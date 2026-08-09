/**
 * Default home-based session roots for the persisted-session adapters.
 *
 * `HOME` is captured once at module load — consumers that need to point the
 * adapters at a fake home (tests) must mock `node:os` before importing any
 * mem module.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const HOME = os.homedir();
export const CLAUDE_PROJECTS = path.join(HOME, ".claude", "projects");
export const CODEX_SESSIONS = path.join(HOME, ".codex", "sessions");
/** ZCode (Zhipu) persisted-session SQLite store. The companion `-wal` file is
 * auto-detected by the readonly parser. */
export const ZCODE_DB = path.join(HOME, ".zcode", "cli", "db", "db.sqlite");
/** Grok CLI session root: `<cwd url-encoded>/<session-id>/chat_history.jsonl`.
 * The sibling `session_search.sqlite` is a search index only and is not read —
 * this adapter needs no database and adds no dependency. */
export const GROK_SESSIONS = path.join(HOME, ".grok", "sessions");

/**
 * OpenCode's data root: `$XDG_DATA_HOME/opencode`, falling back to
 * `~/.local/share/opencode`.
 *
 * OpenCode applies this XDG rule on every platform — it has no Windows
 * `%LOCALAPPDATA%` or macOS `Application Support` branch — so a Windows install
 * stores its database under `%USERPROFILE%\.local\share\opencode` unless
 * `XDG_DATA_HOME` is set. Verified against the shipped 1.18 bundle:
 * `XDG_DATA_HOME || join(homedir, ".local", "share")` then `join(that,
 * "opencode")`.
 *
 * Read per call rather than at module load so a caller (or test) that sets
 * `XDG_DATA_HOME` sees its own value.
 */
export function opencodeDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME?.trim();
  if (xdg) return path.join(xdg, "opencode");
  return path.join(HOME, ".local", "share", "opencode");
}

/**
 * Resolve the OpenCode session database, or `undefined` when this machine has
 * none (a normal empty result, not an error).
 *
 * Mirrors OpenCode's own resolution order:
 *   1. `OPENCODE_DB` — absolute path used as-is, relative name joined to the
 *      data dir, and `:memory:` meaning there is no file to read at all.
 *   2. `<data>/opencode.db` — the release channels (`latest` / `beta` /
 *      `prod`) and anyone setting `OPENCODE_DISABLE_CHANNEL_DB`.
 *   3. `<data>/opencode-<channel>.db` — other channels write a suffixed file.
 *      The channel is baked into the user's binary and is not discoverable
 *      from here, so the most recently written one wins.
 */
export function opencodeDbPath(): string | undefined {
  const dir = opencodeDataDir();
  const override = process.env.OPENCODE_DB?.trim();
  if (override) {
    if (override === ":memory:") return undefined;
    const expanded = expandHome(override);
    return path.isAbsolute(expanded) ? expanded : path.join(dir, expanded);
  }

  const primary = path.join(dir, "opencode.db");
  if (fs.existsSync(primary)) return primary;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  let newest: { file: string; mtimeMs: number } | undefined;
  for (const entry of entries) {
    if (!entry.isFile() || !/^opencode-.+\.db$/.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    try {
      const { mtimeMs } = fs.statSync(file);
      if (!newest || mtimeMs > newest.mtimeMs) newest = { file, mtimeMs };
    } catch {
      /* raced away between readdir and stat — skip it */
    }
  }
  return newest?.file;
}

function expandHome(p: string): string {
  if (p === "~") return HOME;
  if (p.startsWith(`~${path.sep}`)) return path.join(HOME, p.slice(2));
  if (p.startsWith("~/")) return path.join(HOME, p.slice(2));
  return p;
}

export const PI_AGENT_DIR = expandHome(
  process.env.PI_CODING_AGENT_DIR ?? path.join(HOME, ".pi", "agent"),
);
export const PI_SESSIONS = expandHome(
  process.env.PI_CODING_AGENT_SESSION_DIR ??
    path.join(PI_AGENT_DIR, "sessions"),
);

function readPiSettingsSessionDir(settingsFile: string): string | undefined {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const sessionDir = (raw as { sessionDir?: unknown }).sessionDir;
    if (typeof sessionDir !== "string" || !sessionDir.trim()) return undefined;
    const expanded = expandHome(sessionDir);
    return path.isAbsolute(expanded)
      ? expanded
      : path.resolve(path.dirname(settingsFile), expanded);
  } catch {
    return undefined;
  }
}

/** Claude sanitizes a cwd into its on-disk project dir name by replacing
 * every path separator (`/` and Windows `\`), drive colon (`:`), `_`, and `.`
 * with `-`. Confirmed empirically against `~/.claude/projects/`:
 * `/Users/x/.codex/...` → `-Users-x--codex-...`, `snap_note` → `snap-note`. */
export function claudeProjectDirFromCwd(cwd: string): string {
  return path.join(CLAUDE_PROJECTS, cwd.replace(/[/\\:_.]/g, "-"));
}

/** Grok names each project dir with the URL-encoded absolute cwd, e.g.
 * `/Users/x/proj` → `%2FUsers%2Fx%2Fproj`. */
export function grokProjectDirFromCwd(cwd: string): string {
  return path.join(GROK_SESSIONS, encodeURIComponent(path.resolve(cwd)));
}

/** Inverse of {@link grokProjectDirFromCwd}. Returns `undefined` when the name
 * is not valid percent-encoding rather than throwing on a stray `%`. */
export function grokCwdFromProjectDir(dirName: string): string | undefined {
  try {
    return decodeURIComponent(dirName);
  } catch {
    return undefined;
  }
}

/** Pi encodes a cwd as `--<resolved-cwd-with-separators-as-dashes>--`. */
export function piProjectDirFromCwd(cwd: string): string {
  const resolvedCwd = path.resolve(cwd);
  const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return path.join(path.join(PI_AGENT_DIR, "sessions"), safePath);
}

/** Discover Pi session roots visible from the current process and project. */
export function piSessionRoots(cwd?: string): string[] {
  const roots = [path.join(PI_AGENT_DIR, "sessions"), PI_SESSIONS];
  const globalSettingsDir = readPiSettingsSessionDir(
    path.join(PI_AGENT_DIR, "settings.json"),
  );
  if (globalSettingsDir) roots.push(globalSettingsDir);
  if (cwd) {
    const projectSettingsDir = readPiSettingsSessionDir(
      path.join(path.resolve(cwd), ".pi", "settings.json"),
    );
    if (projectSettingsDir) roots.push(projectSettingsDir);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const root of roots) {
    const normalized = path.resolve(root);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(root);
  }
  return out;
}

/** Lazy stack-based recursive file walk — yields every file path under
 * `root`. Missing roots and unreadable directories are skipped silently. */
export function* walkDir(root: string): Generator<string> {
  if (!fs.existsSync(root)) return;
  const stack: string[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) yield p;
    }
  }
}
