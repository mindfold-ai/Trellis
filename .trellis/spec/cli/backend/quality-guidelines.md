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
let outputFormat = options.format;
if (!outputFormat) {
  outputFormat = "text";
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

## Schema Field Removal

When removing a persisted field, inventory every writer, reader, formatter,
hook, generated template, and test. Remove the field at its source and at
every downstream write site. Verify that a new record and subsequent lifecycle
events never introduce it again. A reader is not required to support records
written by an older schema.
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
  tools = ["cursor", "claude"]; // Ignores --codex, --opencode!
} else if (options.cursor || options.codex) {
  // Build from flags...
}

// Good: Check explicit flags first
const hasExplicitTools = options.cursor || options.codex || options.opencode;
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
- `update({ force?: boolean, skipAll?: boolean, createNew?: boolean })`

#### 3. Contracts

- `--force`, `--skip-all`, and `--create-new` resolve file conflicts without
  per-file prompts.
- The same flags also bypass the final `Proceed?` confirmation prompt.
- `--dry-run` must return before any mutation or confirmation prompt.
- A no-op update with batch flags must still complete without touching
  `inquirer.prompt`.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|-----------|-------------------|
| `update --force` in non-TTY shell | exits 0 or a domain error; never crashes with readline/inquirer lifecycle errors |
| `update --force` with modified template | overwrites, updates hash, no prompt |
| `update --skip-all` with modified template | preserves file, no prompt |
| `update --create-new` with modified template | writes `.new`, no prompt |
| `update --dry-run` | no prompt, no backup, no writes |

#### 5. Good/Base/Bad Cases

- Good: `node dist/cli/index.js update --force` can run as a smoke
  test with closed stdin and either update files or report already up to date.
- Base: `trellis update` in a terminal asks the user how to handle
  modified managed files.
- Bad: `--force` resolves file conflicts but still asks `Proceed?`, then
  crashes in CI with `ERR_USE_AFTER_CLOSE`.

#### 6. Tests Required

- Integration test that clears the `inquirer.prompt` mock after setup and
  asserts `update({ force: true })` does not call it.
- Existing force/skip/create-new tests must continue to assert file outcomes.
- Real CLI smoke test after build:
  `node packages/cli/dist/cli/index.js update --force`.

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
if (options.codex) tools.push("codex");
// ... repeated logic, easy to miss one

