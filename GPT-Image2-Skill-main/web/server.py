"""FastAPI server for GPT-Image-2 Web Studio.

Supports multi-provider image generation:
1. Free Instant Mode (100% free, no key needed)
2. Hugging Face Inference (FLUX.1-schnell, SDXL, etc. with free HF token)
3. OpenAI GPT-Image-2 (with OpenAI API key)
"""
from __future__ import annotations

import base64
import os
import re
import shutil
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import httpx
from openai import APIError, OpenAI
from pydantic import BaseModel

# Load environment chain
load_dotenv(Path.cwd() / ".env", override=False)
load_dotenv(Path.home() / ".env", override=False)

try:
    from huggingface_hub import InferenceClient
    HF_AVAILABLE = True
except ImportError:
    HF_AVAILABLE = False

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"
OUTPUTS_DIR = BASE_DIR / "outputs"
DOCS_DIR = BASE_DIR / "docs"
REFERENCES_DIR = BASE_DIR / "skills" / "gpt-image" / "references"

OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="GPT-Image-2 Web Studio", version="1.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SIZE_SHORTCUTS: dict[str, str] = {
    "1k": "1024x1024",
    "2k": "2048x2048",
    "4k": "3840x2160",
    "portrait": "1024x1536",
    "landscape": "1536x1024",
    "square": "1024x1024",
    "wide": "2048x1152",
    "tall": "2160x3840",
}


def get_openai_client(api_key: Optional[str] = None) -> OpenAI:
    key = api_key or os.environ.get("OPENAI_API_KEY")
    if not key:
        raise HTTPException(
            status_code=400,
            detail="OPENAI_API_KEY is not configured. Please enter your key in Settings, or switch to Free FLUX Mode."
        )
    return OpenAI(api_key=key)


def slugify(text: str, max_len: int = 30) -> str:
    s = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    s = re.sub(r"[-\s]+", "-", s)[:max_len]
    return s or "image"


class GenerateRequest(BaseModel):
    prompt: str
    provider: str = "free-flux"  # "free-flux", "huggingface", "openai"
    model: str = "black-forest-labs/FLUX.1-schnell"
    size: str = "1024x1024"
    quality: str = "high"
    n: int = 1
    background: str = "auto"
    moderation: str = "low"
    format: str = "png"
    compression: Optional[int] = None
    apiKey: Optional[str] = None
    hfToken: Optional[str] = None


