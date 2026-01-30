/**
 * Task schemas with Zod validation
 *
 * Single source of truth for Task types - TypeScript types are inferred from schemas.
 */

import { z } from "zod";

/**
 * Task status lifecycle
 */
export const TaskStatusSchema = z.enum([
  "planning",
  "in_progress",
  "completed",
  "archived",
  "rejected",
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Task priority levels
 */
export const TaskPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);

export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

/**
 * Development type for context injection
 */
export const DevTypeSchema = z.enum([
  "backend",
  "frontend",
  "fullstack",
  "test",
  "docs",
]);

export type DevType = z.infer<typeof DevTypeSchema>;

/**
 * Phase action in multi-agent pipeline
 */
export const PhaseActionSchema = z.object({
  phase: z.number(),
  action: z.enum(["implement", "check", "debug", "finish", "create-pr"]),
});

export type PhaseAction = z.infer<typeof PhaseActionSchema>;

/**
 * Task metadata stored in task.json
 */
export const TaskSchema = z.object({
  /** Unique identifier (slug) */
  id: z.string(),
  /** Task name (usually same as id) */
  name: z.string(),
  /** Human-readable title */
  title: z.string(),
  /** Optional description */
  description: z.string(),
  /** Current status */
  status: TaskStatusSchema,
  /** Development type for context injection */
  dev_type: DevTypeSchema.nullable(),
  /** Scope for commit/PR messages (e.g., "api", "web") */
  scope: z.string().nullable(),
  /** Priority level */
  priority: TaskPrioritySchema,
  /** Creator's name */
  creator: z.string(),
  /** Assigned developer */
  assignee: z.string(),
  /** Creation date (YYYY-MM-DD) */
  createdAt: z.string(),
  /** Completion date (YYYY-MM-DD) */
  completedAt: z.string().nullable(),
  /** Git branch for this task */
  branch: z.string().nullable(),
  /** Base branch for PR */
  base_branch: z.string().nullable(),
  /** Worktree path for multi-agent pipeline */
  worktree_path: z.string().nullable(),
  /** Current phase index (0-based) */
  current_phase: z.number(),
  /** Pipeline phases */
  next_action: z.array(PhaseActionSchema),
  /** Latest commit hash */
  commit: z.string().nullable(),
  /** Pull request URL */
  pr_url: z.string().nullable(),
  /** Subtask IDs */
  subtasks: z.array(z.string()),
  /** Related file paths */
  relatedFiles: z.array(z.string()),
  /** Free-form notes */
  notes: z.string(),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Options for creating a new task
 */
export const CreateTaskOptionsSchema = z.object({
  /** Custom slug (auto-generated from title if not provided) */
  slug: z.string().optional(),
  /** Assigned developer (defaults to current developer) */
  assignee: z.string().optional(),
  /** Priority level */
  priority: TaskPrioritySchema.optional(),
  /** Optional description */
  description: z.string().optional(),
});

export type CreateTaskOptions = z.infer<typeof CreateTaskOptionsSchema>;

/**
 * Options for listing tasks
 */
export const ListTasksOptionsSchema = z.object({
  /** Filter by assignee (current developer if true) */
  mine: z.boolean().optional(),
  /** Filter by status */
  status: TaskStatusSchema.optional(),
});

export type ListTasksOptions = z.infer<typeof ListTasksOptionsSchema>;

/**
 * JSONL context entry for agent context injection
 */
export const ContextEntrySchema = z.object({
  /** File or directory path */
  file: z.string(),
  /** Entry type */
  type: z.enum(["file", "directory"]).optional(),
  /** Reason for including this context */
  reason: z.string(),
});

export type ContextEntry = z.infer<typeof ContextEntrySchema>;

/**
 * Default pipeline phases
 */
export const DEFAULT_PHASES: PhaseAction[] = [
  { phase: 1, action: "implement" },
  { phase: 2, action: "check" },
  { phase: 3, action: "finish" },
  { phase: 4, action: "create-pr" },
];

/**
 * Parse and validate task.json content
 *
 * @param content - Raw JSON content
 * @returns Validated Task object
 * @throws ZodError if validation fails
 */
export function parseTask(content: unknown): Task {
  return TaskSchema.parse(content);
}

/**
 * Safely parse task.json content
 *
 * @param content - Raw JSON content
 * @returns Result object with success/error
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function safeParseTask(content: unknown) {
  return TaskSchema.safeParse(content);
}

/**
 * Parse and validate context entry
 */
export function parseContextEntry(content: unknown): ContextEntry {
  return ContextEntrySchema.parse(content);
}

/**
 * Safely parse context entry
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function safeParseContextEntry(content: unknown) {
  return ContextEntrySchema.safeParse(content);
}
