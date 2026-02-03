#!/usr/bin/env node

/**
 * Cross-platform script to copy template files to dist/
 *
 * This script copies src/templates/ to dist/templates/ (excluding .ts files).
 *
 * The templates are GENERIC templates for user projects:
 * - src/templates/trellis/ - Workflow scripts and config
 * - src/templates/claude/ - Claude Code commands, agents, hooks
 * - src/templates/cursor/ - Cursor commands
 * - src/templates/iflow/ - iFlow CLI commands, agents, hooks
 * - src/templates/opencode/ - OpenCode commands, agents, hooks
 * - src/templates/markdown/ - Markdown templates (spec, guides)
 *
 * Note: We NO LONGER copy from the project's own .trellis/, .cursor/, .claude/
 * because those may be customized for the Trellis project itself.
 */

import { cpSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Recursively copy directory, excluding .ts files
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (extname(entry) !== ".ts") {
      cpSync(srcPath, destPath);
    }
  }
}

// Copy src/templates to dist/templates
copyDir("src/templates", "dist/templates");
console.log("Copied src/templates/ to dist/templates/");

// Copy src/migrations/manifests to dist/migrations/manifests
copyDir("src/migrations/manifests", "dist/migrations/manifests");
console.log("Copied src/migrations/manifests/ to dist/migrations/manifests/");

console.log("Template copy complete.");