@app.get("/api/config")
def get_config():
    has_openai_key = bool(os.environ.get("OPENAI_API_KEY"))
    has_hf_token = bool(os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN"))
    return {
        "hasOpenAiKey": has_openai_key,
        "hasHfToken": has_hf_token,
        "providers": [
            {"id": "free-flux", "name": "Free Mode (FLUX.1)", "badge": "100% Free"},
            {"id": "huggingface", "name": "Hugging Face (FLUX.1 / SDXL)", "badge": "Free Token"},
            {"id": "openai", "name": "OpenAI (GPT-Image-2)", "badge": "Paid API"},
        ],
        "sizeShortcuts": SIZE_SHORTCUTS,
        "qualities": ["low", "medium", "high", "auto"],
        "formats": ["png", "jpeg", "webp"],
    }


@app.post("/api/generate")
async def generate_images(req: GenerateRequest):
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")
    
    size_str = SIZE_SHORTCUTS.get(req.size, req.size)
    try:
        width, height = map(int, size_str.split("x"))
    except Exception:
        width, height = 1024, 1024

    saved_images = []
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = slugify(req.prompt)

    # -------------------------------------------------------------
    # Provider 1: Free Mode (FLUX.1 - 100% free, no key needed)
    # -------------------------------------------------------------
    if req.provider == "free-flux":
        try:
            async with httpx.AsyncClient(verify=False, timeout=90.0) as http_client:
                for idx in range(max(1, min(req.n, 4))):
                    encoded_prompt = urllib.parse.quote(req.prompt.strip())
                    flux_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={min(width, 1280)}&height={min(height, 1280)}"
                    
                    resp = await http_client.get(flux_url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
                    if resp.status_code != 200:
                        raise HTTPException(status_code=resp.status_code, detail="Image generation service returned an error. Please try again.")
                    
                    img_data = resp.content
                    filename = f"{stamp}_{slug}_flux_{idx+1}.png" if req.n > 1 else f"{stamp}_{slug}_flux.png"
                    filepath = OUTPUTS_DIR / filename
                    filepath.write_bytes(img_data)

                    saved_images.append({
                        "filename": filename,
                        "url": f"/outputs/{filename}",
                        "prompt": req.prompt,
                        "provider": "Free FLUX.1",
                        "size": f"{width}x{height}",
                        "quality": req.quality,
                        "timestamp": datetime.now().isoformat(),
                    })
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Free Generation Error: {str(e)}")

        return {"status": "success", "images": saved_images}

    # -------------------------------------------------------------
    # Provider 2: Hugging Face Inference (FLUX.1-schnell / SDXL)
    # -------------------------------------------------------------
    elif req.provider == "huggingface":
        hf_token = req.hfToken or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN")
        if not hf_token:
            raise HTTPException(
                status_code=400,
                detail="HF_TOKEN is required for Hugging Face mode. Please enter your free token in Settings, or use Free Mode."
            )

        if not HF_AVAILABLE:
            raise HTTPException(status_code=500, detail="huggingface_hub is not installed.")

        try:
            client = InferenceClient(api_key=hf_token)
            model_id = req.model or "black-forest-labs/FLUX.1-schnell"

            for idx in range(max(1, min(req.n, 4))):
                pil_image = client.text_to_image(
                    prompt=req.prompt.strip(),
                    model=model_id,
                    width=min(width, 1024),
                    height=min(height, 1024),
                )
                filename = f"{stamp}_{slug}_hf_{idx+1}.png" if req.n > 1 else f"{stamp}_{slug}_hf.png"
                filepath = OUTPUTS_DIR / filename
                pil_image.save(filepath)

                saved_images.append({
                    "filename": filename,
                    "url": f"/outputs/{filename}",
                    "prompt": req.prompt,
                    "provider": f"HuggingFace ({model_id.split('/')[-1]})",
                    "size": f"{width}x{height}",
                    "quality": req.quality,
                    "timestamp": datetime.now().isoformat(),
                })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Hugging Face Error: {str(e)}")

        return {"status": "success", "images": saved_images}

    # -------------------------------------------------------------
    # Provider 3: OpenAI (GPT-Image-2)
    # -------------------------------------------------------------
    else:
        client = get_openai_client(req.apiKey)
        kwargs: dict[str, Any] = {
            "model": "gpt-image-2",
            "prompt": req.prompt.strip(),
            "n": max(1, min(req.n, 4)),
            "size": size_str,
        }
        if req.quality:
            kwargs["quality"] = req.quality
        if req.background:
            kwargs["background"] = req.background
        if req.moderation:
            kwargs["moderation"] = req.moderation
        if req.format:
            kwargs["output_format"] = req.format

        try:
            response = client.images.generate(**kwargs)
        except APIError as e:
            raise HTTPException(status_code=500, detail=f"OpenAI API Error: {e.message}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        async with httpx.AsyncClient(verify=False, timeout=30.0) as http_client:
            for idx, item in enumerate(response.data):
                ext = req.format if req.format in ("png", "jpeg", "webp") else "png"
                filename = f"{stamp}_{slug}_{idx+1}.{ext}" if len(response.data) > 1 else f"{stamp}_{slug}.{ext}"
                filepath = OUTPUTS_DIR / filename

                if getattr(item, "b64_json", None):
                    data = base64.b64decode(item.b64_json)
                    filepath.write_bytes(data)
                elif getattr(item, "url", None):
                    resp = await http_client.get(item.url)
                    filepath.write_bytes(resp.content)
                else:
                    continue

                saved_images.append({
                    "filename": filename,
                    "url": f"/outputs/{filename}",
                    "prompt": req.prompt,
                    "provider": "OpenAI (GPT-Image-2)",
                    "size": size_str,
                    "quality": req.quality,
                    "timestamp": datetime.now().isoformat(),
                })

        return {"status": "success", "images": saved_images}


@app.post("/api/edit")
async def edit_images(
    prompt: str = Form(...),
    model: str = Form("gpt-image-2"),
    size: str = Form("1024x1024"),
    quality: str = Form("high"),
    n: int = Form(1),
    background: str = Form("auto"),
    format: str = Form("png"),
    apiKey: Optional[str] = Form(None),
    images: List[UploadFile] = File(...),
    mask: Optional[UploadFile] = File(None),
):
    if not prompt or not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt instruction cannot be empty.")
    if not images:
        raise HTTPException(status_code=400, detail="At least one reference image is required.")

    client = get_openai_client(apiKey)
    size = SIZE_SHORTCUTS.get(size, size)

    temp_files: list[Path] = []
    try:
        img_tuples = []
        for idx, img in enumerate(images):
            temp_path = OUTPUTS_DIR / f"_temp_ref_{idx}_{img.filename}"
            with open(temp_path, "wb") as buffer:
                shutil.copyfileobj(img.file, buffer)
            temp_files.append(temp_path)
            img_tuples.append((img.filename, open(temp_path, "rb"), img.content_type or "image/png"))

        image_arg: Any = img_tuples[0] if len(img_tuples) == 1 else img_tuples

        mask_arg = None
        if mask and mask.filename:
            mask_path = OUTPUTS_DIR / f"_temp_mask_{mask.filename}"
            with open(mask_path, "wb") as buffer:
                shutil.copyfileobj(mask.file, buffer)
            temp_files.append(mask_path)
            mask_arg = (mask.filename, open(mask_path, "rb"), mask.content_type or "image/png")

        kwargs: dict[str, Any] = {
            "model": model,
            "image": image_arg,
            "prompt": prompt.strip(),
            "n": max(1, min(n, 10)),
            "size": size,
        }
        if mask_arg:
            kwargs["mask"] = mask_arg
        if quality:
            kwargs["quality"] = quality
        if background:
            kwargs["background"] = background
        if format:
            kwargs["output_format"] = format

        response = client.images.edit(**kwargs)
    except APIError as e:
        raise HTTPException(status_code=500, detail=f"OpenAI API Error: {e.message}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in temp_files:
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass

    saved_images = []
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = slugify(prompt)

    async with httpx.AsyncClient(verify=False, timeout=30.0) as http_client:
        for idx, item in enumerate(response.data):
            ext = format if format in ("png", "jpeg", "webp") else "png"
            filename = f"{stamp}_{slug}_edit_{idx+1}.{ext}" if len(response.data) > 1 else f"{stamp}_{slug}_edit.{ext}"
            filepath = OUTPUTS_DIR / filename

            if getattr(item, "b64_json", None):
                data = base64.b64decode(item.b64_json)
                filepath.write_bytes(data)
            elif getattr(item, "url", None):
                resp = await http_client.get(item.url)
                filepath.write_bytes(resp.content)
            else:
                continue

            saved_images.append({
                "filename": filename,
                "url": f"/outputs/{filename}",
                "prompt": prompt,
                "size": size,
                "quality": quality,
                "timestamp": datetime.now().isoformat(),
            })

    return {"status": "success", "images": saved_images}


@app.get("/api/galleries")
def get_galleries():
    categories = []
    if REFERENCES_DIR.exists():
        for file in sorted(REFERENCES_DIR.glob("gallery-*.md")):
            name = file.stem.replace("gallery-", "").replace("-", " ").title()
            content = file.read_text(encoding="utf-8")
            
            sections = content.split("### ")
            items = []
            for sec in sections[1:]:
                lines = sec.strip().split("\n")
                title = lines[0].strip() if lines else "Example"
                
                img_match = re.search(r"!\[.*?\]\((.*?)\)", sec)
                img_url = ""
                if img_match:
                    raw_path = img_match.group(1).lstrip("/")
                    img_url = f"/{raw_path}"

                prompt_match = re.search(r"\*\*Prompt\*\*:\s*([^\n\r]+)", sec)
                if not prompt_match:
                    prompt_match = re.search(r"```text\s*\n([\s\S]*?)\n```", sec)
                prompt_text = prompt_match.group(1).strip() if prompt_match else ""

                if prompt_text:
                    items.append({
                        "title": title,
                        "prompt": prompt_text,
                        "imageUrl": img_url,
                    })

            categories.append({
                "id": file.stem,
                "name": name,
                "count": len(items),
                "items": items[:12],
            })
    return {"categories": categories}


@app.get("/api/history")
def get_history():
    files = []
    for ext in ("*.png", "*.jpg", "*.jpeg", "*.webp"):
        for path in OUTPUTS_DIR.glob(ext):
            if path.name.startswith("_temp"):
                continue
            stat = path.stat()
            files.append({
                "filename": path.name,
                "url": f"/outputs/{path.name}",
                "sizeBytes": stat.st_size,
                "createdAt": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    files.sort(key=lambda x: x["createdAt"], reverse=True)
    return {"history": files}


app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")
if DOCS_DIR.exists():
    app.mount("/docs", StaticFiles(directory=str(DOCS_DIR)), name="docs")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "GPT-Image-2 Web Studio API is running."}
