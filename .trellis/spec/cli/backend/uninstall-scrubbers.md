# Uninstall Scrubbers

How `trellis uninstall` performs **paragraph-level deletion** on structured config files (`settings.json`, `hooks.json`, `config.toml`, `package.json`) so that Trellis-emitted fields are removed while user-added neighbors stay intact.

The scrubbers live in `utils/uninstall-scrubbers.ts`. They are pure functions — they do no I/O, take a file's content as input, and return new content plus a `fullyEmpty` flag. Shared dispatch/planning lives in `utils/managed-removal.ts`; `commands/uninstall.ts:uninstall` retains permanent-removal UX and execution policy (see `commands-uninstall.md`).

---

## Overview

### Why paragraph-level, not whole-file delete

Most files Trellis writes are opaque (`.py`, `.md`, `.ts`) — `trellis uninstall` `unlink`s them outright. But a handful of platform config files are **shared** with the user:

| File | What's shared |
|------|----------------|
| `.claude/settings.json` | Trellis writes the `hooks` block and may opt in its status-line command; user may have set `env`, `model`, `permissions`, `version`, or another status line |
| `.cursor/hooks.json` | Same idea, but a flat schema |
| `.opencode/package.json` | Trellis adds `dependencies["@opencode-ai/plugin"]`; user may have other deps |
| `.pi/settings.json` | Trellis adds `enableSkillCommands` plus entries in `extensions`/`skills`/`prompts` arrays; user may have entries of their own |
| `.codex/config.toml` | Trellis writes documented fallback/hook settings, template comments, and `[agents].max_depth = 1`; user may have added more TOML directives or other `[agents]` keys |
| `.codex/hooks.json`, `.gemini/settings.json`, `.factory/settings.json`, `.codebuddy/settings.json`, `.qoder/settings.json`, `.github/copilot/hooks.json` | Same hooks-block pattern as `.claude/settings.json` (sometimes flat, sometimes nested) |

If `uninstall` simply `rm`-ed these files, the user would lose their own config. If it **left** them alone, the dangling Trellis hook entries would point at deleted scripts and the platform would error on the next session.

The scrubbers walk each file's structure, drop only the Trellis-known parts, and report whether anything meaningful remains.

### Contract with the caller

The caller (`utils/managed-removal.ts:buildManagedRemovalPlan`) is responsible for:

- Reading the file off disk and passing its raw text to the scrubber.
- Comparing `fullyEmpty` from the result: if `true`, the file is queued for deletion; if `false`, the new content is written back.
- Identifying *which* paths count as "deleted by this uninstall" (passed in to hooks-shaped scrubbers as `deletedPaths`). This is the full list of POSIX paths from `.trellis/.template-hashes.json`.

Scrubbers themselves never touch the filesystem. They never log. They return.

---

## Scrubber interface

All scrubbers share a result shape:

```ts
interface ScrubResult {
  content: string;     // post-scrub text to write back
  fullyEmpty: boolean; // true → caller should delete the file instead of writing
}
```

Two distinct signatures depending on whether the scrubber needs to know the uninstall delete-set:

| Signature | Used by |
|-----------|---------|
| `(content: string, deletedPaths: readonly string[], mode: "nested" \| "flat") → ScrubResult` | `utils/uninstall-scrubbers.ts:scrubHooksJson` |
| `(content: string) → ScrubResult` | `utils/uninstall-scrubbers.ts:scrubOpencodePackageJson`, `:scrubPiSettings`, `:scrubCodexConfigToml` |

Hooks-JSON scrubbers need the delete-set because they identify Trellis hook entries by **whether the entry's command refers to a path being deleted**. The other three identify Trellis content by exact-match values that Trellis-the-configurator hard-codes.

### Universal invariants

Every scrubber holds the following:

- **Input may be malformed** — if `JSON.parse` (or equivalent) throws, return `{ content, fullyEmpty: false }`. The caller's outer flow then writes the file back unchanged. We never half-rewrite.
- **Input may have unexpected shape** — if the parsed root isn't a plain object, return `{ content, fullyEmpty: false }`. Same reasoning.
- **Output is canonicalized** — JSON-shaped scrubbers re-`stringify` with 2-space indent and a trailing newline, even if no change was made. This is intentional; user-written hand-formatting is acceptable collateral. Callers know.
- **No throws** — scrubbers must not propagate exceptions; surface "I couldn't scrub this" via `fullyEmpty: false` plus original `content`.
- **No side effects** — no `fs.*`, no `console.*`, no network. Pure function.
- **Idempotent** — running a scrubber on its own output must yield byte-identical content (modulo the JSON pretty-print canonicalization).

