# Project Overview

This is my personal blog built with **Jekyll**, hosted on **GitHub Pages** at `github.io`.

## Article Directory

All blog articles are in the `_posts` directory, written in Markdown format.

## Local Development

```bash
docker compose up
```

Once started, visit `http://localhost:4000/` to preview.

## Important Notes

- **Article changes only**: Modifying, adding, or deleting files inside `_posts` is safe and requires no extra testing.
- **Non-article changes**: The project includes custom styles, layouts, and pages (e.g., `_layouts/`, `_includes/`, `src/`, etc.). If any change touches files outside `_posts`, or if you're unsure whether a change might affect startup, **you must test locally via `docker compose up` first** — confirm no errors and pages render correctly before delivering.
