# Quality Guidelines

> Code quality standards for backend/CLI development.

---

## Overview

This project enforces strict TypeScript and ESLint rules to maintain code quality. The configuration prioritizes type safety, explicit declarations, and modern JavaScript patterns.

---

## TypeScript Configuration

### Strict Mode

The project uses `strict: true` in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

This enables:
- `strictNullChecks` - Null and undefined must be explicitly handled
- `strictFunctionTypes` - Function parameter types are checked strictly
- `strictPropertyInitialization` - Class properties must be initialized
- `noImplicitAny` - All types must be explicit
- `noImplicitThis` - `this` must have explicit type

---

## ESLint Rules

### Forbidden Patterns

| Rule | Setting | Reason |
|------|---------|--------|
| `@typescript-eslint/no-explicit-any` | `error` | Forces proper typing |
| `@typescript-eslint/no-non-null-assertion` | `error` | Prevents runtime null errors |
| `no-var` | `error` | Use `const` or `let` instead |

### Required Patterns

| Rule | Setting | Description |
|------|---------|-------------|
| `@typescript-eslint/explicit-function-return-type` | `error` | All functions must declare return type |
| `@typescript-eslint/prefer-nullish-coalescing` | `error` | Use `??` instead of `\|\|` for defaults |
| `@typescript-eslint/prefer-optional-chain` | `error` | Use `?.` for optional access |
| `prefer-const` | `error` | Use `const` when variable is not reassigned |

### Exceptions

```javascript
// eslint.config.js
rules: {
  "@typescript-eslint/explicit-function-return-type": [
    "error",
    {
      allowExpressions: true,          // Arrow functions in callbacks OK
      allowTypedFunctionExpressions: true,  // Typed function expressions OK
    },
  ],
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",   // Prefix unused params with _
      varsIgnorePattern: "^_",   // Prefix unused vars with _
    },
  ],
}
```

---

## Code Patterns

### Return Type Declarations

All functions must have explicit return types:

```typescript
// Good: Explicit return type
function detectProjectType(cwd: string): ProjectType {
  // ...
}

async function init(options: InitOptions): Promise<void> {
  // ...
}

// Bad: Missing return type (ESLint error)
function detectProjectType(cwd: string) {
  // ...
}
```

### Nullish Coalescing

Use `??` for default values, not `||`:

```typescript
// Good: Nullish coalescing
const name = options.name ?? "default";
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const depNames = Object.keys(allDeps ?? {});

// Bad: Logical OR (treats empty string, 0 as falsy)
const name = options.name || "default";
```

### Optional Chaining

Use `?.` for optional property access:

```typescript
// Good: Optional chaining
const version = config?.version;
const deps = pkg?.dependencies?.["react"];

// Bad: Manual checks
const version = config && config.version;
```

### Const Declarations

Use `const` by default, `let` only when reassignment is needed:

```typescript
// Good: const for non-reassigned
const cwd = process.cwd();
const options: InitOptions = { force: true };

// Good: let for reassigned
let developerName = options.user;
if (!developerName) {
  developerName = detectFromGit();
}

// Bad: let for non-reassigned
let cwd = process.cwd();  // ESLint error: prefer-const
```

### Unused Variables

Prefix unused parameters with underscore:

```typescript
// Good: Prefixed with underscore
function handler(_req: Request, res: Response): void {
  res.send("OK");
}

// Bad: Unused without prefix (ESLint error)
function handler(req: Request, res: Response): void {
  res.send("OK");
}
```

---

## Interface and Type Patterns

### Interface Definitions

Define interfaces for structured data:

```typescript
// Good: Interface for options
interface InitOptions {
  cursor?: boolean;
  claude?: boolean;
  yes?: boolean;
  user?: string;
  force?: boolean;
}

// Good: Interface for return types
interface WriteOptions {
  mode: WriteMode;
}
```

### Type Aliases

Use type aliases for unions and computed types:

