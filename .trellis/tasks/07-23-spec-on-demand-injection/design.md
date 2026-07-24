# Design: Path-scoped on-demand spec injection

## Architecture

```
.trellis/spec/**/*.md  (optional frontmatter: paths: [globs])
        │  bounded head-read + hand-rolled frontmatter parse
        ▼
common/spec_match.py  ── match(file_path) -> [SpecMatch(path, description)]
        │                                   │
        ▼                                   ▼
shared-hooks/inject-spec-context.py   get_context.py --mode spec --file <p>
  (Claude PostToolUse Edit|Write|MultiEdit)   (pull mode, all platforms)
  budget + session dedup + truncation
  → hookSpecificOutput.additionalContext
```

## Contracts

### 1. Frontmatter (parsing in `common/spec_match.py`, new)

- Only files whose first line is exactly `---` are considered; scan ends at the
  closing `---` or after 100 lines / 8 KiB head-read, whichever first.
- Recognized: `paths:` followed by `- <glob>` items (flat list). `name:` /
  `description:` single-line strings tolerated (description reused in index
  lines). Unknown keys ignored. Hand-rolled parser modeled on
  `channel/agent-loader.ts` / `trellis_config.parse_simple_yaml` style —
  no YAML dependency.
- Glob validation: repo-relative, POSIX separators, must not be absolute, no
  `..` segments, charset `[A-Za-z0-9_./*?-]`. Invalid entry ⇒ stderr warn, skip
  that glob (not the whole file).
- Glob semantics: `**` matches across segments, `*` within a segment, `?`
  single char. Implemented by deterministic translation to a compiled regex
  (documented in module docstring with examples; unit-tested). A glob ending
  in `/` is sugar for `<glob>/**`.

### 2. `common/spec_match.py` API

```python
@dataclass(frozen=True)
class SpecMatch:
    spec_path: Path        # absolute
    rel_path: str          # repo-relative, for display
    description: str | None

def match_specs_for_file(repo_root: Path, file_path: str | Path) -> list[SpecMatch]:
    """file_path absolute or repo-relative; returns matches in stable
    (rel_path sorted) order. Scans .trellis/spec/**/*.md head-reads only.
    Never raises; unreadable spec files are skipped with stderr warning."""
```

### 3. Hook `shared-hooks/inject-spec-context.py`

- stdin: Claude hook JSON. Uses `session_id`, `cwd`, `tool_name`,
  `tool_input.file_path`. Missing/foreign fields ⇒ exit 0 silently.
- Kill switches: honors `TRELLIS_HOOKS=0` / `TRELLIS_DISABLE_HOOKS=1` like the
  other shared hooks; config `spec_injection.enabled: false` disables.
- Flow: resolve repo root (existing hook convention from cwd) → match →
  dedup-filter → budget-assemble → emit
  `{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": ...}}`
  or nothing at all when the final payload is empty.
- Payload shape per spec:
  `<spec-context file="<edited rel path>" spec="<spec rel path>">\n<body>\n</spec-context>`
  with truncation notice inside when capped. Overflow-degraded matches are
  emitted as one `<spec-index>` block of `- <rel_path> — <description|no description>` lines.
- Budgets (config `spec_injection:`): `max_spec_bytes` default 8192,
  `max_total_bytes` default 9000 (Claude additionalContext hard ceiling is
  10,000 chars — stay under with margin), `0` = unlimited. UTF-8-safe
  truncation reusing the truncate_utf8 approach from inject-subagent-context.py
  (self-contained copy — shared-hooks scripts are standalone by design).

### 4. Session dedup state

- File: `.trellis/.runtime/spec-injection/<sanitized session_id>.json`
  → `{"<spec rel path>": <mtime-at-injection>, ...}`.
- Eligible again when current mtime != recorded mtime.
- Prune sibling state files older than 48 h (mtime) on each run, best-effort.
- All state IO fail-open (inject rather than skip) and non-fatal.
- `.runtime/` already gitignored (`.trellis/.gitignore`).

### 5. Pull mode (`get_context.py --mode spec --file <path>`)

- New mode in `common/git_context.py` dispatch → `spec_match`.
- Output: one line per match `<rel spec path> — <description|(no description)>`,
  or `No spec files declare paths matching <path>.` Exit 0 always.
- No budget/dedup (it lists paths, not bodies).

### 6. Registration / distribution

- `templates/claude/settings.json`: add PostToolUse block with matchers
  `Edit`, `Write`, `MultiEdit` → `{{PYTHON_CMD}} .claude/hooks/inject-spec-context.py`,
  timeout 15 (matcher casing/shape copied from existing PreToolUse entries).
- `templates/shared-hooks/index.ts` SHARED_HOOKS_BY_PLATFORM: add
  `inject-spec-context.py` to claude only (comment: other platforms follow-up;
  table drives both init and update).
- Dogfood mirrors: `.claude/settings.json`, `.claude/hooks/inject-spec-context.py`,
  `.trellis/scripts/common/spec_match.py`, get_context dispatch mirror.

### 7. Dogfood frontmatter (translate existing index.md checklist, no invention)

E.g. `commands-workflow.md` → `packages/cli/src/commands/workflow.ts`,
`packages/cli/src/utils/workflow-resolver.ts`; `commands-update.md` →
`packages/cli/src/commands/update.ts`; `script-conventions.md` →
`.trellis/scripts/**`, `packages/cli/src/templates/trellis/scripts/**`,
`packages/cli/src/templates/shared-hooks/**`; `platform-integration.md` →
`packages/cli/src/configurators/**`, `packages/cli/src/templates/**` (will
truncate at cap — the notice + path is the point); full set = whatever
`.trellis/spec/cli/backend/index.md` Pre-Development Checklist names.

