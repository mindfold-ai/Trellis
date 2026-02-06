/**
 * Template hash utilities for detecting user modifications
 *
 * Stores SHA256 hashes of template files at install time.
 * Used to determine if users have modified templates.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES } from "../constants/paths.js";
import { ALL_MANAGED_DIRS } from "../configurators/index.js";
import type { TemplateHashes } from "../types/migration.js";

/** File name for storing template hashes */
const HASHES_FILE = ".template-hashes.json";

/**
 * Compute SHA256 hash of content
 */
export function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Get path to the hashes file
 */
function getHashesPath(cwd: string): string {
  return path.join(cwd, DIR_NAMES.WORKFLOW, HASHES_FILE);
}

/**
 * Load stored template hashes
 */
export function loadHashes(cwd: string): TemplateHashes {
  const hashesPath = getHashesPath(cwd);
  if (!fs.existsSync(hashesPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(hashesPath, "utf-8");
    return JSON.parse(content) as TemplateHashes;
  } catch {
    return {};
  }
}

/**
 * Save template hashes
 */
export function saveHashes(cwd: string, hashes: TemplateHashes): void {
  const hashesPath = getHashesPath(cwd);
  fs.writeFileSync(hashesPath, JSON.stringify(hashes, null, 2));
}

/**
 * Update hashes for specific files
 *
 * @param cwd - Working directory
 * @param files - Map of relative paths to file contents
 */
export function updateHashes(cwd: string, files: Map<string, string>): void {
  const hashes = loadHashes(cwd);

  for (const [relativePath, content] of files) {
    hashes[relativePath] = computeHash(content);
  }

  saveHashes(cwd, hashes);
}

/**
 * Update hash for a single file by reading its current content
 */
export function updateHashFromFile(cwd: string, relativePath: string): void {
  const fullPath = path.join(cwd, relativePath);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const hashes = loadHashes(cwd);
  hashes[relativePath] = computeHash(content);
  saveHashes(cwd, hashes);
}

/**
 * Remove hash entry for a file (e.g., after deletion)
 */
export function removeHash(cwd: string, relativePath: string): void {
  const hashes = loadHashes(cwd);
  const { [relativePath]: _, ...rest } = hashes;
  saveHashes(cwd, rest);
}

/**
 * Rename hash entry (used after file rename)
 */
export function renameHash(
  cwd: string,
  oldPath: string,
  newPath: string,
): void {
  const hashes = loadHashes(cwd);
  if (hashes[oldPath]) {
    const { [oldPath]: oldValue, ...rest } = hashes;
    rest[newPath] = oldValue;
    saveHashes(cwd, rest);
  }
}

/**
 * Check if a template file has been modified by the user
 *
 * @param cwd - Working directory
 * @param relativePath - Relative path to the file
 * @param hashes - Stored template hashes
 * @returns true if file has been modified from template, false otherwise
 */
export function isTemplateModified(
  cwd: string,
  relativePath: string,
  hashes: TemplateHashes,
): boolean {
  const fullPath = path.join(cwd, relativePath);

  // If file doesn't exist, can't be modified
  if (!fs.existsSync(fullPath)) {
    return false;
  }

  // If we don't have a stored hash, assume it's modified (conservative)
  const storedHash = hashes[relativePath];
  if (!storedHash) {
    return true;
  }

  // Compare current content hash with stored hash
  const currentContent = fs.readFileSync(fullPath, "utf-8");
  const currentHash = computeHash(currentContent);

  return currentHash !== storedHash;
}

/**
 * Check if a file matches its original template content
 * (Useful for determining if a file can be safely auto-migrated)
 *
 * @param cwd - Working directory
 * @param relativePath - Relative path to the file
 * @param originalContent - Original template content
 * @returns true if file matches original template
 */
export function matchesOriginalTemplate(
  cwd: string,
  relativePath: string,
  originalContent: string,
): boolean {
  const fullPath = path.join(cwd, relativePath);

  if (!fs.existsSync(fullPath)) {
    return false;
  }

  const currentContent = fs.readFileSync(fullPath, "utf-8");
  return currentContent === originalContent;
}

/**
 * Get modification status for multiple files
 *
 * @param cwd - Working directory
 * @param relativePaths - Array of relative paths to check
 * @param hashes - Stored template hashes
 * @returns Map of path to modification status
 */
export function getModificationStatus(
  cwd: string,
  relativePaths: string[],
  hashes: TemplateHashes,
): Map<string, boolean> {
  const result = new Map<string, boolean>();

  for (const relativePath of relativePaths) {
    result.set(relativePath, isTemplateModified(cwd, relativePath, hashes));
  }

  return result;
}

/**
 * Directories to scan for template files during init (derived from platform registry)
 */
const TEMPLATE_DIRS = ALL_MANAGED_DIRS;

/**
 * Patterns to exclude from hash tracking
 */
const EXCLUDE_FROM_HASH = [
  ".template-hashes.json", // Hash file itself
  ".version", // Version file
  ".gitignore", // Git ignore files
  ".developer", // Developer identity file
  "workspace/", // Workspace files (user data)
  "tasks/", // Task files (user data)
  ".current-task", // Current task marker (file, not directory)
  "spec/frontend/", // User-filled spec files
  "spec/backend/", // User-filled spec files
  ".backup-", // Backup directories
];

/**
 * Check if a path should be excluded from hash tracking
 */
function shouldExcludeFromHash(relativePath: string): boolean {
  for (const pattern of EXCLUDE_FROM_HASH) {
    if (relativePath.includes(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively collect all files in a directory
 */
function collectFiles(
  cwd: string,
  dir: string,
  relativeTo: string = "",
): string[] {
  const fullDir = path.join(cwd, dir);
  if (!fs.existsSync(fullDir)) {
    return [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = path.join(dir, entry.name);

    if (shouldExcludeFromHash(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...collectFiles(cwd, relativePath, relativeTo));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Initialize template hashes after init
 *
 * Scans all template directories and computes hashes for files.
 * This should be called at the end of `trellis init` to enable
 * modification detection on subsequent updates.
 *
 * @param cwd - Working directory
 * @returns Number of files hashed
 */
export function initializeHashes(cwd: string): number {
  const hashes: TemplateHashes = {};

  // Collect all template files
  for (const dir of TEMPLATE_DIRS) {
    const files = collectFiles(cwd, dir);

    for (const relativePath of files) {
      const fullPath = path.join(cwd, relativePath);
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        hashes[relativePath] = computeHash(content);
      } catch {
        // Skip files that can't be read (binary, etc.)
      }
    }
  }

  saveHashes(cwd, hashes);
  return Object.keys(hashes).length;
}
