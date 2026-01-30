/**
 * Task queue filtering and selection
 *
 * Provides functions for filtering and querying tasks based on various criteria.
 */

import { z } from "zod";
import { listTasks } from "./crud.js";
import {
  type Task,
  type TaskStatus,
  type TaskPriority,
  type DevType,
  TaskStatusSchema,
  TaskPrioritySchema,
  DevTypeSchema,
} from "./schemas.js";

/**
 * Task filter schema for validating filter options
 */
export const TaskFilterSchema = z.object({
  /** Filter by task status (single or array) */
  status: z
    .union([TaskStatusSchema, z.array(TaskStatusSchema)])
    .optional(),
  /** Filter by assignee name */
  assignee: z.string().optional(),
  /** Filter by creator name */
  creator: z.string().optional(),
  /** Filter by priority (single or array) */
  priority: z
    .union([TaskPrioritySchema, z.array(TaskPrioritySchema)])
    .optional(),
  /** Filter by development type */
  devType: DevTypeSchema.optional(),
});

export type TaskFilter = z.infer<typeof TaskFilterSchema>;

/**
 * Task statistics by priority
 */
export interface TaskStats {
  P0: number;
  P1: number;
  P2: number;
  P3: number;
  total: number;
}

/**
 * Filter tasks based on provided criteria
 *
 * @param tasks - Array of tasks to filter
 * @param filter - Filter criteria
 * @returns Filtered array of tasks
 */
export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  // Validate filter
  const parsed = TaskFilterSchema.safeParse(filter);
  if (!parsed.success) {
    console.warn(`Invalid filter: ${parsed.error.message}`);
    return tasks;
  }

  const { status, assignee, creator, priority, devType } = parsed.data;

  return tasks.filter((task) => {
    // Filter by status
    if (status !== undefined) {
      const statusArray = Array.isArray(status) ? status : [status];
      if (!statusArray.includes(task.status)) {
        return false;
      }
    }

    // Filter by assignee
    if (assignee !== undefined && task.assignee !== assignee) {
      return false;
    }

    // Filter by creator
    if (creator !== undefined && task.creator !== creator) {
      return false;
    }

    // Filter by priority
    if (priority !== undefined) {
      const priorityArray = Array.isArray(priority) ? priority : [priority];
      if (!priorityArray.includes(task.priority)) {
        return false;
      }
    }

    // Filter by dev type
    if (devType !== undefined && task.dev_type !== devType) {
      return false;
    }

    return true;
  });
}

/**
 * Get tasks by status
 *
 * @param status - Task status to filter by
 * @param repoRoot - Repository root path
 * @returns Array of tasks with the specified status
 */
export function getTasksByStatus(
  status: TaskStatus,
  repoRoot?: string,
): Task[] {
  const results = listTasks({}, repoRoot);
  const tasks = results.map((r) => r.task);
  return filterTasks(tasks, { status });
}

/**
 * Get tasks by assignee
 *
 * @param assignee - Assignee name to filter by
 * @param repoRoot - Repository root path
 * @returns Array of tasks assigned to the specified user
 */
export function getTasksByAssignee(
  assignee: string,
  repoRoot?: string,
): Task[] {
  const results = listTasks({}, repoRoot);
  const tasks = results.map((r) => r.task);
  return filterTasks(tasks, { assignee });
}

/**
 * Get tasks by priority
 *
 * @param priority - Priority level(s) to filter by
 * @param repoRoot - Repository root path
 * @returns Array of tasks with the specified priority
 */
export function getTasksByPriority(
  priority: TaskPriority | TaskPriority[],
  repoRoot?: string,
): Task[] {
  const results = listTasks({}, repoRoot);
  const tasks = results.map((r) => r.task);
  return filterTasks(tasks, { priority });
}

/**
 * Get tasks by creator
 *
 * @param creator - Creator name to filter by
 * @param repoRoot - Repository root path
 * @returns Array of tasks created by the specified user
 */
export function getTasksByCreator(
  creator: string,
  repoRoot?: string,
): Task[] {
  const results = listTasks({}, repoRoot);
  const tasks = results.map((r) => r.task);
  return filterTasks(tasks, { creator });
}

/**
 * Get tasks by development type
 *
 * @param devType - Development type to filter by
 * @param repoRoot - Repository root path
 * @returns Array of tasks with the specified dev type
 */
export function getTasksByDevType(
  devType: DevType,
  repoRoot?: string,
): Task[] {
  const results = listTasks({}, repoRoot);
  const tasks = results.map((r) => r.task);
  return filterTasks(tasks, { devType });
}

/**
 * Get ready tasks (status=planning, no blockers)
 *
 * A task is ready to start when:
 * - Status is "planning"
 * - Has no blocking dependencies (future: check blockedBy field)
 *
 * @param repoRoot - Repository root path
 * @returns Array of tasks ready to be started
 */
export function getReadyTasks(repoRoot?: string): Task[] {
  const results = listTasks({}, repoRoot);
  const tasks = results.map((r) => r.task);

  return tasks.filter((task) => {
    // Must be in planning status
    if (task.status !== "planning") {
      return false;
    }

    // Future: Check blockedBy field if it exists
    // For now, all planning tasks are considered ready

    return true;
  });
}

/**
 * Get in-progress tasks
 *
 * @param repoRoot - Repository root path
 * @returns Array of tasks currently in progress
 */
export function getInProgressTasks(repoRoot?: string): Task[] {
  return getTasksByStatus("in_progress", repoRoot);
}

/**
 * Get pending tasks (planning status)
 *
 * Alias for getTasksByStatus("planning")
 *
 * @param repoRoot - Repository root path
 * @returns Array of tasks in planning status
 */
export function getPendingTasks(repoRoot?: string): Task[] {
  return getTasksByStatus("planning", repoRoot);
}

/**
 * Get completed tasks
 *
 * @param repoRoot - Repository root path
 * @returns Array of completed tasks
 */
export function getCompletedTasks(repoRoot?: string): Task[] {
  return getTasksByStatus("completed", repoRoot);
}

/**
 * Get task statistics by priority
 *
 * @param repoRoot - Repository root path
 * @returns Object with counts for each priority level and total
 */
export function getTaskStats(repoRoot?: string): TaskStats {
  const results = listTasks({}, repoRoot);
  const tasks = results.map((r) => r.task);

  const stats: TaskStats = {
    P0: 0,
    P1: 0,
    P2: 0,
    P3: 0,
    total: 0,
  };

  for (const task of tasks) {
    stats[task.priority]++;
    stats.total++;
  }

  return stats;
}

/**
 * Format task statistics as a string
 *
 * @param stats - Task statistics object
 * @returns Formatted string like "P0:2 P1:5 P2:10 P3:3 Total:20"
 */
export function formatTaskStats(stats: TaskStats): string {
  return `P0:${stats.P0} P1:${stats.P1} P2:${stats.P2} P3:${stats.P3} Total:${stats.total}`;
}

/**
 * Get tasks matching multiple filters
 *
 * @param filter - Filter criteria
 * @param repoRoot - Repository root path
 * @returns Array of tasks matching all filter criteria
 */
export function queryTasks(filter: TaskFilter, repoRoot?: string): Task[] {
  const results = listTasks({}, repoRoot);
  const tasks = results.map((r) => r.task);
  return filterTasks(tasks, filter);
}