---

## Per-platform scrubbers

### `utils/uninstall-scrubbers.ts:scrubHooksJson`

Scrubs `hooks`-shaped settings JSON for **eight** platforms. The schema differs slightly across platforms, so the function takes a `mode` selector:

| Mode | Files | Schema |
|------|-------|--------|
| `"nested"` | `.claude/settings.json`, `.gemini/settings.json`, `.factory/settings.json`, `.codebuddy/settings.json`, `.qoder/settings.json`, `.codex/hooks.json` | `hooks.{Event}.[ {matcher?, hooks: [ {command, ...} ]} ]` |
| `"flat"` | `.cursor/hooks.json`, `.github/copilot/hooks.json` | `hooks.{Event}.[ {command, ...} ]` |

Algorithm:

1. If the top-level `statusLine` command ends in the exact Trellis-owned `.claude/hooks/statusline.py` path, remove it. Preserve every other status-line command.
2. Walk `root.hooks.{eventName}`. For each event array, drop entries whose command matches a deleted path; for nested mode, drill one level deeper through the matcher block's inner `hooks` array first.
3. If a matcher block's inner `hooks` becomes empty → drop the whole block.
4. If an event array becomes empty → `delete root.hooks[eventName]`.
5. If `root.hooks` becomes an empty object → `delete root.hooks`.
6. `fullyEmpty` is true iff `Object.keys(root).length === 0`.

User-defined keys outside `hooks` (`env`, `model`, `permissions`, `version`) are preserved verbatim — only the Trellis-claimed `hooks` subtree is touched.

#### Path matching is **last-token-only**, not substring

The helper `utils/uninstall-scrubbers.ts:commandMatchesDeletedPath` resolves the script path inside a hook command by taking the **trailing whitespace-delimited token** (with surrounding `'`/`"` stripped). It then compares that token to each deleted path with `===` or `endsWith("/" + p)` (so absolute paths match too).

Why not substring containment? A user-written hook like

```json
{ "command": "echo 'see .claude/hooks/session-start.py for context'" }
```

would naively match `".claude/hooks/session-start.py"` and be wrongly deleted. Last-token-only is stricter: the trailing token here is `context'`, not the deleted path.

This rule assumes the Trellis-emitted shape:

```text
<python-cmd> <manifest-relative-path>
```

(e.g. `python3 .claude/hooks/session-start.py`). Any future change to hook command emission (extra trailing args, different launcher) MUST update both the configurator and this scrubber.

#### Command field fallback

`utils/uninstall-scrubbers.ts:getEntryCommand` reads `command` first, then falls back to `bash`, then `powershell`. Copilot's flat schema uses dual `bash`/`powershell` fields instead of a unified `command`. Either field is enough to identify a Trellis entry; we don't require both to match because Trellis emits the same script path on both fields.

### `utils/uninstall-scrubbers.ts:scrubOpencodePackageJson`

Scrubs `.opencode/package.json`:

1. Delete `dependencies["@opencode-ai/plugin"]`.
2. If `dependencies` ends up empty → drop the field.
3. `fullyEmpty` iff the resulting root object has no keys.

This is the simplest scrubber: only one field to touch, and the rest of `package.json` (name, version, scripts, devDeps, …) is user-owned.

### `utils/uninstall-scrubbers.ts:scrubPiSettings`

Scrubs `.pi/settings.json`:

1. Drop `enableSkillCommands` (Trellis-only flag).
2. Filter three arrays for the Trellis-emitted entries (exact string match):
   - `extensions` — remove `"./extensions/trellis/index.ts"`
   - `skills` — remove `"./skills"`
   - `prompts` — remove `"./prompts"`
3. If any of those arrays becomes empty → drop the array key.
4. `fullyEmpty` iff the root has no keys.

Constants `PI_TRELLIS_EXTENSION`, `PI_TRELLIS_SKILLS`, `PI_TRELLIS_PROMPTS` in `utils/uninstall-scrubbers.ts` define the exact strings the Pi configurator emits. If the configurator changes the path emitted, this scrubber must change in lockstep — there is no shared source of truth across the two halves.

### `utils/uninstall-scrubbers.ts:scrubCodexConfigToml`

