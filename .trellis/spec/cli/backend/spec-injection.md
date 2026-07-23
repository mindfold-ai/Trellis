---
name: spec-injection
description: Path-scoped on-demand spec injection — frontmatter contract, glob matching, hook flow, budgets, dedup, platform matrix
paths:
  - packages/cli/src/templates/shared-hooks/inject-spec-context.py
  - packages/cli/src/templates/trellis/scripts/common/spec_match.py
  - .claude/hooks/inject-spec-context.py
  - .trellis/scripts/common/spec_match.py
---

# Path-Scoped Spec Injection

> Contract for on-demand spec injection: spec `.md` files under
> `.trellis/spec/` declare which code paths they govern via `paths:`
> frontmatter; when the agent edits a governed file, the matching specs are
> injected right then — small, relevant, budgeted — instead of everything up
> front (impossible: this repo's spec tree alone exceeds every injection
> ceiling) or nothing at all (index-only "read on demand" is unreliable).
> This file's own frontmatter block is a live example of the contract.

---

## Code map

| Surface | File |
|---|---|
| Matching engine | `packages/cli/src/templates/trellis/scripts/common/spec_match.py` (live twin `.trellis/scripts/common/spec_match.py`) |
| Injection hook | `packages/cli/src/templates/shared-hooks/inject-spec-context.py` (live twin `.claude/hooks/inject-spec-context.py`) |
| Registration | `packages/cli/src/templates/claude/settings.json` `PostToolUse` (live twin `.claude/settings.json`) |
| Distribution | `packages/cli/src/templates/shared-hooks/index.ts` `SHARED_HOOKS_BY_PLATFORM` (claude only this iteration) |
| Config | `.trellis/config.yaml` `spec_injection:` (commented template section in `templates/trellis/config.yaml`) |
| Pull mode | `get_context.py --mode spec --file <path>` (dispatch in `common/git_context.py`) |
| Dedup state | `.trellis/.runtime/spec-injection/<session_id>.json` (`.runtime/` is gitignored) |

---

## 1. Frontmatter contract

Frontmatter is **optional and additive**: a spec file without it (all
pre-existing specs, everywhere) behaves exactly as today and is invisible to
this feature. Frontmatter is inert prose to every other consumer (SessionStart
spec-path listing, index.md readers, byte-based spec-refresh hash tracking).

### Grammar

- Only files whose **first line is exactly `---`** (a UTF-8 BOM before it is
  tolerated) enter frontmatter parsing.
- The scan is a bounded head-read: first **8 KiB / 100 lines**, whichever ends
  first; parsing stops at the closing `---` or at the bound. Content past the
  bound is never seen — keep frontmatter short and at the very top.
- Key lines match `^([A-Za-z_][A-Za-z0-9_-]*):(.*)$` (after stripping
  surrounding whitespace). Values are unquoted (matching `"` / `'` pairs
  removed) and inline ` # …` comments are stripped (a `#` inside a quoted
  value is preserved).
- Recognized keys — parsing is hand-rolled in `parse_spec_frontmatter()`
  (house pattern, modeled on `trellis_config.parse_simple_yaml`; **no YAML
  dependency**):
  - `paths:` — must have an empty inline value followed by `- <glob>` list
    items (flat list).
  - `description:` — single-line scalar; reused in `<spec-index>` degradation
    lines and pull-mode output.
  - `name:` — single-line scalar; tolerated, currently unused by matching.
- Unknown keys are tolerated and ignored, whether scalar or list-valued.
  Blank lines and `#` comment lines are skipped.

### Malformed frontmatter (whole spec skipped, stderr warning)

`parse_spec_frontmatter()` raises `ValueError` — and `match_specs_for_file()`
skips that spec with a `[WARN] spec_match:` line on stderr — for:

- `paths: <inline value>` (must be a list of globs, not a scalar)
- a `- item` line outside any pending list key
- any other unrecognized line shape inside the block

### Invalid globs (that glob skipped, the rest of the file still applies)

`validate_glob()` rejects — with a stderr warning, without discarding the
spec's other globs:

| Rejection | Rule |
|---|---|
| empty glob | must be non-empty |
| charset | only `[A-Za-z0-9_./*?-]` — no spaces, no brackets/braces, no `\` (write POSIX separators even on Windows) |
| absolute | no leading `/`; globs are repo-relative |
| traversal | no `..` segments |

---

## 2. Glob semantics

Globs are matched against the edited file's **repo-relative POSIX path** with
an anchored full match (`^…$`). Translation is deterministic, segment-based
(`glob_to_regex()`):

| Token | Meaning | Regex |
|---|---|---|
| `*` | any run (incl. empty) **within one segment** — never crosses `/` | `[^/]*` |
| `?` | exactly one character within a segment | `[^/]` |
| `**` (whole segment, not last) | zero or more whole segments | `(?:[^/]+/)*` |
| `**` (whole segment, last) | the rest of the path | `.*` |
| `**` embedded with other characters | degrades to `*` per star | — |
| trailing `/` | sugar for `/**` (expanded before translation) | — |
| anything else | literal (regex-escaped) | — |

Examples (mirrored from the `spec_match.py` module docstring; keep in sync):

| Glob | Matches | Does not match |
|---|---|---|
| `packages/cli/src/commands/update.ts` | only that exact file | anything else |
| `packages/cli/src/commands/*.ts` | `…/commands/update.ts` | `…/commands/channel/spawn.ts` |
| `packages/cli/src/templates/**` | `…/templates/trellis/index.ts` (any depth) | `packages/cli/src/templates` (the directory path itself) |
| `packages/**/index.ts` | `packages/index.ts`, `packages/cli/src/index.ts` | — |
| `src/util?.py` | `src/utils.py` | `src/util.py`, `src/utilXY.py` |
| `packages/cli/` | same as `packages/cli/**` | — |

---

## 3. Matching scan (`common/spec_match.py`)

```python
match_specs_for_file(repo_root, file_path) -> list[SpecMatch]
# SpecMatch(spec_path: Path absolute, rel_path: str repo-relative POSIX,
#           description: str | None)
```

Contract:

1. `file_path` may be absolute or repo-relative. Normalization: backslashes →
   `/`, leading `./` stripped; absolute paths outside the repo and `../`
   prefixes yield **no matches** (return `[]`), never an error.
2. Bail-out before any I/O when `.trellis/spec/` does not exist → `[]`.
3. Scans `.trellis/spec/**/*.md` via `rglob` — `index.md` files included if
   they declare `paths:`. Each file gets a **bounded head-read only**
   (8 KiB); spec bodies are never read during matching.
4. Unreadable file → stderr warn, skip. Malformed frontmatter → stderr warn,
   skip. No frontmatter or no/empty `paths` → skip silently.
5. **First matching glob per spec wins** (`break`): each spec appears at most
   once per event regardless of how many of its globs match.
6. Results are sorted by `rel_path` — deterministic injection order.
7. Never raises: the whole scan is wrapped; any unexpected exception → stderr
   warn + `[]`. Callers are hooks and context tools.

---

## 4. Injection hook (`shared-hooks/inject-spec-context.py`)

Registered on **Claude Code only** this iteration: `PostToolUse` with three
matcher entries — `Edit`, `Write`, `MultiEdit` — each running
`{{PYTHON_CMD}} .claude/hooks/inject-spec-context.py`, timeout 15. The script
keeps the shared-hooks platform-neutral shape so later registrations are
wiring-only.

### Flow (in order; every early exit is `exit 0`, no stdout)

1. Env kill switches: `TRELLIS_HOOKS=0` or `TRELLIS_DISABLE_HOOKS=1`.
2. stdin JSON parse; non-dict or parse failure → silent exit.
3. `tool_name` (fallback `toolName`) must be `Edit` / `Write` / `MultiEdit`.
4. `tool_input.file_path` must be a non-empty string.
5. Repo root: walk up from `cwd` (fallback `os.getcwd()`) to find `.trellis/`.
6. Bail **before any spec scan** when `.trellis/spec/` is absent — a spec-less
   project pays only the subprocess spawn.
7. Config gate: `spec_injection.enabled: false` → silent exit.
8. Import `common.spec_match` from `.trellis/scripts` (sys.path extension);
   import failure → degrade to nothing.
9. Match; no matches → silent exit.
10. Dedup filter + budget assembly (below); state persisted only for specs
    whose bodies were actually inlined.
11. Empty payload → silent exit; otherwise print exactly one JSON object:

```json
{"hookSpecificOutput": {"hookEventName": "PostToolUse",
                        "additionalContext": "<payload>"}}
