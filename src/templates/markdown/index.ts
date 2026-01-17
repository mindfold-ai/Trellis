/**
 * Markdown templates for Trellis workflow
 *
 * Templates are sourced from two locations:
 * 1. `.trellis/` directory - Dogfooding: actual trellis structure files
 * 2. `src/templates/markdown/` - Template-only files (no .trellis counterpart)
 *
 * This implements the "eat your own dog food" principle - Trellis uses its
 * own actual configuration files as the source of truth for templating.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMarkdown } from "../extract.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read a template-only markdown file from src/templates/markdown/
 * These are templates that have no .trellis counterpart
 */
function readLocalTemplate(filename: string): string {
  const filePath = join(__dirname, filename);
  return readFileSync(filePath, "utf-8");
}

// =============================================================================
// Template-only files (no .trellis counterpart)
// These remain in src/templates/markdown/
// =============================================================================

// Agent progress index template (for new projects)
export const agentProgressIndexContent: string = readLocalTemplate(
  "agent-traces-index.md",
);

// Root files (for new projects)
export const initAgentContent: string = readLocalTemplate("init-agent.md");
export const agentsMdContent: string = readLocalTemplate("agents.md");

// Gitignore template
export const workflowGitignoreContent: string =
  readLocalTemplate("gitignore.txt");

// =============================================================================
// Dogfooded files (read from .trellis/ - Trellis's own config)
// =============================================================================

// Workflow documentation
export const workflowMdContent: string = readMarkdown("workflow.md");

// Backend structure (multi-doc format)
export const backendIndexContent: string = readMarkdown(
  "structure/backend/index.md",
);
export const backendDirectoryStructureContent: string = readMarkdown(
  "structure/backend/directory-structure.md",
);
export const backendDatabaseGuidelinesContent: string = readMarkdown(
  "structure/backend/database-guidelines.md",
);
export const backendLoggingGuidelinesContent: string = readMarkdown(
  "structure/backend/logging-guidelines.md",
);
export const backendQualityGuidelinesContent: string = readMarkdown(
  "structure/backend/quality-guidelines.md",
);
export const backendErrorHandlingContent: string = readMarkdown(
  "structure/backend/error-handling.md",
);

// Frontend structure (multi-doc format)
export const frontendIndexContent: string = readMarkdown(
  "structure/frontend/index.md",
);
export const frontendDirectoryStructureContent: string = readMarkdown(
  "structure/frontend/directory-structure.md",
);
export const frontendTypeSafetyContent: string = readMarkdown(
  "structure/frontend/type-safety.md",
);
export const frontendHookGuidelinesContent: string = readMarkdown(
  "structure/frontend/hook-guidelines.md",
);
export const frontendComponentGuidelinesContent: string = readMarkdown(
  "structure/frontend/component-guidelines.md",
);
export const frontendQualityGuidelinesContent: string = readMarkdown(
  "structure/frontend/quality-guidelines.md",
);
export const frontendStateManagementContent: string = readMarkdown(
  "structure/frontend/state-management.md",
);

// Guides structure
export const guidesIndexContent: string = readMarkdown(
  "structure/guides/index.md",
);
export const guidesCrossLayerThinkingGuideContent: string = readMarkdown(
  "structure/guides/cross-layer-thinking-guide.md",
);
export const guidesCodeReuseThinkingGuideContent: string = readMarkdown(
  "structure/guides/code-reuse-thinking-guide.md",
);