Scrubs `.codex/config.toml`. Unlike the JSON scrubbers, this one is **line-based**: TOML is harder to round-trip without a real parser, and the Trellis-emitted file is small + flat enough that a marker-line approach is safer than a structural one.

Trellis writes three distinct content classes into this file:

1. The single assignment `project_doc_fallback_filenames = ["AGENTS.md"]`.
2. Comment lines from the shipped Codex config template, plus legacy template comments retained for uninstall compatibility.
3. The exact `[agents]` assignment `max_depth = 1`.

Algorithm:

- Derive the current Trellis comment allowlist directly from `templates/codex/index.ts:getConfigTemplate`; merge it with the legacy allowlist.
- Walk lines. Drop any line that:
  - Matches the assignment regex `/^\s*project_doc_fallback_filenames\s*=/`.
  - Is a comment line whose inner text (after stripping `#` and spaces) **exactly** matches a current-template or legacy marker.
  - Is a bare `#` comment line — these are inside the Trellis comment block.
- Inside an `[agents]` table, remove only `max_depth = 1` (optionally followed by a comment). Keep the table header when another non-comment user key remains; otherwise remove the now-empty table.
- Collapse consecutive blank lines created by removals.
- Trim trailing blanks.
- `fullyEmpty` iff the result has no non-whitespace characters.

User-added lines (their own TOML keys, their own comments, blank gaps) survive because they do not match the assignment regex AND their comment text is not in `trellisCommentMarkers`.

---

## Marker block format

Scrubbers identify Trellis content via three distinct mechanisms — there is no single uniform marker syntax.

| Mechanism | Used by | Example |
|-----------|---------|---------|
| **Last-token path match** against `deletedPaths` | `scrubHooksJson` | Hook entry with `command = "python3 .claude/hooks/session-start.py"` matches because the trailing token is in the delete-set |
| **Exact string match** against hard-coded constants | `scrubOpencodePackageJson`, `scrubPiSettings` | `"./skills"` in a Pi `skills` array, `"@opencode-ai/plugin"` as a dep key |
| **Current-template-derived + legacy comment allowlists**, exact table assignment, and fallback assignment regex | `scrubCodexConfigToml` | Current/legacy Trellis comment lines, `[agents].max_depth = 1`, and `project_doc_fallback_filenames` |

### Why no "BEGIN TRELLIS / END TRELLIS" comment markers?

Earlier designs considered wrapping Trellis content in delimited blocks (`# BEGIN TRELLIS …` / `# END TRELLIS`). We rejected that because:

- **JSON / TOML can't carry inline comments inside arrays/objects in a way every parser preserves on round-trip.** Both Claude's `settings.json` writer and Codex's `config.toml` re-`stringify` on every save, which would either eat the markers or force us to ship a custom serializer. Neither is worth the maintenance.
- **The configurators already produce structurally identifiable values** (specific keys, specific paths, specific comment phrasings). Recognizing those structures is sufficient — no markers needed.

The cost is **brittleness across Trellis versions**: when the configurator changes the path or wording it emits, the scrubber must update in lockstep. See "Common pitfalls" for the explicit rule.

### Legacy compatibility

If a future Trellis version starts emitting a *new* hook script path or a different Pi extension path, the scrubber must recognize **both old and new** for at least one major version, or users who upgrade then immediately uninstall will leak the legacy fields. Today the codebase does not yet face this — only one shape of each emission exists. When the first such migration lands, document it here.

---

## Hash gate

Scrubbers themselves are **not hash-gated**. Decisions about whether a file may be touched at all are upstream:

- `utils/managed-removal.ts:buildManagedRemovalPlan` only considers manifest-listed files. Files outside the manifest are never seen by any scrubber.
- The PRD policy is "全删" — uninstall removes manifest-listed files whether or not the user has modified them. There is no per-file "user-modified, skip" branch like `update.ts` has.
- `--force` does not exist on `uninstall`; the only flags are `--yes` (skip prompt) and `--dry-run` (plan only).

Hash matching DOES affect `update.ts` flows (preserve user edits, `safe-file-delete` allowlist). It does NOT affect `uninstall`. If you are adding a scrubber and reaching for a hash gate, you are probably writing migration logic in the wrong place — see `migrations.md`.

---

## Boundaries

Scrubbers MUST NOT:

