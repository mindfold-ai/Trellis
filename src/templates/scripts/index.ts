/**
 * Script templates for Trellis workflow
 *
 * Scripts are read from .trellis/scripts/ directory (dogfooding).
 * This implements the "eat your own dog food" principle - Trellis uses its
 * own actual scripts as the source of truth for templating.
 *
 * Directory structure in .trellis/scripts/:
 *   scripts/
 *   ├── common/              # Shared utilities (to be sourced)
 *   │   ├── paths.sh         # Path utilities
 *   │   ├── developer.sh     # Developer management
 *   │   ├── git-context.sh   # Git context (main implementation)
 *   │   └── worktree.sh      # Worktree utilities (for multi-agent)
 *   ├── multi-agent/         # Multi-agent pipeline scripts
 *   │   ├── start.sh         # Start worktree agent
 *   │   ├── cleanup.sh       # Cleanup worktree
 *   │   └── status.sh        # Status monitor
 *   ├── feature.sh           # Feature management
 *   ├── get-context.sh       # Wrapper for git-context.sh
 *   ├── get-developer.sh     # Get developer name
 *   ├── init-developer.sh    # Initialize developer identity
 *   ├── add-session.sh       # Add session and update index
 *   └── create-bootstrap.sh  # Create bootstrap for features
 *
 * Configuration templates from .trellis/:
 *   .trellis/
 *   └── worktree.yaml        # Worktree configuration template
 */

import { readScript, readTrellisFile } from "../extract.js";

// Common utilities (to be sourced by other scripts)
export const commonPathsScript: string = readScript("common/paths.sh");
export const commonDeveloperScript: string = readScript("common/developer.sh");
export const commonGitContextScript: string = readScript(
  "common/git-context.sh",
);
export const commonWorktreeScript: string = readScript("common/worktree.sh");

// Multi-agent scripts
export const multiAgentStartScript: string = readScript("multi-agent/start.sh");
export const multiAgentCleanupScript: string = readScript(
  "multi-agent/cleanup.sh",
);
export const multiAgentStatusScript: string = readScript(
  "multi-agent/status.sh",
);

// Configuration templates (from .trellis/ root)
export const worktreeYamlTemplate: string = readTrellisFile("worktree.yaml");

// Main scripts
export const initDeveloperScript: string = readScript("init-developer.sh");
export const getDeveloperScript: string = readScript("get-developer.sh");
export const featureScript: string = readScript("feature.sh");
export const getContextScript: string = readScript("get-context.sh");
export const addSessionScript: string = readScript("add-session.sh");
export const createBootstrapScript: string = readScript("create-bootstrap.sh");
