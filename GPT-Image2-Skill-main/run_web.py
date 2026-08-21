#!/usr/bin/env python3
"""Launcher for GPT-Image-2 Web Studio."""

import argparse
import sys
import webbrowser

try:
    import uvicorn
except ImportError:
    print("Error: uvicorn is required. Run 'pip install uvicorn fastapi python-multipart'")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Start GPT-Image-2 Web Studio")
    parser.add_argument("--host", default="127.0.0.1", help="Host IP to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open web browser")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}"
    print("=" * 65)
    print("  GPT-Image-2 Web Studio is starting...")
    print(f"  Access Studio at: {url}")
    print("=" * 65)

    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    uvicorn.run("web.server:app", host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
