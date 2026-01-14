import path from "node:path";

import { DIR_NAMES, PATHS } from "../constants/paths.js";

// Import script templates
import {
  // Common utilities
  commonPathsScript,
  commonDeveloperScript,
  commonGitContextScript,
  // Main scripts
  initDeveloperScript,
  getDeveloperScript,
  featureScript,
  getContextScript,
  addSessionScript,
  createBootstrapScript,
} from "../templates/scripts/index.js";

// Import markdown templates
import {
  agentProgressIndexContent,
  flowMdContent,
  workflowGitignoreContent,
  // Backend structure (multi-doc)
  backendIndexContent,
  backendDirectoryStructureContent,
  backendDatabaseGuidelinesContent,
  backendLoggingGuidelinesContent,
  backendQualityGuidelinesContent,
  backendErrorHandlingContent,
  // Frontend structure (multi-doc)
  frontendIndexContent,
  frontendDirectoryStructureContent,
  frontendTypeSafetyContent,
  frontendHookGuidelinesContent,
  frontendComponentGuidelinesContent,
  frontendQualityGuidelinesContent,
  frontendStateManagementContent,
  // Flows structure
  flowsIndexContent,
  flowsCrossLayerThinkingGuideContent,
  flowsCodeReuseThinkingGuideContent,
} from "../templates/markdown/index.js";

import { writeFile, ensureDir } from "../utils/file-writer.js";
import type { ProjectType } from "../utils/project-detector.js";

interface ScriptDefinition {
  name: string;
  content: string;
}

interface DocDefinition {
  name: string;
  content: string;
}

/**
 * Options for creating workflow structure
 */
export interface WorkflowOptions {
  /** Detected or specified project type */
  projectType: ProjectType;
}

/**
 * Create workflow structure based on project type
 *
 * @param cwd - Current working directory
 * @param options - Workflow options including project type
 */
export async function createWorkflowStructure(
  cwd: string,
  options?: WorkflowOptions,
): Promise<void> {
  const projectType = options?.projectType ?? "fullstack";

  // Create base directories (always created)
  const baseDirs = [
    DIR_NAMES.WORKFLOW,
    PATHS.SCRIPTS,
    `${PATHS.SCRIPTS}/common`,
    PATHS.PROGRESS,
    PATHS.STRUCTURE,
    `${PATHS.STRUCTURE}/flows`, // Always created
  ];

  // Add type-specific directories
  if (projectType === "frontend" || projectType === "fullstack") {
    baseDirs.push(`${PATHS.STRUCTURE}/frontend`);
  }
  if (projectType === "backend" || projectType === "fullstack") {
    baseDirs.push(`${PATHS.STRUCTURE}/backend`);
  }
  // For unknown, create both but let user decide
  if (projectType === "unknown") {
    baseDirs.push(`${PATHS.STRUCTURE}/frontend`);
    baseDirs.push(`${PATHS.STRUCTURE}/backend`);
  }

  for (const dir of baseDirs) {
    ensureDir(path.join(cwd, dir));
  }

  // Create scripts
  await createScripts(cwd);

  // Create agent-traces index
  await createAgentProgressIndex(cwd);

  // Create structure templates based on project type
  await createStructureTemplates(cwd, projectType);

  // Create flow.md
  await createFlowMd(cwd);

  // Create .gitignore for workflow
  await createWorkflowGitignore(cwd);
}

async function createScripts(cwd: string): Promise<void> {
  // Common utilities (to be sourced by other scripts)
  const commonScripts: ScriptDefinition[] = [
    { name: "common/paths.sh", content: commonPathsScript },
    { name: "common/developer.sh", content: commonDeveloperScript },
    { name: "common/git-context.sh", content: commonGitContextScript },
  ];

  for (const script of commonScripts) {
    const scriptPath = path.join(cwd, PATHS.SCRIPTS, script.name);
    await writeFile(scriptPath, script.content, { executable: true });
  }

  // Main scripts
  const mainScripts: ScriptDefinition[] = [
    { name: "init-developer.sh", content: initDeveloperScript },
    { name: "get-developer.sh", content: getDeveloperScript },
    { name: "feature.sh", content: featureScript },
    { name: "get-context.sh", content: getContextScript },
    { name: "add-session.sh", content: addSessionScript },
    { name: "create-bootstrap.sh", content: createBootstrapScript },
  ];

  for (const script of mainScripts) {
    const scriptPath = path.join(cwd, PATHS.SCRIPTS, script.name);
    await writeFile(scriptPath, script.content, { executable: true });
  }
}

async function createAgentProgressIndex(cwd: string): Promise<void> {
  await writeFile(
    path.join(cwd, PATHS.PROGRESS, "index.md"),
    agentProgressIndexContent,
  );
}

async function createStructureTemplates(
  cwd: string,
  projectType: ProjectType,
): Promise<void> {
  // Flows structure - always created
  const flowsDocs: DocDefinition[] = [
    { name: "index.md", content: flowsIndexContent },
    {
      name: "cross-layer-thinking-guide.md",
      content: flowsCrossLayerThinkingGuideContent,
    },
    {
      name: "code-reuse-thinking-guide.md",
      content: flowsCodeReuseThinkingGuideContent,
    },
  ];

  for (const doc of flowsDocs) {
    await writeFile(
      path.join(cwd, `${PATHS.STRUCTURE}/flows`, doc.name),
      doc.content,
    );
  }

  // Backend structure - for backend/fullstack/unknown
  if (
    projectType === "backend" ||
    projectType === "fullstack" ||
    projectType === "unknown"
  ) {
    const backendDocs: DocDefinition[] = [
      { name: "index.md", content: backendIndexContent },
      {
        name: "directory-structure.md",
        content: backendDirectoryStructureContent,
      },
      {
        name: "database-guidelines.md",
        content: backendDatabaseGuidelinesContent,
      },
      {
        name: "logging-guidelines.md",
        content: backendLoggingGuidelinesContent,
      },
      {
        name: "quality-guidelines.md",
        content: backendQualityGuidelinesContent,
      },
      { name: "error-handling.md", content: backendErrorHandlingContent },
    ];

    for (const doc of backendDocs) {
      await writeFile(
        path.join(cwd, `${PATHS.STRUCTURE}/backend`, doc.name),
        doc.content,
      );
    }
  }

  // Frontend structure - for frontend/fullstack/unknown
  if (
    projectType === "frontend" ||
    projectType === "fullstack" ||
    projectType === "unknown"
  ) {
    const frontendDocs: DocDefinition[] = [
      { name: "index.md", content: frontendIndexContent },
      {
        name: "directory-structure.md",
        content: frontendDirectoryStructureContent,
      },
      { name: "type-safety.md", content: frontendTypeSafetyContent },
      { name: "hook-guidelines.md", content: frontendHookGuidelinesContent },
      {
        name: "component-guidelines.md",
        content: frontendComponentGuidelinesContent,
      },
      {
        name: "quality-guidelines.md",
        content: frontendQualityGuidelinesContent,
      },
      {
        name: "state-management.md",
        content: frontendStateManagementContent,
      },
    ];

    for (const doc of frontendDocs) {
      await writeFile(
        path.join(cwd, `${PATHS.STRUCTURE}/frontend`, doc.name),
        doc.content,
      );
    }
  }
}

async function createFlowMd(cwd: string): Promise<void> {
  await writeFile(path.join(cwd, PATHS.FLOW_FILE), flowMdContent);
}

async function createWorkflowGitignore(cwd: string): Promise<void> {
  await writeFile(
    path.join(cwd, DIR_NAMES.WORKFLOW, ".gitignore"),
    workflowGitignoreContent,
  );
}
