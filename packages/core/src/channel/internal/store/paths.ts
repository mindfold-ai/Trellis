import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  GLOBAL_PROJECT_KEY,
  type ChannelRef,
  type ChannelScope,
} from "./schema.js";

/** Top-level Trellis channels directory. */
export function channelRoot(): string {
  const env = process.env.TRELLIS_CHANNEL_ROOT;
  if (env && env.length > 0) return path.resolve(env);
  return path.join(os.homedir(), ".trellis", "channels");
}

/**
 * Derive a per-project bucket name from an absolute cwd, mirroring
 * Claude Code's `~/.claude/projects/<sanitized-cwd>/` convention.
 */
export function projectKey(cwd: string): string {
  const abs = path.resolve(cwd);
  const slashes = abs.replace(/[\\/_]/g, "-");
  return slashes.replace(/[^A-Za-z0-9.-]/g, "-");
}

/**
 * Project key for the current CLI invocation. Reads
 * `TRELLIS_CHANNEL_PROJECT` env first, then falls back to deriving from
 * `process.cwd()`.
 */
export function currentProjectKey(): string {
  const env = process.env.TRELLIS_CHANNEL_PROJECT;
  if (env && env.length > 0) return env;
  return projectKey(process.cwd());
}

export function projectDir(project: string = currentProjectKey()): string {
  return path.join(channelRoot(), project);
}

const BUCKET_MARKER = ".bucket";

/** Characters allowed in a channel or worker name used as a path segment. */
const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Whether a channel/worker name is usable as a filesystem segment.
 * Discovery scans use this to skip directories created before name
 * validation existed (spaces, CJK, ...) — they can never be valid
 * channels, and `assertSafeName` throwing mid-scan would kill the scan.
 */
export function isSafeName(name: string): boolean {
  return name !== "." && name !== ".." && SAFE_SEGMENT_RE.test(name);
}

/**
 * Reject names that would escape their bucket when joined into a path.
 * A channel/worker name becomes a filesystem segment; without this guard
 * a name like `../../x` lets `path.join` resolve outside the store and a
 * later `fs.rmSync(recursive)` deletes arbitrary directories.
 */
export function assertSafeName(name: string, kind = "channel"): void {
  if (!isSafeName(name)) {
    throw new Error(
      `Invalid ${kind} name: ${JSON.stringify(name)}. ` +
        `Names may only contain letters, digits, '.', '_' and '-'.`,
    );
  }
}

export function channelDir(
  name: string,
  project: string = currentProjectKey(),
): string {
  assertSafeName(name);
  return path.join(projectDir(project), name);
}

export function eventsPath(
  name: string,
  project: string = currentProjectKey(),
): string {
  return path.join(channelDir(name, project), "events.jsonl");
}

export function seqSidecarPath(
  name: string,
  project: string = currentProjectKey(),
): string {
  return path.join(channelDir(name, project), ".seq");
}

export function lockPath(
  name: string,
  project: string = currentProjectKey(),
): string {
  return path.join(channelDir(name, project), `${name}.lock`);
}

export function workerFile(
  name: string,
  worker: string,
  suffix: string,
  project: string = currentProjectKey(),
): string {
  assertSafeName(worker, "worker");
  return path.join(channelDir(name, project), `${worker}.${suffix}`);
}

export function workerLockPath(
  name: string,
  worker: string,
  project: string = currentProjectKey(),
): string {
  assertSafeName(worker, "worker");
  return path.join(channelDir(name, project), `${worker}.spawnlock`);
}

/**
 * One-shot migration: move legacy flat channels at `<root>/<name>/` into
 * a `_legacy/` bucket so the new project-scoped layout can use the top
 * level. Idempotent.
 */
export function migrateLegacyChannels(): void {
  const root = channelRoot();
  if (!fs.existsSync(root)) return;
  const legacy = path.join(root, "_legacy");
  let moved = 0;
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "_legacy" || entry === "_default") continue;
    const dir = path.join(root, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if (fs.existsSync(path.join(dir, BUCKET_MARKER))) continue;
    if (!fs.existsSync(path.join(dir, "events.jsonl"))) continue;
    fs.mkdirSync(legacy, { recursive: true });
    const target = path.join(legacy, entry);
    try {
      fs.renameSync(dir, target);
      moved++;
    } catch (err) {
      process.stderr.write(
        `[channel migrate] failed to move ${entry} to _legacy/: ${
          err instanceof Error ? err.message : err
        }\n`,
      );
    }
  }
  if (moved > 0) {
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, BUCKET_MARKER), "");
    process.stderr.write(
      `[channel migrate] moved ${moved} legacy channel(s) to ${legacy}\n`,
    );
  }
}

