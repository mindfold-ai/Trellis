# Runtime Hardening Audit Matrix

> Deliverable for checklist item 1 of `implement.md`. **No code was changed to produce
> this document.** Every "current behavior" cell marked *(verified)* was reproduced by
> running the real scripts against a throwaway git repo; unmarked cells are read from
> source only.

- Audited trees: `.trellis/scripts/**` (dogfood) and
  `packages/cli/src/templates/trellis/scripts/**` (packaged).
- Drift status at audit time: **none** — `diff -rq` over both trees excluding
  `__pycache__` exits 0. Line numbers below are identical in both copies.
- Classification vocabulary from `design.md`: **hard-fail** (risk of data loss, path
  escape, or corrupt task state), **warn-and-continue** (expected hook fail-open or
  optional context), **quiet-fallback** (intentionally missing optional files only).

---

## How the probes were run

A temp repo received a copy of `.trellis/scripts`, a `.trellis/tasks/` tree, and a
sibling directory *outside* the repo. Each lifecycle command was then invoked with
hostile or degenerate input. The reproductions are cheap to re-run; the concrete
commands appear inline in the findings below so the implementation step can turn them
into regression tests directly.

---

## 1. Task path resolution — `common/task_utils.py`

| Entry point | Input source | Trust boundary | Current behavior | Desired behavior | Classification | Existing test coverage |
|---|---|---|---|---|---|---|
| `is_safe_task_path` (`task_utils.py:27`) | n/a | n/a | **Dead code.** Repo-wide grep finds zero callers — only its own docstring and the `__main__` demo at `:297-298` reference it. The one real containment check in the codebase is `is_within_tasks_dir`, which does not call it. | Either wire it into the resolution chokepoint or delete it. A safety helper nothing calls is worse than none: it reads as coverage during review. | hard-fail (as a review hazard) | none |
| `resolve_task_dir` (`task_utils.py:198`) | CLI arg on 11 call sites | **Untrusted** — user/AI-supplied string | No containment whatsoever. `../../etc` → `<repo>/../../etc` *(verified, escapes repo)*; `/etc/passwd` → returned verbatim because absolute paths are honored at `:221-222` *(verified)*; unknown names fall back to `repo_root/<name>` at `:235`. | Resolve, then require containment under `.trellis/tasks/` (or an explicit archive path) before returning. Callers should not each have to re-check. | hard-fail | `regression.test.ts:554` — asserts only that the source *string* contains `.startswith(".trellis")` and a backslash `replace`. No behavioral or traversal test. |
| `find_task_by_name` exact branch (`task_utils.py:114-116`) | CLI arg | Untrusted | `tasks_dir / task_name` with `task_name=".."` is a directory, so the function returns `.trellis/tasks/..` → i.e. `.trellis` itself is handed back as a "task" *(verified)*. | Reject any name containing a path separator or equal to `.`/`..` before the join. | hard-fail | none |
| `find_task_by_name` suffix branch (`task_utils.py:119-121`) | CLI arg | Untrusted | Iterates `tasks_dir.iterdir()` — **unsorted** — and returns the first `-<name>` suffix match. With `01-01-dupe` and `12-31-dupe` both present, one is chosen silently and the choice depends on filesystem enumeration order *(verified: `dupe` → `01-01-dupe`)*. | Collect all matches; on ≥2 print both and fail. Ambiguous identifiers must not resolve. | hard-fail (acceptance criterion 3 names "ambiguous task identifiers" explicitly) | none |
| `is_within_tasks_dir` (`task_utils.py:72`) | computed `Path` | Trusted input, guards untrusted | Correct: `.resolve()` then requires the parent to be exactly the tasks dir, and rejects the literal `archive` name. Resolving means a **symlinked** task dir is rejected too *(verified: `archive 08-09-symlinked` refused, symlink target untouched)*. | Keep as-is. Promote to the shared chokepoint so it guards more than archive. | — (this one is correct) | `regression.test.ts:565` "is_within_tasks_dir archive boundary (issue #428)" — real Python execution, 5 cases. Good model for the rest. |
| Containment enforcement, repo-wide | — | — | `is_within_tasks_dir` is called from exactly **one** place: `task_store.py:541` (`cmd_archive`). Ten other `resolve_task_dir` consumers have no containment check at all. | One chokepoint; commands opt out explicitly rather than opt in accidentally. | hard-fail | partial (archive only) |

