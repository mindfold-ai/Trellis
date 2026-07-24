# PRD: Path-scoped on-demand spec injection

## Problem

Specs accumulate. This repo's own `.trellis/spec/` is 884 KB across 40 files
(cli/backend alone 680 KB; platform-integration.md is 162 KB — 5× the 32 KiB
per-file sub-agent cap and larger than the whole 128 KiB budget). Full injection
is impossible: Claude Code truncates `additionalContext` around ~20 KB, and the
07-22-subagent-context-limits caps protect the sub-agent path for good reason.

Today the main session gets spec index **paths only** at SessionStart, and
"агent reads on demand" is unreliable — the model may simply not read them
(the recorded rationale for rejecting pure index-mode in
07-22-subagent-context-limits applies to the main session too). The
`cli/backend/index.md` Pre-Development Checklist already maps code paths to
spec files ("Editing `commands/update.ts` → commands-update.md") — but it is
prose, followed only when the model happens to read and obey it. The failure
mode: rules exist, model edits a matching file 99 turns in, rules are not in
context, model violates them.

**Goal: when the agent edits a file, the specs that govern that file are
injected right then — small, relevant, budgeted — instead of everything
up front or nothing at all.**

## Mechanism (summary)

1. Spec .md files declare which code paths they govern via YAML frontmatter
   (`paths:` glob list).
2. A new shared hook `inject-spec-context.py` fires after Edit/Write tool use
   (Claude Code PostToolUse), matches the edited file path against spec
   frontmatter, and injects matching spec content — budgeted, deduped
   per session.
3. A pull-mode command `get_context.py --mode spec --file <path>` exposes the
   same matching for platforms without tool-event hooks (and for testing).

Symlinking specs into code directories (an idea from the original discussion)
is explicitly dropped: nothing reads directory-local files today, symlinks
break on Windows without privileges, complicate `trellis update` hash
tracking, and a glob mapping is strictly more expressive (one spec ↔ many
directories).

## Requirements

1. **Frontmatter contract** (optional, additive): spec .md files MAY start with
   a `---` frontmatter block containing `paths:` — a list of repo-relative
   globs (`*` within a path segment, `**` across segments). `name` /
   `description` keys are tolerated and ignored by this feature. Files without
   frontmatter (all existing specs everywhere) behave exactly as today. Parsing
   is hand-rolled (house pattern — no YAML dependency).
2. **Matching**: edited file's repo-relative path tested against every
   `.trellis/spec/**/*.md` frontmatter's globs (`index.md` files included if
   they declare paths). Scan reads only the frontmatter head of each file
   (bounded read), not whole bodies.
3. **Injection hook** (`shared-hooks/inject-spec-context.py`), Claude Code
   registration: PostToolUse, matchers `Edit` / `Write` / `MultiEdit`. Output:
   standard `hookSpecificOutput.additionalContext`. Non-matching events, missing
   file_path, no matches, any internal error → exit 0 with no output (stderr
   warning allowed; never block the tool result, never crash the session).
4. **Session dedup**: a given spec is injected at most once per session
   (state file under `.trellis/.runtime/`, keyed by the hook's `session_id`,
   pruned by age). If the spec file's mtime changes after injection, it is
   eligible again. Fail-open: unreadable/unwritable state ⇒ inject.
5. **Budget**: per-spec and per-event byte caps with UTF-8-safe truncation and
   an explicit `[Trellis: truncated — read <path>]` notice (reuse the #441
   truncation conventions). Defaults sized against Claude Code's documented
   **10,000-character** additionalContext ceiling (verified 2026-07-23,
   code.claude.com/docs/en/hooks.md): per-spec 8,192 bytes, per-event total
   9,000 bytes. Configurable via `.trellis/config.yaml` `spec_injection:`
   section; `0` = unlimited (`channel.worker_guard` convention). Overflow specs
   degrade to an index line (path + description if declared) — never silently
   dropped.
6. **Pull mode**: `get_context.py --mode spec --file <path>` prints matching
   spec paths + descriptions (not bodies) — same matching engine, usable by
   class-2 platforms, skills, and tests.
