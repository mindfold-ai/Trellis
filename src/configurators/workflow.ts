import path from "node:path";

import { DIR_NAMES, PATHS } from "../constants/paths.js";
import { copyTrellisDir } from "../templates/extract.js";

// Import trellis templates (generic, not project-specific)
import {
  workflowMdTemplate,
  worktreeYamlTemplate,
  gitignoreTemplate,
} from "../templates/trellis/index.js";

// Import markdown templates
import {
  agentProgressIndexContent,
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
  // Guides structure
  guidesIndexContent,
  guidesCrossLayerThinkingGuideContent,
  guidesCodeReuseThinkingGuideContent,
} from "../templates/markdown/index.js";

import { writeFile, ensureDir } from "../utils/file-writer.js";
import type { ProjectType } from "../utils/project-detector.js";

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
  /** Enable multi-agent pipeline with worktree support */
  multiAgent?: boolean;
}

/**
 * Create workflow structure based on project type
 *
 * This function creates the .trellis/ directory structure by:
 * 1. Copying scripts/ directory directly (dogfooding)
 * 2. Copying workflow.md and .gitignore (dogfooding)
 * 3. Creating workspace/ with index.md
 * 4. Creating tasks/ directory
 * 5. Creating spec/ with templates (not dogfooded - generic templates)
 * 6. Copying worktree.yaml if multi-agent is enabled
 *
 * @param cwd - Current working directory
 * @param options - Workflow options including project type
 */
export async function createWorkflowStructure(
  cwd: string,
  options?: WorkflowOptions,
): Promise<void> {
  const projectType = options?.projectType ?? "fullstack";
  const multiAgent = options?.multiAgent ?? false;

  // Create base .trellis directory
  ensureDir(path.join(cwd, DIR_NAMES.WORKFLOW));

  // Copy scripts/ directory from templates
  await copyTrellisDir("scripts", path.join(cwd, PATHS.SCRIPTS), {
    executable: true,
  });

  // Copy workflow.md from templates
  await writeFile(
    path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE),
    workflowMdTemplate,
  );

  // Copy .gitignore from templates
  await writeFile(
    path.join(cwd, DIR_NAMES.WORKFLOW, ".gitignore"),
    gitignoreTemplate,
  );

  // Create workspace/ with index.md
  ensureDir(path.join(cwd, PATHS.WORKSPACE));
  await writeFile(
    path.join(cwd, PATHS.WORKSPACE, "index.md"),
    agentProgressIndexContent,
  );

  // Create tasks/ directory
  ensureDir(path.join(cwd, PATHS.TASKS));

  // Copy worktree.yaml if multi-agent enabled
  if (multiAgent) {
    await writeFile(
      path.join(cwd, DIR_NAMES.WORKFLOW, "worktree.yaml"),
      worktreeYamlTemplate,
    );
  }

  // Create spec templates based on project type
  // These are NOT dogfooded - they are generic templates for new projects
  await createSpecTemplates(cwd, projectType);
}

async function createSpecTemplates(
  cwd: string,
  _projectType: ProjectType,
): Promise<void> {
  // Ensure spec directory exists
  ensureDir(path.join(cwd, PATHS.SPEC));

  // Guides - always created
  ensureDir(path.join(cwd, `${PATHS.SPEC}/guides`));
  const guidesDocs: DocDefinition[] = [
    { name: "index.md", content: guidesIndexContent },
    {
      name: "cross-layer-thinking-guide.md",
      content: guidesCrossLayerThinkingGuideContent,
    },
    {
      name: "code-reuse-thinking-guide.md",
      content: guidesCodeReuseThinkingGuideContent,
    },
  ];

  for (const doc of guidesDocs) {
    await writeFile(
      path.join(cwd, `${PATHS.SPEC}/guides`, doc.name),
      doc.content,
    );
  }

  // Always create backend spec
  ensureDir(path.join(cwd, `${PATHS.SPEC}/backend`));
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
      path.join(cwd, `${PATHS.SPEC}/backend`, doc.name),
      doc.content,
    );
  }

  // Always create frontend spec
  ensureDir(path.join(cwd, `${PATHS.SPEC}/frontend`));
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
      path.join(cwd, `${PATHS.SPEC}/frontend`, doc.name),
      doc.content,
    );
  }
}