```typescript
// Good: Type alias for union
export type AITool = "claude-code" | "cursor" | "opencode";
export type WriteMode = "ask" | "force" | "skip" | "append";
export type ProjectType = "frontend" | "backend" | "fullstack" | "unknown";

// Good: Type alias with const assertion
export const DIR_NAMES = {
  WORKFLOW: ".trellis",
  PROGRESS: "agent-traces",
} as const;
```

### Export Patterns

Export types explicitly:

```typescript
// Good: Explicit type export
export type { WriteMode, WriteOptions };
export { writeFile, ensureDir };

// Good: Combined export
export type WriteMode = "ask" | "force" | "skip" | "append";
export function writeFile(path: string, content: string): Promise<boolean> {
  // ...
}
```

---

## Forbidden Patterns

### Never Use `any`

```typescript
// Bad: Explicit any
function process(data: any): void { }

// Good: Proper typing
function process(data: Record<string, unknown>): void { }
function process<T>(data: T): void { }
```

### Never Use Non-Null Assertion

```typescript
// Bad: Non-null assertion
const name = user!.name;

// Good: Proper null check
const name = user?.name ?? "default";
if (user) {
  const name = user.name;
}
```

### Never Use `var`

```typescript
// Bad: var declaration
var count = 0;

// Good: const or let
const count = 0;
let mutableCount = 0;
```

---

## Schema Deprecation: Audit ALL Writers, Not Just the Creator

**Trigger**: Removing a field from a persisted schema (e.g. `task.json`, migration manifests, config files).

**Common mistake**: Remove the field from the creator (`cmd_create` / init) and the reader (normalize / load), but forget that **other writers** (hooks, triggers, sub-processes) still re-populate the field on every event. Net effect: field "deprecated" in docs, but still appears in newly-written files — you've declared a cleanup but haven't executed it.

### Scope / Trigger
- Any commit that removes a field from a schema struct or JSON output.
- Trigger is independent of whether the reader still tolerates the field.

### Audit Contract
Before landing the removal, produce a writer inventory:

```bash
# Find every place that writes the field (not just the schema definition)
grep -rn "<field_name>" --include="*.py" --include="*.ts" --include="*.js" .
```

Classify each hit:

| Kind | Example | Action |
|------|---------|--------|
| **Schema / creator** | `task_store.cmd_create`, `utils/task-json.ts:emptyTaskJson` (TS factory used by `init.ts` + `update.ts`) | Drop field from output |
| **Writer / updater** | `inject-subagent-context.py:update_current_phase`, OpenCode plugin equivalent | **Drop the write call OR delete the function entirely** |
| **Reader / getter** | `tasks.py:load_task` (defaults via `data.get("field", default)` on `TaskInfo`) | Keep with tolerance default (`data.get("field", null)`) — handles legacy files |
| **Docs / comments** | spec, README, PRDs | Update references |
| **Tests** | Assertions on field presence | Flip to "must NOT contain field" |

### Validation & Error Matrix
| Condition | Expected behaviour |
|-----------|-------------------|
| Fresh task: field present in `task.json` | ❌ regression — writer missed |
| Old task still has field | ✅ tolerated (reader defaults) |
| Two runs of the same lifecycle op | ✅ field never re-appears |

### Tests Required
- **Writer regression**: call creator → assert field NOT in output. Example: `test task.py create does NOT write legacy current_phase / next_action`.
- **Writer-after-event regression**: simulate the downstream event that historically re-wrote the field (e.g. spawn sub-agent → hook fires) → re-read file → assert field still absent.
- **Reader compatibility**: mock a legacy file containing the field → assert reader does not raise.

### Wrong vs Correct
#### Wrong — cleanup only touches the creator
```python
# task_store.cmd_create — dropped current_phase
task_data = {"status": "planning", ...}  # current_phase removed
```
```python
# inject-subagent-context.py — still writes it on every spawn
def update_current_phase(task_dir, subagent_type):
    task = read_json(task_dir / "task.json")
    task["current_phase"] = next_phase(...)  # ← re-populates deprecated field
    write_json(task_dir / "task.json", task)
```
Net: after the first `implement` spawn, `task.json` contains `current_phase` again. Deprecation undone silently.