```

Top-level `try/except → sys.exit(0)`: the hook **never** blocks the tool
result, never crashes the session, never exits non-zero. stdout carries hook
JSON or nothing; all warnings go to stderr.

### Payload shape

Per injected spec (blocks joined by a blank line):

```
<spec-context file="<edited rel path>" spec="<spec rel path>">
<spec body, UTF-8-safe truncated at max_spec_bytes>
[Trellis: truncated at 8192 bytes — read <spec rel path> for the full content]
</spec-context>
```

The truncation notice appears only when the body was capped. Matches that
did not fit the per-event budget degrade to one trailing block — never
silently dropped:

```
<spec-index>
- <spec rel path> — <description or "no description">
</spec-index>
```

### Session dedup state

- File: `.trellis/.runtime/spec-injection/<sanitized session_id>.json`,
  mapping `{"<spec rel path>": <mtime-at-injection>}`. `session_id` is
  sanitized (`[^A-Za-z0-9._-]+` → `_`, trimmed, 160-char cap); an absent or
  empty id disables dedup (inject every event) rather than failing.
- A spec is skipped only when its recorded mtime equals its **current** mtime:
  touching the spec file re-arms injection. A spec whose mtime cannot be
  stat'd is injected (fail-open) and not recorded.
- Budget-degraded index-line specs are **not** recorded — they stay eligible
  for full injection on a later event.
- Sibling state files older than **48 h** are pruned on each run, best-effort.
- All state I/O is fail-open: unreadable state ⇒ treat as empty (inject);
  unwritable state ⇒ stderr warn, injection proceeds. The failure direction
  is always "inject again", never "skip".

---

## 5. Budget rules

| Cap | Default | Applies to |
|---|---|---|
| `max_spec_bytes` | 8192 | one spec's body bytes, UTF-8-safe truncation (`truncate_utf8` never splits a multi-byte sequence) + in-body notice |
| `max_total_bytes` | 9000 | running total of full `<spec-context>` block sizes (envelope included), in UTF-8 bytes |

- `0` = unlimited for either cap (`channel.worker_guard` convention).
- Sizing rationale: Claude Code's documented **additionalContext ceiling is
  10,000 characters** (verified 2026-07-23, code.claude.com/docs/en/hooks.md).
  Caps are bytes, the ceiling is characters — UTF-8 bytes ≥ characters, so
  byte caps are conservative. The ~1,000 headroom between 9,000 and 10,000
  absorbs what the running total does not count: the trailing `<spec-index>`
  block (one short line per degraded spec) and inter-block separators.
- A block that would push the total over `max_total_bytes` degrades that spec
  to an index line (path + description); assembly continues so a smaller later
  match may still fit.
- Spec-index degradation is the floor, not an error: the agent always at least
  learns *which* spec governs the file and where to read it.

---

## 6. Config keys (`.trellis/config.yaml`)

```yaml
spec_injection:
  enabled: true                # false disables push injection entirely
  max_spec_bytes: 8192         # per matched spec file; 0 = unlimited
  max_total_bytes: 9000        # whole per-event payload; 0 = unlimited
