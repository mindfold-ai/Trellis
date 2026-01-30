# Cross-Layer Check

Check if your changes considered all dimensions. Most bugs come from "didn't think of it", not lack of technical skill.

**This project**: TypeScript CLI tool (`@mindfoldhq/trellis`)

---

## Execution Steps

### 1. Identify Change Scope

```bash
git status
git diff --name-only
```

### 2. Select Applicable Check Dimensions

Based on your change type, execute relevant checks below.

---

## Trellis Layer Structure

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| **CLI** | `src/cli/` | Argument parsing, help text |
| **Commands** | `src/commands/` | Command implementation, user-facing logic |
| **Core** | `src/core/` | Business logic, domain modules |
| **Platforms** | `src/core/platforms/` | Platform-specific adapters (Claude, etc.) |
| **Templates** | `src/templates/` | Template files for `trellis init` |
| **Dogfooding** | `.claude/`, `.trellis/` | Self-used configs (copied to new projects) |

---

## Dimension A: Cross-Layer Data Flow

**Trigger**: Changes involve 2+ layers (e.g., command + core)

**Checklist**:
- [ ] Types correctly passed between layers?
- [ ] Errors properly propagated to caller?
- [ ] Return value matches what caller expects?

**Example flow**:
```
CLI (parse args) → Command (validate, format output) → Core (business logic)
                                                           ↓
                                              Platforms (Claude-specific)
```

---

## Dimension B: Worktree/Main Repo Sync

**Trigger**: Changes to pipeline, task, or worktree code

**Checklist**:
- [ ] Writing task.json? → Update BOTH main repo AND worktree
- [ ] Reading task data for agent? → Read from WORKTREE (not main repo)
- [ ] Setting base_branch? → Preserve if already set

**Critical Pattern** (from `quality-guidelines.md`):
```typescript
// Write to both
updateTask(worktreeTaskDir, updates);
updateTask(mainRepoTaskDir, updates);

// Read from worktree for agent context
const task = readTask(path.join(agent.worktree_path, agent.task_dir));
```

---

## Dimension C: Code Reuse

**Trigger**:
- Modifying constants or config
- Creating new utility function
- Just finished batch modifications

**Checklist**:
- [ ] Search first: Does similar code/utility already exist?
  ```bash
  grep -r "functionName" src/
  ```
- [ ] If 2+ places define same value → Extract to shared constant
- [ ] After modification, all usage sites updated?

---

## Dimension D: Module Exports

**Trigger**: Creating or modifying modules in `src/core/`

**Checklist**:
- [ ] New file → Added to module's `index.ts`?
- [ ] New module → Added to `src/core/index.ts`?
- [ ] Types exported along with functions?

**Pattern**:
```typescript
// core/pipeline/index.ts
export * from "./schemas.js";
export * from "./state.js";
export * from "./orchestrator.js";
```

---

## Dimension E: Dogfooding Impact

**Trigger**: Changes to `.claude/`, `.cursor/`, or `.trellis/scripts/`

**Checklist**:
- [ ] These files are copied to user projects via `trellis init`
- [ ] Change intentional for all users?
- [ ] Template still valid for empty/new projects?

---

## Common Issues Quick Reference

| Issue | Root Cause | Prevention |
|-------|------------|------------|
| Task data stale | Read from wrong location | Always read from worktree for agent |
| PR status not visible | Only updated worktree | Update both locations |
| Module not found | Not exported in index.ts | Add to index.ts |
| User config broken | Dogfooding change too specific | Test on fresh project |

---

## Output

Report:
1. Which dimensions your changes involve
2. Check results for each dimension
3. Issues found and fix suggestions