#### Correct — delete every writer, or route through a single entry point
Option A: delete the writer function.
```python
# inject-subagent-context.py
# (update_current_phase + its call removed; the hook no longer writes phase)
```
Option B: keep the writer but have it stop emitting the field.
```python
def update_task_state(task_dir, subagent_type):
    task = read_json(task_dir / "task.json")
    task["last_subagent"] = subagent_type  # new field
    # current_phase not written
    write_json(task_dir / "task.json", task)
```

### Why
A field is "gone" only after every code path that could produce it is removed. Silently leaving ghost writers makes the deprecation non-executable and forces future readers to keep supporting the field forever.

### Case Study (2026-04-22): `current_phase` / `next_action` drift across 4 writers + type declaration

The task `04-21-task-schema-unify` ran a retroactive audit on the 0.5.0-beta.0 deprecation of `current_phase` / `next_action` and found **four** drift modes that the original cleanup missed, across **both TypeScript and Python**:

| # | Location | Drift mode | Why the first audit missed it |
|---|----------|------------|-------------------------------|
| 1 | `packages/cli/src/commands/init.ts` (`interface TaskJson` + `getBootstrapTaskJson`) | Divergent 17-field TS interface + inline object literal | Audit grepped for field names, but this writer omitted them rather than writing them — it silently diverged in shape, not content |
| 2 | `packages/cli/src/commands/update.ts` (migration-task inline literal) | Inline TS object still wrote `current_phase: 0` + `next_action: [...]` | Writer lives in a language the original Python-focused audit skipped |
| 3 | `.trellis/scripts/create_bootstrap.py` | Orphan Python CLI — its own 13-field shape incl. structured subtasks | Not invoked by any command; shipped as template but dead. Easy to miss because grepping for "bootstrap" returns too many hits |
| 4 | `.trellis/scripts/common/types.py` — `TaskData` TypedDict declared `current_phase: int` + `next_action: list[dict]` | **Type-declaration writer**: no runtime code produces the field, but readers that annotate `TaskData` get IDE autocomplete for ghost fields, and code reviewers see "valid field" | A TypedDict is technically a declaration, not a writer — but to the reader-side contract, it IS a writer of expectations |

**Three lessons added to the audit discipline**:

1. **Cross-language grep**: when a field is removed, grep must span `.py`, `.ts`, `.js`, AND `.json` (migration manifest changelogs can leak field names that get copy-pasted). Restrict by `--include="*.py" --include="*.ts"` plus checking manifest `.json` files.
2. **Shipped-but-unused code counts**: any file enumerated in a template registry (`packages/cli/src/templates/trellis/index.ts`, `templates/markdown/index.ts`) is a writer of user expectations even if no command invokes it. Orphan = still writes.
3. **Type declarations count as writers of the reader-side contract**: a TypedDict / TS interface that still declares the deprecated field misleads consumers the same way a runtime writer does. Prune declarations in the same PR as runtime writers.

**Consolidation outcome**: `packages/cli/src/utils/task-json.ts` now exports a single `TaskJson` type + `emptyTaskJson(overrides)` factory. Both `init.ts` and `update.ts` route through it. The audit set for future schema changes is now: canonical Python `cmd_create` (runtime) + canonical TS `emptyTaskJson` (bootstrap + migration) + `TaskData` TypedDict (declaration). Three surfaces instead of seven.

---

## Quality Checklist

Before committing, ensure:

- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm typecheck` passes with no errors
- [ ] All functions have explicit return types
- [ ] No `any` types in code
- [ ] No non-null assertions (`x!` operator)
- [ ] Using `??` instead of `||` for defaults
- [ ] Using `?.` for optional property access
- [ ] Using `const` by default, `let` only when needed
- [ ] Unused variables prefixed with `_`

---

## Running Quality Checks

```bash
# Run ESLint
pnpm lint

# Run TypeScript type checking
pnpm typecheck

