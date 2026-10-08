/**
 * Canonical task.json shape — single source of truth for Trellis tasks.
 *
 * The runtime Python writer is `.trellis/scripts/common/task_store.py`
 * (`cmd_create`). The field shape and order below mirror that
 * writer exactly so every TS and Python entry point produces structurally
 * identical task.json files.
 *
 * Downstream consumers (CLI bootstrap, external Node
 * services) should depend on this type instead of redefining their own
 * task.json shape.
 */
export type TaskSource =
  | { kind: "no_issue" }
  | { kind: "issue"; repo_ref: string; number: number; disposition: "exact_source" | "reference_only" | "follow_up" | "parent" };

export interface TrellisTaskRecord {
  id: string;
  name: string;
  lifecycle_generation: number;
  source: TaskSource;
  title: string;
  description: string;
  status: string;
  dev_type: string | null;
  scope: string | null;
  package: string | null;
  priority: string;
  createdAt: string;
  completedAt: string | null;
  base_branch: string | null;
  branch?: string | null;
  worktree_path: string | null;
  commit: string | null;
  pr_url: string | null;
  children: string[];
  parent: string | null;
  relatedFiles: string[];
  notes: string;
  meta: Record<string, unknown>;
}

/**
 * Canonical task field order — matches `task_store.py::cmd_create`. Used
 * by `writeTaskRecord` so the on-disk JSON layout is deterministic.
 */
export const TASK_RECORD_FIELD_ORDER = [
  "id",
  "name",
  "lifecycle_generation",
  "source",
  "title",
  "description",
  "status",
  "dev_type",
  "scope",
  "package",
  "priority",
  "createdAt",
  "completedAt",
  "base_branch",
  "worktree_path",
  "commit",
  "pr_url",
  "children",
  "parent",
  "relatedFiles",
  "notes",
  "meta",
] as const satisfies readonly (keyof TrellisTaskRecord)[];

export type TaskRecordField = (typeof TASK_RECORD_FIELD_ORDER)[number];

const STRING_FIELDS: ReadonlySet<TaskRecordField> = new Set([
  "id",
  "name",
  "title",
  "description",
  "status",
  "priority",
  "createdAt",
  "notes",
]);

const NULLABLE_STRING_FIELDS: ReadonlySet<TaskRecordField> = new Set([
  "dev_type",
  "scope",
  "package",
  "completedAt",
  "base_branch",
  "worktree_path",
  "commit",
  "pr_url",
  "parent",
]);

const STRING_ARRAY_FIELDS: ReadonlySet<TaskRecordField> = new Set([
  "children",
  "relatedFiles",
]);

/**
 * Lightweight runtime schema for {@link TrellisTaskRecord}. Zero-dep on
 * purpose — `taskRecordSchema.parse(input)` returns a canonicalized
 * record, throwing on shape violations; `taskRecordSchema.safeParse`
 * returns a result discriminated by `success`.
 *
 * Canonical fields are required, except branch which is added by set-branch.
 * Unknown top-level fields are rejected; meta remains an open JSON object.
 */
