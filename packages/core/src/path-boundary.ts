import fs from "node:fs";
import path from "node:path";

/** Resolve an existing ancestor and append absent descendants without reading contents. */
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

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Reject relative paths that escape the project, including through symlinks. */
export function assertProjectPath(filePath: string, cwd: string): string {
  const root = path.resolve(cwd);
  const absolute = path.resolve(root, filePath);
  const projectRelative = !path.isAbsolute(filePath) || isWithin(root, absolute);
  if (projectRelative && !isWithin(root, absolute)) {
    throw new Error(`Path is outside the project: ${filePath}`);
  }
  const resolved = resolveAccessPath(absolute);
  if (projectRelative && !isWithin(resolveAccessPath(root), resolved)) {
    const workflow = path.join(root, ".trellis");
    const relativeToWorkflow = path.relative(workflow, absolute);
    const workflowPath = isWithin(workflow, absolute);
    const workflowRoot = workflowPath ? resolveAccessPath(workflow) : null;
    const tasks = path.join(workflow, "tasks");
    const taskName = path.relative(tasks, absolute).split(path.sep)[0];
    const taskRoot = isWithin(tasks, absolute) && taskName && taskName !== "."
      ? path.join(tasks, taskName)
      : null;
    const linkedTaskRoot = taskRoot && fs.lstatSync(taskRoot, { throwIfNoEntry: false })?.isSymbolicLink()
      ? resolveAccessPath(taskRoot)
      : null;
    if ((workflowRoot && relativeToWorkflow !== ".." && isWithin(workflowRoot, resolved)) ||
        (linkedTaskRoot && isWithin(linkedTaskRoot, resolved))) return resolved;
    throw new Error(`Path resolves outside the project: ${filePath}`);
  }
  return resolved;
}
