# Changelog

## v0.3.2 — 2026-11-01

- A user question that only restates the query no longer crowds out a note that states the rule, including a question that repeats an id such as `TASK-4419`. A turn is treated as only a question when every word is a query term or a request word. A fact with no confirmation word, a `Confirmed:` line, a numeric correction, and a Chinese rejection stay eligible. Reordering document bodies does not move a session hit out of the place coverage gave it.
- A note whose body states the rule ranks ahead of archived tasks whose titles repeat the query, including migrated tasks that also discuss the topic in their own body. The heading is not counted as the body. An archived body still stays ahead of a current title that only says TODO. An archived path or unique id still returns that history. Declared successors are unchanged.

Version changes and upgrade instructions are in the [release notes](docs/releases/v0.3.2.md).

## v0.3.1 — 2026-10-20

- DeepSeek Harness installs short project skills under `.dsh/skills/`. There is no project SessionStart hook. The model calls `mem recall`, then `mem read` when the excerpt is not enough, and `mini-trellis-remember` after a confirmed decision. Compressed transcripts in `~/.dsh/sessions` are not read.
- Cursor installs the same short skills and reuses the local `sessionStart` hook. Cloud agents do not run `sessionStart`. Cursor conversation history is not parsed.
- OpenCode and Pi still do not name the current session after compact.

- Adds a [task comparison summary and detailed per-run breakdown](docs/releases/benchmark-detail.md): 38.4% less elapsed time and 40.1% fewer processed tokens across the recorded Claude Code batch.

Version changes and upgrade instructions are in the [release notes](docs/releases/v0.3.1.md).

## v0.3.0 — 2026-10-18

- A note can mark a whole-document replacement with `status: superseded` and `superseded_by`. Recall prefers the current note, including when `--limit 1` would otherwise keep only the older match. `mem read` shows the same successor path and does not paste the successor body.
- A missing, out-of-scope, self, cyclic, or unfinished chain is reported. A newer file time, a section edit, or nested metadata does not mark the whole note historical.
- After compact, Claude Code and Codex name the host session id. `mini-trellis mem context <id> --platform claude|codex` reads the turns before the latest compaction boundary. Keyword search and neighboring excerpts skip the compaction summary.
- OpenCode and Pi still do not name the current session after compact.

Version changes and upgrade instructions are in the [release notes](docs/releases/v0.3.0.md).

## v0.2.2 — 2026-10-14

- Migration now removes Trellis hook commands, the legacy Pi extension, and the Codex `max_depth = 1` pin before writing mini-trellis host config. User hooks and custom settings stay. A second run can repair config left behind after the scripts were already deleted.
- Session start no longer carries the topic-writing procedure. Recall guidance stays in the short entry; write steps stay in the remember command. A compact restart points back at local session history.
- Recording guidance can keep a rejected approach that a later session should not retry, labeled as rejected rather than as a current rule.
- Removes unused Trellis task-engine modules from the installed script templates. `migrate` and `refresh` delete leftover copies in an existing project. `get_context.py` remains because OpenCode still uses it to resolve monorepo spec scope.
- Document discovery in `mem recall` no longer triggers false `doc-search-incomplete` warnings on large migrated repositories with >200 internal links or deep non-Markdown evidence directories, and ranks active research notes ahead of migrated `legacy/` task files.
- `mini-trellis doctor` renders `unknown` checks with `?` instead of `✗`.

Version changes and upgrade instructions are in the [release notes](docs/releases/v0.2.2.md).

## v0.2.1 — 2026-10-13

- Adds automatic project Markdown discovery and unified `mem recall` / `mem read` alongside local conversation history, with bounded scans and source verification.
- Uses a short startup entry and on-demand excerpts; preserves conditions, negations, original document language and existing topics.
- Links recorded journal sessions to actual spec/research files, reports the actual journal/index paths, and distinguishes those writes from topic updates.
- Defaults new installations to file-only recording; preserves existing configuration. Adds recent hook and recording diagnostics, keeping unobserved delivery `unknown`.
- Batches Git ignore checks for large documentation directories without dropping scope, symlink or incomplete-scan safeguards.
- Pins the banner dependency to a Node 18 compatible release so fresh production installs respect the advertised minimum runtime.
- Validates recording, recall and interactive compact recovery in Claude Code and Codex.

Version changes, host validation and upgrade instructions are in the [release notes](docs/releases/v0.2.1.md).

## v0.2.0 — 2026-10-04

v0.2 makes the memory layer safer to install into an existing project and easier to verify:

- Adds `mini-trellis doctor` with JSON output and an explicit unknown state for host delivery that needs a real session check.
- Adds `mini-trellis refresh` and `refresh --dry-run`; claimed, unchanged assets can be refreshed while local edits and invalid configuration are preserved.
- Merges the mini-trellis AGENTS block and Claude/Codex/Pi JSON entries without overwriting user settings.
- Records a small managed asset manifest during init so later refreshes can distinguish templates from local edits.
- Limits automatic context to 4,000 characters, skips duplicate OpenCode injection, and states when the model should record knowledge.
- Keeps new installs journal-only by default and removes the project-level Codex recursion setting from the new template.

Version changes are in the [release notes](docs/releases/v0.2.0.md).

## v0.1.1 — 2026-10-04

`v0.1.1` is the maintenance baseline immediately before the v0.2 line.

- Keeps the product focused on spec, research, journal, and cross-session memory.
- Supports Claude Code, Codex, OpenCode, and Pi Agent memory hooks.
- Adds the migration path from Trellis tasks into research topics.
- Keeps first install journal-only by default; explicit `remember` can still commit when configured.
- Refreshes the bilingual quick start and documents the memory boundaries.