export function ensureBucketMarker(project: string): void {
  const dir = projectDir(project);
  fs.mkdirSync(dir, { recursive: true });
  const marker = path.join(dir, BUCKET_MARKER);
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(marker, "");
  }
}

export function listProjects(): string[] {
  const root = channelRoot();
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root)) {
    const dir = path.join(root, entry);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    if (
      fs.existsSync(path.join(dir, BUCKET_MARKER)) ||
      entry === "_legacy" ||
      entry === "_default" ||
      entry === GLOBAL_PROJECT_KEY
    ) {
      out.push(entry);
    }
  }
  return out;
}

/**
 * List channel names inside a project bucket — subdirectories that
 * contain an `events.jsonl` file. Used by the cross-channel watcher for
 * dynamic channel discovery.
 */
export function listChannelNamesInProject(project: string): string[] {
  const dir = projectDir(project);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    // Pre-validation legacy dirs (spaces, CJK, ...) can never be valid
    // channels; returning them would make the watcher's channelDir/
    // eventsPath calls throw and kill cross-channel discovery.
    if (!isSafeName(entry)) continue;
    const channelEvents = path.join(dir, entry, "events.jsonl");
    if (fs.existsSync(channelEvents)) out.push(entry);
  }
  return out;
}

export interface ResolveChannelOptions {
  scope?: ChannelScope;
  cwd?: string;
}

export function resolveChannelProjectForCreate(
  name: string,
  opts: ResolveChannelOptions = {},
): ChannelRef {
  const scope = opts.scope ?? "project";
  const project =
    scope === "global"
      ? GLOBAL_PROJECT_KEY
      : opts.cwd
        ? projectKey(opts.cwd)
        : currentProjectKey();
  return {
    name,
    scope,
    project,
    dir: channelDir(name, project),
  };
}

export function resolveExistingChannelRef(
  name: string,
  opts: ResolveChannelOptions = {},
): ChannelRef {
  migrateLegacyChannels();

  if (opts.scope) {
    const project =
      opts.scope === "global"
        ? GLOBAL_PROJECT_KEY
        : opts.cwd
          ? projectKey(opts.cwd)
          : currentProjectKey();
    if (!fs.existsSync(eventsPath(name, project))) {
      throw new Error(
        `Channel '${name}' not found in ${opts.scope} scope (${project})`,
      );
    }
    process.env.TRELLIS_CHANNEL_PROJECT = project;
    return { name, scope: opts.scope, project, dir: channelDir(name, project) };
  }

  const current = currentProjectKey();
  const projectMatches = listProjects()
    .filter((project) => project !== GLOBAL_PROJECT_KEY)
    .filter((project) => fs.existsSync(eventsPath(name, project)));
  const globalExists = fs.existsSync(eventsPath(name, GLOBAL_PROJECT_KEY));

  if (globalExists && projectMatches.length > 0) {
    throw new Error(
      `Channel '${name}' exists in global and project scopes. Use --scope global or --scope project.`,
    );
  }

  if (globalExists) {
    process.env.TRELLIS_CHANNEL_PROJECT = GLOBAL_PROJECT_KEY;
    return {
      name,
      scope: "global",
      project: GLOBAL_PROJECT_KEY,
      dir: channelDir(name, GLOBAL_PROJECT_KEY),
    };
  }

  if (fs.existsSync(eventsPath(name, current))) {
    process.env.TRELLIS_CHANNEL_PROJECT = current;
    return {
      name,
      scope: "project",
      project: current,
      dir: channelDir(name, current),
    };
  }

  if (projectMatches.length === 1) {
    process.env.TRELLIS_CHANNEL_PROJECT = projectMatches[0];
    return {
      name,
      scope: "project",
      project: projectMatches[0],
      dir: channelDir(name, projectMatches[0]),
    };
  }

  if (projectMatches.length > 1) {
    throw new Error(
      `Channel '${name}' exists in multiple project buckets: ${projectMatches.join(", ")}. Run from the owning project cwd or use --scope.`,
    );
  }

  throw new Error(
    `Channel '${name}' not found in current project bucket (${current}) or any known scope`,
  );
}

export function selectExistingChannelProject(name: string): string {
  return resolveExistingChannelRef(name).project;
}
