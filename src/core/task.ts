/**
 * Task management utilities
 */

import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  getTasksDir,
  getArchiveDir,
  getTaskDir,
  getCurrentTask,
  setCurrentTask,
  clearCurrentTask,
  ensureTasksDir,
  generateTaskDatePrefix,
  slugify,
  PATHS,
  DIR_NAMES,
  FILE_NAMES,
} from "./paths.js";
import { getDeveloper } from "./developer.js";
import type {
  Task,
  TaskStatus,
  TaskPriority,
  DevType,
  CreateTaskOptions,
  ListTasksOptions,
  ContextEntry,
  PhaseAction,
} from "../types/task.js";

// Re-export for convenience
export { getCurrentTask, setCurrentTask, clearCurrentTask };

/**
 * Default pipeline phases
 */
const DEFAULT_PHASES: PhaseAction[] = [
  { phase: 1, action: "implement" },
  { phase: 2, action: "check" },
  { phase: 3, action: "finish" },
  { phase: 4, action: "create-pr" },
];

/**
 * Read task.json from a task directory
 */
export function readTask(taskDir: string): Task | null {
  const taskJsonPath = path.join(taskDir, FILE_NAMES.TASK_JSON);

  if (!fs.existsSync(taskJsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(taskJsonPath, "utf-8");
    return JSON.parse(content) as Task;
  } catch {
    return null;
  }
}

/**
 * Write task.json to a task directory
 */
export function writeTask(taskDir: string, task: Task): void {
  const taskJsonPath = path.join(taskDir, FILE_NAMES.TASK_JSON);
  fs.writeFileSync(taskJsonPath, JSON.stringify(task, null, 2) + "\n");
}

/**
 * Create a new task
 * Returns the relative path to the task directory
 */
export function createTask(
  title: string,
  options: CreateTaskOptions = {},
  repoRoot?: string,
): string {
  const root = repoRoot ?? getRepoRoot();

  // Get or validate assignee
  let assignee = options.assignee;
  if (!assignee) {
    const currentDeveloper = getDeveloper(root);
    if (!currentDeveloper) {
      throw new Error(
        "No developer set. Run 'trellis init -u <name>' first or use --assignee",
      );
    }
    assignee = currentDeveloper;
  }

  // Get creator (same as current developer or assignee)
  const creator = getDeveloper(root) ?? assignee;

  // Generate slug
  const slug = options.slug ?? slugify(title);
  if (!slug) {
    throw new Error("Could not generate slug from title");
  }

  // Ensure tasks directory exists
  ensureTasksDir(root);

  // Create task directory with MM-DD-slug format
  const datePrefix = generateTaskDatePrefix();
  const dirName = `${datePrefix}-${slug}`;
  const taskDir = getTaskDir(dirName, root);

  if (fs.existsSync(taskDir)) {
    // Directory already exists, but we'll proceed
    console.warn(`Warning: Task directory already exists: ${dirName}`);
  } else {
    fs.mkdirSync(taskDir, { recursive: true });
  }

  // Create task.json
  const today = new Date().toISOString().split("T")[0];
  const task: Task = {
    id: slug,
    name: slug,
    title,
    description: options.description ?? "",
    status: "planning",
    dev_type: null,
    scope: null,
    priority: options.priority ?? "P2",
    creator,
    assignee,
    createdAt: today,
    completedAt: null,
    branch: null,
    base_branch: null,
    worktree_path: null,
    current_phase: 0,
    next_action: DEFAULT_PHASES,
    commit: null,
    pr_url: null,
    subtasks: [],
    relatedFiles: [],
    notes: "",
  };

  writeTask(taskDir, task);

  // Return relative path
  return `${PATHS.TASKS}/${dirName}`;
}

/**
 * Find a task by name (partial match)
 */
export function findTask(
  nameOrSlug: string,
  repoRoot?: string,
): { task: Task; dir: string } | null {
  const tasksDir = getTasksDir(repoRoot);

  if (!fs.existsSync(tasksDir)) {
    return null;
  }

  const entries = fs.readdirSync(tasksDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === DIR_NAMES.ARCHIVE) {
      continue;
    }

    const taskDir = path.join(tasksDir, entry.name);
    const task = readTask(taskDir);

    if (task) {
      // Match by directory name, id, or name
      if (
        entry.name === nameOrSlug ||
        entry.name.endsWith(`-${nameOrSlug}`) ||
        task.id === nameOrSlug ||
        task.name === nameOrSlug
      ) {
        return { task, dir: taskDir };
      }
    }
  }

  return null;
}

