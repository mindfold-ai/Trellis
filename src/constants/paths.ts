/**
 * Path constants for Trellis workflow structure
 *
 * Change these values to rename directories across the entire project.
 * All paths should be relative to the project root.
 */

// Directory names (can be renamed)
export const DIR_NAMES = {
  /** Root workflow directory */
  WORKFLOW: "workflow",
  /** Progress tracking directory (under workflow/) */
  PROGRESS: "agent-traces",
  /** Features directory (under progress/{developer}/) */
  FEATURES: "features",
  /** Archive directory (under features/) */
  ARCHIVE: "archive",
  /** Structure/guidelines directory (under workflow/) */
  STRUCTURE: "structure",
  /** Scripts directory (under workflow/) */
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
  FLOW: "flow.md",
} as const;

// Constructed paths (relative to project root)
export const PATHS = {
  /** workflow/ */
  WORKFLOW: DIR_NAMES.WORKFLOW,
  /** workflow/agent-traces/ */
  PROGRESS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.PROGRESS}`,
  /** workflow/structure/ */
  STRUCTURE: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.STRUCTURE}`,
  /** workflow/scripts/ */
  SCRIPTS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SCRIPTS}`,
  /** workflow/.developer */
  DEVELOPER_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.DEVELOPER}`,
  /** workflow/.current-feature */
  CURRENT_FEATURE_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.CURRENT_FEATURE}`,
  /** workflow/flow.md */
  FLOW_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.FLOW}`,
} as const;

/**
 * Get developer's progress directory path
 * @example getProgressDir("john") => "workflow/agent-traces/john"
 */
export function getProgressDir(developer: string): string {
  return `${PATHS.PROGRESS}/${developer}`;
}

/**
 * Get developer's features directory path
 * @example getFeaturesDir("john") => "workflow/agent-traces/john/features"
 */
export function getFeaturesDir(developer: string): string {
  return `${getProgressDir(developer)}/${DIR_NAMES.FEATURES}`;
}

/**
 * Get feature directory path
 * @example getFeatureDir("john", "my-feature") => "workflow/agent-traces/john/features/my-feature"
 */
export function getFeatureDir(developer: string, featureName: string): string {
  return `${getFeaturesDir(developer)}/${featureName}`;
}

/**
 * Get archive directory path
 * @example getArchiveDir("john") => "workflow/agent-traces/john/features/archive"
 */
export function getArchiveDir(developer: string): string {
  return `${getFeaturesDir(developer)}/${DIR_NAMES.ARCHIVE}`;
}
