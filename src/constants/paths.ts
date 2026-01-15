/**
 * Path constants for Trellis workflow structure
 *
 * Change these values to rename directories across the entire project.
 * All paths should be relative to the project root.
 */

// Directory names (can be renamed)
export const DIR_NAMES = {
  /** Root workflow directory */
  WORKFLOW: ".trellis",
  /** Progress tracking directory (under .trellis/) */
  PROGRESS: "agent-traces",
  /** Features directory (under progress/{developer}/) */
  FEATURES: "features",
  /** Archive directory (under features/) */
  ARCHIVE: "archive",
  /** Structure/guidelines directory (under .trellis/) */
  STRUCTURE: "structure",
  /** Scripts directory (under .trellis/) */
  SCRIPTS: "scripts",
} as const;

// File names
export const FILE_NAMES = {
  /** Developer identity file */
  DEVELOPER: ".developer",
  /** Current feature pointer */
  CURRENT_FEATURE: ".current-feature",
  /** Feature metadata */
  FEATURE_JSON: "feature.json",
  /** Requirements document */
  PRD: "prd.md",
  /** Workflow guide */
  WORKFLOW_GUIDE: "workflow.md",
} as const;

// Constructed paths (relative to project root)
export const PATHS = {
  /** .trellis/ */
  WORKFLOW: DIR_NAMES.WORKFLOW,
  /** .trellis/agent-traces/ */
  PROGRESS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.PROGRESS}`,
  /** .trellis/structure/ */
  STRUCTURE: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.STRUCTURE}`,
  /** .trellis/scripts/ */
  SCRIPTS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SCRIPTS}`,
  /** .trellis/.developer */
  DEVELOPER_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.DEVELOPER}`,
  /** .trellis/.current-feature */
  CURRENT_FEATURE_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.CURRENT_FEATURE}`,
  /** .trellis/workflow.md */
  WORKFLOW_GUIDE_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.WORKFLOW_GUIDE}`,
} as const;

/**
 * Get developer's progress directory path
 * @example getProgressDir("john") => ".trellis/agent-traces/john"
 */
export function getProgressDir(developer: string): string {
  return `${PATHS.PROGRESS}/${developer}`;
}

/**
 * Get developer's features directory path
 * @example getFeaturesDir("john") => ".trellis/agent-traces/john/features"
 */
export function getFeaturesDir(developer: string): string {
  return `${getProgressDir(developer)}/${DIR_NAMES.FEATURES}`;
}

/**
 * Get feature directory path
 * @example getFeatureDir("john", "my-feature") => ".trellis/agent-traces/john/features/my-feature"
 */
export function getFeatureDir(developer: string, featureName: string): string {
  return `${getFeaturesDir(developer)}/${featureName}`;
}

/**
 * Get archive directory path
 * @example getArchiveDir("john") => ".trellis/agent-traces/john/features/archive"
 */
export function getArchiveDir(developer: string): string {
  return `${getFeaturesDir(developer)}/${DIR_NAMES.ARCHIVE}`;
}