# Run both
pnpm lint && pnpm typecheck
```

---

## CLI Design Patterns

### Explicit Flags Take Precedence

When a CLI has both explicit flags (`--tool`) and convenience flags (`-y`), explicit flags must always win:

```typescript
// Bad: -y overrides explicit flags
if (options.yes) {
  tools = ["cursor", "claude"]; // Ignores --iflow, --opencode!
} else if (options.cursor || options.iflow) {
  // Build from flags...
}

// Good: Check explicit flags first
const hasExplicitTools = options.cursor || options.iflow || options.opencode;
if (hasExplicitTools) {
  // Build from explicit flags (works with or without -y)
} else if (options.yes) {
  // Default only when no explicit flags
}
```

**Why**: Users specify explicit flags intentionally. The `-y` flag means "skip interactive prompts", not "ignore my other flags".

### Scenario: Non-Interactive Batch Flags Must Not Prompt

#### 1. Scope / Trigger

- Trigger: any command that accepts batch-resolution flags such as `--force`,
  `--skip-all`, `--create-new`, or a command-specific `--yes`.
- Reason: these flags are explicit consent for non-interactive execution. A
  later confirmation prompt can crash CI or smoke tests when stdin is closed.

#### 2. Signatures

- `trellis update --force`
- `trellis update --skip-all`
- `trellis update --create-new`
- `trellis update --force --migrate`
- `update({ force?: boolean, skipAll?: boolean, createNew?: boolean, migrate?: boolean })`

#### 3. Contracts

- `--force`, `--skip-all`, and `--create-new` resolve file conflicts without
  per-file prompts.
- The same flags also bypass the final `Proceed?` confirmation prompt.
- `--migrate` alone may still prompt for modified migration entries and final
  confirmation.
- `--dry-run` must return before any mutation or confirmation prompt.
- A no-op update with batch flags must still complete without touching
  `inquirer.prompt`.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|-----------|-------------------|
| `update --force --migrate` in non-TTY shell | exits 0 or a domain error; never crashes with readline/inquirer lifecycle errors |
| `update --force` with modified template | overwrites, updates hash, no prompt |
| `update --skip-all` with modified template | preserves file, no prompt |
| `update --create-new` with modified template | writes `.new`, no prompt |
| `update --migrate` without batch flag | may prompt interactively |
| `update --dry-run` | no prompt, no backup, no writes |

#### 5. Good/Base/Bad Cases

- Good: `node dist/cli/index.js update --force --migrate` can run as a smoke
  test with closed stdin and either update files or report already up to date.
- Base: `trellis update --migrate` in a terminal asks the user how to handle
  modified migrated files.
- Bad: `--force` resolves file conflicts but still asks `Proceed?`, then
  crashes in CI with `ERR_USE_AFTER_CLOSE`.

#### 6. Tests Required

- Integration test that clears the `inquirer.prompt` mock after setup and
  asserts `update({ force: true })` does not call it.
- Existing force/skip/create-new tests must continue to assert file outcomes.
- Real CLI smoke test after build:
  `node packages/cli/dist/cli/index.js update --force --migrate`.

#### 7. Wrong vs Correct

##### Wrong

```typescript
if (!options.dryRun) {
  await inquirer.prompt([{ name: "proceed", message: "Proceed?" }]);
}
```

##### Correct

```typescript
const batchMode = options.force || options.skipAll || options.createNew;
if (!options.dryRun && !batchMode) {
  await inquirer.prompt([{ name: "proceed", message: "Proceed?" }]);
}
```

### Data-Driven Configuration

When handling multiple similar options, use arrays with metadata instead of repeated if-else:

```typescript
// Bad: Repetitive if-else
if (options.cursor) tools.push("cursor");
if (options.claude) tools.push("claude");
if (options.iflow) tools.push("iflow");
// ... repeated logic, easy to miss one

// Good: Data-driven approach
const TOOLS = [
  { key: "cursor", name: "Cursor", defaultChecked: true },
  { key: "claude", name: "Claude Code", defaultChecked: true },
  { key: "iflow", name: "iFlow CLI", defaultChecked: false },
] as const;

