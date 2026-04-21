/**
 * Trellis workflow templates
 *
 * These are GENERIC templates for user projects.
 * Do NOT use Trellis project's own .trellis/ directory (which may be customized).
 *
 * Directory structure:
 *   trellis/
 *   ├── scripts/
 *   │   ├── __init__.py
 *   │   ├── common/           # Shared utilities (Python)
 *   │   ├── multi_agent/      # Multi-agent pipeline scripts (Python)
 *   │   └── *.py              # Main scripts (Python)
 *   ├── scripts-shell-archive/ # Archived shell scripts (for reference)
 *   ├── workflow.md           # Workflow guide
 *   ├── config.yaml            # Trellis configuration
 *   ├── worktree.yaml         # Worktree configuration
 *   └── gitignore.txt         # .gitignore content
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

// Python scripts - package init
export const scriptsInit = readTemplate("scripts/__init__.py");

// Python scripts - common
export const commonInit = readTemplate("scripts/common/__init__.py");
export const commonPaths = readTemplate("scripts/common/paths.py");
export const commonDeveloper = readTemplate("scripts/common/developer.py");
export const commonGitContext = readTemplate("scripts/common/git_context.py");
export const commonWorktree = readTemplate("scripts/common/worktree.py");
export const commonTaskQueue = readTemplate("scripts/common/task_queue.py");
export const commonTaskUtils = readTemplate("scripts/common/task_utils.py");
export const commonPhase = readTemplate("scripts/common/phase.py");
export const commonRegistry = readTemplate("scripts/common/registry.py");
export const commonCliAdapter = readTemplate("scripts/common/cli_adapter.py");
export const commonConfig = readTemplate("scripts/common/config.py");
export const commonIo = readTemplate("scripts/common/io.py");
export const commonLog = readTemplate("scripts/common/log.py");
export const commonGit = readTemplate("scripts/common/git.py");
export const commonTypes = readTemplate("scripts/common/types.py");
export const commonTasks = readTemplate("scripts/common/tasks.py");
export const commonTaskContext = readTemplate("scripts/common/task_context.py");
export const commonTaskStore = readTemplate("scripts/common/task_store.py");
export const commonSessionContext = readTemplate(
  "scripts/common/session_context.py",
);
export const commonPackagesContext = readTemplate(
  "scripts/common/packages_context.py",
);
export const commonSpecIndexToc = readTemplate(
  "scripts/common/spec_index_toc.py",
);

// Python scripts - multi_agent
export const multiAgentInit = readTemplate("scripts/multi_agent/__init__.py");
export const multiAgentStart = readTemplate("scripts/multi_agent/start.py");
export const multiAgentCleanup = readTemplate("scripts/multi_agent/cleanup.py");
export const multiAgentStatus = readTemplate("scripts/multi_agent/status.py");
export const multiAgentCreatePr = readTemplate(
  "scripts/multi_agent/create_pr.py",
);
export const multiAgentPlan = readTemplate("scripts/multi_agent/plan.py");
export const multiAgentStatusDisplay = readTemplate(
  "scripts/multi_agent/status_display.py",
);
export const multiAgentStatusMonitor = readTemplate(
  "scripts/multi_agent/status_monitor.py",
);

// Python scripts - main
export const getDeveloperScript = readTemplate("scripts/get_developer.py");
export const initDeveloperScript = readTemplate("scripts/init_developer.py");
export const taskScript = readTemplate("scripts/task.py");
export const getContextScript = readTemplate("scripts/get_context.py");
export const addSessionScript = readTemplate("scripts/add_session.py");
export const createBootstrapScript = readTemplate(
  "scripts/create_bootstrap.py",
);

// Configuration files
export const workflowMdTemplate = readTemplate("workflow.md");
export const configYamlTemplate = readTemplate("config.yaml");
export const worktreeYamlTemplate = readTemplate("worktree.yaml");
export const gitignoreTemplate = readTemplate("gitignore.txt");

/**
 * Get all script templates as a map of relative path to content
 */
export function getAllScripts(): Map<string, string> {
  const scripts = new Map<string, string>();

  // Package init
  scripts.set("__init__.py", scriptsInit);

  // Common
  scripts.set("common/__init__.py", commonInit);
  scripts.set("common/paths.py", commonPaths);
  scripts.set("common/developer.py", commonDeveloper);
  scripts.set("common/git_context.py", commonGitContext);
  scripts.set("common/worktree.py", commonWorktree);
  scripts.set("common/task_queue.py", commonTaskQueue);
  scripts.set("common/task_utils.py", commonTaskUtils);
  scripts.set("common/phase.py", commonPhase);
  scripts.set("common/registry.py", commonRegistry);
  scripts.set("common/cli_adapter.py", commonCliAdapter);
  scripts.set("common/config.py", commonConfig);
  scripts.set("common/io.py", commonIo);
  scripts.set("common/log.py", commonLog);
  scripts.set("common/git.py", commonGit);
  scripts.set("common/types.py", commonTypes);
  scripts.set("common/tasks.py", commonTasks);
  scripts.set("common/task_context.py", commonTaskContext);
  scripts.set("common/task_store.py", commonTaskStore);
  scripts.set("common/session_context.py", commonSessionContext);
  scripts.set("common/packages_context.py", commonPackagesContext);
  scripts.set("common/spec_index_toc.py", commonSpecIndexToc);

  // Multi-agent
  scripts.set("multi_agent/__init__.py", multiAgentInit);
  scripts.set("multi_agent/start.py", multiAgentStart);
  scripts.set("multi_agent/cleanup.py", multiAgentCleanup);
  scripts.set("multi_agent/status.py", multiAgentStatus);
  scripts.set("multi_agent/create_pr.py", multiAgentCreatePr);
  scripts.set("multi_agent/plan.py", multiAgentPlan);
  scripts.set("multi_agent/status_display.py", multiAgentStatusDisplay);
  scripts.set("multi_agent/status_monitor.py", multiAgentStatusMonitor);

  // Main
  scripts.set("get_developer.py", getDeveloperScript);
  scripts.set("init_developer.py", initDeveloperScript);
  scripts.set("task.py", taskScript);
  scripts.set("get_context.py", getContextScript);
  scripts.set("add_session.py", addSessionScript);
  scripts.set("create_bootstrap.py", createBootstrapScript);

  return scripts;
}
