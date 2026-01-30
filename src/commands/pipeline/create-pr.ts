/**
 * trellis pipeline create-pr - Create PR from completed task
 *
 * This command:
 * 1. Stages and commits all changes (excluding workspace/)
 * 2. Pushes to origin
 * 3. Creates a Draft PR using `gh pr create`
 * 4. Updates task.json with status="completed", pr_url, and current_phase
 *
 * Note: This is the only action that performs git commit, as it's the final
 * step after all implementation and checks are complete.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { execa } from "execa";
import { getRepoRoot, isTrellisInitialized, getCurrentTask } from "../../core/paths.js";
import { readTask, updateTask } from "../../core/task/index.js";
import {
  searchAgent,
  getAgentByTaskDir,
  getPhaseForAction,
} from "../../core/pipeline/index.js";

export interface PipelineCreatePrOptions {
  draft?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export interface CreatePrResult {
  prUrl: string;
  branch: string;
  baseBranch: string;
  committed: boolean;
  pushed: boolean;
}

/**
 * Create PR from a completed task
 */
export async function pipelineCreatePr(
  agentIdOrTaskDir: string | undefined,
  options: PipelineCreatePrOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  // Validate environment
  if (!isTrellisInitialized(repoRoot)) {
    console.error(chalk.red("Error: Trellis not initialized. Run: trellis init"));
    process.exit(1);
  }

  // Determine working directory and task
  let workDir: string;
  let taskDir: string;
  let taskDirRel: string | undefined; // Relative task dir for updating main repo

  if (agentIdOrTaskDir) {
    // Try to find agent first
    const agent = searchAgent(agentIdOrTaskDir, repoRoot);
    if (agent) {
      workDir = agent.worktree_path;
      taskDir = path.join(workDir, agent.task_dir);
      taskDirRel = agent.task_dir; // Track for main repo update
    } else {
      // Assume it's a task directory
      const taskDirAbs = path.isAbsolute(agentIdOrTaskDir)
        ? agentIdOrTaskDir
        : path.join(repoRoot, agentIdOrTaskDir);

      if (!fs.existsSync(taskDirAbs)) {
        console.error(chalk.red(`Error: Task directory not found: ${agentIdOrTaskDir}`));
        process.exit(1);
      }

      // Check if there's an agent for this task
      const taskDirRelLookup = path.relative(repoRoot, taskDirAbs);
      const agentForTask = getAgentByTaskDir(taskDirRelLookup, repoRoot);

      if (agentForTask) {
        workDir = agentForTask.worktree_path;
        taskDir = path.join(workDir, agentForTask.task_dir);
        taskDirRel = agentForTask.task_dir; // Track for main repo update
      } else {
        // No agent, work directly in repo
        workDir = repoRoot;
        taskDir = taskDirAbs;
      }
    }
  } else {
    // Try to get current task
    const currentTask = getCurrentTask(repoRoot);
    if (!currentTask) {
      console.error(chalk.red("Error: No task specified and no current task set"));
      console.error("Usage: trellis pipeline create-pr <agent-id|task-dir>");
      process.exit(1);
    }

    // Check if there's an agent for current task
    const agent = getAgentByTaskDir(currentTask, repoRoot);
    if (agent) {
      workDir = agent.worktree_path;
      taskDir = path.join(workDir, agent.task_dir);
      taskDirRel = agent.task_dir; // Track for main repo update
    } else {
      workDir = repoRoot;
      taskDir = path.join(repoRoot, currentTask);
    }
  }

  // Validate task
  const taskJsonPath = path.join(taskDir, "task.json");
  if (!fs.existsSync(taskJsonPath)) {
    console.error(chalk.red(`Error: task.json not found at ${taskDir}`));
    process.exit(1);
  }

  const task = readTask(taskDir);
  if (!task) {
    console.error(chalk.red("Error: Failed to read task.json"));
    process.exit(1);
  }

  // Get task info
  const baseBranch = task.base_branch ?? "main";
  const scope = task.scope ?? "core";
  const devType = task.dev_type;

  // Map dev_type to commit prefix
  let commitPrefix = "feat";
  if (devType) {
    switch (devType) {
      case "docs":
        commitPrefix = "docs";
        break;
      case "test":
        commitPrefix = "test";
        break;
      // backend, frontend, fullstack all use "feat"
      default:
        commitPrefix = "feat";
    }
  }

  if (!options.json) {
    console.log(chalk.blue("=== Create PR ==="));
    if (options.dryRun) {
      console.log(chalk.yellow("[DRY-RUN MODE] No actual changes will be made"));
    }
    console.log("");
    console.log(`Task: ${task.name ?? task.title}`);
    console.log(`Base branch: ${baseBranch}`);
    console.log(`Scope: ${scope}`);
    console.log(`Commit prefix: ${commitPrefix}`);
    console.log("");
  }

  // Get current branch
  const { stdout: currentBranch } = await execa("git", ["branch", "--show-current"], {
    cwd: workDir,
  });

  if (!options.json) {
    console.log(`Current branch: ${currentBranch}`);
  }

  // Stage changes
  if (!options.json) {
    console.log(chalk.yellow("Checking for changes..."));
  }

  // Stage all changes
  await execa("git", ["add", "-A"], { cwd: workDir });

  // Exclude workspace and temp files
  try {
    await execa("git", ["reset", ".trellis/workspace/"], { cwd: workDir });
  } catch {
    // Ignore if path doesn't exist
  }
  try {
    await execa("git", ["reset", ".agent-log", ".agent-runner.sh"], { cwd: workDir });
  } catch {
    // Ignore if files don't exist
  }

  // Check for staged changes
  const { stdout: stagedDiff } = await execa("git", ["diff", "--cached", "--name-only"], {
    cwd: workDir,
  });

  const hasChanges = stagedDiff.trim().length > 0;
  let committed = false;
  let pushed = false;

  if (!hasChanges) {
    if (!options.json) {
      console.log(chalk.yellow("No staged changes to commit"));
    }

    // Check for unpushed commits
    let unpushedCount = 0;
    try {
      const { stdout } = await execa(
        "git",
        ["log", `origin/${currentBranch}..HEAD`, "--oneline"],
        { cwd: workDir },
      );
      unpushedCount = stdout.split("\n").filter(Boolean).length;
    } catch {
      // Remote branch might not exist yet
      unpushedCount = 1; // Assume we have something to push
    }

    if (unpushedCount === 0) {
      if (options.dryRun) {
        // Reset staging in dry-run
        try {
          await execa("git", ["reset", "HEAD"], { cwd: workDir });
        } catch {
          // Ignore
        }
      }
      console.error(chalk.red("No changes to create PR"));
      process.exit(1);
    }

    if (!options.json) {
      console.log(`Found ${unpushedCount} unpushed commit(s)`);
    }
  } else {
    // Commit changes
    const commitMsg = `${commitPrefix}(${scope}): ${task.name ?? task.title}`;

    if (options.dryRun) {
      if (!options.json) {
        console.log(`[DRY-RUN] Would commit with message: ${commitMsg}`);
        console.log(`[DRY-RUN] Staged files:`);
        const files = stagedDiff.split("\n").filter(Boolean);
        for (const file of files) {
          console.log(`  - ${file}`);
        }
      }
    } else {
      await execa("git", ["commit", "-m", commitMsg], { cwd: workDir });
      committed = true;
      if (!options.json) {
        console.log(chalk.green(`Committed: ${commitMsg}`));
      }
    }
  }

  // Push to remote
  if (!options.json) {
    console.log(chalk.yellow("Pushing to remote..."));
  }

  if (options.dryRun) {
    if (!options.json) {
      console.log(`[DRY-RUN] Would push to: origin/${currentBranch}`);
    }
  } else {
    await execa("git", ["push", "-u", "origin", currentBranch], { cwd: workDir });
    pushed = true;
    if (!options.json) {
      console.log(chalk.green(`Pushed to origin/${currentBranch}`));
    }
  }

  // Create PR
  if (!options.json) {
    console.log(chalk.yellow("Creating PR..."));
  }

  const prTitle = `${commitPrefix}(${scope}): ${task.name ?? task.title}`;
  let prUrl = "";

  if (options.dryRun) {
    if (!options.json) {
      console.log(`[DRY-RUN] Would create PR:`);
      console.log(`  Title: ${prTitle}`);
      console.log(`  Base:  ${baseBranch}`);
      console.log(`  Head:  ${currentBranch}`);
      if (fs.existsSync(path.join(taskDir, "prd.md"))) {
        console.log(`  Body:  (from prd.md)`);
      }
    }
    prUrl = "https://github.com/example/repo/pull/DRY-RUN";
  } else {
    // Check if PR already exists
    try {
      const { stdout: existingPr } = await execa(
        "gh",
        ["pr", "list", "--head", currentBranch, "--base", baseBranch, "--json", "url", "--jq", ".[0].url"],
        { cwd: workDir },
      );

      if (existingPr.trim()) {
        prUrl = existingPr.trim();
        if (!options.json) {
          console.log(chalk.yellow(`PR already exists: ${prUrl}`));
        }
      }
    } catch {
      // No existing PR
    }

    if (!prUrl) {
      // Read PRD as PR body
      let prBody = "";
      const prdPath = path.join(taskDir, "prd.md");
      if (fs.existsSync(prdPath)) {
        prBody = fs.readFileSync(prdPath, "utf-8");
      }

      // Build gh pr create args
      const args = ["pr", "create", "--base", baseBranch, "--title", prTitle];

      if (options.draft !== false) {
        args.push("--draft");
      }

      if (prBody) {
        args.push("--body", prBody);
      }

      const { stdout: newPrUrl } = await execa("gh", args, { cwd: workDir });
      prUrl = newPrUrl.trim();

      if (!options.json) {
        console.log(chalk.green(`PR created: ${prUrl}`));
      }
    }
  }

  // Update task.json
  if (!options.json) {
    console.log(chalk.yellow("Updating task status..."));
  }

  if (options.dryRun) {
    if (!options.json) {
      console.log(`[DRY-RUN] Would update task.json:`);
      console.log(`  status: completed`);
      console.log(`  pr_url: ${prUrl}`);
    }
    // Reset staging in dry-run
    try {
      await execa("git", ["reset", "HEAD"], { cwd: workDir });
    } catch {
      // Ignore
    }
  } else {
    // Get the phase number for create-pr action
    let createPrPhase = getPhaseForAction(taskDir, "create-pr");
    if (!createPrPhase) {
      createPrPhase = 4; // Default fallback
    }

    const taskUpdates = {
      status: "completed" as const,
      pr_url: prUrl,
      current_phase: createPrPhase,
    };

    // Update worktree task.json
    updateTask(taskDir, taskUpdates);

    // Also update main repo task.json if we're working from a worktree
    if (taskDirRel && workDir !== repoRoot) {
      const mainRepoTaskDir = path.join(repoRoot, taskDirRel);
      if (fs.existsSync(mainRepoTaskDir)) {
        updateTask(mainRepoTaskDir, taskUpdates);
      }
    }

    if (!options.json) {
      console.log(chalk.green(`Task status updated to 'completed', phase ${createPrPhase}`));
    }
  }

  // Output result
  const result: CreatePrResult = {
    prUrl,
    branch: currentBranch,
    baseBranch,
    committed,
    pushed,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("");
    console.log(chalk.green("=== PR Created Successfully ==="));
    console.log(`PR URL: ${prUrl}`);
  }
}
