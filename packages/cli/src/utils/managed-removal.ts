/**
 * Shared ownership-aware removal planning used by `uninstall` and `ablate`.
 *
 * The template hash manifest is the ownership boundary. This module deliberately
 * keeps planning pure with respect to mutations: it reads manifest-listed files,
 * runs the existing pure scrubbers, and returns the exact post-removal content.
 */

import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES, FILE_NAMES } from "../constants/paths.js";
import { ALL_MANAGED_DIRS } from "../configurators/index.js";
import {
  COPILOT_INSTRUCTIONS_BLOCK_END,
  COPILOT_INSTRUCTIONS_BLOCK_START,
  COPILOT_INSTRUCTIONS_PATH,
} from "../templates/copilot/index.js";
import {
  scrubCodexConfigToml,
  scrubHooksJson,
  scrubManagedMarkdownBlock,
  scrubOpencodePackageJson,
  scrubPiSettings,
  type ScrubResult,
} from "./uninstall-scrubbers.js";
import {
  cleanupEmptyDirs,
  TRELLIS_BLOCK_END,
  TRELLIS_BLOCK_START,
} from "./managed-paths.js";

export interface StructuredFileSpec {
  /** Manifest path (POSIX). */
  posixPath: string;
  /** Human-readable reason for the mixed-file edit. */
  reason: string;
  /** Pure scrubber for this path. */
  scrub: (content: string, deletedPaths: readonly string[]) => ScrubResult;
}

export interface PlannedDeletion {
  posixPath: string;
  absPath: string;
  missing: boolean;
}

export interface PlannedModification {
  posixPath: string;
  absPath: string;
  reason: string;
  result: ScrubResult;
}

export interface ManagedRemovalPlan {
  deletions: PlannedDeletion[];
  modifications: PlannedModification[];
  removeTrellisDir: boolean;
  allPosixPaths: string[];
}

export interface BuildManagedRemovalPlanOptions {
  /** Strict path/symlink handling required by reversible ablation. */
  strictPaths?: boolean;
}

