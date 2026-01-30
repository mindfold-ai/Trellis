/**
 * trellis task bootstrap - Create bootstrap task for first-time setup
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getRepoRoot, getTasksDir, isTrellisInitialized, setCurrentTask } from "../../core/paths.js";
import { getDeveloper } from "../../core/developer/index.js";

export type ProjectType = "frontend" | "backend" | "fullstack";

export interface TaskBootstrapOptions {
  json?: boolean;
}

const TASK_NAME = "00-bootstrap-guidelines";

/**
 * Generate PRD content based on project type
 */
function generatePrdContent(projectType: ProjectType): string {
  const header = `# Bootstrap: Fill Project Development Guidelines

## Purpose

Welcome to Trellis! This is your first task.

AI agents use \`.trellis/spec/\` to understand YOUR project's coding conventions.
**Empty templates = AI writes generic code that doesn't match your project style.**

Filling these guidelines is a one-time setup that pays off for every future AI session.

---

## Your Task

Fill in the guideline files based on your **existing codebase**.
`;

  const backendSection = `
### Backend Guidelines

| File | What to Document |
|------|------------------|
| \`.trellis/spec/backend/directory-structure.md\` | Where different file types go (routes, services, utils) |
| \`.trellis/spec/backend/database-guidelines.md\` | ORM, migrations, query patterns, naming conventions |
| \`.trellis/spec/backend/error-handling.md\` | How errors are caught, logged, and returned |
| \`.trellis/spec/backend/logging-guidelines.md\` | Log levels, format, what to log |
| \`.trellis/spec/backend/quality-guidelines.md\` | Code review standards, testing requirements |
`;

  const frontendSection = `
### Frontend Guidelines

| File | What to Document |
|------|------------------|
| \`.trellis/spec/frontend/directory-structure.md\` | Component/page/hook organization |
| \`.trellis/spec/frontend/component-guidelines.md\` | Component patterns, props conventions |
| \`.trellis/spec/frontend/hook-guidelines.md\` | Custom hook naming, patterns |
| \`.trellis/spec/frontend/state-management.md\` | State library, patterns, what goes where |
| \`.trellis/spec/frontend/type-safety.md\` | TypeScript conventions, type organization |
| \`.trellis/spec/frontend/quality-guidelines.md\` | Linting, testing, accessibility |
`;

  const footer = `
### Thinking Guides (Optional)

The \`.trellis/spec/guides/\` directory contains thinking guides that are already
filled with general best practices. You can customize them for your project if needed.

---

## How to Fill Guidelines

### Principle: Document Reality, Not Ideals

Write what your codebase **actually does**, not what you wish it did.
AI needs to match existing patterns, not introduce new ones.

### Steps

1. **Look at existing code** - Find 2-3 examples of each pattern
2. **Document the pattern** - Describe what you see
3. **Include file paths** - Reference real files as examples
4. **List anti-patterns** - What does your team avoid?

---

## Tips for Using AI

Ask AI to help analyze your codebase:

- "Look at my codebase and document the patterns you see"
- "Analyze my code structure and summarize the conventions"
- "Find error handling patterns and document them"

The AI will read your code and help you document it.

---

## Completion Checklist

- [ ] Guidelines filled for your project type
- [ ] At least 2-3 real code examples in each guideline
- [ ] Anti-patterns documented

When done:

\`\`\`bash
trellis task finish
trellis task archive 00-bootstrap-guidelines
\`\`\`

---

## Why This Matters

After completing this task:

1. AI will write code that matches your project style
2. Relevant \`/trellis:before-*-dev\` commands will inject real context
3. \`/trellis:check-*\` commands will validate against your actual standards
4. Future developers (human or AI) will onboard faster
`;

  let content = header;

  switch (projectType) {
    case "frontend":
      content += frontendSection;
      break;
    case "backend":
      content += backendSection;
      break;
    case "fullstack":
      content += backendSection;
      content += frontendSection;
      break;
  }

  content += footer;
  return content;
}

