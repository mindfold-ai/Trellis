# Using it while you code

Commands run from the project root. The record command is `/mini-trellis:remember` in Claude Code and OpenCode, `$mini-trellis-remember` in Codex, and `/mini-trellis-remember` in Pi. DeepSeek Harness and Cursor use the `mini-trellis-remember` skill.

## Install on a new project

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
```

Pass only the tools you use: `--claude`, `--codex`, `--opencode`, `--pi`, `--dsh`, `--cursor`. Add `-y` to skip prompts. Init writes `.trellis/` and the host files. It does not create a Git commit. DeepSeek has no SessionStart, so call `mem recall` when project knowledge is needed. Cursor installs skills and a local `sessionStart` hook; cloud agents do not run that hook, and a local hook run does not by itself mean the agent prompt received `additional_context`. Neither host parses local conversation history. OpenCode and Pi have no precise compact.

## Cursor

```bash
mini-trellis init -u your-name --cursor -y
```

Init writes the managed block in `AGENTS.md`, three skills under `.cursor/skills/`, and a `.cursor/hooks.json` that registers only `sessionStart`. Record with the `mini-trellis-remember` skill. Recall with `mini-trellis mem recall`, then `mem read` when the excerpt is missing a condition.

On Cursor 3.27.22, a local agent chat ran `sessionStart`, the Hooks log said the responses were merged, and the returned `additional_context` was not in the model prompt. Treat `AGENTS.md` plus `mem recall` as the path that actually works. Cloud agents do not run `sessionStart`. Cursor conversation history is not parsed.

First loop:

1. Run the init command above from the project root.
2. Open a new local agent chat. `mini-trellis doctor` should show `cursor` and `cursor-trigger` as ok. `cursor-runtime` stays unknown until a hook run is on disk.
3. Confirm one rule. Ask the agent to update the existing topic, or create a short spec if none exists, then use `mini-trellis-remember`. Check the topic text, the journal link, and the index.
4. Open another chat and run `mem recall` for that rule. The excerpt should keep the condition and the source.

`init` and `refresh` keep unrelated hooks in `.cursor/hooks.json`. A user `version` value is left as-is. If that file is not valid JSON, init prints `Skipped .cursor/hooks.json` and leaves it, and refresh stops with a conflict. `doctor` then reports `cursor-config`.

| What you see | What to do |
| --- | --- |
| Hooks log never says a project `sessionStart` hook loaded | Open the project root that contains `.cursor/hooks.json`. |
| `cursor-runtime` is unknown | No successful hook record yet. Start one local agent chat, then read `.trellis/.runtime/hooks/cursor.json`. |
| The hook succeeded and the model still has no recall instruction | Use `AGENTS.md` and say `mini-trellis mem recall`. A merged Hooks log is not delivery. |
| `cursor-config` warns | Fix `.cursor/hooks.json` before the next init or refresh. The invalid file is kept. |
| Cloud agent | `sessionStart` does not run. Notes in the repo are still there; call `mem recall`. |

## Move a Trellis project over

Back up project knowledge and custom configuration first, including Git-ignored files. The migration command does not create a backup.

```bash
mini-trellis migrate --dry-run
mini-trellis migrate
```

`--dry-run` lists the changes and does not write. The migration replaces the Trellis instruction surface, rewrites mini-trellis scripts, and folds `.trellis/tasks/` into research. `.trellis/spec/`, `research/`, and `workspace/` stay. `-y` skips the prompts and archives task files under `<topic>/legacy/`.

## Look it up before editing

```bash
mini-trellis mem recall "callback retries"
```

Each hit is a short excerpt with a path and a `ref`. Edit from the excerpt when it is enough. To open the note or the original conversation:

```bash
mini-trellis mem read "<ref>"
```

`mem search` searches conversations only. `mem list` shows sessions for this project. JSON output keeps the full session id; the text list shortens it.

```bash
mini-trellis mem search "callback retries"
mini-trellis mem list --platform claude
mini-trellis mem context <session-id> --platform claude
```

`--platform` is `claude`, `codex`, `opencode`, `pi`, or `all`. Without `--global`, list and context stay in this project. A full id from another project is not used. If the same full id matches more than one session in scope, the command does not pick one.

If nothing matches, change the code. You do not create a task first.

## What to write down

Keep a conclusion only when a later session would need it.

| What happened | Where it goes | What to ask |
| --- | --- | --- |
| Callbacks must carry an idempotency key. | `.trellis/spec/` | Write this as a project convention and update the existing spec. |
| The provider allows at most two retries. | `.trellis/research/` | Update the research note with the conclusion, its conditions, and the doc link. |
| Deduplicating before the ledger made reconciliation wrong, so that approach was dropped. | The same research note | Label it rejected. Do not write it as a current rule. |
| Which files changed, and whether the test passed. | The journal under `.trellis/workspace/<you>/` | Run `remember` before the session ends. |

The journal records the work and the note path. The rule itself lives in spec or research. If a file already covers the topic, edit that file.

You can hand this to the agent:

```text
Confirmed: every callback carries an idempotency key, and a repeat returns the first result.
Deduplicating before the ledger was tried and broke reconciliation. Label that rejected.
Update the existing spec, add the provider doc link to the research note, then run remember.
```

`remember` updates the topic, then links it from the journal.

## Keep the project description current

Keep one description of what the project is today. If a README, docs page, or spec already states it, edit that file. Create a short spec only when no such file exists. Do not copy the same description into a second file.

You can hand this to the agent:

```text
Update the project description from the current code. Keep confirmed capabilities, architecture, and constraints. Mark anything uncertain as unverified.
```

The description lists purpose, implemented capabilities, main modules, and constraints, each traced to code, a test, or a confirmed decision. Planned work and a suggestion are not implemented capabilities. Change the affected section. An ordinary rename or formatting change does not rewrite the description and does not get a journal entry.

A Chinese discussion updates an English description in English, with the same meaning, limits, and negations. After a confirmation, the current description and the journal link agree. The next session's `mem recall` returns the updated text. Older journal entries stay searchable and do not replace the current description.

## When a decision changes

Edit the section when only that section changed. When a whole note is replaced, leave the old note in place and point it at the new one:

```markdown
---
status: superseded
superseded_by: .trellis/research/new-topic.md
---
```

`superseded_by` is a path relative to the repository root. Recall follows a short chain to the last current note and can show a short excerpt of that note. `mem read` shows the same path and does not paste the successor body. A missing target, a path outside the project or the document sources, a self pointer, a cycle, or a chain that is too long is reported and is not treated as the current rule. A newer file time, a nearby source edit, or a nested metadata key does not mark the whole note historical.

## After compact

On Claude Code and Codex, the SessionStart hint after compact names the session id the host sent. From this project, run the command it prints:

```bash
mini-trellis mem context <session-id> --platform claude
```

Use `--platform codex` under Codex. With no query, that reads a bounded window of turns before the latest compaction boundary. A long reply does not drop the last short limit in that window. `mem recall` still searches project notes, and `mem read` expands a `session:v1` ref.

For an older condition, add `--grep "<keyword>"` to locate the original turns. Compaction summaries are excluded from keyword hits and neighboring excerpts. On Codex, the compact hint arrives when the next user message starts.

Three failures stay separate. No session id: the hint stays generic and does not attach another session. The history file is not on disk yet: the command warns that this session has no readable history, then exits with `session not found`. The file cannot be read: the warning says it cannot read that session. Those two warnings are `session-history-missing` and `session-history-unreadable`.

OpenCode and Pi do not have this precise session recovery. Their startup text does not name the current session id. Use `mem recall` and `mem read` for notes. To inspect a local history file, use `mem list --platform opencode` or `--platform pi` and then `mem context` with the full id from that list.

## When something looks wrong

```bash
mini-trellis doctor
```

`--json` prints the same checks. Doctor reports files and the last hook result it can see. It does not mean the model followed the rules.

| Check | What it means |
| --- | --- |
| `legacy-trellis` | A Trellis workflow is still present. Run `mini-trellis migrate --dry-run`. |
| `memory-layer` | `.trellis` or `add_session.py` is missing. Run `mini-trellis init`. |
| `instructions` | `AGENTS.md` is missing the managed block. Run init again. |
| `platforms` | No host was found. Pass `--claude`, `--codex`, `--opencode`, `--pi`, `--dsh`, or `--cursor`. |
| `<host>-runtime` unknown | No real hook run is on disk yet. Start one host session. For Codex, trust the project hook first. For Cursor, a later hook record still does not prove the short entry reached the model prompt. |
| `cursor-config` | `.cursor/hooks.json` is not valid JSON. Init skips it and refresh stops, leaving the file in place. |
| `<host>-runtime` warn | The last hook did not finish cleanly. The detail has the status and error category. |
