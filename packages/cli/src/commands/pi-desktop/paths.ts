import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  PI_DESKTOP_AGENTS_DIR_NAME,
  PI_DESKTOP_DATA_DIR_NAME,
  PI_DESKTOP_HOST_PROCESS,
  PI_DESKTOP_INSTALLED_PATH,
  PI_DESKTOP_REGISTRY_PATH,
  PI_DESKTOP_SKILLS_REGISTRY_PATH,
  PI_DESKTOP_SUBAGENTS_DIR,
} from "../../constants/pi-desktop.js";

export interface DataDirOptions {
  /** `--data-dir`, highest precedence. */
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

function inside(dataDir: string, relativePosixPath: string): string {
  return path.join(dataDir, ...relativePosixPath.split("/"));
}

/**
 * Resolve the host data root: `--data-dir` → `PI_DESKTOP_DATA_DIR` →
 * `~/.pi-desktop`. The env override exists so tests (and users with a
 * relocated profile) never have to touch the real directory.
 */
export function resolvePiDesktopDataDir(options: DataDirOptions = {}): string {
  const env = options.env ?? process.env;
  const explicit =
    options.dataDir?.trim() ?? env.PI_DESKTOP_DATA_DIR?.trim() ?? "";
  if (explicit.length > 0) return path.resolve(explicit);
  return path.join(options.home ?? os.homedir(), PI_DESKTOP_DATA_DIR_NAME);
}

export function registryFile(dataDir: string): string {
  return inside(dataDir, PI_DESKTOP_REGISTRY_PATH);
}

export function installedPluginDir(dataDir: string): string {
  return inside(dataDir, PI_DESKTOP_INSTALLED_PATH);
}

export function skillsRegistryFile(dataDir: string): string {
  return inside(dataDir, PI_DESKTOP_SKILLS_REGISTRY_PATH);
}
/**
 * Resolve the `~/.agents` root: `--agents-dir` → `AGENTS_HOME` → `~/.agents`.
 * Sub-agents live there, not under the PI-Desktop data directory.
 */
export function resolveAgentsDir(
  options: DataDirOptions & { agentsDir?: string } = {},
): string {
  const env = options.env ?? process.env;
  const explicit = options.agentsDir?.trim() ?? env.AGENTS_HOME?.trim() ?? "";
  if (explicit.length > 0) return path.resolve(explicit);
  return path.join(options.home ?? os.homedir(), PI_DESKTOP_AGENTS_DIR_NAME);
}

/** `~/.agents/subagents` — the only directory the host scans for sub-agents. */
export function subagentsDir(agentsDir: string): string {
  return path.join(agentsDir, PI_DESKTOP_SUBAGENTS_DIR);
}

/**
 * The host compares project scopes case-insensitively and ignores a trailing
 * separator (ADR 0056 `isActiveInProject`), so store the same shape it does:
 * an absolute path with forward slashes and no trailing slash.
 *
 * A root (`/`, `D:/`) keeps its separator: `D:` is a drive-relative path to
 * Windows, not the drive root.
 */
export function normalizeProjectPath(projectRoot: string): string {
  const resolved = path.resolve(projectRoot).replace(/\\/g, "/");
  if (resolved === "/" || /^[A-Za-z]:\/$/.test(resolved)) return resolved;
  return resolved.replace(/\/+$/, "");
}

/**
 * The comparison form of a path: normalized, and case-folded on Windows the way
 * the host folds it. Prefix tests and set membership go through this too, or a
 * repo installed from `d:\x` never matches `D:\x`.
 */
export function foldProjectPath(value: string): string {
  const normalized = normalizeProjectPath(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/** Same rule as the host: case-insensitive on Windows, exact elsewhere. */
export function sameProjectPath(left: string, right: string): boolean {
  return foldProjectPath(left) === foldProjectPath(right);
}

/**
 * Whether the desktop host looks alive.
 *
 * `plugins/registry.json` is read while the app runs and rewritten whenever the
 * user changes any plugin, so installing behind a live window can be lost on
 * the next write. Install refuses unless the caller passes `--force`.
 */
export function isHostRunning(): boolean {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "tasklist",
        ["/FI", `IMAGENAME eq ${PI_DESKTOP_HOST_PROCESS}.exe`, "/NH"],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
      );
      return out
        .toLowerCase()
        .includes(`${PI_DESKTOP_HOST_PROCESS}.exe`.toLowerCase());
    }
    execFileSync("pgrep", ["-f", PI_DESKTOP_HOST_PROCESS], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}