/** A safe lstat that distinguishes an absent path from a filesystem error. */
export function lstatIfPresent(absPath: string): fs.Stats | null {
  try {
    return fs.lstatSync(absPath);
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function assertWithinProject(projectRoot: string, absPath: string): void {
  let root = path.resolve(projectRoot);
  let resolved = path.resolve(absPath);
  if (process.platform === "win32") {
    root = root.toLowerCase();
    resolved = resolved.toLowerCase();
  }
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Managed path escapes project root: ${absPath}`);
  }
}

/**
 * Validate a manifest key before it reaches path.join/path.resolve.
 * Manifest keys are intentionally stricter than generic relative paths: empty,
 * dot, dotdot, NUL, absolute, and Windows-separator segments are not ownership
 * claims that Trellis can safely act on.
 */
export function validateManagedRelativePath(posixPath: string): void {
  if (
    posixPath.length === 0 ||
    posixPath.includes("\0") ||
    posixPath.includes("\\") ||
    path.posix.isAbsolute(posixPath) ||
    path.win32.isAbsolute(posixPath) ||
    /^[A-Za-z]:/.test(posixPath)
  ) {
    throw new Error(
      `Invalid managed manifest path: ${JSON.stringify(posixPath)}`,
    );
  }

  const segments = posixPath.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(
      `Invalid managed manifest path: ${JSON.stringify(posixPath)}`,
    );
  }
}

/**
 * Reject parent symlink traversal outside the project while allowing a leaf
 * symlink to be treated as an opaque managed entry.
 */
export function assertSafeManagedPath(
  projectRoot: string,
  posixPath: string,
): string {
  validateManagedRelativePath(posixPath);
  const root = path.resolve(projectRoot);
  const segments = posixPath.split("/");
  let current = root;

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index] ?? "");
    assertWithinProject(root, current);
    const stat = lstatIfPresent(current);
    if (!stat || index === segments.length - 1) continue;
    if (stat.isSymbolicLink()) {
      const realParent = fs.realpathSync(current);
      assertWithinProject(root, realParent);
    }
    if (!stat.isDirectory() && !stat.isSymbolicLink()) {
      throw new Error(`Managed path parent is not a directory: ${posixPath}`);
    }
  }

  return current;
}

/**
 * Build the one structured-file registry shared by permanent uninstall and
 * reversible ablation. Keep path ownership here; scrubber behavior remains in
 * `uninstall-scrubbers.ts`.
 */
export function buildStructuredFileSpecs(): Map<string, StructuredFileSpec> {
  const specs: StructuredFileSpec[] = [
    ...(
      [
        ".claude/settings.json",
        ".gemini/settings.json",
        ".factory/settings.json",
        ".codebuddy/settings.json",
        ".qoder/settings.json",
        ".codex/hooks.json",
        ".trae/hooks.json",
      ] as const
    ).map(
      (posixPath): StructuredFileSpec => ({
        posixPath,
        reason: "Strip trellis hooks; preserve user fields",
        scrub: (content, deletedPaths) =>
          scrubHooksJson(content, deletedPaths, "nested"),
      }),
    ),
    ...([".cursor/hooks.json", ".github/copilot/hooks.json"] as const).map(
      (posixPath): StructuredFileSpec => ({
        posixPath,
        reason: "Strip trellis hooks; preserve user fields",
        scrub: (content, deletedPaths) =>
          scrubHooksJson(content, deletedPaths, "flat"),
      }),
    ),
    {
      posixPath: ".opencode/package.json",
      reason: "Remove @opencode-ai/plugin dep; preserve other deps",
      scrub: (content) => scrubOpencodePackageJson(content),
    },
    {
      posixPath: ".pi/settings.json",
      reason:
        "Strip trellis extension/skills/prompts entries; preserve user fields",
      scrub: (content) => scrubPiSettings(content),
    },
    {
      posixPath: ".codex/config.toml",
      reason: "Remove trellis project_doc_fallback_filenames and notes",
      scrub: (content) => scrubCodexConfigToml(content),
    },
    {
      posixPath: COPILOT_INSTRUCTIONS_PATH,
      reason: "Remove Trellis Copilot guidance; preserve repo instructions",
      scrub: (content) =>
        scrubManagedMarkdownBlock(
          content,
          COPILOT_INSTRUCTIONS_BLOCK_START,
          COPILOT_INSTRUCTIONS_BLOCK_END,
        ),
    },
    {
      posixPath: FILE_NAMES.AGENTS,
      reason: "Strip Trellis managed block; preserve user instructions",
      scrub: (content) =>
        scrubManagedMarkdownBlock(
          content,
          TRELLIS_BLOCK_START,
          TRELLIS_BLOCK_END,
        ),
    },
  ];

  return new Map(specs.map((spec) => [spec.posixPath, spec]));
}

/**
 * Build a removal plan from the authoritative v2 manifest. Structured files
 * are scrubbed only when they are regular files; a leaf symlink is opaque and
 * is therefore unlinked rather than dereferenced.
 */
export function buildManagedRemovalPlan(
  cwd: string,
  hashes: Record<string, string>,
  options: BuildManagedRemovalPlanOptions = {},
): ManagedRemovalPlan {
  const structured = buildStructuredFileSpecs();
  const allPosixPaths = Object.keys(hashes);
  const deletions: PlannedDeletion[] = [];
  const modifications: PlannedModification[] = [];

  for (const posixPath of allPosixPaths) {
    const absPath = options.strictPaths
      ? assertSafeManagedPath(cwd, posixPath)
      : path.join(cwd, ...posixPath.split("/"));
    const stat = options.strictPaths ? lstatIfPresent(absPath) : null;
    const spec = structured.get(posixPath);

    if (!spec) {
      deletions.push({
        posixPath,
        absPath,
        missing: options.strictPaths ? stat === null : !fs.existsSync(absPath),
      });
      continue;
    }

    if (options.strictPaths) {
      if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
        deletions.push({ posixPath, absPath, missing: stat === null });
        continue;
      }
    } else if (!fs.existsSync(absPath)) {
      deletions.push({ posixPath, absPath, missing: true });
      continue;
    }

    const content = fs.readFileSync(absPath, "utf-8");
    const result = spec.scrub(content, allPosixPaths);
    if (
      options.strictPaths &&
      !result.fullyEmpty &&
      result.content === content
    ) {
      throw new Error(
        `Cannot prove Trellis content was removed from structured file: ${posixPath}`,
      );
    }
    if (result.fullyEmpty) {
      deletions.push({ posixPath, absPath, missing: false });
    } else {
      modifications.push({
        posixPath,
        absPath,
        reason: spec.reason,
        result,
      });
    }
  }

  return {
    deletions,
    modifications,
    removeTrellisDir: true,
    allPosixPaths,
  };
}

/**
 * Preserve the uninstall execution semantics after planner extraction. Ablate
 * uses the same plan but applies its own backup/rollback transaction around it.
 */
export function executeManagedRemovalPlan(
  cwd: string,
  plan: ManagedRemovalPlan,
): { deletedFiles: number; modifiedFiles: number; deletedDirs: number } {
  let deletedFiles = 0;
  let modifiedFiles = 0;

  for (const modification of plan.modifications) {
    fs.writeFileSync(modification.absPath, modification.result.content);
    modifiedFiles += 1;
  }

  const deletedDirCandidates = new Set<string>();
  for (const deletion of plan.deletions) {
    if (deletion.missing) continue;
    try {
      fs.unlinkSync(deletion.absPath);
      deletedFiles += 1;
      deletedDirCandidates.add(path.posix.dirname(deletion.posixPath));
    } catch {
      // Preserve uninstall's best-effort behavior for individual unlink errors.
    }
  }

  let deletedDirs = 0;
  if (plan.removeTrellisDir) {
    const trellisDir = path.join(cwd, DIR_NAMES.WORKFLOW);
    if (lstatIfPresent(trellisDir)) {
      fs.rmSync(trellisDir, { recursive: true, force: true });
      deletedDirs += 1;
    }
  }

  for (const dirPosix of deletedDirCandidates) {
    if (dirPosix === "." || dirPosix === "") continue;
    cleanupEmptyDirs(cwd, dirPosix);
  }

  const sortedManagedDirs = [...ALL_MANAGED_DIRS]
    .filter((dir) => dir !== DIR_NAMES.WORKFLOW)
    .sort((left, right) => right.split("/").length - left.split("/").length);
  for (const managedDir of sortedManagedDirs) {
    const abs = path.join(cwd, ...managedDir.split("/"));
    if (!fs.existsSync(abs)) continue;
    try {
      const stat = fs.statSync(abs);
      if (!stat.isDirectory()) continue;
      if (fs.readdirSync(abs).length !== 0) continue;
      fs.rmdirSync(abs);
      deletedDirs += 1;

      let parentPosix = path.posix.dirname(managedDir);
      while (parentPosix !== "." && parentPosix.length > 0) {
        const parentAbs = path.join(cwd, ...parentPosix.split("/"));
        if (!fs.existsSync(parentAbs)) break;
        if (fs.readdirSync(parentAbs).length !== 0) break;
        fs.rmdirSync(parentAbs);
        deletedDirs += 1;
        parentPosix = path.posix.dirname(parentPosix);
      }
    } catch {
      // Preserve uninstall's best-effort directory cleanup semantics.
    }
  }

  return { deletedFiles, modifiedFiles, deletedDirs };
}