- Read or write the filesystem. All I/O lives in `commands/uninstall.ts`.
- Log. The orchestrator owns user-visible output.
- Touch any file beyond the one passed in. No git ops, no template fetches, no other-file writes.
- Couple to other platforms. Each scrubber is self-contained: changing `scrubPiSettings` MUST NOT alter the behavior of any other scrubber.
- Decide whether a file is deletable. They report `fullyEmpty`; the caller decides what to do with that bit.
- Throw. Malformed or unexpected input → `{ content, fullyEmpty: false }` so the caller leaves the file alone.

Scrubbers ARE allowed to:

- Re-canonicalize JSON output (re-indent, sort, etc.) — current implementation re-pretty-prints with 2-space indent.
- Drop blank-line runs created by removals (TOML scrubber does this).
- Delete sibling fields once their last child disappears (e.g. drop empty `dependencies` after removing the last dep).

---

## Common pitfalls

### Configurator emits a new path; scrubber doesn't know

**Symptom**: `trellis uninstall` leaves stale Trellis fields in a platform config file because the scrubber's hard-coded matcher (`PI_TRELLIS_EXTENSION`, `trellisCommentMarkers`) doesn't recognize the new emission.

**Cause**: some configurator and scrubber values remain parallel hard-coded tables of "what Trellis writes". When the configurator changes (e.g. moves the Pi extension to a new path), the scrubber's table goes stale. Codex comment markers avoid this for the current template by deriving from the template source, while still retaining explicit legacy markers.

**Fix**: any PR that changes a configurator's emitted path / field name / comment phrasing in a scrubber-targeted file MUST update the matching scrubber in the same commit. Add a regression test that round-trips configure → scrub → assert empty.

### Marker block partially edited by user

**Symptom**: After `trellis uninstall`, a `.codex/config.toml` retains half of the Trellis comment block (e.g. the user deleted `# NOTE:` but left `# Without this flag, …`).

**Cause**: `scrubCodexConfigToml` matches on **per-line exact text**, not on a block boundary. Any surviving Trellis-known line will be removed individually; any user-edited line whose text no longer matches the allowlist will be preserved.

**Mitigation**: this is the correct behavior — we cannot tell whether a near-miss line is a typo or an intentional user customization. Documentation should warn users: editing Trellis-emitted comments may leave fragments after uninstall. They can always delete manually.

### Hook command with trailing args

**Symptom**: A future configurator emits `python3 .claude/hooks/session-start.py --verbose` and `commandMatchesDeletedPath` no longer matches because the trailing token is now `--verbose`, not the script path.

**Mitigation**: today, all hook commands are exactly two tokens (`<python-cmd> <script-path>`). If we ever add trailing args, `commandMatchesDeletedPath` needs to scan all tokens, not just the last. Update the helper and add a regression test.

### Nested marker / duplicate matcher block

**Symptom**: A platform's `hooks.{Event}` array contains two matcher blocks that both target Trellis. After scrubbing, both should be removed.

**Mitigation**: `scrubHooksJson` already filters per-entry independently. Duplicate Trellis entries are handled correctly. Nested-within-nested is not a real shape any platform emits — the schema is exactly two levels deep — but the scrubber's per-entry filter wouldn't blow up either; it just wouldn't recurse further.

### External tool rewrites the file before uninstall

**Symptom**: A user's editor or formatter normalized `.codex/config.toml` (e.g. reordered keys, changed comment wrapping). The scrubber leaves Trellis content behind because it didn't match the allowlist exactly.

**Mitigation**: the line-allowlist approach is intentionally strict to avoid false positives. If a user's formatter has rewritten Trellis content, we treat it as user-customized and preserve it. Document the workaround: re-run `trellis init` to restore canonical content, then `trellis uninstall` to remove it cleanly.

### Caller forgets to pass `deletedPaths`

**Symptom**: Hooks-JSON scrubber preserves all hook entries because the `deletedPaths` argument is empty.

**Mitigation**: TypeScript catches this — `scrubHooksJson` requires the argument. The plumbing in `utils/managed-removal.ts:buildManagedRemovalPlan` constructs `deletedPaths` from `Object.keys(hashes)` so every manifest entry is in the list. If a hook command refers to a script that is NOT in the manifest, we deliberately leave the entry alone (it might be user-added, even if it points at a Trellis-shaped path).

### Scrubber called on a file outside the manifest

**Symptom**: not a real symptom — `utils/managed-removal.ts:buildManagedRemovalPlan` only dispatches to scrubbers for paths that appear both in `.template-hashes.json` AND in `buildStructuredFileSpecs`. Files outside the manifest are never scrubbed.

