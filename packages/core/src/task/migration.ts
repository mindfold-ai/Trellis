import {
  TASK_RECORD_FIELD_ORDER,
  taskRecordSchema,
  type TrellisTaskRecord,
} from "./schema.js";

/** Reservation/diagnostic shape only; never a current lifecycle candidate. */
export function isKnownLegacyTaskRecord(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const old = value as Record<string, unknown>;
  const allowed = new Set([
    ...TASK_RECORD_FIELD_ORDER.filter(
      (field) => field !== "source" && field !== "lifecycle_generation",
    ),
    "branch",
    "creator",
    "assignee",
    "subtasks",
  ]);
  if (Object.keys(old).some((field) => !allowed.has(field))) return false;
  if (
    !["id", "name", "title", "status", "creator", "assignee"].every(
      (field) => typeof old[field] === "string",
    )
  )
    return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(old.id as string)) return false;
  const strings = ["description", "priority", "createdAt", "notes"];
  const nullable = [
    "dev_type",
    "scope",
    "package",
    "completedAt",
    "base_branch",
    "worktree_path",
    "commit",
    "pr_url",
    "parent",
    "branch",
  ];
  const arrays = ["children", "relatedFiles", "subtasks"];
  return (
    strings.every(
      (field) => !(field in old) || typeof old[field] === "string",
    ) &&
    nullable.every(
      (field) =>
        !(field in old) ||
        old[field] === null ||
        typeof old[field] === "string",
    ) &&
    arrays.every(
      (field) =>
        !(field in old) ||
        (Array.isArray(old[field]) &&
          old[field].every((item: unknown) => typeof item === "string")),
    ) &&
    (!("meta" in old) ||
      (old.meta !== null &&
        typeof old.meta === "object" &&
        !Array.isArray(old.meta)))
  );
}

/**
 * The one-time legacy task migration boundary. The caller authors the complete
 * projection after reviewing source/relationships; normal readers stay strict.
 */
export function validateLegacyTaskProjection(
  legacy: unknown,
  projection: unknown,
  retiredFields: readonly string[] = [],
): TrellisTaskRecord {
  const record = taskRecordSchema.parse(projection);
  if (legacy === null || typeof legacy !== "object" || Array.isArray(legacy)) {
    throw new Error("legacy task must be an object");
  }
  const old = legacy as Record<string, unknown>;
  if (old.id !== record.id) throw new Error("Migration must retain task.id");
  if ("lifecycle_generation" in old) {
    if (old.lifecycle_generation !== record.lifecycle_generation) {
      throw new Error("Migration must retain lifecycle_generation");
    }
  } else if (record.lifecycle_generation !== 0) {
    throw new Error(
      "A legacy task without generation migrates to generation 0",
    );
  }
  const allowed = new Set<string>([
    ...TASK_RECORD_FIELD_ORDER,
    "branch",
    "creator",
    "assignee",
    "subtasks",
  ]);
  for (const field of Object.keys(old)) {
    if (!allowed.has(field) && !retiredFields.includes(field)) {
      throw new Error(`legacy task.${field} needs explicit field disposition`);
    }
  }
  // These fields contain business facts. Projection cannot silently drop them.
  for (const field of [
    "name",
    "title",
    "description",
    "status",
    "notes",
    "meta",
    "commit",
    "pr_url",
    "relatedFiles",
    "parent",
    "createdAt",
    "completedAt",
  ] as const) {
    if (
      field in old &&
      JSON.stringify(old[field]) !== JSON.stringify(record[field])
    ) {
      throw new Error(`Migration must preserve task.${field}`);
    }
  }
  for (const field of ["children", "subtasks"] as const) {
    if (!(field in old)) continue;
    const values = old[field];
    if (
      !Array.isArray(values) ||
      values.some(
        (value: unknown) =>
          typeof value !== "string" || !record.children.includes(value),
      )
    ) {
      throw new Error(
        `legacy task.${field} needs a lossless children projection`,
      );
    }
  }
  return record;
}