/**
 * Generate task.json content
 */
function generateTaskJson(
  developer: string,
  projectType: ProjectType,
): Record<string, unknown> {
  const today = new Date().toISOString().split("T")[0];

  let subtasks: { name: string; status: string }[];
  let relatedFiles: string[];

  switch (projectType) {
    case "frontend":
      subtasks = [
        { name: "Fill frontend guidelines", status: "pending" },
        { name: "Add code examples", status: "pending" },
      ];
      relatedFiles = [".trellis/spec/frontend/"];
      break;
    case "backend":
      subtasks = [
        { name: "Fill backend guidelines", status: "pending" },
        { name: "Add code examples", status: "pending" },
      ];
      relatedFiles = [".trellis/spec/backend/"];
      break;
    case "fullstack":
    default:
      subtasks = [
        { name: "Fill backend guidelines", status: "pending" },
        { name: "Fill frontend guidelines", status: "pending" },
        { name: "Add code examples", status: "pending" },
      ];
      relatedFiles = [".trellis/spec/backend/", ".trellis/spec/frontend/"];
      break;
  }

  return {
    id: TASK_NAME,
    name: "Bootstrap Guidelines",
    title: "Bootstrap: Fill Project Development Guidelines",
    description: "Fill in project development guidelines for AI agents",
    status: "in_progress",
    dev_type: "docs",
    scope: "setup",
    priority: "P1",
    creator: developer,
    assignee: developer,
    createdAt: today,
    completedAt: null,
    branch: null,
    base_branch: null,
    worktree_path: null,
    current_phase: null,
    next_action: null,
    commit: null,
    pr_url: null,
    subtasks,
    relatedFiles,
    notes: `First-time setup task created by trellis init (${projectType} project)`,
  };
}

/**
 * Create bootstrap task for first-time setup
 */
export async function taskBootstrap(
  projectType: string | undefined,
  options: TaskBootstrapOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  // Validate initialization
  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  // Validate developer
  const developer = getDeveloper(repoRoot);
  if (!developer) {
    console.error(
      chalk.red("Error: Developer not initialized. Run: trellis developer init <name>"),
    );
    process.exit(1);
  }

  // Validate and normalize project type
  let normalizedType: ProjectType = "fullstack";
  if (projectType) {
    if (!["frontend", "backend", "fullstack"].includes(projectType)) {
      console.error(
        chalk.yellow(`Unknown project type: ${projectType}, defaulting to fullstack`),
      );
    } else {
      normalizedType = projectType as ProjectType;
    }
  }

  const tasksDir = getTasksDir(repoRoot);
  const taskDir = path.join(tasksDir, TASK_NAME);
  const relativePath = `.trellis/tasks/${TASK_NAME}`;

  // Check if already exists
  if (fs.existsSync(taskDir)) {
    if (options.json) {
      console.log(JSON.stringify({ exists: true, path: relativePath }));
    } else {
      console.error(chalk.yellow(`Bootstrap task already exists: ${relativePath}`));
    }
    return;
  }

  // Create task directory
  fs.mkdirSync(taskDir, { recursive: true });

  // Write task.json
  const taskJson = generateTaskJson(developer, normalizedType);
  fs.writeFileSync(
    path.join(taskDir, "task.json"),
    JSON.stringify(taskJson, null, 2) + "\n",
  );

  // Write prd.md
  const prdContent = generatePrdContent(normalizedType);
  fs.writeFileSync(path.join(taskDir, "prd.md"), prdContent);

  // Set as current task
  setCurrentTask(relativePath, repoRoot);

  if (options.json) {
    console.log(JSON.stringify({
      created: true,
      path: relativePath,
      projectType: normalizedType,
    }));
    return;
  }

  // Output path for scripting
  console.log(relativePath);
  console.error(chalk.green(`Created bootstrap task: ${relativePath}`));
  console.error(chalk.blue("Project type:"), normalizedType);
  console.error(chalk.blue("Status:"), "Set as current task");
}