// Single source of truth for:
// - Building from flags: TOOLS.filter(t => options[t.key])
// - Interactive choices: TOOLS.map(t => ({ name: t.name, value: t.key }))
// - Default values: TOOLS.filter(t => t.defaultChecked)
```

**Benefits**:
- Adding a new tool = adding one line to TOOLS array
- Display name, flag key, and default are co-located
- Less code duplication, fewer bugs

### Auto-Detect Modes Must Probe in ALL Code Paths

When a CLI auto-detects mode (e.g., marketplace vs direct download) by probing a resource, the probe must run in **every** code path that uses the result — including `-y` (non-interactive) mode:

```typescript
// Bad: Probe only runs in interactive mode
let templates: Item[] = [];
if (!options.yes) {
  templates = await fetchIndex(url); // Only interactive probes
}
// -y mode: templates stays [], falls through to direct mode
// Bug: marketplace registries silently downloaded as raw directory

// Good: Probe in all paths that need the result
if (options.template) {
  selectedTemplate = options.template; // Explicit: no probe needed
} else if (!options.yes) {
  // Interactive: probe + show picker
  const result = await probeIndex(url);
  // ...
} else if (registry) {
  // -y mode with registry: still need to probe
  const result = await probeIndex(url);
  if (result.templates.length > 0) {
    // Marketplace requires selection — can't auto-select in -y mode
    console.error("Use --template to specify which template");
    return;
  }
}
```

**Why**: The `-y` flag means "skip interactive prompts", not "skip network operations". If a mode decision depends on a remote resource, the probe must happen regardless of interactivity.

### Don't Drop Fields When Reconstructing Composite Identifiers

When a structured object is parsed into parts and later reassembled, include **all** parsed fields:

```typescript
// Bad: ref is parsed but dropped when rebuilding
const registry = parseSource("gh:org/repo/path#develop");
// registry = { provider: "gh", repo: "org/repo", ref: "develop", ... }
const repoSource = `${registry.provider}:${registry.repo}`;
// Result: "gh:org/repo" — ref "develop" is lost, defaults to "main"

// Good: Include all relevant fields
const repoSource = `${registry.provider}:${registry.repo}#${registry.ref}`;
// Result: "gh:org/repo#develop"
```

**Prevention**: When building a string from a parsed object, review the object's fields and verify each one is either included or explicitly irrelevant.

### Don't: "Warn and Continue" for Mode-Detection Logic

When code decides which mode to run based on a probe result, a warning + continue is functionally equivalent to no fix at all:

```typescript
// Bad: Warning prints but code still falls through to wrong mode
if (!probeResult.isNotFound) {
  console.log(chalk.yellow("Warning: network issue, attempting direct download"));
}
// Falls through → downloads marketplace root as spec directory

// Good: Abort or loop back — never silently switch modes
if (!probeResult.isNotFound) {
  console.log(chalk.red("Could not reach registry. Check connection and retry."));
  return; // or: continue (loop back to picker)
}
```

**Why**: "Warn and continue" is appropriate for **degraded functionality** (missing optional data). It is **not** appropriate for **mode decisions** — the wrong mode causes data corruption, not just degraded UX.

### Convention: Reset Shared State on Branch Switch

When user input or control flow changes context (e.g., switching from official marketplace to a custom source), reset any shared state that was populated by the previous context:

```typescript
// Bad: fetchedTemplates still has official marketplace results
registry = parseRegistrySource(customSource);
// fetchedTemplates.length > 0 → direct-download guard never fires!

// Good: Reset before entering new context
registry = parseRegistrySource(customSource);
fetchedTemplates = []; // Clear stale data from previous source
```

**Why**: Shared mutable state across branches is a silent bug factory. The later guard (`registry && fetchedTemplates.length === 0`) depends on `fetchedTemplates` reflecting the *current* source, not a previous one.

### Scenario: Registry Probe and Download Must Share Backend

#### 1. Scope / Trigger

When a CLI registry flow probes one backend to decide marketplace vs direct-download mode, and then downloads content later, the chosen backend is part of the control-flow contract. This applies to `trellis init --registry`, especially private/self-hosted Git registries.

#### 2. Signatures

```typescript
type RegistryBackend = "http" | "git";

