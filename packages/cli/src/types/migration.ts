/**
 * Migration types for Trellis update command
 *
 * These types support intelligent migration during updates,
 * handling file renames, deletions, and user modification detection.
 */

/**
 * A single migration action (rename, rename-dir, or delete)
 */
export interface MigrationItem {
  /** Type of migration action */
  type: "rename" | "rename-dir" | "delete" | "safe-file-delete";
  /** Source path (relative to project root) */
  from: string;
  /** Target path for renames (relative to project root) */
  to?: string;
  /** Human-readable description of WHAT this migration does */
  description?: string;
  /**
   * Optional context shown in the "confirm" prompt explaining WHY the user is
   * being asked about this specific file. Use this for version-specific nuance
   * (e.g. a known hash-tracking gap from a prior CLI version) that would
   * otherwise have to be hardcoded in update.ts. Keep it short (1-2 sentences).
   */
  reason?: string;
  /** Known template hashes for safe-file-delete (only delete if content matches) */
  allowed_hashes?: string[];
}

/**
 * A new top-level config.yaml section introduced by this release.
 *
 * Used by `trellis update` to append the section to existing user config files
 * that pre-date the release, without overwriting their other customizations.
 * Append is gated on `sentinel`: if the user file already contains the sentinel
 * substring (live or commented), the section is treated as already present.
 */
export interface ConfigSectionAdded {
  /** Target file relative to project root (e.g. `.trellis/config.yaml`). */
  file: string;
  /**
   * Substring whose presence in the user file means this section already
   * exists. Pick something stable (e.g. the new top-level YAML key like
   * `codex:`).
   */
  sentinel: string;
  /**
   * The section heading text that appears on the `# <heading>` line inside the
   * `#---` separator block in the bundled template. The extractor takes lines
   * from that separator block until the next `#---` separator (or EOF).
   */
  sectionHeading: string;
}

/**
 * Migration manifest for a specific version
 */
export interface MigrationManifest {
  /** Target version this migration upgrades to */
  version: string;
  /** Human-readable description of changes in this version */
  description?: string;
  /** List of migration actions */
  migrations: MigrationItem[];
  /** Detailed changelog for display to users */
  changelog?: string;
  /** Whether this version contains breaking changes */
  breaking?: boolean;
  /** Whether users should run --migrate (recommended for breaking changes) */
  recommendMigrate?: boolean;
  /** Detailed migration guide for AI-assisted fixes (markdown format) */
  migrationGuide?: string;
  /** Instructions for AI assistants on how to help with migration */
  aiInstructions?: string;
  /**
   * New top-level config.yaml sections introduced by this release. Applied
   * additively to existing user files via sentinel-gated append, keeping their
   * customizations intact while still surfacing newly-introduced knobs.
   */
  configSectionsAdded?: ConfigSectionAdded[];
}

/**
 * Classification of how a migration should be handled
 */
export type MigrationClassification =
  | "auto" // Unmodified by user, can auto-migrate
  | "confirm" // Modified by user, needs confirmation
  | "conflict" // Both old and new files exist
  | "skip"; // Old file doesn't exist, nothing to do

/**
 * Classified migration item with its determined action
 */
export interface ClassifiedMigrationItem extends MigrationItem {
  classification: MigrationClassification;
}

/**
 * Result of classifying all migrations
 */
export interface ClassifiedMigrations {
  /** Unmodified files - safe to auto-migrate */
  auto: MigrationItem[];
  /** User-modified files - need confirmation */
  confirm: MigrationItem[];
  /** Conflict - both old and new exist */
  conflict: MigrationItem[];
  /** Skip - old file doesn't exist */
  skip: MigrationItem[];
}

/**
 * Result of executing migrations
 */
export interface MigrationResult {
  /** Number of files renamed */
  renamed: number;
  /** Number of files deleted */
  deleted: number;
  /** Number of files skipped (user choice or no action needed) */
  skipped: number;
  /** Number of conflicts encountered */
  conflicts: number;
}

/**
 * User action choice for migration confirmation
 */
export type MigrationAction =
  | "rename" // Proceed with rename anyway
  | "backup-rename" // Backup original, then rename
  | "skip" // Skip this migration
  | "view-diff"; // View the diff first

/**
 * Template hashes storage structure
 * Maps relative file paths to their SHA256 hashes
 */
export type TemplateHashes = Record<string, string>;
