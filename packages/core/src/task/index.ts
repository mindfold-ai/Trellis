// Public task API surface — canonical task record shape, factory,
// schema, I/O helpers, directory validation, and phase inference.
//
// Task API is intentionally independent from the channel API.

export type { TrellisTaskRecord, TaskRecordField } from "./schema.js";

export {
  TASK_RECORD_FIELD_ORDER,
  emptyTaskRecord,
  taskRecordSchema,
} from "./schema.js";

export type {
  LoadTaskRecordOptions,
  WriteTaskRecordOptions,
} from "./records.js";

export {
  loadTaskRecord,
  writeTaskRecord,
  serializeTaskRecord,
} from "./records.js";

export {
  isKnownLegacyTaskRecord,
  validateLegacyTaskProjection,
} from "./migration.js";

export type { TaskDirParts } from "./paths.js";
export { validateTaskDirName, isValidTaskDirName } from "./paths.js";

export type { TrellisTaskPhase } from "./phase.js";
export { inferTaskPhase } from "./phase.js";
