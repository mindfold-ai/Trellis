#!/usr/bin/env node

/**
 * Cross-platform script to copy template files to dist/
 * Excludes .ts files (handled by tsc)
 */

import { cpSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const SRC = "src/templates";
const DEST = "dist/templates";

/**
 * Recursively copy directory, excluding .ts files
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

copyDir(SRC, DEST);