// Good: Data-driven approach
const TOOLS = [
  { key: "cursor", name: "Cursor", defaultChecked: true },
  { key: "claude", name: "Claude Code", defaultChecked: true },
  { key: "codex", name: "Codex", defaultChecked: false },
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
rg -n "createBootstrapTask|handleReinit" packages/cli/src/commands/init.ts
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

### Why

Multi-entry dispatch is a structural force-multiplier for bugs: every entry path is a separate opportunity for the original defect to manifest, and the cost of missing one is "the user re-files the same issue with slightly different flags." Auditing each entry path takes 5 minutes; missing one costs a release cycle.

---

## Native dependency policy

### Cautionary tale — 0.6.0-beta.3 → 0.6.0-beta.4 emergency revert

0.6.0-beta.3 added `better-sqlite3` (a native C++ binding) to read OpenCode 1.2+ session storage, which switched from JSONL to SQLite. On Windows + China network, the failure cascade was:

1. `prebuild-install` tries to download a prebuilt binary from the GitHub releases CDN.
2. CDN times out (China network reliability for `github.com/.../releases/download/...` is poor).
3. `node-gyp` source-build fallback kicks in.
4. Source build needs Visual Studio 2017+ Build Tools, which most Windows users don't have installed.
5. Install fails — **`trellis` itself can no longer be installed at all**.

Time to detect: ~4 hours after publish. Fix: emergency revert in 0.6.0-beta.4 (removed `better-sqlite3`, marked the OpenCode 1.2+ SQLite reader as degraded with a soft-degrade fallback). The OpenCode SQLite section in `commands-mem.md` is now a stub describing the degraded state.

The lesson: **a native dep that fails to install fails the entire CLI**, not just one feature. For a productivity tool, that tradeoff is unacceptable unless the perf benefit is dramatic and unreplaceable.

### Rules

#### 1. Avoid native deps in the trellis CLI by default

Trellis is a productivity / scaffolding tool. Install reliability across all OS / network conditions matters more than per-call perf. The default answer to "should we add this native dep?" is **no**.

#### 2. If absolutely needed, use `optionalDependencies` + soft-degrade

Place the dep under `optionalDependencies` (not `dependencies`) so install never hard-fails on it. Wrap every load site in a try/catch with a clear "feature unavailable" stderr hint:

```typescript
let nativeReader: NativeReader | null = null;
try {
  // Dynamic import keeps install-time failure away from the load barrel
  nativeReader = (await import("better-sqlite3")).default as NativeReader;
} catch {
  process.stderr.write(
    "[trellis] OpenCode 1.2+ SQLite session reader unavailable " +
    "(better-sqlite3 not installed). Falling back to JSONL-only mode.\n"
  );
}

if (nativeReader) {
  // Use native path
} else {
  // Soft-degrade: degraded but functional output
}
```

Cross-reference: future native-dep additions should mirror the soft-degrade pattern used by `commands/mem.ts:opencodeListSessions` (on the `feat/v0.6.0-beta` branch). When the native reader is unavailable, the function returns degraded but non-empty output rather than throwing.

#### 3. Test on Windows + restricted network before shipping

Even when a prebuild exists for the target platform, the GitHub releases CDN is unreliable from China and other constrained networks. The node-gyp source-build fallback then requires C compiler tooling that users typically don't have (MSVC on Windows, Xcode CLT on macOS, build-essential on Linux).

Required pre-ship matrix for any native dep:

| Environment | What to verify |
|---|---|
| Windows (clean VM, no VS Build Tools) + China-route network | `pnpm install` succeeds; CLI starts without the feature |
| macOS (clean, no Xcode CLT) | Install succeeds; falls back gracefully |
| Linux (Alpine / minimal Docker) | Install succeeds; musl vs glibc prebuild matches |

#### 4. Decision framework

A native dep is justified only when **both** are true:

- The perf benefit is **dramatic** (orders of magnitude, not 2-3x) AND unreplaceable in pure JS / WASM.
- Shell-out to a system tool (`sqlite3`, `ffmpeg`, etc.) is not viable — usually because the system tool isn't standard across target platforms or per-call dispatch overhead is prohibitive.

If only one is true, pick a non-native alternative.

#### 5. Alternative ladder (in preference order)

| Option | Install risk | Perf | Notes |
|---|---|---|---|
| Pure JS | none | baseline | Always the first choice. Most CLI workloads are I/O-bound, not CPU-bound. |
| WASM bundle | none (one-time bundle size cost ~1-2 MB) | ~1.5-3x slower than native, usually fine | E.g. `sql.js` for SQLite reads. Bundled at build time, no install-time fetch. |
| Shell out to system CLI | low (Windows-PATH / "is it installed" risk) | per-call dispatch overhead | Zero install deps, but introduces "is sqlite3 / ffmpeg on PATH?" branching. Acceptable when the tool is broadly assumed present. |
| `node:sqlite` etc. (Node built-ins) | none | native | Once these graduate from experimental in Node LTS, they become the preferred path. As of Node 22 LTS, `node:sqlite` is still experimental — track upstream. |
| Native dep + `optionalDependencies` + soft-degrade | medium (still fails to install on a non-trivial fraction of Windows users) | native | Last resort. Only when steps 1-4 are ruled out and the soft-degrade path is genuinely usable. |

#### 6. Audit checklist when adding any native dep

Before merging a PR that adds a native dep:

- [ ] Is it under `optionalDependencies` (not `dependencies`)?
- [ ] Is every load site wrapped in try/catch with a stderr hint?
- [ ] Does the soft-degrade path produce useful output, or does it just throw with a different message?
- [ ] Has install been tested on a clean Windows VM without VS Build Tools, behind a China-route proxy?
- [ ] Is the perf benefit measured (not assumed) and dramatic?
- [ ] Has the WASM alternative been benchmarked and rejected with numbers?
- [ ] Does the spec / PR description state which alternative ladder rungs were considered and why each was rejected?

If any answer is "no", the dep doesn't ship.

---

## Native dependency policy

### Cautionary tale — 0.6.0-beta.3 → 0.6.0-beta.4 emergency revert

0.6.0-beta.3 added `better-sqlite3` (a native C++ binding) to read OpenCode 1.2+ session storage, which switched from JSONL to SQLite. On Windows + China network, the failure cascade was:

1. `prebuild-install` tries to download a prebuilt binary from the GitHub releases CDN.
2. CDN times out (China network reliability for `github.com/.../releases/download/...` is poor).
3. `node-gyp` source-build fallback kicks in.
4. Source build needs Visual Studio 2017+ Build Tools, which most Windows users don't have installed.
5. Install fails — **`trellis` itself can no longer be installed at all**.

Time to detect: ~4 hours after publish. Fix: emergency revert in 0.6.0-beta.4 (removed `better-sqlite3`, marked the OpenCode 1.2+ SQLite reader as degraded with a soft-degrade fallback). The OpenCode SQLite section in `commands-mem.md` is now a stub describing the degraded state.

The lesson: **a native dep that fails to install fails the entire CLI**, not just one feature. For a productivity tool, that tradeoff is unacceptable unless the perf benefit is dramatic and unreplaceable.

### Rules

#### 1. Avoid native deps in the trellis CLI by default

Trellis is a productivity / scaffolding tool. Install reliability across all OS / network conditions matters more than per-call perf. The default answer to "should we add this native dep?" is **no**.

#### 2. If absolutely needed, use `optionalDependencies` + soft-degrade

Place the dep under `optionalDependencies` (not `dependencies`) so install never hard-fails on it. Wrap every load site in a try/catch with a clear "feature unavailable" stderr hint:

```typescript
let nativeReader: NativeReader | null = null;
try {
  // Dynamic import keeps install-time failure away from the load barrel
  nativeReader = (await import("better-sqlite3")).default as NativeReader;
} catch {
  process.stderr.write(
    "[trellis] OpenCode 1.2+ SQLite session reader unavailable " +
    "(better-sqlite3 not installed). Falling back to JSONL-only mode.\n"
  );
}

if (nativeReader) {
  // Use native path
} else {
  // Soft-degrade: degraded but functional output
}
```

Cross-reference: future native-dep additions should mirror the soft-degrade pattern used by `commands/mem.ts:opencodeListSessions` (on the `feat/v0.6.0-beta` branch). When the native reader is unavailable, the function returns degraded but non-empty output rather than throwing.

#### 3. Test on Windows + restricted network before shipping

Even when a prebuild exists for the target platform, the GitHub releases CDN is unreliable from China and other constrained networks. The node-gyp source-build fallback then requires C compiler tooling that users typically don't have (MSVC on Windows, Xcode CLT on macOS, build-essential on Linux).

Required pre-ship matrix for any native dep:

| Environment | What to verify |
|---|---|
| Windows (clean VM, no VS Build Tools) + China-route network | `pnpm install` succeeds; CLI starts without the feature |
| macOS (clean, no Xcode CLT) | Install succeeds; falls back gracefully |
| Linux (Alpine / minimal Docker) | Install succeeds; musl vs glibc prebuild matches |

#### 4. Decision framework

A native dep is justified only when **both** are true:

- The perf benefit is **dramatic** (orders of magnitude, not 2-3x) AND unreplaceable in pure JS / WASM.
- Shell-out to a system tool (`sqlite3`, `ffmpeg`, etc.) is not viable — usually because the system tool isn't standard across target platforms or per-call dispatch overhead is prohibitive.

If only one is true, pick a non-native alternative.

#### 5. Alternative ladder (in preference order)

| Option | Install risk | Perf | Notes |
|---|---|---|---|
| Pure JS | none | baseline | Always the first choice. Most CLI workloads are I/O-bound, not CPU-bound. |
| WASM bundle | none (one-time bundle size cost ~1-2 MB) | ~1.5-3x slower than native, usually fine | E.g. `sql.js` for SQLite reads. Bundled at build time, no install-time fetch. |
| Shell out to system CLI | low (Windows-PATH / "is it installed" risk) | per-call dispatch overhead | Zero install deps, but introduces "is sqlite3 / ffmpeg on PATH?" branching. Acceptable when the tool is broadly assumed present. |
| `node:sqlite` etc. (Node built-ins) | none | native | Once these graduate from experimental in Node LTS, they become the preferred path. As of Node 22 LTS, `node:sqlite` is still experimental — track upstream. |
| Native dep + `optionalDependencies` + soft-degrade | medium (still fails to install on a non-trivial fraction of Windows users) | native | Last resort. Only when steps 1-4 are ruled out and the soft-degrade path is genuinely usable. |

#### 6. Audit checklist when adding any native dep

Before merging a PR that adds a native dep:

- [ ] Is it under `optionalDependencies` (not `dependencies`)?
- [ ] Is every load site wrapped in try/catch with a stderr hint?
- [ ] Does the soft-degrade path produce useful output, or does it just throw with a different message?
- [ ] Has install been tested on a clean Windows VM without VS Build Tools, behind a China-route proxy?
- [ ] Is the perf benefit measured (not assumed) and dramatic?
- [ ] Has the WASM alternative been benchmarked and rejected with numbers?
- [ ] Does the spec / PR description state which alternative ladder rungs were considered and why each was rejected?

If any answer is "no", the dep doesn't ship.

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
