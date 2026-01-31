import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import figlet from "figlet";
import inquirer from "inquirer";
import { configureClaude } from "../configurators/claude.js";
import { configureCursor } from "../configurators/cursor.js";
// TODO: Re-enable when OpenCode support is stable
// import {
//   configureOpenCode,
//   configureOpenCodeAgents,
// } from "../configurators/opencode.js";
import { createWorkflowStructure } from "../configurators/workflow.js";
import { DIR_NAMES, FILE_NAMES, PATHS } from "../constants/paths.js";
import { VERSION } from "../cli/index.js";
import { agentsMdContent } from "../templates/markdown/index.js";
import {
  setWriteMode,
  writeFile,
  type WriteMode,
} from "../utils/file-writer.js";
import {
  detectProjectType,
  type ProjectType,
} from "../utils/project-detector.js";
import { initializeHashes } from "../utils/template-hash.js";

/**
 * Detect available Python command (python3 or python)
 */
function getPythonCommand(): string {
  // Try python3 first (preferred on macOS/Linux)
  try {
    execSync("python3 --version", { stdio: "pipe" });
    return "python3";
  } catch {
    // Fall back to python (common on Windows)
    try {
      execSync("python --version", { stdio: "pipe" });
      return "python";
    } catch {
      // Default to python3, let it fail with a clear error
      return "python3";
    }
  }
}

// =============================================================================
// Bootstrap Task Creation
// =============================================================================

const BOOTSTRAP_TASK_NAME = "00-bootstrap-guidelines";

function getBootstrapPrdContent(projectType: ProjectType): string {
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
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
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
  if (projectType === "frontend") {
    content += frontendSection;
  } else if (projectType === "backend") {
    content += backendSection;
  } else {
    // fullstack
    content += backendSection;
    content += frontendSection;
  }
  content += footer;

  return content;
}

interface TaskJson {
  id: string;
  name: string;
  description: string;
  status: string;
  dev_type: string;
  priority: string;
  creator: string;
  assignee: string;
  createdAt: string;
  completedAt: null;
  commit: null;
  subtasks: { name: string; status: string }[];
  relatedFiles: string[];
  notes: string;
}

function getBootstrapTaskJson(
  developer: string,
  projectType: ProjectType,
): TaskJson {
  const today = new Date().toISOString().split("T")[0];

  let subtasks: { name: string; status: string }[];
  let relatedFiles: string[];

  if (projectType === "frontend") {
    subtasks = [
      { name: "Fill frontend guidelines", status: "pending" },
      { name: "Add code examples", status: "pending" },
    ];
    relatedFiles = [".trellis/spec/frontend/"];
  } else if (projectType === "backend") {
    subtasks = [
      { name: "Fill backend guidelines", status: "pending" },
      { name: "Add code examples", status: "pending" },
    ];
    relatedFiles = [".trellis/spec/backend/"];
  } else {
    // fullstack
    subtasks = [
      { name: "Fill backend guidelines", status: "pending" },
      { name: "Fill frontend guidelines", status: "pending" },
      { name: "Add code examples", status: "pending" },
    ];
    relatedFiles = [".trellis/spec/backend/", ".trellis/spec/frontend/"];
  }

  return {
    id: BOOTSTRAP_TASK_NAME,
    name: "Bootstrap Guidelines",
    description: "Fill in project development guidelines for AI agents",
    status: "in_progress",
    dev_type: "docs",
    priority: "P1",
    creator: developer,
    assignee: developer,
    createdAt: today,
    completedAt: null,
    commit: null,
    subtasks,
    relatedFiles,
    notes: `First-time setup task created by trellis init (${projectType} project)`,
  };
}

/**
 * Create bootstrap task for first-time setup
 */
function createBootstrapTask(
  cwd: string,
  developer: string,
  projectType: ProjectType,
): boolean {
  const taskDir = path.join(cwd, PATHS.TASKS, BOOTSTRAP_TASK_NAME);
  const taskRelativePath = `${PATHS.TASKS}/${BOOTSTRAP_TASK_NAME}`;

  // Check if already exists
  if (fs.existsSync(taskDir)) {
    return true; // Already exists, not an error
  }

  try {
    // Create task directory
    fs.mkdirSync(taskDir, { recursive: true });

    // Write task.json
    const taskJson = getBootstrapTaskJson(developer, projectType);
    fs.writeFileSync(
      path.join(taskDir, FILE_NAMES.TASK_JSON),
      JSON.stringify(taskJson, null, 2),
      "utf-8",
    );

    // Write prd.md
    const prdContent = getBootstrapPrdContent(projectType);
    fs.writeFileSync(path.join(taskDir, FILE_NAMES.PRD), prdContent, "utf-8");

    // Set as current task
    const currentTaskFile = path.join(cwd, PATHS.CURRENT_TASK_FILE);
    fs.writeFileSync(currentTaskFile, taskRelativePath, "utf-8");

    return true;
  } catch {
    return false;
  }
}