7. **Cross-platform posture**: hook registered on Claude Code only this
   iteration (verified 2026-07-23: PostToolUse fires with session_id +
   tool_input.file_path, supports additionalContext, "Edit|Write|MultiEdit"
   pipe matcher valid; fires for subagent tool calls too, injecting into the
   editing agent's own context — exactly the desired behavior). The script
   keeps the shared-hooks platform-branching shape so later registrations are
   wiring-only. Class-2 platforms get the pull mode. Windows: only a cosmetic
   "hook error" display bug is on record (claude-code#45065); if PostToolUse
   ever fails to fire, the feature degrades to nothing — no breakage.
8. **Dogfood**: add `paths:` frontmatter to the `.trellis/spec/cli/backend/`
   specs already named by the index.md Pre-Development Checklist mapping
   (translate the existing prose mapping; do not invent new mappings).
9. **Distribution**: SHARED_HOOKS_BY_PLATFORM gains the new script for claude;
   `claude/settings.json` template gains the PostToolUse entries; live
   `.claude/settings.json` + `.claude/hooks/` mirrored surgically.
10. **Spec doc**: new `.trellis/spec/cli/backend/spec-injection.md` documenting
    the frontmatter contract, matching, budget, dedup, and platform matrix;
    index.md table entry added.

## Non-goals

- No symlink mechanism (rationale above).
- No hook registration on non-Claude platforms this iteration (follow-up
  matrix documented in the spec doc).
- No auto-generation of frontmatter from index.md checklists (possible
  follow-up for trellis-spec-bootstrap).
- No change to sub-agent JSONL curation or its budgets.
- No central mapping config in config.yaml (frontmatter is the single source;
  avoids two sources of truth).
- No caching/index of frontmatter (bounded head-reads are cheap; caches
  invalidate).

## Acceptance Criteria

- [ ] Editing a file matched by a spec's `paths:` glob injects that spec's
      content once; a second edit of the same/another matching file in the same
      session injects nothing; touching the spec file re-arms injection.
- [ ] Editing a file matching no spec, or a project with zero frontmatter
      specs: hook exits 0, empty output (byte-identical behavior to no hook).
- [ ] Oversized spec truncated at cap with notice; when per-event budget is
      exhausted remaining matches degrade to index lines.
- [ ] `get_context.py --mode spec --file packages/cli/src/commands/workflow.ts`
      lists commands-workflow.md (per dogfood frontmatter).
- [ ] Malformed frontmatter (bad YAML, non-list paths, absolute/`..` globs)
      → that spec is skipped with a stderr warning; hook still exits 0.
- [ ] `spec_injection.enabled: false` disables injection entirely.
- [ ] `pnpm lint && pnpm lint:py && pnpm typecheck && pnpm test` — no new
      failures vs the recorded main baseline (5 pre-existing).

---

# PRD v2 upgrade: ticket-refresh model (supersedes the dedup semantics above)

Source: taosu's v2 architecture doc (2026-07-24, "内核当子进程,平台侧只剩薄适配器",
§4 凭条机制 / §11 spec-inject / §12 会话身份四档阶梯 / §12.1 状态存储). Scope here is
the FEATURE only — the kernel-ABI refactor (P-1..P4) is explicitly out of scope.

## Why v1 semantics are wrong

v1 injects a spec once per session, then stays silent forever. The original
problem statement is recency decay: by round 100+ the agent no longer follows
rules that sit deep in history. Inject-once does not solve that; it recreates it.

## v2 behavior (per spec, per event)

```
tier = identity ladder (below)
h    = sha256(spec content)
last = last emission recorded for (identity, spec)   # tier STATELESS → None

if tier == STATELESS:            emit TICKET          # bounded cost, always
elif last is None:               emit FULL TEXT
elif last.sha256 != h:           emit FULL TEXT       # spec changed → re-teach
elif clock - last.clock < WINDOW: silent               # fixed window: no state append
else:                            emit TICKET          # refresh attention cheaply
```

- FIXED window, not sliding: silent hits do NOT extend the window (continuous
  editing is exactly when drift is worst).
- A TICKET emission also appends state (tickets are rate-limited by the same window).

## Requirements (delta over v1)

1. **Triggers**: add `Read` to the matchers (Read/Edit/Write/MultiEdit) — touching
   a file counts; miss path must stay a fast exit.
2. **Identity ladder** (misfire asymmetry: collision→missed injection is
   unacceptable; drift→extra injection is fine):
   - The session/window key is DELEGATED to
     `common.active_task.resolve_context_key` (the shared, platform-verified
     resolver every other hook uses), called payload-first so env overrides
     can never collapse two live sessions onto one identity.
   - When payload carries `agent_id` (subagent context), identity includes it —
     parent and subagent must NOT share state (context is not shared between them).
   - Resolver unavailable (older scripts tree) → minimal payload-only fallback.
   - No key from any source → stateless: no state IO; every hit emits TICKET only.
   - ppid+TTL identity is documented as reserved for future CLI-only platforms
     and NOT wired (unreliable CLI-vs-IDE detection would violate the
     asymmetry principle).
3. **Clock**: transcript line count when `transcript_path` readable, else epoch
   seconds. State records both when available; compare lines-to-lines else
   seconds-to-seconds; units incomparable → treat as past-window (over-inject side).
4. **State**: user-global, out of the repo —
   `~/.trellis/spec-inject/<project16>/<identity>.<pid>.jsonl`, append-only JSONL,
   per-pid shard (merge on read, newest wins), bad lines skipped, best-effort
   (any state IO failure degrades toward emitting). `TRELLIS_SPEC_STATE_DIR`
   overrides the base dir (tests/hermeticity). GC: prune files older than 48 h,
   at most once per hour via a `.last-gc` mtime marker, event-independent.
5. **Config** (`spec_injection:`): existing keys plus
   `refresh_window_lines` (default 300) and `refresh_window_seconds` (default 2700,
   used when the line clock is unavailable). Both 0 → never refresh (v1 behavior).
6. **Payload shapes** are frozen contracts (see design.md v2 §emissions).
7. Budgets/truncation/degradation/pull mode/frontmatter engine: unchanged.

## Acceptance criteria (v2)

- [ ] First touch of a matched file → full `<spec-context>` block (with sha256 attr).
- [ ] Second touch within window → empty output.
- [ ] Touch past the line window (fixture-controlled transcript) → `<spec-ticket>`
      block, few-hundred-byte order, containing spec path + sha prefix + Read hint.
- [ ] Spec content edited between touches → full text again (hash change beats window).
- [ ] Payload without any identity → ticket-only on every hit, zero state files.
- [ ] Payload with `agent_id` keeps separate state from same `session_id` without it.
- [ ] `Read` tool event triggers exactly like Edit.
- [ ] State lands under `TRELLIS_SPEC_STATE_DIR` when set; stale files pruned by GC.
- [ ] Full gate green (lint, typecheck, lint:py, full test suite vs baseline).
