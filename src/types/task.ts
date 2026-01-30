/**
 * Task Types for Trellis Workflow
 */

/**
 * Task status lifecycle
 */
export type TaskStatus =
  | "planning"
  | "in_progress"
  | "completed"
  | "archived";

/**
 * Task priority levels
 */
export type TaskPriority = "P0" | "P1" | "P2" | "P3";

/**
 * Development type for context injection
 */
export type DevType = "backend" | "frontend" | "fullstack" | "test" | "docs";

/**
 * Phase action in multi-agent pipeline
 */
export interface PhaseAction {
  phase: number;
  action: "implement" | "check" | "debug" | "finish" | "create-pr";
}

/**
 * Task metadata stored in task.json
 */
export interface Task {
  /** Unique identifier (slug) */
  id: string;
  /** Task name (usually same as id) */
  name: string;
  /** Human-readable title */
  title: string;
  /** Optional description */
  description: string;
  /** Current status */
  status: TaskStatus;
  /** Development type for context injection */
  dev_type: DevType | null;
  /** Scope for commit/PR messages (e.g., "api", "web") */
  scope: string | null;
  /** Priority level */
  priority: TaskPriority;
  /** Creator's name */
  creator: string;
  /** Assigned developer */
  assignee: string;
  /** Creation date (YYYY-MM-DD) */
  createdAt: string;
  /** Completion date (YYYY-MM-DD) */
  completedAt: string | null;
  /** Git branch for this task */
  branch: string | null;
  /** Base branch for PR */
  base_branch: string | null;
  /** Worktree path for multi-agent pipeline */
  worktree_path: string | null;
  /** Current phase index (0-based) */
  current_phase: number;
  /** Pipeline phases */
  next_action: PhaseAction[];
  /** Latest commit hash */
  commit: string | null;
  /** Pull request URL */
  pr_url: string | null;
  /** Subtask IDs */
  subtasks: string[];
  /** Related file paths */
  relatedFiles: string[];
  /** Free-form notes */
  notes: string;
}

/**
 * Options for creating a new task
 */
export interface CreateTaskOptions {
  /** Custom slug (auto-generated from title if not provided) */
  slug?: string;
  /** Assigned developer (defaults to current developer) */
  assignee?: string;
  /** Priority level */
  priority?: TaskPriority;
  /** Optional description */
  description?: string;
}

/**
 * Options for listing tasks
 */
export interface ListTasksOptions {
  /** Filter by assignee (current developer if true) */
  mine?: boolean;
  /** Filter by status */
  status?: TaskStatus;
}

/**
 * JSONL context entry for agent context injection
 */
export interface ContextEntry {
  /** File or directory path */
  file: string;
  /** Entry type */
  type?: "file" | "directory";
  /** Reason for including this context */
  reason: string;
}

/**
 * Developer identity stored in .developer file
 */
export interface Developer {
  name: string;
  initialized_at: string;
}