interface InitOptions {
  cursor?: boolean;
  claude?: boolean;
  // opencode?: boolean;  // TODO: Re-enable when OpenCode support is stable
  yes?: boolean;
  user?: string;
  force?: boolean;
  skipExisting?: boolean;
}

interface InitAnswers {
  tools: string[];
}

export async function init(options: InitOptions): Promise<void> {
  const cwd = process.cwd();

  // Generate ASCII art banner dynamically using FIGlet "Rebel" font
  const banner = figlet.textSync("Trellis", { font: "Rebel" });
  console.log(chalk.cyan(`\n${banner.trimEnd()}`));
  console.log(
    chalk.gray(
      "\n   All-in-one AI framework & toolkit for Claude Code & Cursor\n",
    ),
  );

  // Set write mode based on options
  let writeMode: WriteMode = "ask";
  if (options.force) {
    writeMode = "force";
    console.log(chalk.gray("Mode: Force overwrite existing files\n"));
  } else if (options.skipExisting) {
    writeMode = "skip";
    console.log(chalk.gray("Mode: Skip existing files\n"));
  }
  setWriteMode(writeMode);

  // Detect developer name from git config or options
  let developerName = options.user;
  if (!developerName) {
    // Only detect from git if current directory is a git repo
    const isGitRepo = fs.existsSync(path.join(cwd, ".git"));
    if (isGitRepo) {
      try {
        developerName = execSync("git config user.name", {
          cwd,
          encoding: "utf-8",
        }).trim();
      } catch {
        // Git not available or no user.name configured
      }
    }
  }

  if (developerName) {
    console.log(chalk.blue("👤 Developer:"), chalk.gray(developerName));
  } else if (!options.yes) {
    // Ask for developer name if not detected and not in yes mode
    console.log(
      chalk.gray(
        "\nTrellis supports team collaboration - each developer has their own\n" +
          `workspace directory (${PATHS.WORKSPACE}/{name}/) to track AI sessions.\n` +
          "Tip: Usually this is your git username (git config user.name).\n",
      ),
    );
    developerName = await askInput("Your name: ");
    while (!developerName) {
      console.log(chalk.yellow("Name is required"));
      developerName = await askInput("Your name: ");
    }
    console.log(chalk.blue("👤 Developer:"), chalk.gray(developerName));
  }

  // Detect project type (silent - no output)
  const detectedType = detectProjectType(cwd);

  let tools: string[];
  let projectType: ProjectType = detectedType;

  if (options.yes) {
    // Default: both Cursor and Claude
    tools = ["cursor", "claude"];
    // Treat unknown as fullstack
    if (detectedType === "unknown") {
      projectType = "fullstack";
    }
  } else if (options.cursor || options.claude) {
    // Use flags
    tools = [];
    if (options.cursor) {
      tools.push("cursor");
    }
    if (options.claude) {
      tools.push("claude");
    }
    // TODO: Re-enable when OpenCode support is stable
    // if (options.opencode) {
    //   tools.push("opencode");
    // }
    // Treat unknown as fullstack
    if (detectedType === "unknown") {
      projectType = "fullstack";
    }
  } else {
    // Interactive mode
    const questions: {
      type: string;
      name: string;
      message: string;
      choices?: { name: string; value: string; checked?: boolean }[];
      default?: boolean | string;
      when?: (answers: InitAnswers) => boolean;
    }[] = [
      {
        type: "checkbox",
        name: "tools",
        message: "Select AI tools to configure:",
        choices: [
          { name: "Cursor", value: "cursor", checked: true },
          { name: "Claude Code", value: "claude", checked: true },
          // TODO: Re-enable when OpenCode support is stable
          // { name: "OpenCode", value: "opencode", checked: false },
        ],
      },
    ];

    const answers = await inquirer.prompt<InitAnswers>(questions);
    tools = answers.tools;

    // Treat unknown as fullstack
    if (detectedType === "unknown") {
      projectType = "fullstack";
    }
  }

  // TODO: Re-enable when OpenCode support is stable
  // const enableOpenCodeAgents = tools.includes("opencode");

  if (tools.length === 0) {
    console.log(
      chalk.yellow("No tools selected. At least one tool is required."),
    );
    return;
  }

  // Silent - no "Configuring" output

  // Create workflow structure with project type
  // Multi-agent is enabled by default
  console.log(chalk.blue("📁 Creating workflow structure..."));
  await createWorkflowStructure(cwd, { projectType, multiAgent: true });

  // Write version file for update tracking
  const versionPath = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");
  fs.writeFileSync(versionPath, VERSION);

  // Configure selected tools by copying entire directories (dogfooding)
  if (tools.includes("cursor")) {
    console.log(chalk.blue("📝 Configuring Cursor..."));
    await configureCursor(cwd);
  }

  if (tools.includes("claude")) {
    console.log(
      chalk.blue("📝 Configuring Claude Code (commands, agents, hooks)..."),
    );
    await configureClaude(cwd);
  }

  // TODO: Re-enable when OpenCode support is stable
  // if (tools.includes("opencode")) {
  //   console.log(chalk.blue("📝 Configuring OpenCode..."));
  //   await configureOpenCode(cwd);
  //
  //   if (enableOpenCodeAgents) {
  //     console.log(chalk.blue("🤖 Configuring OpenCode agents..."));
  //     await configureOpenCodeAgents(cwd);
  //   }
  // }

  // Create root files (skip if exists)
  await createRootFiles(cwd);

  // Initialize template hashes for modification tracking
  const hashedCount = initializeHashes(cwd);
  if (hashedCount > 0) {
    console.log(
      chalk.gray(`📋 Tracking ${hashedCount} template files for updates`),
    );
  }

  // Initialize developer identity (silent - no output)
  if (developerName) {
    try {
      const pythonCmd = getPythonCommand();
      const scriptPath = path.join(cwd, PATHS.SCRIPTS, "init_developer.py");
      execSync(`${pythonCmd} "${scriptPath}" "${developerName}"`, {
        cwd,
        stdio: "pipe", // Silent
      });

      // Create bootstrap task to guide user through filling guidelines
      createBootstrapTask(cwd, developerName, projectType);
    } catch {
      // Silent failure - user can run init_developer.py manually
    }
  }

  // Print "What We Solve" section
  printWhatWeSolve();
}

