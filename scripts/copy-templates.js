#!/usr/bin/env node

/**
 * Cross-platform script to copy template files to dist/
 *
 * This script copies:
 * 1. src/templates/ to dist/templates/ (excluding .ts files)
 * 2. .trellis/ to dist/.trellis/ (for dogfooding - templates read from actual config)
 *
 * The .trellis/ directory is copied because the template system reads actual
 * Trellis configuration files as templates (dogfooding principle).
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
 * Recursively copy directory, excluding .ts files
 */
function copyDir(src, dest, excludePatterns = []) {
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    // Skip excluded patterns
    if (excludePatterns.includes(entry)) {
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

// Copy .trellis to dist/.trellis (for dogfooding)
// This allows the package to read actual trellis config files as templates
if (existsSync(".trellis")) {
  copyDir(".trellis", "dist/.trellis", TRELLIS_EXCLUDE);
  console.log("Copied .trellis/ to dist/.trellis/");
}

console.log("Template copy complete.");
