Read the backend development guidelines before starting your development task.

**This project**: TypeScript CLI tool (`@mindfoldhq/trellis`)

---

## Execute These Steps

### Step 1: Read the Guidelines Index

```bash
cat .trellis/spec/backend/index.md
```

### Step 2: Read Relevant Guidelines Based on Your Task

| Task Type | Must Read |
|-----------|-----------|
| **Any code change** | `quality-guidelines.md` (TypeScript, Zod, ESLint rules) |
| **New module/file** | `directory-structure.md` (where to put files) |
| **Pipeline/worktree** | `quality-guidelines.md` → Worktree Data Sync Pattern |
| **Shell scripts** | `shell-conventions.md` (migration status, when to use) |
| **Error handling** | `error-handling.md` |
| **Logging** | `logging-guidelines.md` |

### Step 3: Understand Key Patterns

Quick reference from `quality-guidelines.md`:

```typescript
// Zod-first types
const Schema = z.object({ ... });
type MyType = z.infer<typeof Schema>;

// Nullable return for "not found"
function find(id: string): Item | null { ... }

// Output conventions
console.log(data);           // stdout - for piping
console.error(chalk.green("OK"));  // stderr - for user
```

### Step 4: Check Code Quality Commands

```bash
# Must pass before any commit
pnpm lint        # ESLint checks
pnpm typecheck   # TypeScript strict mode
pnpm build       # Full build
```

---

## This Step is MANDATORY

Before writing any backend/CLI code, you must:
- [ ] Read `index.md` to understand available guidelines
- [ ] Read `quality-guidelines.md` for coding standards
- [ ] Read task-specific guidelines if applicable

Then proceed with your development plan.
