/**
 * Remote template fetcher for Trellis CLI
 *
 * Fetches spec templates from the official docs repository:
 * https://github.com/mindfold-ai/docs/tree/main/marketplace
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadTemplate } from "giget";

// =============================================================================
// Constants
// =============================================================================

const TEMPLATE_INDEX_URL =
  "https://raw.githubusercontent.com/mindfold-ai/docs/main/marketplace/index.json";

const TEMPLATE_REPO = "gh:mindfold-ai/docs";

/** Map template type to installation path */
const INSTALL_PATHS: Record<string, string> = {
  spec: ".trellis/spec",
  skill: ".agents/skills",
  command: ".claude/commands",
  full: ".", // Entire project root
};

// =============================================================================
// Types
// =============================================================================

export interface SpecTemplate {
  id: string;
  type: string;
  name: string;
  description?: string;
  path: string;
  tags?: string[];
}

interface TemplateIndex {
  version: number;
  templates: SpecTemplate[];
}

export type TemplateStrategy = "skip" | "overwrite" | "append";

// =============================================================================
// Fetch Template Index
// =============================================================================

/**
 * Fetch available templates from the remote index
 * Returns empty array on network error (allows fallback to blank)
 */
export async function fetchTemplateIndex(): Promise<SpecTemplate[]> {
  try {
    const res = await fetch(TEMPLATE_INDEX_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const index: TemplateIndex = (await res.json()) as TemplateIndex;
    return index.templates;
  } catch {
    // Network error - return empty array, caller will fallback to blank
    return [];
  }
}

/**
 * Find a template by ID from the index
 */
export async function findTemplate(
  templateId: string,
): Promise<SpecTemplate | null> {
  const templates = await fetchTemplateIndex();
  return templates.find((t) => t.id === templateId) ?? null;
}

// =============================================================================
// Download Template
// =============================================================================

/**
 * Get the installation path for a template type
 */
export function getInstallPath(cwd: string, templateType: string): string {
  const relativePath = INSTALL_PATHS[templateType] || INSTALL_PATHS.spec;
  return path.join(cwd, relativePath);
}

/**
 * Download a template with the specified strategy
 *
 * @param templatePath - Path in the docs repo (e.g., "marketplace/specs/electron-fullstack")
 * @param destDir - Destination directory
 * @param strategy - How to handle existing directory: skip, overwrite, or append
 * @returns true if template was downloaded, false if skipped
 */
export async function downloadWithStrategy(
  templatePath: string,
  destDir: string,
  strategy: TemplateStrategy,
): Promise<boolean> {
  const exists = fs.existsSync(destDir);

  // skip: Directory exists, don't download
  if (strategy === "skip" && exists) {
    return false;
  }

  // overwrite: Delete existing directory first
  if (strategy === "overwrite" && exists) {
    await fs.promises.rm(destDir, { recursive: true });
  }

  // append: Download to temp dir, then merge missing files
  if (strategy === "append" && exists) {
    const tempDir = path.join(os.tmpdir(), `trellis-template-${Date.now()}`);
    try {
      await downloadTemplate(`${TEMPLATE_REPO}/${templatePath}`, {
        dir: tempDir,
        preferOffline: true,
      });
      await copyMissing(tempDir, destDir);
    } finally {
      // Clean up temp directory
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
    return true;
  }

  // Default: Direct download (for new directory or after overwrite)
  await downloadTemplate(`${TEMPLATE_REPO}/${templatePath}`, {
    dir: destDir,
    preferOffline: true,
  });
  return true;
}

/**
 * Copy only files that don't exist in the destination
 */
async function copyMissing(src: string, dest: string): Promise<void> {
  // Ensure destination exists
  if (!fs.existsSync(dest)) {
    await fs.promises.mkdir(dest, { recursive: true });
  }

  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy missing files in subdirectory
      await copyMissing(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      // Only copy if file doesn't exist
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Download a template by ID
 *
 * @param cwd - Current working directory
 * @param templateId - Template ID from the index
 * @param strategy - How to handle existing directory
 * @returns Object with success status and message
 */
export async function downloadTemplateById(
  cwd: string,
  templateId: string,
  strategy: TemplateStrategy,
): Promise<{ success: boolean; message: string; skipped?: boolean }> {
  // Find template in index
  const template = await findTemplate(templateId);
  if (!template) {
    return {
      success: false,
      message: `Template "${templateId}" not found`,
    };
  }

  // Only support spec type in MVP
  if (template.type !== "spec") {
    return {
      success: false,
      message: `Template type "${template.type}" is not supported yet (only "spec" is supported)`,
    };
  }

  // Get destination path
  const destDir = getInstallPath(cwd, template.type);

  // Check if directory exists for skip strategy
  if (strategy === "skip" && fs.existsSync(destDir)) {
    return {
      success: true,
      skipped: true,
      message: `Skipped: ${destDir} already exists`,
    };
  }

  // Download template
  try {
    await downloadWithStrategy(template.path, destDir, strategy);
    return {
      success: true,
      message: `Downloaded template "${templateId}" to ${destDir}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to download template: ${errorMessage}`,
    };
  }
}
