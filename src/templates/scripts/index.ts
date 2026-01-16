/**
 * Script templates for Trellis workflow
 *
 * Directory structure:
 *   scripts/
 *   ├── common/              # Shared utilities (to be sourced)
 *   │   ├── paths.sh.txt     # Path utilities
 *   │   ├── developer.sh.txt # Developer management
 *   │   ├── git-context.sh.txt # Git context (main implementation)
 *   │   └── worktree.sh.txt  # Worktree utilities (for multi-agent)
 *   ├── multi-agent/         # Multi-agent pipeline scripts
 *   │   ├── start.sh.txt     # Start worktree agent
 *   │   ├── cleanup.sh.txt   # Cleanup worktree
 *   │   └── status.sh.txt    # Status monitor
 *   ├── feature.sh.txt       # Feature management
 *   ├── worktree.yaml.txt    # Worktree configuration template
 *   ├── get-context.sh.txt   # Wrapper for git-context.sh
 *   ├── get-developer.sh.txt # Get developer name
 *   ├── init-developer.sh.txt
 *   └── add-session.sh.txt   # Add session and update index
 */

import { readScript } from "../extract.js";

// Common utilities (to be sourced by other scripts)
export const commonPathsScript: string = readScript("common/paths.sh.txt");
export const commonDeveloperScript: string = readScript(
  "common/developer.sh.txt",
);
export const commonGitContextScript: string = readScript(
  "common/git-context.sh.txt",
);
export const commonWorktreeScript: string = readScript(
  "common/worktree.sh.txt",
);

// Multi-agent scripts
export const multiAgentStartScript: string = readScript(
  "multi-agent/start.sh.txt",
);
export const multiAgentCleanupScript: string = readScript(
  "multi-agent/cleanup.sh.txt",
);
export const multiAgentStatusScript: string = readScript(
  "multi-agent/status.sh.txt",
);

// Configuration templates
export const worktreeYamlTemplate: string = readScript("worktree.yaml.txt");

// Main scripts
export const initDeveloperScript: string = readScript("init-developer.sh.txt");
export const getDeveloperScript: string = readScript("get-developer.sh.txt");
export const featureScript: string = readScript("feature.sh.txt");
export const getContextScript: string = readScript("get-context.sh.txt");
export const addSessionScript: string = readScript("add-session.sh.txt");
export const createBootstrapScript: string = readScript(
  "create-bootstrap.sh.txt",
);
