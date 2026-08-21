# Contributing

Thanks for helping improve the GPT Image 2 Agentic Skill gallery. This repo is intentionally lightweight: a runnable skill/CLI plus a curated prompt gallery with generated examples.

## What to contribute

Good contributions usually fall into one of these buckets:

- **New prompt + generated image** for an existing category.
- **New category** when the prompt does not fit the existing gallery and adds a clearly useful scenario.
- **Better wording / formatting** in `README.md` and `README.zh.md`.
- **CLI or skill fixes** under `src/` or `skills/gpt-image/`.

## Gallery entry rules

When adding or editing a gallery entry:

1. Add the entry to both `README.md` and `README.zh.md`.
2. Keep the same entry order, image path, and numbering in both READMEs.
3. Put gallery images under:

   ```text
   docs/<category-slug>/<short-slug>.png
   ```

   Do not add new gallery images directly under `docs/`.
4. Keep the entry layout consistent:

   ```md
   #### No. X · Title

   <img src="docs/category/short-slug.png" ... />

   <sub>Category · `size` · `pixels` · Original</sub>

   <details>
   <summary>📝 Prompt · ⚡ CLI · 🐍 OpenAI SDK</summary>
   ...
   </details>
   ```

5. Use one divider (`---`) between entries. Do not leave duplicate dividers.
6. For original repo-generated examples, footer metadata should end with `Original`.
7. For outside-source prompts, preserve attribution visibly:

   ```text
   Author: @handle · Source: [X](https://...)
   ```

8. Read the actual prompt text before choosing a category. Do not categorize only by filename or title.

## Prompt and image quality

- Prefer prompts that demonstrate a distinct technique: layout, typography, multi-panel composition, reference editing, dense labels, realistic photography, product render, UI mockup, etc.
- Keep titles clean and natural. Put safety constraints inside the prompt, not in awkward titles.
- For adult fashion/anime prompts, explicitly keep the prompt tasteful and non-explicit, and avoid minor-coded language.
- Avoid weak or redundant categories. A category should have a clear visual identity and useful examples.

## Updating counts and index

After adding/removing/moving entries:

1. Renumber all `#### No. ...` headings in both READMEs.
2. Update the Prompt Gallery index ranges and counts.
3. Update the top `Gallery size` / `图库规模` count.
4. Confirm English and Chinese entries have matching image paths in the same order.

Manual counting is fine; no automation tool is required.

## Verification checklist

Before opening a PR, run:

```bash
git diff --check
python3 -m py_compile src/gpt_image_cli/cli.py src/gpt_image_cli/__init__.py
uv run gpt-image --help
```

Recommended README checks:

```bash
rg -n 'docs/example-.*\.(png|jpg|jpeg|webp)' README.md README.zh.md
rg -n '^### |^#### ' README.md README.zh.md
```

Also verify:

- No broken local image references.
- No duplicate anchors.
- No duplicate dividers between entries.
- No `###` category heading immediately followed by a `####` entry heading without a blank line.
- `README.md` and `README.zh.md` have the same number of gallery entries.

## Pull request notes

Please include:

- What changed.
- Which categories were added or updated.
- Whether new images are original or adapted from outside prompts.
- What verification you ran.

## 中文简要说明

贡献新 Prompt / 图片时，请同时更新 `README.md` 和 `README.zh.md`，并保持编号、图片路径、分类顺序一致。图库图片统一放在 `docs/<category-slug>/<short-slug>.png`。原创图片 footer 使用 `Original`；外部来源必须保留 `Author + Source`。提交前请运行上面的验证命令，并检查 Index、总数、图片引用和分隔线。