### Verified traversal writes

| Command | Probe | Result |
|---|---|---|
| `set-meta` | `task.py set-meta ../victim pwned yes` | Exit 0, `"pwned": "yes"` written into a `task.json` **outside the repo** |
| `set-meta` via symlink | symlinked task dir, `set-meta 08-09-symlinked pwned yes` | Exit 0, wrote through the symlink to the outside target |
| `add-subtask` | `task.py add-subtask ../ext .trellis/tasks/08-09-real-task` | Exit 0, child appended to an outside `task.json`'s `children` |
| `create` | `task.py create Evil --slug ../../../escaped-task` | Exit 0, created `.trellis/escaped-task/` (task.json + prd.md) plus a junk `.trellis/tasks/08-09../` directory |
| `add-context` | `add-context <task> ../../../evil-ctx src/main.py` | Exit 0, appended to `<repo>/evil-ctx.jsonl` — the JSONL *filename* is unvalidated user input |
| `add-context` | `add-context .. implement src/main.py` | Exit 0, created `.trellis/implement.jsonl` (`..` resolved to `.trellis` via the exact-match branch) |

`set-branch`, `set-base-branch`, `set-scope`, and `remove-subtask` share `set-meta`'s
shape (`resolve_task_dir` → `<dir>/task.json` → read → mutate → write) and are escapable
the same way; only `set-meta` was executed as the representative probe.

---

## 2. Task lifecycle commands — `task.py`, `common/task_store.py`

| Entry point | Input source | Trust boundary | Current behavior | Desired behavior | Classification | Existing test coverage |
|---|---|---|---|---|---|---|
| `cmd_create` slug handling (`task_store.py:271`) | `--slug` / title | Untrusted | `slug = args.slug or _slugify(args.title)`. Title-derived slugs are sanitized by `_slugify` (`:65`, strips everything outside `[a-z0-9-]`); an **explicit `--slug` is never sanitized**. Only a date-prefix guard (`:283-305`) inspects it. | Run `--slug` through the same character allow-list, or reject any slug containing `/`, `\`, or `..`. | hard-fail | none (the `#377` date-prefix guard is tested; the character class is not) |
| `cmd_create` existing-dir collision (`task_store.py:318-321`) | filesystem | — | Prints a yellow warning, then **continues and overwrites `task.json` wholesale** at `:389` *(verified: `status`, `children`, `parent`, `branch`, `meta` all reset to defaults; exit 0)*. `prd.md` is preserved by an `exists()` guard, `task.json` is not. | Hard-fail unless an explicit `--force`. Same-day slug reuse is a realistic accident, and the lost fields are exactly the ones nothing else can reconstruct. | hard-fail (acceptance criterion 3: "must not silently overwrite task metadata") | none |
| `cmd_create` archived-name collision (`task_store.py:311-316`) | filesystem | — | Correctly hard-fails with the archived path and a remediation hint. | Keep. This is the pattern the two rows above should copy. | — (correct) | none found |
| `cmd_create` JSONL seeding (`task_store.py:404-407`) | filesystem | — | `if not jsonl_path.exists()` before writing the seed — no clobber. | Keep. | quiet-fallback (correct) | `regression.test.ts` covers seeding-by-platform |
| `cmd_create` parent link (`task_store.py:411-430`) | `--parent` | Untrusted | `resolve_task_dir` with no containment; a missing parent `task.json` only warns and the task is still created with `parent: null` — a half-specified link that looks successful. | Containment check; and since `--parent` was explicit, a bad parent should fail rather than silently drop the relationship. | hard-fail | none |
| `cmd_start` (`task.py:73`) | CLI arg | Untrusted | `is_dir()` check only. Non-task dirs are stopped *incidentally*, by `set_active_task` → `_canonical_task_ref` → `resolve_task_ref`, which re-roots bare names under `.trellis/tasks/` *(verified: `start src` → "Failed to set current task")*. In **degraded mode** (no session identity) that path is never reached: `start src` prints the degraded notice and **returns 0** *(verified)*. | Validate the target is a real task (task.json present, inside tasks dir) *before* branching on session identity, so both modes agree. | hard-fail (the two modes disagreeing is the defect) | `regression.test.ts` covers degraded-mode session behavior, not target validation |
| `cmd_finish` (`task.py:146`) | none | — | Deletes only the resolved session file; well specified and well tested. | Keep. | — (correct) | `regression.test.ts` finish/exact-match/fallback/ambiguous cases |
| `cmd_archive` guard (`task_store.py:541`) | CLI arg | Untrusted | Correct — refuses anything not directly under `.trellis/tasks/`. | Keep. | — (correct) | `regression.test.ts:565` |
| `archive_task_dir` destination collision (`task_utils.py:159-165`) | filesystem | — | `shutil.move` with an **already-existing** destination directory moves the source *inside* it. Archiving `08-09-collide` when `archive/2026-08/08-09-collide/` already exists produces `archive/2026-08/08-09-collide/08-09-collide/` *(verified)*. The pre-existing archived files survive, but the function returns — and `cmd_archive` prints and hooks on — the **wrong path**: the old archived dir, not where the task actually went. | `if dest.exists(): fail` before the move. Same-slug tasks in the same month are plausible, and the wrong return path propagates into the printed result, the `after_archive` hook's `TASK_JSON_PATH`, and the auto-commit paths. | hard-fail | `packages/cli/test/scripts/task-archive.integration.test.ts` exists but does not cover destination collision |
| `cmd_add_subtask` / `cmd_remove_subtask` (`task_store.py:719`, `:772`) | two CLI args | Untrusted | No containment (see §1). Both `task.json`s are written as two independent `write_json` calls (`:761-762`, `:808-809`) whose return values are ignored — if the second fails the link is half-written with no error. `add-subtask` does correctly refuse a child that already has a parent (`:746-748`). | Containment check on both; verify the first write before attempting the second and report which side failed. | hard-fail | none |

