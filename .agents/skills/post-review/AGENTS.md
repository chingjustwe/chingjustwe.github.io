# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this repo is

An OpenCode skill for managing the full lifecycle of blog posts: review,
publish, translate, and deploy. The runtime artifact is `SKILL.md`:
the agent reads its YAML frontmatter (metadata + allowed tools) followed by the
editor workflow. There is no build step and no code to run.

## Key files

- `SKILL.md` — the skill itself. YAML frontmatter (`name`, `version`,
  `description`, `allowed-tools`) followed by the end-to-end workflow (Phase 0
  through Phase 7).
  **This is the source of truth.**

## When to update

- **Accuracy pass rules change** — when you add/remove fact-check categories or
  verification rules.
- **Consistency pass rules change** — when you add new types of contradictions
  to check.
- **De-AI pass rules change** — when you add new blog-specific voice rules
  beyond the humanizer skill's 30 patterns.
- **Workflow phase changes** — when you add, remove, or reorder phases in the
  post-review pipeline (preview, translation, cleanup, commit).
- **Version bump** — increment the `version` field in the YAML frontmatter and
  note what changed.

## Key design decisions

- The skill **references** the humanizer skill for AI writing patterns but does
  not duplicate them. It extends them with blog-specific voice rules.
- Fact-checking uses `WebFetch` and `Bash` to verify claims. It never invents
  sources.
- The default target voice is a natural Chinese technical blog tone (direct,
  slightly casual, occasional first-person).
- The workflow is sequential and gated on user approval at each handoff point
  (after review, after preview).

## Maintenance

- `SKILL.md` is the only required file. There is no `README.md` by design
  (this is a project-local skill, not a public distribution).
- Preserve valid YAML frontmatter formatting and indentation.
- The prompt below the frontmatter is the product. Edit it like a careful
  instruction document.