interface RegistryProbeResult {
  templates: SpecTemplate[];
  isNotFound: boolean;
  backend: RegistryBackend;
  error?: RegistryBackendError;
}
```

#### 3. Contracts

- `backend` records which implementation produced the probe result.
- `isNotFound: true` means the registry path exists but has no `index.json`; it may enter direct-download mode.
- `error` means the probe failed and must not enter direct-download mode.
- Download functions that receive a registry must either use the probe's `backend` or re-probe before downloading.

#### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| `index.json` exists and parses | `templates.length > 0`, `isNotFound: false`, `backend` set |
| No `index.json` at a valid registry path | `templates: []`, `isNotFound: true`, `backend` set |
| Auth failure / invalid login-page JSON / network failure | `isNotFound: false`, `error` set, abort or loop back |
| Template path outside repo root | `path-not-found` error |
| Git ref missing | `ref-not-found` error |

#### 5. Good/Base/Bad Cases

- Good: private GitLab probe uses local Git credentials and download copies from the same Git checkout strategy.
- Base: public registry probe uses HTTP and download uses the existing HTTP/giget path.
- Bad: probe succeeds through Git, but download rebuilds a raw/giget URL and fails authentication.

#### 6. Tests Required

- Probe test for public registry remains `backend: "http"`.
- Probe test for self-hosted/SSH registry returns `backend: "git"`.
- Download test passes a prefetched template plus `registryBackend: "git"` and verifies filesystem output.
- Failure tests assert auth/ref/path/invalid-json errors do not set `isNotFound: true`.

#### 7. Wrong vs Correct

```typescript
// Wrong: backend choice is lost after probe
const probe = await probeRegistryIndex(indexUrl, registry);
const template = probe.templates.find((t) => t.id === selected);
await downloadTemplateById(cwd, selected, strategy, template, registry);

// Correct: download uses the same backend that proved access during probe
const probe = await probeRegistryIndex(indexUrl, registry);
const template = probe.templates.find((t) => t.id === selected);
await downloadTemplateById(
  cwd,
  selected,
  strategy,
  template,
  registry,
  undefined,
  probe.backend,
);
```

**Why**: Authentication and reachability are backend-specific. A successful Git probe only proves Git access; it does not prove raw HTTP or giget access.

---

## String Sanitization Patterns

### Never Use `str.strip()` to Remove Surrounding Quotes

Python's `str.strip(chars)` removes **all matching characters from both ends greedily** — it is NOT "remove one pair of surrounding quotes":

```python
# Bad: Greedy strip eats nested quotes
value = raw.strip('"').strip("'")
# "echo 'hello'" → strip('"') → echo 'hello' → strip("'") → echo  hello
#                                                               ^^^^ BROKEN!

# Good: Remove exactly one layer of matching outer quotes
def _unquote(s: str) -> str:
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        return s[1:-1]
    return s

value = _unquote(raw)
# "echo 'hello'" → echo 'hello'  ✓
```

In TypeScript, the equivalent safe pattern:

```typescript
// Bad: No quote handling at all
const value = match[1].trim();
// "path" → still has quotes