/**
 * List all active tasks
 */
export function listTasks(
  options: ListTasksOptions = {},
  repoRoot?: string,
): Array<{ task: Task; dirName: string; isCurrent: boolean }> {
  const root = repoRoot ?? getRepoRoot();
  const tasksDir = getTasksDir(root);
  const currentTaskPath = getCurrentTask(root);
  const developer = getDeveloper(root);

  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  const results: Array<{ task: Task; dirName: string; isCurrent: boolean }> = [];
  const entries = fs.readdirSync(tasksDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === DIR_NAMES.ARCHIVE) {
      continue;
    }

    const taskDir = path.join(tasksDir, entry.name);
    const task = readTask(taskDir);

    if (!task) {
      continue;
    }

    // Apply filters
    if (options.mine && task.assignee !== developer) {
      continue;
    }

    if (options.status && task.status !== options.status) {
      continue;
    }

    const relativePath = `${PATHS.TASKS}/${entry.name}`;
    results.push({
      task,
      dirName: entry.name,
      isCurrent: relativePath === currentTaskPath,
    });
  }

  return results;
}

/**
 * Update a task
 */
export function updateTask(
  taskDir: string,
  updates: Partial<Task>,
): Task | null {
  const task = readTask(taskDir);

  if (!task) {
    return null;
  }

  const updatedTask = { ...task, ...updates };
  writeTask(taskDir, updatedTask);

  return updatedTask;
}

/**
 * Archive a task
 * Returns the new archive path
 */
export function archiveTask(
  nameOrSlug: string,
  repoRoot?: string,
): string | null {
  const root = repoRoot ?? getRepoRoot();
  const found = findTask(nameOrSlug, root);

  if (!found) {
    return null;
  }

  const { task, dir: taskDir } = found;
  const dirName = path.basename(taskDir);

  // Update status before archiving
  const today = new Date().toISOString().split("T")[0];
  updateTask(taskDir, {
    status: "completed",
    completedAt: today,
  });

  // Clear if it's the current task
  const currentTaskPath = getCurrentTask(root);
  if (currentTaskPath?.includes(dirName)) {
    clearCurrentTask(root);
  }

  // Move to archive
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const archiveMonthDir = path.join(getArchiveDir(root), yearMonth);

  if (!fs.existsSync(archiveMonthDir)) {
    fs.mkdirSync(archiveMonthDir, { recursive: true });
  }

  const archivePath = path.join(archiveMonthDir, dirName);
  fs.renameSync(taskDir, archivePath);

  return `${PATHS.TASKS}/${DIR_NAMES.ARCHIVE}/${yearMonth}/${dirName}`;
}

/**
 * List archived tasks
 */
export function listArchivedTasks(
  month?: string,
  repoRoot?: string,
): Array<{ dirName: string; month: string }> {
  const archiveDir = getArchiveDir(repoRoot);

  if (!fs.existsSync(archiveDir)) {
    return [];
  }

  const results: Array<{ dirName: string; month: string }> = [];

  if (month) {
    // List tasks for specific month
    const monthDir = path.join(archiveDir, month);
    if (fs.existsSync(monthDir)) {
      const entries = fs.readdirSync(monthDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          results.push({ dirName: entry.name, month });
        }
      }
    }
  } else {
    // List all archived months with task counts
    const entries = fs.readdirSync(archiveDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const monthDir = path.join(archiveDir, entry.name);
        const tasks = fs.readdirSync(monthDir, { withFileTypes: true });
        for (const task of tasks) {
          if (task.isDirectory()) {
            results.push({ dirName: task.name, month: entry.name });
          }
        }
      }
    }
  }

  return results;
}