## Failure-mode table

| Failure | Behavior |
|---|---|
| No frontmatter anywhere (all existing projects) | zero matches, no output |
| Malformed frontmatter | stderr warn, spec skipped |
| Spec listed but unreadable | stderr warn, skipped |
| State dir unwritable | inject (fail-open), warn |
| Hook crashes (bug) | exit code guarded by top-level try/except → exit 0 |
| additionalContext near ceiling | budget keeps total ≤ 9000 bytes |
| Windows PostToolUse quirk | cosmetic error display only (#45065); worst case: no injection |

## Compatibility

- Projects without frontmatter: hook emits nothing; the only observable delta
  is one extra fast subprocess per Edit/Write. Mitigation: bail out before any
  spec scan when `.trellis/spec` is absent; head-reads are bounded.
- Sub-agents editing matched files receive the injection themselves (verified:
  PostToolUse fires for subagent tool calls; context lands in the editing
  agent's context) — complements, never duplicates, JSONL curation (different
  channel; dedup is per session).
- No interaction with #464 / PR #456 (different injection paths).

## Rollback

Revert removes hook + registration + frontmatter; specs with leftover
frontmatter are inert prose to every other consumer (parsers all skip it —
verified: session-start spec-path listing and index.md readers treat it as
content; harmless `---` block at file top).

Wait — verify that claim during implementation: grep any spec consumers that
would choke on a leading `---` block (e.g. spec-refresh hash tracking is
byte-based, fine; index.md Guidelines tables are prose, fine).

---

# Design v2: ticket-refresh (exact contracts — implementation and tests code to THIS)

Supersedes §4 (session dedup) above. Everything not mentioned here is unchanged.

## Emissions (frozen formats)

FULL (per matched spec; sha256 attr added vs v1):

    <spec-context file="<edited rel>" spec="<spec rel>" sha256="<first 12 hex>">
    <spec body, budgeted, truncation notice inside when capped>
    </spec-context>

TICKET (per matched spec):

    <spec-ticket file="<edited rel>" spec="<spec rel>" sha256="<first 12 hex>">
    You were shown this spec earlier in this session and its content is unchanged.
    It still governs edits to matching files. If you no longer remember it, Read
    <spec rel> before continuing.
    </spec-ticket>

Overflow degradation (`<spec-index>` block) applies to FULL bodies; the index
block is itself budget-bounded — lines that do not fit collapse into one
summary line `- (+N more governing specs over budget — run get_context.py
--mode spec --file <edited rel> to list them)` so the ceiling is honored while
no governing spec is ever silently dropped. Tickets are counted against the
total budget last — if even they do not fit, drop with stderr warn, never
malformed JSON.

## Decision engine

    EDIT_TOOLS = ("Read", "Edit", "Write", "MultiEdit")

    identity, stateless = resolve_identity(root, payload)
      # Session/window key DELEGATED to common.active_task.resolve_context_key
      # (payload-first: allow_environment_context=False, then an env-inclusive
      # second pass) — inherits all platform-verified key handling. On top:
      # "+a-" + sanitize(agent_id) when payload has non-empty agent_id;
      # minimal payload-only fallback ladder when the resolver is unavailable;
      # no key from any source → stateless=True (ticket-only, zero state IO)
    clock = {"lines": line_count(transcript_path) or None, "ts": time.time()}
    for spec in matches:                    # stable rel_path order
        h = sha256(spec bytes).hexdigest()
        last = newest state line for spec   # None when stateless or no record
        decide per PRD v2 state machine; window compare:
          both have lines → lines delta vs refresh_window_lines
          else            → ts delta vs refresh_window_seconds
          incomparable    → past-window
          NEGATIVE delta  → past-window (transcript compacted shorter / clock
                            skew: the earlier injection was likely lost — the
                            over-inject side of the asymmetry principle)
        emit FULL or TICKET → append state line (mode recorded); silent → no append

## State file contract

Path: `${TRELLIS_SPEC_STATE_DIR:-~/.trellis/spec-inject}/<project16>/<identity>.<pid>.jsonl`
  project16 = sha256(str(realpath(repo_root)))[:16]
Line: {"v":1,"spec":"<rel>","sha256":"<64hex>","mode":"full"|"ticket","ts":<float>,"lines":<int|null>,"pid":<int>}
Read: merge every `<identity>.*.jsonl` shard, newest record per spec wins
      (ts is the tiebreaker); malformed lines skipped silently.
Write: O_APPEND single line to own-pid shard; failure → stderr warn, proceed.
GC: under the base dir, when `.last-gc` mtime older than 1 h: touch it, then
    unlink any `*.jsonl` with mtime older than 48 h (best-effort, errors ignored).

## Config keys (template + doc)

    spec_injection:
      enabled: true
      max_spec_bytes: 8192
      max_total_bytes: 9000
      refresh_window_lines: 300     # transcript-line clock; 0 = never refresh
      refresh_window_seconds: 2700  # wall-clock fallback;  0 = never refresh

## Registration delta

claude settings template + live mirror: PostToolUse matchers gain "Read"
(same command/timeout shape). No other platform wiring.

## Explicitly rejected in this scope (upstream doc's larger plan)

Kernel ABI / forwarding shells / behavior registry / config.resolved.json /
heartbeat / doctor / interpreter baking — P-1..P4 territory, separate efforts.
Tier-3 ppid identity: reserved, unwired (rationale in PRD v2 §2).
