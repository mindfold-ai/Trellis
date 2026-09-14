import fs from "node:fs";
import path from "node:path";

const RETIRED_NAMES = new Set([".developer", "workspace", "agent-traces"]);

function isProtectedEntry(name: string): boolean {
  return RETIRED_NAMES.has(name) || name.startsWith(".backup-");
}

/** Pure path classification; callers may supply the physical workflow root. */
export function isRetiredDataPath(filePath: string, trellisRoot?: string): boolean {
  const absolute = path.resolve(filePath);
  if (trellisRoot) {
    const relative = path.relative(trellisRoot, absolute);
    if (isProtectedEntry(relative.split(path.sep)[0] ?? "")) return true;
  }
  const segments = absolute.split(path.sep);
  return segments.some(
    (segment, index) =>
      segment === ".trellis" && isProtectedEntry(segments[index + 1] ?? ""),
  );
}

/** Resolve metadata only, including destinations that have not been created. */
function resolveAccessPath(filePath: string): string {
  let current = path.resolve(filePath);
  const suffix: string[] = [];
  let links = 0;
  for (;;) {
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      if (++links > 40) throw new Error(`Cannot resolve symlink path: ${filePath}`);
      current = path.resolve(path.dirname(current), fs.readlinkSync(current));
      continue;
    }
    if (stat) return path.resolve(fs.realpathSync(current), ...suffix);
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Cannot resolve path: ${filePath}`);
    suffix.unshift(path.basename(current));
    current = parent;
  }
}

/** Resolve the boundary without enumerating any protected children. */
export function resolveTrellisDataRoot(cwd: string): string {
  return resolveAccessPath(path.resolve(cwd, ".trellis"));
}

export class RetiredDataAccessError extends Error {
  constructor(filePath: string) {
    super(`Retired identity/history is not an active data source or destination: ${filePath}`);
    this.name = "RetiredDataAccessError";
  }
}

/** Apply before reads, enumeration, creation or mutation, not after accessing data. */
export function assertActiveDataPath(filePath: string, cwd: string): string {
  const absolute = path.resolve(cwd, filePath);
  if (isRetiredDataPath(absolute)) throw new RetiredDataAccessError(filePath);
  const workflowRoot = resolveTrellisDataRoot(cwd);
  const resolved = resolveAccessPath(absolute);
  if (isRetiredDataPath(resolved, workflowRoot)) {
    throw new RetiredDataAccessError(filePath);
  }
  return resolved;
}
