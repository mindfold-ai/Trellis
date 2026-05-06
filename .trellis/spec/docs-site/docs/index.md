# Mintlify Documentation Guidelines

> Best practices for writing and maintaining documentation in this Mintlify project.

---

## Overview

This project uses **Mintlify** as the documentation platform. All content is written in MDX (Markdown + JSX) and configured via `docs.json`.

---

## Guidelines Index

| Guide                                           | Description                              | Status |
| ----------------------------------------------- | ---------------------------------------- | ------ |
| [Directory Structure](./directory-structure.md) | File organization and naming conventions | Ready  |
| [MDX Guidelines](./mdx-guidelines.md)           | MDX syntax, frontmatter, components      | Ready  |
| [Config Guidelines](./config-guidelines.md)     | docs.json configuration patterns         | Ready  |
| [Plugin Guidelines](./plugin-guidelines.md)     | Claude Code plugin manifest patterns     | Ready  |
| [Style Guide](./style-guide.md)                 | Writing style + changelog/release-notes voice | Ready  |
| [ASCII-Art Alignment](./ascii-art-alignment.md) | Box-drawing & CJK alignment in diagrams  | Ready  |
| [Sync on Change](./sync-on-change.md)           | Which docs-site pages to update when Trellis workflow / platforms / commands / skills change | Ready  |
| [Release Lifecycle](./release-lifecycle.md)     | `docs-site/scripts/` lifecycle (release-only / +beta / +rc), when and how to use them        | Ready  |

---

## Quick Reference

### Local Development

```bash
# Start dev server
mintlify dev

# Custom port
mintlify dev --port 3333
```

### File Types

| Extension   | Purpose                                    |
| ----------- | ------------------------------------------ |
| `.mdx`      | Documentation pages                        |
| `.json`     | Configuration (docs.json) or OpenAPI specs |
| `.svg/.png` | Images and logos                           |

### Key Files

| File             | Purpose            |
| ---------------- | ------------------ |
| `docs.json`      | Main configuration |
| `index.mdx`      | Homepage           |
| `snippets/*.mdx` | Reusable content   |

---

## Deployment

- **Preview**: Automatic on PR creation
- **Production**: Push to `main` branch triggers deploy

---

**Language**: All documentation should be written in **English** unless specified otherwise.
