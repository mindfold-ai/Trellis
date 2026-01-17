/**
 * Markdown templates for Trellis workflow
 *
 * Some templates are dogfooded from .trellis/ (workflow.md, .gitignore, agent-traces/index.md)
 * Others are standalone templates in src/templates/markdown/ (init-agent.md, agents.md)
 * Structure templates use .md.txt extension as they are generic templates for new projects.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTrellisFile } from "../extract.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read a template file from src/templates/markdown/
 */
function readLocalTemplate(filename: string): string {
  const filePath = join(__dirname, filename);
  return readFileSync(filePath, "utf-8");
}

// =============================================================================
// Dogfooded files (from .trellis/)
// =============================================================================

// Agent progress index (from .trellis/agent-traces/index.md)
export const agentProgressIndexContent: string = readTrellisFile(
  "agent-traces/index.md",
);

// Workflow documentation (from .trellis/workflow.md)
export const workflowMdContent: string = readTrellisFile("workflow.md");

// Gitignore (from .trellis/.gitignore)
export const workflowGitignoreContent: string = readTrellisFile(".gitignore");

// =============================================================================
// Standalone templates (not dogfooded)
// =============================================================================

// Root files for new projects
export const initAgentContent: string = readLocalTemplate("init-agent.md");
export const agentsMdContent: string = readLocalTemplate("agents.md");

// Worktree config template (generic, not dogfooded from Trellis project)
export const worktreeYamlContent: string =
  readLocalTemplate("worktree.yaml.txt");

// =============================================================================
// Structure templates (generic templates from .txt files)
// These are NOT dogfooded - they are generic templates for new projects
// =============================================================================

// Backend structure (multi-doc format)
export const backendIndexContent: string = readLocalTemplate(
  "structure/backend/index.md.txt",
);
export const backendDirectoryStructureContent: string = readLocalTemplate(
  "structure/backend/directory-structure.md.txt",
);
export const backendDatabaseGuidelinesContent: string = readLocalTemplate(
  "structure/backend/database-guidelines.md.txt",
);
export const backendLoggingGuidelinesContent: string = readLocalTemplate(
  "structure/backend/logging-guidelines.md.txt",
);
export const backendQualityGuidelinesContent: string = readLocalTemplate(
  "structure/backend/quality-guidelines.md.txt",
);
export const backendErrorHandlingContent: string = readLocalTemplate(
  "structure/backend/error-handling.md.txt",
);

// Frontend structure (multi-doc format)
export const frontendIndexContent: string = readLocalTemplate(
  "structure/frontend/index.md.txt",
);
export const frontendDirectoryStructureContent: string = readLocalTemplate(
  "structure/frontend/directory-structure.md.txt",
);
export const frontendTypeSafetyContent: string = readLocalTemplate(
  "structure/frontend/type-safety.md.txt",
);
export const frontendHookGuidelinesContent: string = readLocalTemplate(
  "structure/frontend/hook-guidelines.md.txt",
);
export const frontendComponentGuidelinesContent: string = readLocalTemplate(
  "structure/frontend/component-guidelines.md.txt",
);
export const frontendQualityGuidelinesContent: string = readLocalTemplate(
  "structure/frontend/quality-guidelines.md.txt",
);
export const frontendStateManagementContent: string = readLocalTemplate(
  "structure/frontend/state-management.md.txt",
);

// Guides structure
export const guidesIndexContent: string = readLocalTemplate(
  "structure/guides/index.md.txt",
);
export const guidesCrossLayerThinkingGuideContent: string = readLocalTemplate(
  "structure/guides/cross-layer-thinking-guide.md.txt",
);
export const guidesCodeReuseThinkingGuideContent: string = readLocalTemplate(
  "structure/guides/code-reuse-thinking-guide.md.txt",
);
