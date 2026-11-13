import fs from "node:fs";
import path from "node:path";

import {
  TASK_RECORD_FIELD_ORDER,
  emptyTaskRecord,
  taskRecordSchema,
  type TrellisTaskRecord,
} from "./schema.js";

const TASK_JSON_BASENAME = "task.json";

export interface LoadTaskRecordOptions {
  /** Absolute or repo-relative directory containing `task.json`. */
  taskDir: string;
  /** Optional repo root used to resolve relative `taskDir` values. */
  cwd?: string;
}

export interface WriteTaskRecordOptions {
  /** Absolute or repo-relative directory containing `task.json`. */
  taskDir: string;
  /** Canonical record to persist. */
  record: TrellisTaskRecord;
  /** Optional repo root used to resolve relative `taskDir` values. */
  cwd?: string;
}

/**
 * Read a task.json file and return a canonicalized record.
 *
 * Records containing unsupported top-level fields are rejected.
 */
export function loadTaskRecord(
  options: LoadTaskRecordOptions,
): TrellisTaskRecord {
  const file = resolveTaskJsonPath(options.taskDir, options.cwd);
  const raw = fs.readFileSync(file, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse ${file}: ${err instanceof Error ? err.message : err}`,
    );
  }
  return taskRecordSchema.parse(parsed);
}

/**
 * Write a task.json file with canonical field ordering. An existing file
 * must satisfy the current schema before it can be replaced.
 *
 * The directory containing `task.json` is created if it does not exist.
 */
export function writeTaskRecord(options: WriteTaskRecordOptions): void {
  const record = taskRecordSchema.parse(options.record);
  const file = resolveTaskJsonPath(options.taskDir, options.cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  readExistingRecord(file);
  fs.writeFileSync(file, serializeTaskRecord(record), "utf-8");
}

/** Current record serialization shared by normal writes and explicit migration. */
export function serializeTaskRecord(input: TrellisTaskRecord): string {
  const record = taskRecordSchema.parse(input);
  const out: Record<string, unknown> = {};

  const recordBag = record as unknown as Record<string, unknown>;
  for (const field of TASK_RECORD_FIELD_ORDER) {
    out[field] = recordBag[field];
  }
  if ("branch" in record) out.branch = record.branch;

  return JSON.stringify(out, null, 2) + "\n";
}

function readExistingRecord(file: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Refusing to overwrite corrupt ${file}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  try {
    taskRecordSchema.parse(parsed);
  } catch (err) {
    throw new Error(
      `Refusing to overwrite invalid task record at ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function resolveTaskJsonPath(taskDir: string, cwd?: string): string {
  if (path.isAbsolute(taskDir)) {
    return path.join(taskDir, TASK_JSON_BASENAME);
  }
  const base = cwd ?? process.cwd();
  return path.join(path.resolve(base, taskDir), TASK_JSON_BASENAME);
}

// Re-exported so callers can build a starter record without hitting the
// schema module directly.
export { emptyTaskRecord };
