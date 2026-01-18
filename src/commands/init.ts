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
import { DIR_NAMES, PATHS } from "../constants/paths.js";
import { VERSION } from "../cli/index.js";
import {
  agentsMdContent,
  initAgentContent,
} from "../templates/markdown/index.js";
import {
  setWriteMode,
  writeFile,
  type WriteMode,
} from "../utils/file-writer.js";
import {
  detectProjectType,
  getProjectTypeDescription,
  type ProjectType,
} from "../utils/project-detector.js";

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
  console.log(chalk.gray("\n  AI-assisted development workflow framework\n"));

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
          `progress directory (${PATHS.PROGRESS}/{name}/) to track AI sessions.\n` +
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

  // Detect project type
  const detectedType = detectProjectType(cwd);
  console.log(
    chalk.blue("🔍 Project type:"),
    chalk.gray(getProjectTypeDescription(detectedType)),
  );

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

  console.log(chalk.gray(`\nConfiguring: ${tools.join(", ")}`));
  console.log(
    chalk.gray(`Project type: ${getProjectTypeDescription(projectType)}\n`),
  );

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

  // Initialize developer identity (developerName already detected at the start)
  let developerInitialized = false;
  let bootstrapCreated = false;
  if (developerName) {
    try {
      const scriptPath = path.join(cwd, PATHS.SCRIPTS, "init-developer.sh");
      execSync(`bash "${scriptPath}" "${developerName}"`, {
        cwd,
        stdio: "inherit",
      });
      developerInitialized = true;

      // Create bootstrap feature to guide user through filling guidelines
      const bootstrapScriptPath = path.join(
        cwd,
        PATHS.SCRIPTS,
        "create-bootstrap.sh",
      );
      execSync(`bash "${bootstrapScriptPath}" "${projectType}"`, {
        cwd,
        stdio: "pipe", // Silent - we handle output in init
      });
      bootstrapCreated = true;
    } catch (error) {
      console.log(
        chalk.yellow(
          `⚠️  Failed to initialize developer: ${error instanceof Error ? error.message : error}`,
        ),
      );
    }
  }

  console.log(chalk.green("\n✅ Trellis initialized successfully!\n"));

  // Print next steps
  console.log(chalk.cyan("Next steps:"));

  let stepNum = 1;
  if (!developerInitialized) {
    console.log(
      chalk.gray(`${stepNum}. Run `) +
        chalk.white(`./${PATHS.SCRIPTS}/init-developer.sh <your-name>`) +
        chalk.gray(" to set up your developer identity"),
    );
    stepNum++;
    console.log(
      chalk.gray(`${stepNum}. Fill in `) +
        chalk.white(`${PATHS.STRUCTURE}/`) +
        chalk.gray(" with your project-specific guidelines"),
    );
    stepNum++;
  } else if (bootstrapCreated) {
    console.log(
      chalk.gray(`${stepNum}. Use `) +
        chalk.white("/start") +
        chalk.gray(" command in your AI tool to begin a session"),
    );
    stepNum++;
    console.log(
      chalk.gray(`${stepNum}. Ask AI to help you `) +
        chalk.white("fill in project guidelines") +
        chalk.gray(` in ${PATHS.STRUCTURE}/\n`),
    );
  } else {
    console.log(
      chalk.gray(`${stepNum}. Use `) +
        chalk.white("/start") +
        chalk.gray(" command in your AI tool to begin a session\n"),
    );
  }

  // Print structure info
  console.log(chalk.cyan("Generated structure files:"));
  console.log(
    chalk.gray(`  ${PATHS.STRUCTURE}/guides/   - Thinking guides (filled)`),
  );
  if (
    projectType === "frontend" ||
    projectType === "fullstack" ||
    projectType === "unknown"
  ) {
    console.log(
      chalk.gray(
        `  ${PATHS.STRUCTURE}/frontend/ - Frontend guidelines (to fill)`,
      ),
    );
  }
  if (
    projectType === "backend" ||
    projectType === "fullstack" ||
    projectType === "unknown"
  ) {
    console.log(
      chalk.gray(
        `  ${PATHS.STRUCTURE}/backend/  - Backend guidelines (to fill)`,
      ),
    );
  }
  console.log("");
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
  const initAgentPath = path.join(cwd, "init-agent.md");
  const agentsPath = path.join(cwd, "AGENTS.md");

  // Write init-agent.md from template
  const initAgentWritten = await writeFile(initAgentPath, initAgentContent);
  if (initAgentWritten) {
    console.log(chalk.blue("📄 Created init-agent.md"));
  }

  // Write AGENTS.md from template
  const agentsWritten = await writeFile(agentsPath, agentsMdContent);
  if (agentsWritten) {
    console.log(chalk.blue("📄 Created AGENTS.md"));
  }
}
