/** Explicit predecessor migration boundary. Never a current workflow API. */
export { taskRecordSchema, emptyTaskRecord } from "./schema.js";
export { serializeTaskRecord } from "./records.js";
export {
  isKnownLegacyTaskRecord,
  validateLegacyTaskProjection,
} from "./migration.js";