// Good: Regex removes exactly one from each end
const value = match[1].trim().replace(/^['"]|['"]$/g, "");
```

**Why this matters**: When parsed values are passed to `shell=True` (subprocess) or used as file paths, corrupted quotes cause shell injection-style errors or silent path mismatches.

**Rule**: Always test string sanitization with nested/mixed quote inputs: `"it's here"`, `'say "hi"'`, `"echo 'hello'"`.

---

## User Input Parsing: Exhaustive Format Enumeration

When writing functions that parse user-provided URLs, paths, or identifiers with multiple valid formats, **enumerate all input forms BEFORE writing code**.

### The Pattern

Create a format table covering every combination of:
- Protocol variants (HTTPS, SSH `git@`, `ssh://`)
- Known vs unknown domains
- Optional suffixes (`.git`, trailing `/`)
- Optional components (port, subdir, ref/branch, subgroup)

```markdown
| # | Format | Example | Expected Behavior |
|---|--------|---------|-------------------|
| 1 | giget prefix | `gh:org/repo` | Native provider |
| 2 | Public HTTPS | `https://github.com/org/repo` | Auto-convert to gh: |
| 3 | Public SSH | `git@github.com:org/repo` | Auto-convert to gh: |
| 4 | Self-hosted HTTPS | `https://git.corp.com/org/repo` | Detect host, map to gitlab: |
| 5 | Self-hosted SSH | `git@git.corp.com:org/repo` | Detect host, map to gitlab: |
| 6 | ssh:// protocol | `ssh://git@host:port/org/repo` | Extract host (strip port) |
| 7 | HTTPS with port | `https://host:8443/org/repo` | Include port in host |
| ... | ... | ... | ... |
```

### Why This Matters

**Lesson from Issue #87 → self-hosted GitLab fix**: The initial fix for HTTPS URLs assumed "only 3 public domains exist". The self-hosted fix then assumed "all SSH URLs are self-hosted" — breaking `git@github.com:org/repo`. Each fix was correct for its target scenario but introduced a new blind spot. Exhaustive enumeration prevents this.

### Rules

1. **List ALL valid input forms** before implementing — not just the ones reported in the issue
2. **Test each form explicitly** — don't assume "if HTTPS works, SSH works too"
3. **Public vs self-hosted must be an explicit branch** — never assume one category covers all inputs
4. **Write the format table in a code comment** at the top of the parsing function

---

## Routing Fixes: Audit ALL Entry Paths Before Claiming a Fix Is Complete

**Trigger**: Modifying any decision/dispatch logic in a command that has multiple entry paths into the same downstream behavior — `trellis init` (handleReinit fast-path + main dispatch), `trellis update` (force vs interactive), or any function with early-return guards above the change point.

**Common mistake**: Patch the dispatch you grepped for, manually verify on one fixture, ship. The other entry path stays broken because (a) it short-circuits before reaching your fix, (b) the manual fixture happened to use a flag combination that bypassed the unfixed path, and (c) the test you wrote also used that convenient bypass flag.

### Scope / Trigger
- Any change inside a function that contains an early-return guard like `if (!isFirstInit && !options.force && !options.skipExisting) { ...; return; }` followed by additional dispatch logic later.
- Any change to a "create X if conditions hold" branch where another sibling function makes the same kind of decision.
- Bug-fix work where the user reported one specific flag combination — assume there are other combinations that hit the same defect via a different path.

### Audit Contract

Before landing the fix, produce an entry-path inventory:

```bash
# Find every call site / branch that can produce the buggy outcome
rg -n "createBootstrapTask|createJoinerOnboardingTask" packages/cli/src/commands/init.ts
rg -n "if \(!options\.force.*return|reinitDone|return true.*//.*handled" packages/cli/src/commands/init.ts
```

For each entry path, record:

| Entry path | Reaches your fix? | Flag combination required to enter it | Flag combination that *bypasses* it |
|------------|-------------------|---------------------------------------|-------------------------------------|
| Path A: `init()` main dispatch | yes (your fix is here) | `--force` or `--skip-existing` (skips reinit) | (always reachable when entered) |
| Path B: `handleReinit` early return | **no** | none of force / skipExisting / first-init | `--force` or `--skip-existing` |

If any entry path doesn't reach the fix, you have two options:

1. **Extend the fix** so all paths funnel into the same logic (e.g. relax the guard at the early-return so the case you care about falls through to the patched dispatch).
2. **Patch each path individually** — only when funneling is structurally infeasible.

Funneling is preferred: it eliminates the class of bug, not just the instance.

### Tests Required
- **One test per entry path**, asserting the fix's effect using the exact flag combination that selects that path.
- A test that uses a "convenience" flag (`force: true`) to bypass an entry-path guard does NOT cover that entry path — it covers the bypass route. See `cli/unit-test/conventions.md` → "Bug-Fix Tests Must Reproduce Reported Flag Combination".
- After landing, re-build the CLI and run the user's exact reported command on a fixture. If you can't reproduce the bug pre-fix on that fixture, your repro is wrong, not the fix.

### Wrong vs Correct

#### Wrong — patch only the dispatch you noticed, test with a flag combination that bypasses the unpatched path

```typescript
// init.ts — main dispatch only
if (isFirstInit || tasksEmpty) {
  createBootstrapTask(...);
} else if (!hadDeveloperFileAtStart) {
  createJoinerOnboardingTask(...);
}

// handleReinit — UNCHANGED, still mis-routes empty-tasks recovery to joiner
async function handleReinit(...) {
  // ... no tasksEmpty check ...
  if (!hadDeveloperFileBefore) createJoinerOnboardingTask(...);
}

// Guard at the top of init() — UNCHANGED
if (!isFirstInit && !options.force && !options.skipExisting) {
  await handleReinit(...);  // ← user's `--yes` alone enters here, never reaches the fix
}
```

```typescript
// Test that "passes" while bug is still live
it("empty tasks/ → bootstrap", async () => {
  await init({ yes: true, user: "alice", force: true });  // ← force bypasses handleReinit
  expect(...).toBe(true);  // green, but only because force routed around the bug
});
```

Net: ship lands with the user's exact command (`trellis init -u alice --codex --yes`) still broken.

#### Correct — make all entry paths converge, test each path

```typescript
// init.ts — relax the guard so empty-tasks recovery never enters reinit
const tasksEmptyEarly =
  !fs.existsSync(tasksDirEarly) || fs.readdirSync(tasksDirEarly).length === 0;
if (
  !isFirstInit &&
  !options.force &&
  !options.skipExisting &&
  !tasksEmptyEarly
) {
  await handleReinit(...);
}
// Main dispatch handles all empty-tasks cases uniformly
```

```typescript
// Two tests: one per entry path, neither uses the bypass flag to dodge work
it("#2b empty tasks/ + --yes alone → bootstrap (reported case)", async () => {
  await init({ yes: true, user: "alice" });  // exactly the user's command
  ...
});
it("#2c empty tasks/ + --yes --force → bootstrap (force path)", async () => {
  await init({ yes: true, user: "alice", force: true });
  ...
});
```

### Why

Multi-entry dispatch is a structural force-multiplier for bugs: every entry path is a separate opportunity for the original defect to manifest, and the cost of missing one is "the user re-files the same issue with slightly different flags." Auditing each entry path takes 5 minutes; missing one costs a release cycle.

### Case Study (2026-04-30): issue #204 `--yes` + bootstrap recovery

The first commit (`346003d`) added a `tasksEmpty` fallback only in `init()`'s main dispatch. It made the `--yes` log line correct, made `--force --yes` recover bootstrap, and added a passing test (`#2b` with `force: true`). It did NOT fix the user's literal reported command — `trellis init -u <name> --codex --yes` — because that command goes through `handleReinit` at `init.ts:931`, which short-circuits before reaching the patched dispatch. Caught by `trellis-check` sub-agent doing a live CLI repro on the dist build. Fixed in `589f753` by adding `!tasksEmptyEarly` to the reinit guard, plus splitting the test into `#2b` (no force, reported case) and `#2c` (with force, parity check).

---

## DO / DON'T

### DO

- Declare explicit return types on all functions
- Use `const` by default
- Use `??` for default values
- Use `?.` for optional access
- Define interfaces for structured data
- Prefix unused parameters with `_`

### DON'T

- Don't use `any` type
- Don't use non-null assertion (`x!` operator)
- Don't use `var`
- Don't use `||` for default values (use `??`)
- Don't leave implicit return types
- Don't ignore ESLint or TypeScript errors