// =============================================================================
// Context File Management
// =============================================================================

/**
 * Get base implement context entries
 */
function getImplementBase(): ContextEntry[] {
  return [
    { file: `${PATHS.WORKFLOW}/workflow.md`, reason: "Project workflow and conventions" },
    { file: `${PATHS.SPEC}/shared/index.md`, reason: "Shared coding standards" },
  ];
}

/**
 * Get backend implement context entries
 */
function getImplementBackend(): ContextEntry[] {
  return [
    { file: `${PATHS.SPEC}/backend/index.md`, reason: "Backend development guide" },
    { file: `${PATHS.SPEC}/backend/api-module.md`, reason: "API module conventions" },
    { file: `${PATHS.SPEC}/backend/quality.md`, reason: "Code quality requirements" },
  ];
}

/**
 * Get frontend implement context entries
 */
function getImplementFrontend(): ContextEntry[] {
  return [
    { file: `${PATHS.SPEC}/frontend/index.md`, reason: "Frontend development guide" },
    { file: `${PATHS.SPEC}/frontend/components.md`, reason: "Component conventions" },
  ];
}

/**
 * Get check context entries
 */
function getCheckContext(devType: DevType): ContextEntry[] {
  const entries: ContextEntry[] = [
    { file: ".claude/commands/trellis/finish-work.md", reason: "Finish work checklist" },
    { file: `${PATHS.SPEC}/shared/index.md`, reason: "Shared coding standards" },
  ];

  if (devType === "backend" || devType === "fullstack") {
    entries.push({
      file: ".claude/commands/trellis/check-backend.md",
      reason: "Backend check spec",
    });
  }

  if (devType === "frontend" || devType === "fullstack") {
    entries.push({
      file: ".claude/commands/trellis/check-frontend.md",
      reason: "Frontend check spec",
    });
  }

  return entries;
}

/**
 * Get debug context entries
 */
function getDebugContext(devType: DevType): ContextEntry[] {
  const entries: ContextEntry[] = [
    { file: `${PATHS.SPEC}/shared/index.md`, reason: "Shared coding standards" },
  ];

  if (devType === "backend" || devType === "fullstack") {
    entries.push({
      file: ".claude/commands/trellis/check-backend.md",
      reason: "Backend check spec",
    });
  }

  if (devType === "frontend" || devType === "fullstack") {
    entries.push({
      file: ".claude/commands/trellis/check-frontend.md",
      reason: "Frontend check spec",
    });
  }

  return entries;
}

/**
 * Write JSONL entries to a file
 */
function writeJsonl(filePath: string, entries: ContextEntry[]): void {
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(filePath, content);
}

/**
 * Read JSONL entries from a file
 */
export function readJsonl(filePath: string): ContextEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);

  return lines.map((line) => {
    try {
      return JSON.parse(line) as ContextEntry;
    } catch {
      return { file: "", reason: "Invalid entry" };
    }
  }).filter((e) => e.file);
}

/**
 * Initialize context files (implement.jsonl, check.jsonl, debug.jsonl)
 */
export function initContext(taskDir: string, devType: DevType): void {
  // Update task.json with dev_type
  const task = readTask(taskDir);
  if (task) {
    writeTask(taskDir, { ...task, dev_type: devType });
  }

  // Generate implement.jsonl
  const implementEntries = [...getImplementBase()];
  switch (devType) {
    case "backend":
    case "test":
      implementEntries.push(...getImplementBackend());
      break;
    case "frontend":
      implementEntries.push(...getImplementFrontend());
      break;
    case "fullstack":
      implementEntries.push(...getImplementBackend());
      implementEntries.push(...getImplementFrontend());
      break;
  }
  writeJsonl(path.join(taskDir, "implement.jsonl"), implementEntries);

  // Generate check.jsonl
  writeJsonl(path.join(taskDir, "check.jsonl"), getCheckContext(devType));

  // Generate debug.jsonl
  writeJsonl(path.join(taskDir, "debug.jsonl"), getDebugContext(devType));
}

