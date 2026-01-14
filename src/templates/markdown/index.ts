/**
 * Markdown templates for Trellis workflow
 * Each template is stored as a .txt file
 */

import { readMarkdown } from "../extract.js";

// Agent progress
export const agentProgressIndexContent: string = readMarkdown(
  "agent-traces-index.md.txt",
);

// Flow documentation
export const flowMdContent: string = readMarkdown("flow.md.txt");
export const workflowGitignoreContent: string = readMarkdown("gitignore.txt");

// Root files
export const initAgentContent: string = readMarkdown("init-agent.md.txt");
export const agentsMdContent: string = readMarkdown("agents.md.txt");

// Backend structure (multi-doc format)
export const backendIndexContent: string = readMarkdown(
  "structure/backend/index.md.txt",
);
export const backendDirectoryStructureContent: string = readMarkdown(
  "structure/backend/directory-structure.md.txt",
);
export const backendDatabaseGuidelinesContent: string = readMarkdown(
  "structure/backend/database-guidelines.md.txt",
);
export const backendLoggingGuidelinesContent: string = readMarkdown(
  "structure/backend/logging-guidelines.md.txt",
);
export const backendQualityGuidelinesContent: string = readMarkdown(
  "structure/backend/quality-guidelines.md.txt",
);
export const backendErrorHandlingContent: string = readMarkdown(
  "structure/backend/error-handling.md.txt",
);

// Frontend structure (multi-doc format)
export const frontendIndexContent: string = readMarkdown(
  "structure/frontend/index.md.txt",
);
export const frontendDirectoryStructureContent: string = readMarkdown(
  "structure/frontend/directory-structure.md.txt",
);
export const frontendTypeSafetyContent: string = readMarkdown(
  "structure/frontend/type-safety.md.txt",
);
export const frontendHookGuidelinesContent: string = readMarkdown(
  "structure/frontend/hook-guidelines.md.txt",
);
export const frontendComponentGuidelinesContent: string = readMarkdown(
  "structure/frontend/component-guidelines.md.txt",
);
export const frontendQualityGuidelinesContent: string = readMarkdown(
  "structure/frontend/quality-guidelines.md.txt",
);
export const frontendStateManagementContent: string = readMarkdown(
  "structure/frontend/state-management.md.txt",
);

// Flows structure
export const flowsIndexContent: string = readMarkdown(
  "structure/flows/index.md.txt",
);
export const flowsCrossLayerThinkingGuideContent: string = readMarkdown(
  "structure/flows/cross-layer-thinking-guide.md.txt",
);
export const flowsCodeReuseThinkingGuideContent: string = readMarkdown(
  "structure/flows/code-reuse-thinking-guide.md.txt",
);
