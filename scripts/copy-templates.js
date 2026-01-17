#!/usr/bin/env node

/**
 * Cross-platform script to copy template files to dist/
 *
 * This script copies:
 * 1. src/templates/ to dist/templates/ (excluding .ts files)
 * 2. .trellis/ to dist/.trellis/ (for dogfooding - scripts)
 * 3. .cursor/ to dist/.cursor/ (for dogfooding - cursor commands)
 * 4. .claude/ to dist/.claude/ (for dogfooding - claude commands, agents, hooks)
 *
 * The config directories are copied because the template system reads actual
 * configuration files as templates (dogfooding principle).
 */

import {
  cpSync,
  readdirSync,
  statSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, extname } from "node:path";

/**
 * Directories/files to exclude when copying .trellis
 * These are runtime/local files that shouldn't be in the package
 */
const TRELLIS_EXCLUDE = [
  ".developer", // Local developer identity
  ".current-feature", // Local feature pointer
  "agent-traces", // Local agent traces
];

/**
 * Files/directories to exclude when copying .claude
 * These are build artifacts or local files that shouldn't be in the package
 */
const CLAUDE_EXCLUDE = [
  "__pycache__", // Python bytecode cache
  "*.pyc", // Python compiled files
];

/**
 * Check if entry matches any exclude pattern
 * Supports exact matches and glob patterns like "*.pyc"
 */
function matchesExclude(entry, excludePatterns) {
  for (const pattern of excludePatterns) {
    // Exact match
    if (pattern === entry) {
      return true;
    }
    // Glob pattern like "*.pyc"
    if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1); // ".pyc"
      if (entry.endsWith(ext)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Recursively copy directory, excluding .ts files
 */
function copyDir(src, dest, excludePatterns = []) {
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    // Skip excluded patterns
    if (matchesExclude(entry, excludePatterns)) {
      continue;
    }

    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath, excludePatterns);
    } else if (extname(entry) !== ".ts") {
      cpSync(srcPath, destPath);
    }
  }
}

// Copy src/templates to dist/templates
copyDir("src/templates", "dist/templates");

// Copy .trellis to dist/.trellis (for dogfooding scripts)
// This allows the package to read actual trellis config files as templates
if (existsSync(".trellis")) {
  copyDir(".trellis", "dist/.trellis", TRELLIS_EXCLUDE);
  console.log("Copied .trellis/ to dist/.trellis/");
}

// Copy .cursor to dist/.cursor (for dogfooding cursor commands)
// This allows the package to read actual cursor command files as templates
if (existsSync(".cursor")) {
  copyDir(".cursor", "dist/.cursor");
  console.log("Copied .cursor/ to dist/.cursor/");
}

// Copy .claude to dist/.claude (for dogfooding claude commands, agents, hooks)
// This allows the package to read actual claude config files as templates
if (existsSync(".claude")) {
  copyDir(".claude", "dist/.claude", CLAUDE_EXCLUDE);
  console.log("Copied .claude/ to dist/.claude/");
}

console.log("Template copy complete.");