/**
 * Simple readline-based input (no flickering like inquirer)
 */
function askInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function createRootFiles(cwd: string): Promise<void> {
  const agentsPath = path.join(cwd, "AGENTS.md");

  // Write AGENTS.md from template
  const agentsWritten = await writeFile(agentsPath, agentsMdContent);
  if (agentsWritten) {
    console.log(chalk.blue("📄 Created AGENTS.md"));
  }
}

/**
 * Print "What We Solve" section showing Trellis value proposition
 * Styled like a meme/rant to resonate with developer pain points
 */
function printWhatWeSolve(): void {
  console.log(
    chalk.gray("\nSound familiar? ") +
      chalk.bold("You'll never say these again!!\n"),
  );

  // Pain point 1: Bug loop → Thinking Guides + Ralph Loop
  console.log(chalk.gray("✗ ") + '"Fix A → break B → fix B → break A..."');
  console.log(
    chalk.green("  ✓ ") +
      chalk.white("Thinking Guides + Ralph Loop: Think first, verify after"),
  );
  // Pain point 2: Instructions ignored/forgotten → Sub-agents + per-agent spec injection
  console.log(
    chalk.gray("✗ ") +
      '"Wrote CLAUDE.md, AI ignored it. Reminded AI, it forgot 5 turns later."',
  );
  console.log(
    chalk.green("  ✓ ") +
      chalk.white("Spec Injection: Rules enforced per task, not per chat"),
  );
  // Pain point 3: Missing connections → Cross-Layer Guide
  console.log(chalk.gray("✗ ") + '"Code works but nothing connects..."');
  console.log(
    chalk.green("  ✓ ") +
      chalk.white("Cross-Layer Guide: Map data flow before coding"),
  );
  // Pain point 4: Code explosion → Plan Agent
  console.log(chalk.gray("✗ ") + '"Asked for a button, got 9000 lines"');
  console.log(
    chalk.green("  ✓ ") +
      chalk.white("Plan Agent: Rejects and splits oversized tasks"),
  );

  console.log("");
}
