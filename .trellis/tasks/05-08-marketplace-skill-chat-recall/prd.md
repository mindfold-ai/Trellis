# Marketplace skill: chat-recall (auto-trigger `trellis mem` for past-conversation lookup)

## Goal

`trellis mem` is now shipped (v0.6.0-beta.0) and lets you search past Claude Code / Codex / OpenCode sessions on disk. But AI agents won't know to invoke it on their own. A marketplace skill installs the reflex: when the user references past work ("we discussed X before", "what did we decide on Y", "上次怎么解决的"), or when the AI itself wants to recall prior context, the skill triggers and tells the AI to run `trellis mem search` / `trellis mem context` and quote real session content instead of guessing or saying "我不记得".

## What I already know (from repo inspection)

### Marketplace skill file layout
- **SKILL.md**: `marketplace/skills/<skill-name>/SKILL.md` with frontmatter `name: ` + `description: ` (description is the AI auto-trigger string).
- **docs-site mdx**: `docs-site/skills-market/<skill-name>.mdx` (English) — single page describing the skill, install command, usage. Also `docs-site/zh/skills-market/<skill-name>.mdx` for Chinese.
- **Index**: `docs-site/skills-market/index.mdx` lists all marketplace skills.
- **Optional `references/` subdir**: e.g. `cc-codex-spec-bootstrap/references/mcp-setup.md`. Useful when the skill body itself would be too long.

### Existing marketplace skills as style baseline
- `cc-codex-spec-bootstrap` — multi-agent pipeline skill, has rich `references/mcp-setup.md`.
- `trellis-meta` — Trellis self-explanation skill.
- `frontend-fullchain-optimization` — domain-specific.

### `trellis mem` surface to bind to
| Subcommand | What it does |
|---|---|
| `trellis mem list [--platform X --since DATE --cwd PATH --json]` | List sessions across platforms |
| `trellis mem search "<keyword>" [--cwd PATH]` | Find sessions whose contents match keyword |
| `trellis mem context <session-id>` | Top-N hit turns + surrounding context (drill-down) |
| `trellis mem extract <session-id> [--grep KW]` | Dump cleaned dialogue, filterable |
| `trellis mem projects` | List active project cwds |

## Resolved Questions

- (Q1) Skill name: **`mem-recall`** — maps directly to the `trellis mem` CLI command, makes the dependency obvious.

## Open Questions

- (Q1) **Skill name**: candidates `chat-recall`, `trellis-recall`, `session-recall`, `mem-recall`, `recall`. Tradeoffs:
  - `chat-recall`: most natural / describes the user's mental model. Doesn't tie to Trellis branding.
  - `trellis-recall`: aligns with `trellis-brainstorm` / `trellis-check` etc. but those are bundled (not marketplace).
  - `session-recall`: technical / accurate but less sticky.
  - `mem-recall`: maps directly to the CLI command (`trellis mem`).
  - `recall`: shortest, but conflicts with generic English word — bad for AI auto-trigger description matching.
- (Q2) **Cross-cwd behavior**: default to current project only (`--cwd $(pwd)`) so AI doesn't surface unrelated repos? Or let AI judge? Default-narrow is safer (privacy, less noise).
- (Q3) **Single-file or with `references/`**: SKILL.md alone, or split usage examples / advanced workflows into a `references/examples.md`? cc-codex-spec-bootstrap has 1 reference doc, `trellis-meta` is single-file.
- (Q4) **Trigger phrases scope**: just user-message phrases ("上次", "we discussed", "之前那个 bug")? Or also AI-self-trigger ("I don't have that context — let me check previous sessions")?

## Requirements (evolving)

- A SKILL.md with frontmatter `name: <chosen-name>` + `description:` long enough for AI auto-trigger matching (covers user phrases + self-trigger scenarios).
- Body: trigger conditions, step-by-step usage of `trellis mem search` → `trellis mem context` flow, citation format ("from session abc123: …"), failure modes (e.g. no Trellis project, no matching sessions).
- docs-site mdx (EN + ZH): install command, usage example, link to `trellis mem` reference.
- Add to `docs-site/skills-market/index.mdx` (EN + ZH).

## Out of scope

- Modifying `trellis mem` itself (no CLI changes; the skill is purely AI-instruction layer).
- Auto-installing the skill via `trellis init` — marketplace skills are user-pulled (`npx skills add ...`).
- Session-content writeback / annotation (read-only recall).

## Acceptance Criteria

- [ ] `marketplace/skills/<name>/SKILL.md` exists with valid frontmatter.
- [ ] AI in a fresh session, told user "上次我们怎么处理 #240 的", invokes `trellis mem search` and surfaces real prior content (manually verified end-to-end).
- [ ] `docs-site/skills-market/<name>.mdx` + zh exist, installed in `index.mdx` lists.
- [ ] `docs-site/docs.json` page list updated for both Beta and Release version blocks (since marketplace pages are non-versioned).
- [ ] Lint / format clean (markdownlint via lint-staged).

## Definition of Done

- Skill body covers ≥3 trigger patterns + at least one full example chain (search → context → quote).
- EN/ZH 1:1 on the docs-site mdx page.
- No em-dashes in changelog-style prose.
- No new runtime deps; no test additions needed (skill = prose).

## Technical Notes

- Skill body should explain **how to phrase the citation** so user can verify the recall: include session-id + the actual quoted line, not just "I remember we said X".
- `trellis mem` JSON mode (`--json`) is most useful for the AI: parse, pick top hits, drill in with `context`.
- Fallback when no matches: gracefully say "I checked past Trellis-tracked sessions but found no matching record" instead of inventing.
