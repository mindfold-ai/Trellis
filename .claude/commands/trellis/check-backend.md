Check if the code you just wrote follows the backend development guidelines.

**This project**: TypeScript CLI tool (`@mindfoldhq/trellis`)

---

## Execute These Steps

### Step 1: Run Automated Checks

```bash
# Must pass - no exceptions
pnpm lint        # ESLint (no any, no x!, explicit return types)
pnpm typecheck   # TypeScript strict mode
pnpm build       # Ensure it compiles
```

### Step 2: Review Changed Files

```bash
git status
git diff --name-only
```

### Step 3: Check Against Guidelines

Based on what you changed, verify against the relevant guidelines:

| Changed Files | Check Against |
|---------------|---------------|
| `src/core/**` | `quality-guidelines.md` - Module patterns, Zod usage |
| `src/commands/**` | `quality-guidelines.md` - Command output conventions |
| `src/core/pipeline/**` | Worktree Data Sync Pattern (write to both locations!) |
| `src/core/platforms/**` | Platform Adapter Pattern |
| `.trellis/scripts/**` | `shell-conventions.md` - Should this be CLI instead? |
| New files | `directory-structure.md` - Correct location? |

### Step 4: Specific Checks

#### For Any Code Change
- [ ] No `any` types? (ESLint enforces)
- [ ] No non-null assertions `x!`? (ESLint enforces)
- [ ] All functions have explicit return types?
- [ ] Using `??` instead of `||` for defaults?
- [ ] Using `?.` for optional access?

#### For New Modules
- [ ] Has `index.ts` with re-exports?
- [ ] Types derived from Zod schemas?
- [ ] Added to parent `index.ts`?

#### For Pipeline/Worktree Code
- [ ] Updates task.json in BOTH main repo AND worktree?
- [ ] Reads from worktree for agent data (not main repo)?
- [ ] Preserves existing values (doesn't overwrite base_branch)?

#### For CLI Commands
- [ ] Data on stdout (for piping)?
- [ ] Messages on stderr (for user)?
- [ ] Supports `--json` flag?
- [ ] Validates initialization with `isTrellisInitialized()`?

### Step 5: Report

Report any violations found and fix them before committing.

---

## Quick Reference

```typescript
// Zod-first pattern
const TaskSchema = z.object({ ... });
type Task = z.infer<typeof TaskSchema>;

// Nullable return pattern
function readTask(dir: string): Task | null {
  if (!fs.existsSync(path)) return null;
  // ...
}

// Command output pattern
console.log(taskPath);                    // stdout
console.error(chalk.green("Created"));    // stderr
if (options.json) console.log(JSON.stringify(result));
```
