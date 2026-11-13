/**
 * Limit `.template-hashes.json` entries to files owned by this installation.
 *
 * `pruneOrphanManifestKeys` removes entries that no current platform
 * configurator owns before uninstall builds its deletion plan.
 *
 * Rules:
 *   - `.trellis/*` entries are kept. `trellis uninstall` removes known owned
 *     children while leaving unknown entries untouched. `update` relies on
 *     these hashes to detect modified workflow files.
 *   - Root-level `AGENTS.md` is kept only when it still looks Trellis-managed
 *     (contains the managed block markers) or is missing on disk. This
 *     keeps a pre-existing, unmanaged AGENTS.md outside the deletion plan.
 *   - Everything else: if the path is not in the union of
 *     `collectPlatformTemplates()` for currently-configured platforms, it is
 *     pruned. This matches "files trellis actually wrote during init/update".
 */

import fs from "node:fs";
import path from "node:path";

import { collectPlatformTemplates } from "../configurators/index.js";
import { FILE_NAMES } from "../constants/paths.js";
import { saveHashes } from "./template-hash.js";
import { toPosix } from "./posix.js";
import { assertProjectPath } from "./path-boundary.js";
import { TRELLIS_BLOCK_END, TRELLIS_BLOCK_START } from "./managed-paths.js";
import type { AITool } from "../types/ai-tools.js";
import type { TemplateHashes } from "../types/template-hashes.js";

export interface PruneResult {
  /** Manifest keys removed (POSIX-style relative paths). */
  pruned: string[];
  /** The post-prune manifest (saved to disk only when `pruned.length > 0`). */
  hashes: TemplateHashes;
}

/**
 * Compute the union of "what trellis writes" across:
 *   - every configured platform's collectTemplates() output
 *   - root-level AGENTS.md when it still carries Trellis managed-block markers
 */
function buildKnownKeys(configuredPlatforms: readonly AITool[]): Set<string> {
  const known = new Set<string>();
  for (const id of configuredPlatforms) {
    const templates = collectPlatformTemplates(id);
    if (!templates) continue;
    for (const key of templates.keys()) {
      known.add(toPosix(key));
    }
  }
  return known;
}

/**
 * Root-level AGENTS.md has no platform registry owner. Managed block markers
 * distinguish it from a pre-existing file that the installer did not write.
 */
function shouldKeepAgentsMd(cwd: string): boolean {
  const fullPath = path.join(cwd, FILE_NAMES.AGENTS);
  assertProjectPath(fullPath, cwd);
  if (!fs.existsSync(fullPath)) {
    return true;
  }
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    return (
      content.includes(TRELLIS_BLOCK_START) &&
      content.includes(TRELLIS_BLOCK_END)
    );
  } catch {
    return true;
  }
}

export interface PruneOptions {
  /**
   * Save the pruned manifest to `.template-hashes.json`. Defaults to true.
   * Callers can pass `false` to compute the prune without mutating disk
   * (dry-run, change-analysis passes).
   */
  persist?: boolean;
}

/**
 * Walk the manifest and split it into kept vs pruned entries.
 *
 * @param cwd  Project root — used to save the rewritten manifest.
 * @param configuredPlatforms Output of `getConfiguredPlatforms(cwd)` — caller
 *   resolves this so we don't have to re-walk the filesystem.
 * @param hashes Already-loaded manifest contents. Passing it in (vs reading
 *   from disk) lets the caller chain `loadHashes` → prune → use the result.
 * @param options.persist When true (default), saves the pruned manifest to
 *   disk. Pass `false` for dry-run flows.
 */
export function pruneOrphanManifestKeys(
  cwd: string,
  configuredPlatforms: readonly AITool[],
  hashes: TemplateHashes,
  options: PruneOptions = {},
): PruneResult {
  const persist = options.persist ?? true;
  const known = buildKnownKeys(configuredPlatforms);
  const pruned: string[] = [];
  const kept: TemplateHashes = {};

  for (const [rawKey, value] of Object.entries(hashes)) {
    const key = toPosix(rawKey);
    // Always preserve .trellis/ entries — they're for the workflow tree
    // which uninstall removes wholesale and which update needs for
    // modified-file detection.
    if (key.startsWith(".trellis/") || key === ".trellis") {
      kept[key] = value;
      continue;
    }
    if (key === FILE_NAMES.AGENTS) {
      if (shouldKeepAgentsMd(cwd)) {
        kept[key] = value;
      } else {
        pruned.push(key);
      }
      continue;
    }
    if (known.has(key)) {
      kept[key] = value;
      continue;
    }
    pruned.push(key);
  }

  if (persist && pruned.length > 0) {
    saveHashes(cwd, kept);
  }

  return { pruned, hashes: kept };
}