---

## 3. JSON I/O — `common/io.py` and callers

`read_json` (`io.py:16`) collapses *missing*, *invalid JSON*, and *unreadable* into a
single `None`. `write_json` (`io.py:27`) is properly atomic (mkstemp + `os.replace`,
with the `#429` fd-ownership fix) and returns `False` on failure.

The problem is not the helpers; it is that **12 of the 14 `write_json` call sites ignore
the return value**, and the `read_json` callers that do check produce no message.

| Entry point | Input source | Trust boundary | Current behavior | Desired behavior | Classification | Existing test coverage |
|---|---|---|---|---|---|---|
| `read_json` (`io.py:16`) | filesystem | Semi-trusted (repo state) | Returns `None` for missing / invalid / `OSError`. | Keep the tolerant helper for optional reads; add a strict variant (or an out-param for the failure reason) for the safety-sensitive callers below. | quiet-fallback (correct **for optional reads only**) | `regression.test.ts:629` covers `write_json` fd ownership; nothing covers `read_json` failure-mode distinction |
| `cmd_set_branch` / `set_base_branch` / `set_scope` / `set_meta` (`task_store.py:835-837`, `869-871`, `901-903`, `933-935`) | filesystem | Semi-trusted | `data = read_json(...); if not data: return 1` — **exit 1 with zero output** *(verified for both a corrupt `task.json` and a `chmod 000` one; stdout and stderr are completely empty)*. The user cannot tell a parse error from a permissions error from an empty file. | Distinguish and print: which file, which failure, what to do. These commands are about to overwrite the file, so a silent read failure is the last warning the user gets. | hard-fail | none |
| Same four commands, write side (`:840`, `:874`, `:906`, `:942`) | — | — | `write_json(...)` return ignored, then unconditionally prints `✓ Branch set to: …` and returns 0. A failed write reports success. | Check the return; report failure and exit non-zero. | hard-fail | none |
| `cmd_create` (`task_store.py:389`, `:424`, `:428`) | — | — | All three writes unchecked. A failed `task.json` write still prints "Created task", emits the path on stdout for script chaining, and returns 0 — leaving a directory with a `prd.md` and no `task.json` (which `list` then hides, see below). | Check `:389` at minimum; a task without `task.json` is not a task. | hard-fail | none |
| `cmd_archive` status write (`task_store.py:574`) and child re-parenting (`:592`) | — | — | Unchecked. `:592` failing leaves a child pointing at an archived parent while `modified_children` still records it for staging. | Check both; the archive move should not proceed on a failed status write. | hard-fail | `task-archive.integration.test.ts` (happy path) |
| `task.py:119`, `task.py:133` (`cmd_start` status flip) | — | — | **These two are correct** — the `✓ Status: planning → in_progress` message is gated on the `write_json` return. | Keep; this is the pattern the others should match. | — (correct) | `regression.test.ts` |
| `tasks.py:load_task` (`:36`) | filesystem | Semi-trusted | `if not data: return None`, so `iter_active_tasks` **silently omits** any task with a corrupt or unreadable `task.json`. *(verified: a task with `{ not json` does not appear in `task.py list` and is not counted.)* A task can vanish from the workflow with no diagnostic anywhere. | Keep the iterator tolerant, but emit one stderr warning per skipped task so the disappearance is observable. | warn-and-continue | none |
| `cmd_current --json` (`task.py:175`) | filesystem | Semi-trusted | `read_json(...) or {}` → every field emits `null` for a corrupt `task.json`, indistinguishable from a task that genuinely has null fields. | Surface a read-failure signal in the JSON envelope. | warn-and-continue | `regression.test.ts` covers the JSON shape, not the corrupt case |
| `active_task.py:_read_json` (`:512`) / `_write_json` (`:520`) | filesystem | Semi-trusted | A **second, private** copy of the JSON helpers. `_read_json` adds an `isinstance(dict)` check `io.read_json` lacks; `_write_json` is a plain `path.write_text` — **not atomic**, unlike `io.write_json`. Session runtime files are therefore still truncatable mid-write, which is the exact failure class `io.write_json` was hardened against. | Route through `io.write_json` (adding the `mkdir(parents=True)` it needs), or document why session files are exempt. | hard-fail | `regression.test.ts:629` covers `io.write_json` only — the duplicate is uncovered |