**Rule**: do not bypass this gate. Adding "scrub any file with this shape" logic outside the manifest gate would risk modifying user files Trellis never wrote.

---

## Test conventions

Tests for scrubbers live alongside the implementation as pure-function tests — no `tmp` directories, no filesystem. Each scrubber test follows this shape:

1. **Fixture** — a string literal of the file content (with a Trellis section + a user-owned section).
2. **Call** — invoke the scrubber directly.
3. **Assert** — Trellis section is gone, user section is intact, `fullyEmpty` matches expectation.

### Required test cases per scrubber

| Case | What to assert |
|------|----------------|
| Pure Trellis content | After scrub, `fullyEmpty === true` |
| Mixed Trellis + user content | After scrub, `fullyEmpty === false`; user content survives byte-for-byte (modulo JSON re-pretty-print) |
| User-only content | After scrub, content is unchanged-ish (modulo re-stringify) and `fullyEmpty === false` |
| Empty file | `fullyEmpty === true` |
| Malformed input (broken JSON / weird shape) | Returns original content with `fullyEmpty: false` — never throws |
| Idempotency | `scrub(scrub(x)).content === scrub(x).content` |

### Scrubber-specific cases

- `scrubHooksJson`:
  - User hook entry whose command body merely *mentions* a deleted path inside an `echo` or comment argument → preserved (last-token rule).
  - Hook entry with `bash` field instead of `command` (Copilot flat schema) → still matched.
  - Multiple deleted paths in `deletedPaths` → all matching entries dropped in one pass.
  - Both modes (`"nested"`, `"flat"`) covered separately.
  - Exact Trellis Claude `statusLine` command → removed; user-owned status-line command → preserved.
- `scrubCodexConfigToml`:
  - Complete current template → fully empty, including `[agents].max_depth = 1`.
  - Another user key in `[agents]` → table and user key preserved while Trellis depth is removed.
  - User added their own TOML keys above/below the Trellis block → preserved.
  - User edited a Trellis comment line (typo) → that single line preserved as user content; rest of Trellis block removed.
- `scrubPiSettings`:
  - User has their own entry in `extensions`/`skills`/`prompts` → kept; only Trellis entries removed.
- `scrubOpencodePackageJson`:
  - User has other dev/runtime deps → kept.

### Cross-cutting integration test

`commands/uninstall.ts` integration tests should cover the **full** init → uninstall round-trip per platform: confirm that after `init({ <platform>: true })` followed by `uninstall({ yes: true })`, the platform config dir is either gone (if Trellis was the only writer) or contains only the user's pre-existing content. This catches regressions where a configurator change isn't mirrored in a scrubber update.

---

## Reference

Source: `packages/cli/src/utils/uninstall-scrubbers.ts`

Caller: `packages/cli/src/utils/managed-removal.ts` (`buildStructuredFileSpecs`, `buildManagedRemovalPlan`)

Related specs:
- `commands-uninstall.md` — orchestration, plan-render-execute flow, prompts
- `migrations.md` — `safe-file-delete` and hash-gated removal during `update`
- `platform-integration.md` — the configurator side: where each scrubber-targeted file is emitted

---

## Potential TODOs surfaced while reading

- `commandMatchesDeletedPath` assumes the Trellis-emitted command has the exact shape `<python-cmd> <script-path>`. If we ever add launcher flags or wrappers, the helper needs a richer parser (full token scan, possibly drop known shell prefixes like `env VAR=val`).
- The Pi exact-string constants (`PI_TRELLIS_EXTENSION`, `PI_TRELLIS_SKILLS`, `PI_TRELLIS_PROMPTS`) duplicate values that live in the Pi configurator. A shared module exporting these would prevent drift; today they are independently hard-coded in two places.
- `scrubCodexConfigToml` derives current comment markers from the shipped template and keeps an explicit legacy allowlist. Other exact assignments such as `[agents].max_depth = 1` still require lockstep regression coverage when template behavior changes.
- Codex comments now have a legacy-marker compatibility layer. Other platform constants still need an "old OR new" branch and deprecation window when their first emission change lands.
- All hooks-JSON scrubbers re-pretty-print with 2-space indent on every call, even when no change was made. This silently rewrites user formatting (e.g. tab-indented JSON). Acceptable today; flag if users complain.
