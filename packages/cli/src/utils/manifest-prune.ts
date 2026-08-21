/**
 * Self-heal poisoned `.template-hashes.json` manifests.
 *
 * Versions before this fix walked `.codex/`, `.claude/`, etc. with a blind
 * recursive scan when computing the manifest, so they hashed user-owned
 * runtime data (`.codex/sessions/*`, `.claude/projects/*.jsonl`, pre-existing
 * `AGENTS.md`, user-added `.codex/skills/<custom>/`, …). On uninstall, every
 * manifest entry is unlinked, which silently deletes user data.
 *
 * `pruneOrphanManifestKeys` removes any manifest entry that no current
 * platform configurator owns. The two entry points that consume it are
 * `trellis update` (before migration classification) and `trellis uninstall`
 * (before plan building). Together they ensure existing poisoned manifests
 * self-correct on the next routine command.
 *
 * Rules:
 *   - `.trellis/*` entries are ALWAYS kept. `trellis uninstall` removes
 *     `.trellis/` wholesale via `fs.rmSync(..., { recursive: true })`, so
 *     manifest accuracy there doesn't affect uninstall data-loss. `update`
 *     also relies on these entries to detect user-modified workflow files.
 *   - Root-level `AGENTS.md` is kept only when it still looks Trellis-managed
 *     (contains the managed block markers) or is missing on disk. This
 *     self-heals old poisoned manifests for user-owned AGENTS.md files that
 *     predated init and were skipped.
 *   - Paths referenced by `from`/`to` of any migration manifest entry
 *     (rename, rename-dir, delete, safe-file-delete) are preserved. Pruning
 *     them would prevent legitimate pending migrations from finding their
 *     source/target.
 *   - Everything else: if the path is not in the union of
 *     `collectPlatformTemplates()` for currently-configured platforms, it is
 *     pruned. This matches "files trellis actually wrote during init/update".
 */

import fs from "node:fs";
import path from "node:path";

import { collectPlatformTemplates } from "../configurators/index.js";
import { FILE_NAMES } from "../constants/paths.js";
import { getAllMigrations } from "../migrations/index.js";
import { saveHashes } from "./template-hash.js";
import { toPosix } from "./posix.js";
import { TRELLIS_BLOCK_END, TRELLIS_BLOCK_START } from "./managed-paths.js";
import type { AITool } from "../types/ai-tools.js";
import type { TemplateHashes } from "../types/migration.js";

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
 *   - every migration manifest's from/to path (preserve so legitimate
 *     pending migrations can find their source/target)
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
  // Preserve any path referenced by a migration: legitimate pending
  // rename/delete operations need to resolve their `from` (and the target's
  // hash record for `to`) even if the current registry doesn't list it.
  for (const migration of getAllMigrations()) {
    if (migration.from) known.add(toPosix(migration.from));
    if (migration.to) known.add(toPosix(migration.to));
  }

  return known;
}

/**
 * Root-level AGENTS.md needs special handling because it has no platform
 * registry owner. New fixed inits record it only when written, but old
 * manifests may contain a user-owned AGENTS.md that init skipped. The
 * managed block markers are the least destructive ownership signal: no
 * markers means preserve the user's file by pruning the stale manifest key.
 */
function shouldKeepAgentsMd(cwd: string): boolean {
  const fullPath = path.join(cwd, FILE_NAMES.AGENTS);
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