export const taskRecordSchema = {
  parse(input: unknown): TrellisTaskRecord {
    return parseTaskRecord(input);
  },
  safeParse(
    input: unknown,
  ):
    | { success: true; data: TrellisTaskRecord }
    | { success: false; error: Error } {
    try {
      return { success: true, data: parseTaskRecord(input) };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  },
} as const;

function parseTaskRecord(input: unknown): TrellisTaskRecord {
  if (!isPlainObject(input)) {
    throw new Error("task record must be a JSON object");
  }
  const allowed = new Set<string>([...TASK_RECORD_FIELD_ORDER, "branch"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`task.${key} is not a supported field`);
  }
  const out = emptyTaskRecord({ id: "placeholder" });
  for (const field of TASK_RECORD_FIELD_ORDER) {
    if (!(field in input)) {
      throw new Error(`task.${field} is required`);
    }
    const value = (input as Record<string, unknown>)[field];
    assignField(out, field, value);
  }
  if ("branch" in input) {
    if (input.branch !== null && typeof input.branch !== "string") {
      throw new Error("task.branch must be a string or null");
    }
    out.branch = input.branch;
  }
  return out;
}

function assignField(
  record: TrellisTaskRecord,
  field: TaskRecordField,
  value: unknown,
): void {
  const bag = record as unknown as Record<string, unknown>;
  if (field === "id") {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
      throw new Error("task.id must match [A-Za-z0-9][A-Za-z0-9._-]*");
    }
    record.id = value;
    return;
  }
  if (field === "lifecycle_generation") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error("task.lifecycle_generation must be a non-negative integer");
    }
    record.lifecycle_generation = value;
    return;
  }
  if (field === "source") {
    if (!isPlainObject(value)) throw new Error("task.source must be an object");
    if (value.kind === "no_issue" && Object.keys(value).length === 1) {
      record.source = { kind: "no_issue" };
      return;
    }
    if (value.kind === "issue" && Object.keys(value).length === 4
        && typeof value.repo_ref === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repo_ref)
        && typeof value.number === "number" && Number.isInteger(value.number) && value.number > 0
        && ["exact_source", "reference_only", "follow_up", "parent"].includes(String(value.disposition))) {
      record.source = value as TaskSource;
      return;
    }
    throw new Error("task.source must be no_issue or a structured issue source");
  }
  if (STRING_FIELDS.has(field)) {
    if (typeof value !== "string") {
      throw new Error(`task.${field} must be a string`);
    }
    bag[field] = value;
    return;
  }
  if (NULLABLE_STRING_FIELDS.has(field)) {
    if (value !== null && typeof value !== "string") {
      throw new Error(`task.${field} must be a string or null`);
    }
    bag[field] = value;
    return;
  }
  if (STRING_ARRAY_FIELDS.has(field)) {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      throw new Error(`task.${field} must be an array of strings`);
    }
    bag[field] = [...value];
    return;
  }
  if (field === "meta") {
    if (!isPlainObject(value)) {
      throw new Error("task.meta must be a JSON object");
    }
    record.meta = cloneJsonObject(value, "task.meta");
    return;
  }
  // Should be unreachable given the field sets cover every canonical field.
  /* c8 ignore next */
  throw new Error(`unknown canonical task field: ${field}`);
}

/**
 * Produce a fully-populated canonical-shape {@link TrellisTaskRecord}.
 *
 * New-task fields are present in canonical order. `overrides` shallow-merges
 * over the defaults — callers supply a valid id and per-task values (name, title,
 * createdAt, etc.) and leave null-default fields untouched
 * unless they have a real value.
 */
export function emptyTaskRecord(
  overrides: Partial<TrellisTaskRecord> & Pick<TrellisTaskRecord, "id">,
): TrellisTaskRecord {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(overrides.id)) {
    throw new Error("task.id must match [A-Za-z0-9][A-Za-z0-9._-]*");
  }
  const today = new Date().toISOString().split("T")[0] ?? "";
  const base: TrellisTaskRecord = {
    id: overrides.id,
    name: "",
    lifecycle_generation: 0,
    source: { kind: "no_issue" },
    title: "",
    description: "",
    status: "planning",
    dev_type: null,
    scope: null,
    package: null,
    priority: "P2",
    createdAt: today,
    completedAt: null,
    base_branch: null,
    worktree_path: null,
    commit: null,
    pr_url: null,
    children: [],
    parent: null,
    relatedFiles: [],
    notes: "",
    meta: {},
  };
  const record = { ...base, ...overrides };
  if (overrides.children !== undefined) {
    record.children = [...overrides.children];
  }
  if (overrides.relatedFiles !== undefined) {
    record.relatedFiles = [...overrides.relatedFiles];
  }
  if (overrides.meta !== undefined) {
    record.meta = cloneJsonObject(overrides.meta, "task.meta");
  }
  return record;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function cloneJsonObject(
  value: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = cloneJsonValue(child, `${path}.${key}`);
  }
  return out;
}

function cloneJsonValue(value: unknown, path: string): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} must be a finite JSON number`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneJsonValue(item, `${path}[${index}]`));
  }
  if (isPlainObject(value)) {
    return cloneJsonObject(value, path);
  }
  throw new Error(`${path} must contain only JSON values`);
}