---

## 4. Config parsers — `common/config.py`, `common/trellis_config.py`

**Finding: the two parsers are not merely similar, they are identical.** Extracting
`_parse_yaml_block` from each and diffing with comments and docstrings normalized away
yields no differences, and all 21 behavioral probes below returned byte-identical
results from both. The `prd.md` framing ("either consolidate the parser or document and
test any deliberate differences") resolves to: **there are no deliberate differences**;
the risk is future drift, and nothing tests for it.

| Entry point | Input source | Trust boundary | Current behavior | Desired behavior | Classification | Existing test coverage |
|---|---|---|---|---|---|---|
| `config.py:parse_simple_yaml` (`:62`) vs `trellis_config.py:parse_simple_yaml` (`:112`) | `.trellis/config.yaml` | Semi-trusted (repo-committed) | Structurally identical duplicates. Both handle `key: value`, nested maps by indentation, `- ` lists, inline `#` comments outside quotes, single-layer unquoting, tabs, and CRLF identically. | Consolidate into one module, or add a parity test that fails on drift — the same remedy the `.py` tree-parity test applies to the two script trees. | hard-fail (drift class) | `regression.test.ts:7935` (source-string assertions on `config.py` only) and `:7958` (6 executed cases, `config.py` only). **`trellis_config.py`'s parser is never executed by any test.** |
| Both parsers — list of mappings | config file | Semi-trusted | **Silent corruption.** `packages:\n  - name: cli\n    path: packages/cli` parses to `{"packages": ["name: cli"], "path": "packages/cli"}` — the second key is hoisted into the **top-level** dict *(verified, both parsers)*. A nested key silently becomes a root key. | Detect and reject the shape with a clear error, or support it. Silent key hoisting is the worst option. | hard-fail | none |
| Both parsers — block scalars | config file | Semi-trusted | `notes: \|` followed by indented lines yields `{"notes": "\|"}` — the marker becomes the value and the body is dropped *(verified)*. | Reject unsupported YAML constructs loudly rather than producing a plausible-looking wrong value. | hard-fail | none |
| Both parsers — anchors / aliases / flow collections | config file | Semi-trusted | `&anchor`, `*alias`, `<<:`, `[a, b]`, `{a: 1}` all become literal strings *(verified)*. | Same as above: named as unsupported, detected, reported. | warn-and-continue | none |
| Both parsers — typing | config file | Semi-trusted | Everything is a string; `false` → `"false"`, `null` → `"null"`, `1` → `"1"`. | Document the string-only contract in one place. Consumers already re-coerce; see the inconsistency below. | warn-and-continue (documented) | partially, via consumer tests |
| Boolean coercion consumers | parsed config | — | Inconsistent. `get_session_auto_commit` (`config.py:236-240`) accepts `true/yes/1/on` and `false/no/0/off` and warns on anything else; `_is_true_config_value` (`:176-182`), used for `packages.*.git`, accepts **only** the exact string `"true"` — so `git: yes` silently means false. | One coercion helper for all boolean config values. | hard-fail (silent wrong branch) | `regression.test.ts` covers `session_auto_commit`; `_is_true_config_value` is uncovered |
| `_load_config` (`config.py:191`) | file read + parse | — | Catches `(OSError, IOError)` around **both** the read and the parse, so a parser exception propagates and crashes the caller. | Match `trellis_config.py:128-131`, which wraps the parse in `except Exception` and returns `{}`. | warn-and-continue (fail-open, deliberately) | none |
| `read_trellis_config` (`trellis_config.py:120`) | file | — | Correct: returns `{}` on missing, unreadable, parse-exception, and non-dict results. | Keep; this is the hardened side of the asymmetry. | quiet-fallback (correct) | none |
| `get_hooks` (`config.py:370`) | parsed config | Semi-trusted | Returns `[]` silently when `hooks` is not a dict, **and** when the event's value is not a list. `hooks:\n  after_create: echo hi` (scalar instead of list — an easy mistake) parses fine and then silently registers no hooks *(verified: parses to `{"hooks": {"after_create": "echo hi"}}`)*. | Warn on a declared-but-unusable hook. A hook the user believes is installed and which silently never runs is the worst outcome for this feature. | warn-and-continue | none |
| `_load_config` call pattern | — | — | Every getter re-reads and re-parses `config.yaml`. `cmd_create` alone triggers it 5+ times. Performance only, no safety impact. | Optional: memoize per repo root. | out of scope | — |

---

## 5. Lifecycle hooks — `common/task_utils.py:242` (`run_task_hooks`)

| Entry point | Input source | Trust boundary | Current behavior | Desired behavior | Classification | Existing test coverage |
|---|---|---|---|---|---|---|
| `run_task_hooks` failure reporting (`:274-280`) | hook exit status | — | On non-zero, prints `[WARN] Hook failed (<event>): <cmd>` plus `result.stderr` if non-empty. **The exit status is not printed** *(verified: a hook exiting 3 reports no `3` anywhere)*, **stdout is captured and discarded**, and the cwd is not shown. | Report event, command, exit status, and both streams (truncated). Acceptance criterion 6 names exit status and stdout/stderr explicitly. | warn-and-continue (fail-open is correct; the diagnostics are not) | none — no test executes `run_task_hooks` |
| `run_task_hooks` timeout (`:264-273`) | hook command | — | `subprocess.run` with **no `timeout=`**. A hook that hangs (waiting on stdin, a network call, an auth prompt) blocks `task.py create` / `archive` / `start` / `finish` indefinitely. `capture_output=True` means the user sees nothing while it hangs. | Add a bounded timeout and report `TimeoutExpired` as a hook failure. The script-conventions spec already requires short timeouts for advisory subprocess probes. | hard-fail (a lifecycle command that never returns) | none |
| `run_task_hooks` exception path (`:281-285`) | — | — | Broad `except Exception` → warn and continue to the next hook. Correct fail-open. | Keep; add exception type to the message. | warn-and-continue (correct) | none |
| `run_task_hooks` execution model (`:264-266`) | `.trellis/config.yaml` | **Repo-committed file** | `shell=True`, cwd = repo root, inherited env plus `TASK_JSON_PATH`. Cloning a repo whose `config.yaml` declares an `after_create` hook and then running `task.py create` executes that command. This is the intended design (hooks are shell commands by definition), but the trust boundary is not stated anywhere in the specs. | Document the boundary explicitly in `script-conventions.md`. No behavior change proposed. | out of scope for behavior; **document** | none |
| Hook invocation sites | — | — | `after_create` (`task_store.py:506`), `after_archive` (`:624`), `after_start` (`task.py:121`, `:139`), `after_finish` (`task.py:163`). Note `after_archive` receives the archived `task.json` path — which is **wrong** in the destination-collision case in §2. | Fix the collision; the hook path is a downstream symptom. | hard-fail (via §2) | none |

---

## 6. Dogfood / packaged template drift

```
$ diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__
$ echo $?
0
```

**No drift.** Both trees are byte-identical, so every finding above applies to both
copies and every fix must land in both. This is already enforced by
`regression.test.ts` → `describe("regression: .trellis/scripts stays byte-identical to
templates/trellis/scripts")`, which derives its file list from the filesystem, so no
test edit is needed when fixing these files — only the `rsync` step from
`script-conventions.md` §7.

---

## 7. Top findings by risk

Ranked by (likelihood of being hit accidentally) × (irreversibility).

1. **`cmd_create` silently overwrites an existing task's `task.json`** — reusing a slug
   on the same day resets `status`, `children`, `parent`, `branch`, and `meta` behind a
   yellow warning and exit 0. Highest-likelihood data loss here: it needs no hostile
   input, just a repeated command.
2. **Archive destination collision nests the task and reports the wrong path** —
   `shutil.move` into an existing directory produces
   `archive/<month>/<task>/<task>/`, and the wrong path then flows into the printed
   result, the `after_archive` hook payload, and the auto-commit path list.
3. **`resolve_task_dir` has no containment, and ten of its eleven callers add none** —
   `set-meta`, `set-branch`, `set-base-branch`, `set-scope`, `add-subtask`,
   `remove-subtask`, `add-context`, `validate`, `list-context`, and `create --parent`
   will read and write `task.json` / `.jsonl` files anywhere the process can reach,
   including outside the repo and through symlinks. `create --slug` and
   `add-context`'s JSONL *filename* are separately unsanitized. Only `archive` is
   guarded, and `is_safe_task_path` — the helper that looks like the guard — is dead
   code with zero callers.
4. **Unchecked `write_json` returns plus message-free `read_json` failures** — 12 of 14
   write sites report success unconditionally; the four `set-*` commands exit 1 with
   *completely empty* output when `task.json` is corrupt or unreadable; and a corrupt
   `task.json` silently removes the task from `task.py list`. A task can disappear with
   no diagnostic produced anywhere in the system.
5. **`run_task_hooks` has no timeout and omits the exit status and stdout** — a hanging
   hook wedges `task.py create` with no output at all, and a failing one reports neither
   its exit code nor its stdout. Separately, the two config parsers are byte-equivalent
   duplicates with only one of them under test, and both silently hoist keys out of a
   list-of-mappings into the top-level config dict.

---

## 8. Notes for the implementation step

- The single highest-leverage change is a containment chokepoint: make
  `resolve_task_dir` return `None` (or raise) for anything outside `.trellis/tasks/`,
  and let callers opt out explicitly. That closes finding 3's whole class rather than
  its ten instances.
- `regression.test.ts:565` (`is_within_tasks_dir`) and `:629` (`write_json` fd
  ownership) are the right template for the new tests: they write the real scripts into
  a temp repo and execute Python, rather than asserting on source strings. The
  `resolve_task_dir` block at `:554` is the anti-pattern to avoid — it asserts the
  source *contains a substring* and would pass unchanged against every defect in §1.
- Fixes land in both script trees in one commit; re-verify with
  `diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__`.
- Per the task's planning notes, run GitNexus impact analysis before editing
  `resolve_task_dir`, `find_task_by_name`, `read_json`, and `run_task_hooks` — each has
  many callers, and `resolve_task_dir` in particular is load-bearing for eleven commands.
