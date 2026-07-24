/**
 * Trusted-root resolution for the context-loading containment checks
 * (`context-loader.ts` `jailedRealpath`, `agent-loader.ts` `findAgentFile`).
 *
 * Users who persist `.trellis/tasks` / `.trellis/workspace` as symlinks to
 * an external directory get legitimate context files rejected by the
 * cwd-only jail. This module resolves an additional set of trusted realpath
 * roots — from `.trellis/config.yaml` `channel.trusted_context_dirs`, plus a
 * narrow auto-trust of `.trellis/tasks` / `.trellis/workspace` when either is
 * itself a top-level symlink — so those roots can be accepted alongside cwd
 * without weakening the containment check to lexical matching (see
 * spec/cli/backend/filesystem-safety.md §2).
 */

import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES } from "../../constants/paths.js";

/** Top-level `.trellis/*` entries eligible for symlink auto-trust. */
const AUTO_TRUST_ENTRIES = ["tasks", "workspace"] as const;

interface ChannelTrustConfig {
  trustedDirs: string[];
  autoTrustSymlinks?: boolean;
}

/**
 * Parse the `channel.trusted_context_dirs` (list) and
 * `channel.auto_trust_trellis_symlinks` (bool) keys out of
 * `.trellis/config.yaml`. Mirrors the lightweight line-scanner used by
 * `loadWorkerGuardConfig` in guard.ts — no YAML dependency.
 */
export function parseChannelTrustSection(content: string): ChannelTrustConfig {
  const lines = content.split("\n");
  const trustedDirs: string[] = [];
  let autoTrustSymlinks: boolean | undefined;

  let inChannel = false;
  let inList = false;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trimEnd();
    if (trimmed.trim().startsWith("#")) continue;

    if (/^channel:\s*$/.test(trimmed)) {
      inChannel = true;
      inList = false;
      continue;
    }

    if (!inChannel) continue;

    // Anything at column 0 (non-blank) ends the `channel:` section.
    if (trimmed.trim() !== "" && /^\S/.test(line)) {
      inChannel = false;
      inList = false;
      continue;
    }

    if (trimmed.trim() === "") continue;

    if (inList) {
      const item = trimmed.match(/^ {4}-\s*(.+)$/);
      if (item) {
        const val = stripTrustValue(item[1]);
        if (val) trustedDirs.push(val);
        continue;
      }
      // Anything else at <= list-header indent ends the list.
      inList = false;
    }

    if (/^ {2}trusted_context_dirs:\s*$/.test(trimmed)) {
      inList = true;
      continue;
    }

    const boolMatch = trimmed.match(
      /^ {2}auto_trust_trellis_symlinks:\s*(.+)$/,
    );
    if (boolMatch) {
      const val = stripTrustValue(boolMatch[1]).toLowerCase();
      if (val === "false") autoTrustSymlinks = false;
      else if (val === "true") autoTrustSymlinks = true;
      else {
        process.stderr.write(
          `[channel] channel.auto_trust_trellis_symlinks: invalid value '${val}', ignoring\n`,
        );
      }
      continue;
    }
  }

  return { trustedDirs, autoTrustSymlinks };
}

function stripTrustValue(s: string): string {
  return s
    .trim()
    .replace(/\s*#.*$/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function loadChannelTrustConfig(cwd: string): ChannelTrustConfig {
  const configPath = path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml");
  if (!fs.existsSync(configPath)) return { trustedDirs: [] };
  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    return { trustedDirs: [] };
  }
  return parseChannelTrustSection(content);
}

/**
 * Resolve the full set of trusted realpath roots for context/agent
 * containment checks, in addition to `cwd` itself. Called once per spawn.
 */
export function resolveTrustedRoots(cwd: string): string[] {
  const config = loadChannelTrustConfig(cwd);
  const roots: string[] = [];

  for (const entry of config.trustedDirs) {
    const resolved = path.resolve(cwd, entry);
    try {
      roots.push(fs.realpathSync(resolved));
    } catch {
      process.stderr.write(
        `[channel] channel.trusted_context_dirs: entry not found or invalid, skipping: ${entry}\n`,
      );
    }
  }

  if (config.autoTrustSymlinks !== false) {
    for (const entryName of AUTO_TRUST_ENTRIES) {
      const entryPath = path.join(cwd, DIR_NAMES.WORKFLOW, entryName);
      let lstat: fs.Stats;
      try {
        lstat = fs.lstatSync(entryPath);
      } catch {
        continue;
      }
      if (!lstat.isSymbolicLink()) continue;
      try {
        roots.push(fs.realpathSync(entryPath));
      } catch {
        // Broken symlink — nothing to trust.
      }
    }
  }

  return [...new Set(roots)];
}