/**
 * Add a context entry to a JSONL file
 */
export function addContext(
  taskDir: string,
  jsonlName: string,
  filePath: string,
  reason: string,
  repoRoot?: string,
): void {
  const root = repoRoot ?? getRepoRoot();

  // Normalize jsonl name
  const jsonlFileName = jsonlName.endsWith(".jsonl")
    ? jsonlName
    : `${jsonlName}.jsonl`;
  const jsonlPath = path.join(taskDir, jsonlFileName);

  // Check if file/directory exists
  const fullPath = path.join(root, filePath);
  let entryType: "file" | "directory" = "file";

  if (fs.existsSync(fullPath)) {
    if (fs.statSync(fullPath).isDirectory()) {
      entryType = "directory";
      // Ensure trailing slash for directories
      if (!filePath.endsWith("/")) {
        filePath += "/";
      }
    }
  } else {
    throw new Error(`Path not found: ${filePath}`);
  }

  // Check if already exists
  const existing = readJsonl(jsonlPath);
  if (existing.some((e) => e.file === filePath)) {
    console.warn(`Warning: Entry already exists for ${filePath}`);
    return;
  }

  // Add entry
  const entry: ContextEntry =
    entryType === "directory"
      ? { file: filePath, type: "directory", reason }
      : { file: filePath, reason };

  fs.appendFileSync(jsonlPath, JSON.stringify(entry) + "\n");
}

/**
 * Validate JSONL context files
 */
export function validateContext(
  taskDir: string,
  repoRoot?: string,
): { file: string; errors: string[]; entryCount: number }[] {
  const root = repoRoot ?? getRepoRoot();
  const results: { file: string; errors: string[]; entryCount: number }[] = [];

  for (const jsonlName of ["implement.jsonl", "check.jsonl", "debug.jsonl"]) {
    const jsonlPath = path.join(taskDir, jsonlName);
    const errors: string[] = [];
    let entryCount = 0;

    if (!fs.existsSync(jsonlPath)) {
      results.push({ file: jsonlName, errors: ["File not found"], entryCount: 0 });
      continue;
    }

    const content = fs.readFileSync(jsonlPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];

      try {
        const entry = JSON.parse(line ?? "{}") as ContextEntry;

        if (!entry.file) {
          errors.push(`Line ${lineNum}: Missing 'file' field`);
          continue;
        }

        const fullPath = path.join(root, entry.file);
        const entryType = entry.type ?? "file";

        if (entryType === "directory") {
          if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
            errors.push(`Line ${lineNum}: Directory not found: ${entry.file}`);
          }
        } else {
          if (!fs.existsSync(fullPath)) {
            errors.push(`Line ${lineNum}: File not found: ${entry.file}`);
          }
        }

        entryCount++;
      } catch {
        errors.push(`Line ${lineNum}: Invalid JSON`);
      }
    }

    results.push({ file: jsonlName, errors, entryCount });
  }

  return results;
}

/**
 * List context entries from all JSONL files
 */
export function listContext(
  taskDir: string,
): { file: string; entries: ContextEntry[] }[] {
  const results: { file: string; entries: ContextEntry[] }[] = [];

  for (const jsonlName of ["implement.jsonl", "check.jsonl", "debug.jsonl"]) {
    const jsonlPath = path.join(taskDir, jsonlName);
    const entries = readJsonl(jsonlPath);

    if (entries.length > 0) {
      results.push({ file: jsonlName, entries });
    }
  }

  return results;
}
