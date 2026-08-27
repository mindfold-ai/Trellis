import fs from "node:fs";
import path from "node:path";

import { isManagedPath, isManagedRootDir } from "../configurators/index.js";

export const TRELLIS_BLOCK_START = "<!-- TRELLIS:START -->";
export const TRELLIS_BLOCK_END = "<!-- TRELLIS:END -->";

/** Remove empty managed parents without deleting a managed root directory. */
export function cleanupEmptyDirs(cwd: string, dirPath: string): void {
  const dirPosix = dirPath.replace(/\\/g, "/");
  const segments = dirPosix.split("/");

  if (
    path.posix.isAbsolute(dirPosix) ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    ) ||
    !isManagedPath(dirPosix) ||
    isManagedRootDir(dirPosix)
  ) {
    return;
  }

  const canonicalCwd = fs.realpathSync(cwd);
  const fullPath = path.resolve(canonicalCwd, ...segments);
  const relative = path.relative(canonicalCwd, fullPath);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return;
  }
  if (!fs.existsSync(fullPath)) return;

  try {
    const canonicalFullPath = fs.realpathSync(fullPath);
    const canonicalRelative = path.relative(canonicalCwd, canonicalFullPath);
    if (
      canonicalRelative === "" ||
      canonicalRelative === ".." ||
      canonicalRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(canonicalRelative)
    ) {
      return;
    }

    const stat = fs.lstatSync(fullPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;

    if (fs.readdirSync(fullPath).length === 0) {
      fs.rmdirSync(fullPath);
      const parent = path.posix.dirname(dirPosix);
      if (parent !== "." && parent !== dirPosix && !isManagedRootDir(parent)) {
        cleanupEmptyDirs(cwd, parent);
      }
    }
  } catch {
    // Cleanup is best-effort; permission/race failures leave the directory.
  }
}
