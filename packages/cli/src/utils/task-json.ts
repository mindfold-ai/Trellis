/**
 * Canonical task.json shape — single source of truth shared by all TS writers.
 *
 * The runtime Python writer is `.trellis/scripts/common/task_store.py` in
 * `cmd_create` (lines ~147-172). This TS factory mirrors that 24-field shape
 * so bootstrap tasks (trellis init) and migration tasks (trellis update
 * --migrate) produce structurally identical task.json files.
 *
 * Field names, order, and null defaults match task_store.py exactly.
 */

export type PrdStatus = "draft" | "confirmed" | "override";

export interface TaskMeta extends Record<string, unknown> {
  prd_status: PrdStatus;
  linear_issue?: string;
}

export interface TaskJson {
  id: string;
  name: string;
  title: string;
  description: string;
  status: string;
  dev_type: string | null;
  scope: string | null;
  package: string | null;
  priority: string;
  creator: string;
  assignee: string;
  createdAt: string;
  completedAt: string | null;
  branch: string | null;
  base_branch: string | null;
  worktree_path: string | null;
  commit: string | null;
  pr_url: string | null;
  subtasks: string[];
  children: string[];
  parent: string | null;
  relatedFiles: string[];
  notes: string;
  meta: TaskMeta;
}

/**
 * Produce a fully-populated canonical-shape TaskJson.
 *
 * All 24 fields are emitted in canonical order. `overrides` shallow-merges on
 * top — callers should supply the per-task values (id, name, title, assignee,
 * createdAt, etc.) and leave null-default fields untouched unless they have a
 * real value.
 */
export function emptyTaskJson(overrides: Partial<TaskJson> = {}): TaskJson {
  const today = new Date().toISOString().split("T")[0];
  const base: TaskJson = {
    id: "",
    name: "",
    title: "",
    description: "",
    status: "planning",
    dev_type: null,
    scope: null,
    package: null,
    priority: "P2",
    creator: "",
    assignee: "",
    createdAt: today,
    completedAt: null,
    branch: null,
    base_branch: null,
    worktree_path: null,
    commit: null,
    pr_url: null,
    subtasks: [],
    children: [],
    parent: null,
    relatedFiles: [],
    notes: "",
    meta: { prd_status: "draft" },
  };
  return { ...base, ...overrides };
}
