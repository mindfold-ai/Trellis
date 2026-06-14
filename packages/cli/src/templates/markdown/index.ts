/**
 * Markdown templates for Trellis workflow
 *
 * These are GENERIC templates for new projects.
 * Structure templates use .md.txt extension as they are generic templates.
 */

import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Locale } from "../../i18n/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read a template file from src/templates/markdown/
 */
function readLocalTemplate(filename: string): string {
  const filePath = join(__dirname, filename);
  return readFileSync(filePath, "utf-8");
}

function localizedFilename(filename: string, locale: Locale): string {
  if (locale === "en") return filename;
  const ext = extname(filename);
  if (!ext) return `${filename}.${locale}`;
  return `${filename.slice(0, -ext.length)}.${locale}${ext}`;
}

function readLocalizedTemplate(filename: string, locale: Locale): string {
  if (locale !== "en") {
    try {
      return readLocalTemplate(localizedFilename(filename, locale));
    } catch {
      // Localized template coverage is incremental. Fall back to English until
      // a sibling file exists for this exact template.
    }
  }
  return readLocalTemplate(filename);
}

// =============================================================================
// Root files for new projects
// =============================================================================

export function getAgentsMdContent(locale: Locale = "en"): string {
  return readLocalizedTemplate("agents.md", locale);
}

export const agentsMdContent: string = getAgentsMdContent("en");

// Workspace index template (developer work records)
export const workspaceIndexContent: string =
  readLocalTemplate("workspace-index.md");

// Backwards compatibility alias
export const agentProgressIndexContent = workspaceIndexContent;

// Gitignore (template file - .gitignore is ignored by npm)
export const workflowGitignoreContent: string =
  readLocalTemplate("gitignore.txt");

// =============================================================================
// Structure templates (generic templates from .txt files)
// These are NOT dogfooded - they are generic templates for new projects
// =============================================================================

// Backend structure (multi-doc format)
export const backendIndexContent: string = readLocalTemplate(
  "spec/backend/index.md.txt",
);
export const backendDirectoryStructureContent: string = readLocalTemplate(
  "spec/backend/directory-structure.md.txt",
);
export const backendDatabaseGuidelinesContent: string = readLocalTemplate(
  "spec/backend/database-guidelines.md.txt",
);
export const backendLoggingGuidelinesContent: string = readLocalTemplate(
  "spec/backend/logging-guidelines.md.txt",
);
export const backendQualityGuidelinesContent: string = readLocalTemplate(
  "spec/backend/quality-guidelines.md.txt",
);
export const backendErrorHandlingContent: string = readLocalTemplate(
  "spec/backend/error-handling.md.txt",
);

// Frontend structure (multi-doc format)
export const frontendIndexContent: string = readLocalTemplate(
  "spec/frontend/index.md.txt",
);
export const frontendDirectoryStructureContent: string = readLocalTemplate(
  "spec/frontend/directory-structure.md.txt",
);
export const frontendTypeSafetyContent: string = readLocalTemplate(
  "spec/frontend/type-safety.md.txt",
);
export const frontendHookGuidelinesContent: string = readLocalTemplate(
  "spec/frontend/hook-guidelines.md.txt",
);
export const frontendComponentGuidelinesContent: string = readLocalTemplate(
  "spec/frontend/component-guidelines.md.txt",
);
export const frontendQualityGuidelinesContent: string = readLocalTemplate(
  "spec/frontend/quality-guidelines.md.txt",
);
export const frontendStateManagementContent: string = readLocalTemplate(
  "spec/frontend/state-management.md.txt",
);

// Guides structure
export const guidesIndexContent: string = readLocalTemplate(
  "spec/guides/index.md.txt",
);
export const guidesCrossLayerThinkingGuideContent: string = readLocalTemplate(
  "spec/guides/cross-layer-thinking-guide.md.txt",
);
export const guidesCodeReuseThinkingGuideContent: string = readLocalTemplate(
  "spec/guides/code-reuse-thinking-guide.md.txt",
);
