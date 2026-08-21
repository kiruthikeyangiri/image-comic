## Summary

<!-- What changed? Keep it short and concrete. -->

## Type of change

- [ ] Prompt / gallery entry
- [ ] Image asset / docs organization
- [ ] CLI / skill behavior
- [ ] Documentation / wording
- [ ] Maintenance / community files

## Gallery checklist

If this PR changes the prompt gallery:

- [ ] Updated both `README.md` and `README.zh.md`
- [ ] Kept English/Chinese entry order and image paths aligned
- [ ] Placed gallery images under `docs/<category-slug>/<short-slug>.png`
- [ ] Updated gallery numbering, index ranges, and top gallery count
- [ ] Used `Original` for repo-generated images or preserved `Author + Source` for outside-source prompts
- [ ] Checked for duplicate dividers and broken local image refs

## Verification

- [ ] `git diff --check`
- [ ] `python3 -m py_compile src/gpt_image_cli/cli.py src/gpt_image_cli/__init__.py`
- [ ] `uv run gpt-image --help`

## Notes

<!-- Anything reviewers should know: attribution, rejected alternatives, visual quality caveats, etc. -->
