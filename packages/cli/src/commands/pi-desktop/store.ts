import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "../../utils/atomic-write.js";

export interface JsonReadResult<T> {
  value: T | null;
  raw: string | null;
  missing: boolean;
  parseError?: string;
}

/** Read a JSON file without throwing on absence or malformed content. */
export function readJsonFile<T>(file: string): JsonReadResult<T> {
  if (!fs.existsSync(file)) return { value: null, raw: null, missing: true };
  const raw = fs.readFileSync(file, "utf-8");
  try {
    return { value: JSON.parse(raw) as T, raw, missing: false };
  } catch (error) {
    return {
      value: null,
      raw,
      missing: false,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface WriteJsonOptions {
  dryRun?: boolean;
}

export interface WriteJsonResult {
  path: string;
  backup: string | null;
  written: boolean;
}

/** One backup per file, overwritten on every write: no unbounded growth. */
const BACKUP_SUFFIX = ".trellis.bak";

/**
 * Write JSON the way the rest of the CLI writes user data: keep one backup of
 * the previous bytes, then replace the file atomically. `dryRun` performs no
 * filesystem work at all.
 */
export function writeJsonFile(
  file: string,
  value: unknown,
  options: WriteJsonOptions = {},
): WriteJsonResult {
  if (options.dryRun) return { path: file, backup: null, written: false };

  let backup: string | null = null;
  if (fs.existsSync(file)) {
    backup = `${file}${BACKUP_SUFFIX}`;
    fs.copyFileSync(file, backup);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
  return { path: file, backup, written: true };
}