```

- Section absent (default install — the template ships it commented out) ⇒
  defaults above.
- `enabled` accepts booleans and the strings `true/yes/1/on` /
  `false/no/0/off`; anything else → stderr warn, default `true`.
- Non-integer or negative byte values → stderr warn, default for that key.
- `enabled: false` disables the hook only; pull mode is unaffected.
- There is deliberately **no path mapping in config.yaml** — frontmatter is
  the single source of truth (two sources would drift).

---

## 7. Pull mode (`get_context.py --mode spec`)

```bash
python3 .trellis/scripts/get_context.py --mode spec --file packages/cli/src/commands/workflow.ts
```

- Output: one line per match, `<rel spec path> — <description>` (literal
  `(no description)` when the spec declares none), or
  `No spec files declare paths matching <path>.`
- Exit 0 in both cases; omitting `--file` is an argparse usage error (exit 2).
- Lists **paths + descriptions only, never bodies** — so it needs no budget
  and no dedup. Same matching engine as the hook (`match_specs_for_file`).
- Consumers: class-2 platforms, skills, tests, humans.

---

## 8. Platform matrix

| Platform | Push injection | Notes |
|---|---|---|
| Claude Code | ✅ wired | PostToolUse fires for **sub-agent tool calls too** — injection lands in the editing agent's own context (desired; complements, never duplicates, JSONL curation — different channel, dedup is per session). Windows: cosmetic "hook error" display bug on record (claude-code#45065); if PostToolUse ever fails to fire, the feature degrades to nothing — no breakage. |
| cursor, codex, gemini, qoder, copilot, codebuddy, droid, kiro, trae, zcode, opencode, pi, omp, snow | follow-up | The hook script is platform-neutral; registering one of these is wiring-only (settings template + `SHARED_HOOKS_BY_PLATFORM` row) **after** verifying the platform has a tool-event hook that consumes `additionalContext`. |
| kilo, antigravity, devin | ❌ impossible | No hook surface at all. |
| grok | ❌ impossible | Hook stdout `additionalContext` is not consumed (verified 0.2.x). |
| kimi | ❌ impossible | Hooks are user-level only (`~/.kimi-code/config.toml`); Trellis writes no project-level hook files. |
| reasonix | ❌ impossible | No prompt/tool hook surface. |

Pull mode (`--mode spec`) works on **every** platform; "impossible" above
refers to push injection only.

Distribution invariant (hard-learned): every shared-hook template file MUST be
registered in `SHARED_HOOKS_BY_PLATFORM` for at least one platform and in the
`shared-hooks.test.ts` `ALL_HOOK_FILES` enumeration — an unregistered file is
either dead weight or breaks every init fixture.

---

## 9. Design decision: globs, not symlinks

Symlinking specs into governed code directories was considered and rejected:

1. Nothing reads directory-local spec files today — the links would have no
   consumer.
2. Symlinks require privileges on Windows and break without them.
3. They complicate `trellis update` hash tracking.
4. A glob mapping is strictly more expressive: one spec ↔ many directories.

Related non-goals: no frontmatter cache/index (bounded head-reads are cheap;
caches invalidate), no auto-generation of frontmatter from index.md
checklists, no change to sub-agent JSONL curation or its budgets.

---

## 10. Failure modes

| Failure | Behavior |
|---|---|
| No frontmatter anywhere (all pre-existing projects) | zero matches, no output — byte-identical to no hook |
| Malformed frontmatter in one spec | stderr warn, that spec skipped |
| One invalid glob in a spec | stderr warn, that glob skipped, the spec's other globs still apply |
| Spec file unreadable | stderr warn, skipped |
| Dedup state unreadable / unwritable / `session_id` missing | inject (fail-open); write failure warns |
| Matching engine unimportable | hook degrades to nothing, exit 0 |
| Hook internal bug | top-level try/except → exit 0, no output |
| Payload near ceiling | blocks capped at 9,000 bytes; headroom absorbs the uncounted `<spec-index>` block |
| Invalid config values | stderr warn, per-key defaults |
| Windows PostToolUse quirk | cosmetic error display only (#45065); worst case: no injection |

---

## 11. Good/Base/Bad cases

- Good: the agent edits `packages/cli/src/commands/workflow.ts`; the hook
  injects `commands-workflow.md` (per its `paths:` frontmatter) as one
  `<spec-context>` block. A second edit of the same or another matching file
  in the same session emits nothing; `touch` on the spec re-arms it.
- Base: a project with zero frontmatter specs — every edit produces exit 0
  with empty stdout; the only observable delta is one fast subprocess per
  Edit/Write.
- Bad: adding a mapping for a spec in `config.yaml` instead of the spec's own
  frontmatter — two sources of truth; the hook reads only frontmatter, so the
  config mapping silently does nothing.
- Bad: a new shared-hook file registered in `settings.json` templates but not
  in `SHARED_HOOKS_BY_PLATFORM` — the file is never distributed and every
  init fixture breaks.

---

## 12. Tests Required

Unit (python-harness style, driven from vitest like `regression.test.ts`):

- Glob translation: `*` vs `**` (segment vs cross-segment), `?`, trailing `/`
  sugar, embedded-`**` degradation, anchored full match.
- `validate_glob` rejections: empty, charset, absolute, `..`.
- Frontmatter parsing: no-frontmatter file, BOM tolerance, quotes and inline
  comments, unknown keys ignored, each malformed shape raising.

Hook E2E matrix (fabricated PostToolUse stdin; every case asserts exit 0 and
valid-JSON-or-empty stdout):

- match → inject; same-session dedup → empty; spec mtime bump → re-inject.
- oversized spec → truncation notice at cap; total-budget overflow →
  `<spec-index>` degradation.
- malformed frontmatter skipped with stderr warn; `spec_injection.enabled:
  false` → empty; non-edit tool / missing `file_path` / no `.trellis` → empty.

Pull mode:

- `get_context.py --mode spec --file packages/cli/src/commands/workflow.ts`
  lists `commands-workflow.md` (dogfood frontmatter); non-matching path prints
  the "No spec files declare paths" line, exit 0.

Template shape:

- `shared-hooks.test.ts`: capability-table integrity + `ALL_HOOK_FILES`
  enumeration includes `inject-spec-context.py`.
- Claude settings template asserts the `PostToolUse` Edit/Write/MultiEdit
  entries.

---

## DO

- Declare `paths:` in the governed spec's own frontmatter — the single source
  of truth. When adding a Pre-Development Checklist mapping to `index.md`,
  add the matching frontmatter globs in the same commit (and vice versa).
- Keep frontmatter at the very top and short — the head-read bound
  (8 KiB / 100 lines) is a hard parsing horizon.
- Keep stdout reserved for the hook JSON envelope; warnings go to stderr.
- Re-verify Claude's documented additionalContext ceiling before changing
  budget defaults, and record the verification date here.
- Register any new shared-hook file in `SHARED_HOOKS_BY_PLATFORM` and
  `ALL_HOOK_FILES` in the same commit that creates it.

## DON'T

- Don't add a YAML dependency — the parser is hand-rolled by design.
- Don't add a central path mapping to `config.yaml` or cache frontmatter
  scans.
- Don't make the hook exit non-zero, print errors to stdout, or block the
  tool result — degrade to nothing instead.
- Don't rely on dedup for correctness: it is fail-open by design, so
  duplicate injection must always be safe.
- Don't symlink specs into code directories (rationale in §9).
- Don't register the hook on a new platform without verifying its tool-event
  hook consumes `additionalContext` (see grok: hook exists, output ignored).

---

## Mandatory triggers (must update this spec when changing)

- Frontmatter grammar, charset, recognized keys, or validation rules
- Glob token semantics or the glob→regex translation
- Budget defaults, byte-vs-character accounting, or the assumed platform
  ceiling (re-verify the documented limit)
- Dedup state schema, location, sanitization, or prune window
- Payload envelope shape (`<spec-context>` / `<spec-index>` / truncation
  notice text)
- New config key under `spec_injection:`
- Hook registration on any additional platform (update the matrix in §8)

Cross-reference: `cli/backend/script-conventions.md` (hook script standards),
`cli/backend/error-handling.md` (never-crash hook posture),
`cli/backend/configurator-shared.md` (distribution table conventions),
`guides/cross-platform-thinking-guide.md` (degradation posture).
