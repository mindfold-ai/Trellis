/**
 * Task module
 *
 * Unified exports for task management functionality.
 */

// Schemas and types
export {
  // Schemas
  TaskStatusSchema,
  TaskPrioritySchema,
  DevTypeSchema,
  PhaseActionSchema,
  TaskSchema,
  CreateTaskOptionsSchema,
  ListTasksOptionsSchema,
  ContextEntrySchema,
  // Types (inferred from schemas)
  type TaskStatus,
  type TaskPriority,
  type DevType,
  type PhaseAction,
  type Task,
  type CreateTaskOptions,
  type ListTasksOptions,
  type ContextEntry,
  // Constants
  DEFAULT_PHASES,
  // Parse functions
  parseTask,
  safeParseTask,
  parseContextEntry,
  safeParseContextEntry,
} from "./schemas.js";

// CRUD operations
export {
  readTask,
  writeTask,
  createTask,
  findTask,
  listTasks,
  updateTask,
  archiveTask,
  listArchivedTasks,
} from "./crud.js";

// Context management
export {
  readJsonl,
  writeJsonl,
  initContext,
  addContext,
  validateContext,
  listContext,
} from "./context.js";

// Queue filtering and selection
export {
  // Schema
  TaskFilterSchema,
  // Types
  type TaskFilter,
  type TaskStats,
  // Filter functions
  filterTasks,
  getTasksByStatus,
  getTasksByAssignee,
  getTasksByPriority,
  getTasksByCreator,
  getTasksByDevType,
  // Convenience functions
  getReadyTasks,
  getInProgressTasks,
  getPendingTasks,
  getCompletedTasks,
  // Statistics
  getTaskStats,
  formatTaskStats,
  // Query
  queryTasks,
} from "./queue.js";

// Utility functions
export {
  // Path validation
  isValidTaskPath,
  isValidTaskDir,
  getTaskFullPath,
  getTaskRelativePath,
  // Archive checks
  canArchiveTask,
  canArchiveTaskDir,
  // Task lookup
  findTaskDirByName,
  getTaskNameFromDir,
  parseTaskDirName,
  // PRD helpers
  hasPrd,
  getPrdPath,
  // Status helpers
  canStartTask,
  isActiveTask,
  isFinishedTask,
} from "./utils.js";
