import fs from "node:fs";
import path from "node:path";

/**
 * Write a file atomically: stream into a temp file in the same directory,
 * then rename it over the target. A crash, Ctrl-C, or ENOSPC mid-write
 * leaves the original file intact (or absent) — never truncated or
 * half-written. The temp file shares the target's directory so the rename
 * stays on one filesystem and is therefore atomic.
 *
 * On failure the temp file is removed on a best-effort basis and the
 * original error is re-thrown.
 */
export function writeFileAtomic(
  filePath: string,
  data: string | Uint8Array,
): void {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best-effort cleanup; surface the original write error
    }
    throw err;
  }
}
