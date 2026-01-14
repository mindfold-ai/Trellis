/**
 * Script templates for Trellis workflow
 *
 * Directory structure:
 *   scripts/
 *   ├── common/              # Shared utilities (to be sourced)
 *   │   ├── paths.sh.txt     # Path utilities
 *   │   ├── developer.sh.txt # Developer management
 *   │   └── git-context.sh.txt # Git context (main implementation)
 *   ├── feature.sh.txt       # Feature management
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

// Main scripts
export const initDeveloperScript: string = readScript("init-developer.sh.txt");
export const getDeveloperScript: string = readScript("get-developer.sh.txt");
export const featureScript: string = readScript("feature.sh.txt");
export const getContextScript: string = readScript("get-context.sh.txt");
export const addSessionScript: string = readScript("add-session.sh.txt");
export const createBootstrapScript: string = readScript(
  "create-bootstrap.sh.txt",
);
