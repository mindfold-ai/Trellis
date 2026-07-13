/**
 * Channel worker OOM guard policy.
 *
 * Resolves idle-cleanup TTL and live-worker budget from CLI flag /
 * environment / project config / built-in defaults (in that precedence
 * order), then scans the live worker registry inside a project bucket
 * to enforce both constraints at spawn time.
 *
 * Boundary: this module lives in the CLI runtime layer. Core owns
 * worker activity / `idleSince` projection; the supervisor owns process
 * launch + signals. The guard only consumes that durable state and
 * sends OS signals through pid files.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  isTerminalLifecycle,
  reduceWorkerRegistry,
  type ChannelEvent,
  type WorkerState,
} from "@mindfoldhq/trellis-core/channel";

import { DIR_NAMES } from "../../constants/paths.js";

import {
  channelDir,
  channelRoot,
  currentProjectKey,
  isSafeName,
  projectDir,
  workerFile,
} from "./store/paths.js";
import { parseDuration } from "./wait.js";

/** Built-in default idle-cleanup TTL for spawned workers (5 minutes). */
export const DEFAULT_IDLE_TTL_MS = 5 * 60 * 1000;

/** Built-in default live-worker budget per project/scope. */
export const DEFAULT_MAX_LIVE_WORKERS = 6;

/** Env var override for the idle-cleanup TTL. */
export const ENV_IDLE_TIMEOUT = "TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT";

/** Env var override for the live-worker budget. */
export const ENV_MAX_LIVE_WORKERS = "TRELLIS_CHANNEL_MAX_LIVE_WORKERS";

export interface WorkerGuardConfig {
  /** Idle-cleanup TTL in ms. `0` disables idle cleanup for new spawns. */
  idleTimeoutMs: number;
  /** Live-worker budget. `0` disables the spawn-time budget check. */
  maxLiveWorkers: number;
}

export interface ResolveGuardOptions {
  /** CLI `--idle-timeout` value (already millisecond-parsed). */
  flagIdleTimeoutMs?: number;
  /** CLI `--max-live-workers` value. */
  flagMaxLiveWorkers?: number;
  /** Override cwd for config lookup (default `process.cwd()`). */
  cwd?: string;
  /** Override env source (default `process.env`). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolve the effective guard policy. Precedence:
 *   1. CLI flag (`flag*Ms` / `flagMaxLiveWorkers`)
 *   2. environment variable
 *   3. `.trellis/config.yaml` `channel.worker_guard`
 *   4. built-in default constant
 */
export function resolveWorkerGuardConfig(
  opts: ResolveGuardOptions = {},
): WorkerGuardConfig {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  const fromConfig = loadWorkerGuardConfig(cwd);

  const idleTimeoutMs = pickNonNegativeMs(
    opts.flagIdleTimeoutMs,
    parseEnvDuration(env[ENV_IDLE_TIMEOUT], ENV_IDLE_TIMEOUT),
    fromConfig?.idleTimeoutMs,
    DEFAULT_IDLE_TTL_MS,
  );
  const maxLiveWorkers = pickNonNegativeInt(
    opts.flagMaxLiveWorkers,
    parseEnvInt(env[ENV_MAX_LIVE_WORKERS], ENV_MAX_LIVE_WORKERS),
    fromConfig?.maxLiveWorkers,
    DEFAULT_MAX_LIVE_WORKERS,
  );

  return { idleTimeoutMs, maxLiveWorkers };
}

function pickNonNegativeMs(...candidates: (number | undefined)[]): number {
  for (const c of candidates) {
    if (c === undefined) continue;
    if (!Number.isFinite(c) || c < 0) {
      throw new Error(
        `Idle timeout must be a non-negative duration (got ${c})`,
      );
    }
    return c;
  }
  return DEFAULT_IDLE_TTL_MS;
}

function pickNonNegativeInt(...candidates: (number | undefined)[]): number {
  for (const c of candidates) {
    if (c === undefined) continue;
    if (!Number.isInteger(c) || c < 0) {
      throw new Error(
        `Max live workers must be a non-negative integer (got ${c})`,
      );
    }
    return c;
  }
  return DEFAULT_MAX_LIVE_WORKERS;
}

function parseEnvDuration(
  raw: string | undefined,
  envName: string,
): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  try {
    return parseDuration(raw);
  } catch (err) {
    throw new Error(
      `${envName}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function parseEnvInt(
  raw: string | undefined,
  envName: string,
): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${envName} must be a non-negative integer (got '${raw}')`);
  }
  return n;
}

interface ProjectGuardConfig {
  idleTimeoutMs?: number;
  maxLiveWorkers?: number;
}

/**
 * Parse the `channel.worker_guard` section out of `.trellis/config.yaml`.
 * Mirrors the lightweight line-scanner used elsewhere in update.ts so we
 * don't pull in a YAML dependency just for this two-field section.
 */
export function loadWorkerGuardConfig(
  cwd: string,
): ProjectGuardConfig | undefined {
  const configPath = path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml");
  if (!fs.existsSync(configPath)) return undefined;
  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    return undefined;
  }
  return parseWorkerGuardSection(content);
}

/** Exposed for unit tests. */
export function parseWorkerGuardSection(
  content: string,
): ProjectGuardConfig | undefined {
  const lines = content.split("\n");
  let inChannel = false;
  let inGuard = false;
  const found: ProjectGuardConfig = {};
  let any = false;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trimEnd();
    if (trimmed === "" || trimmed.trimStart().startsWith("#")) continue;

    if (/^channel:\s*$/.test(trimmed)) {
      inChannel = true;
      inGuard = false;
      continue;
    }
    if (inChannel && /^ {2}worker_guard:\s*$/.test(trimmed)) {
      inGuard = true;
      continue;
    }
    if (inGuard) {
      const idle = trimmed.match(/^ {4}idle_timeout:\s*(.+)$/);
      if (idle) {
        const val = stripValue(idle[1]);
        found.idleTimeoutMs = parseGuardDuration(val, "idle_timeout");
        any = true;
        continue;
      }
      const max = trimmed.match(/^ {4}max_live_workers:\s*(.+)$/);
      if (max) {
        const val = stripValue(max[1]);
        const n = Number(val);
        if (!Number.isInteger(n) || n < 0) {
          throw new Error(
            `channel.worker_guard.max_live_workers must be a non-negative integer (got '${val}')`,
          );
        }
        found.maxLiveWorkers = n;
        any = true;
        continue;
      }
      // Anything else at the same indent (or shallower) ends the section.
      if (!/^ {4}\S/.test(line)) {
        inGuard = false;
      }
    }
    if (inChannel && !/^ {2}\S/.test(line) && /^\S/.test(line)) {
      inChannel = false;
      inGuard = false;
    }
  }

  return any ? found : undefined;
}

function stripValue(s: string): string {
  return s
    .trim()
    .replace(/\s*#.*$/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function parseGuardDuration(raw: string, key: string): number {
  // Allow bare integer = milliseconds (so `0` disables cleanly).
  const asInt = Number(raw);
  if (Number.isFinite(asInt) && /^\d+$/.test(raw)) {
    if (asInt < 0) {
      throw new Error(
        `channel.worker_guard.${key} must be non-negative (got '${raw}')`,
      );
    }
    // Bare integer 0 = disabled; >0 with no unit = milliseconds.
    return asInt;
  }
  try {
    return parseDuration(raw) ?? 0;
  } catch (err) {
    throw new Error(
      `channel.worker_guard.${key}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Live worker observed inside the spawn-time guard scan.
 */
export interface LiveWorker {
  channel: string;
  workerId: string;
  state: WorkerState;
  /** Supervisor pid that owns this worker, when readable + alive. */
  supervisorPid?: number;
  /** True when the OS command line still looks like this worker's supervisor. */
  supervisorVerified?: boolean;
  /** Worker child pid, when readable. */
  workerPid?: number;
}

export interface ScanLiveWorkersOptions {
  /** Project bucket key (default current). */
  projectKey?: string;
  /** Override channel root scan (default uses real channelRoot()). */
  root?: string;
  /** Override supervisor process verification (used by tests). */
  isSupervisorProcess?: (
    pid: number,
    channel: string,
    worker: string,
  ) => boolean;
}

/**
 * Enumerate live (non-terminal + supervisor-pid alive) workers across
 * every channel in the given project bucket.
 */
export function scanLiveWorkers(
  opts: ScanLiveWorkersOptions = {},
): LiveWorker[] {
  const project = opts.projectKey ?? currentProjectKey();
  const bucket = opts.root
    ? path.join(opts.root, project)
    : projectDir(project);
  if (!fs.existsSync(bucket)) return [];

  let entries: string[];
  try {
    entries = fs.readdirSync(bucket);
  } catch {
    return [];
  }

  const out: LiveWorker[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    // Stores created before name validation may hold channel dirs with
    // now-invalid names (spaces, CJK, ...). They can never host workers —
    // skip them instead of letting workerFile/channelDir throw mid-scan.
    if (!isSafeName(entry)) continue;
    const dir = path.join(bucket, entry);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const events = path.join(dir, "events.jsonl");
    if (!fs.existsSync(events)) continue;
    let workers: WorkerState[];
    try {
      const all = readFileEventsSync(events);
      workers = reduceWorkerRegistry(all).workers;
    } catch {
      continue;
    }
    for (const state of workers) {
      if (state.terminal || isTerminalLifecycle(state.lifecycle)) continue;
      const supervisorPid = readPid(
        workerFile(entry, state.workerId, "pid", project),
      );
      if (supervisorPid === undefined || !pidAlive(supervisorPid)) {
        // Supervisor pid file missing or dead → not a live OS process,
        // even if durable state still shows running. Reconciler / future
        // CLI cleanup will catch up; the guard ignores it.
        continue;
      }
      const supervisorVerified = opts.isSupervisorProcess
        ? opts.isSupervisorProcess(supervisorPid, entry, state.workerId)
        : isSupervisorProcess(supervisorPid, entry, state.workerId);
      const workerPid = readPid(
        workerFile(entry, state.workerId, "worker-pid", project),
      );
      out.push({
        channel: entry,
        workerId: state.workerId,
        state,
        supervisorPid,
        supervisorVerified,
        ...(workerPid !== undefined ? { workerPid } : {}),
      });
    }
    for (const state of readReservationWorkers(entry, project)) {
      if (
        out.some((w) => w.channel === entry && w.workerId === state.workerId)
      ) {
        continue;
      }
      const supervisorPid = readPid(
        workerFile(entry, state.workerId, "pid", project),
      );
      if (supervisorPid === undefined || !pidAlive(supervisorPid)) continue;
      const supervisorVerified = opts.isSupervisorProcess
        ? opts.isSupervisorProcess(supervisorPid, entry, state.workerId)
        : isSupervisorProcess(supervisorPid, entry, state.workerId);
      out.push({
        channel: entry,
        workerId: state.workerId,
        state,
        supervisorPid,
        supervisorVerified,
      });
    }
  }
  return out;
}

function readReservationWorkers(
  channel: string,
  project: string,
): WorkerState[] {
  const dir = channelDir(channel, project);
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const workers: WorkerState[] = [];
  for (const file of files) {
    if (!file.endsWith(".reservation")) continue;
    const worker = file.slice(0, -".reservation".length);
    workers.push({
      workerId: worker,
      lifecycle: "starting",
      terminal: false,
      activity: "idle",
      pendingMessageCount: 0,
      inboxPolicy: "explicitOnly",
      updatedAt: new Date(0).toISOString(),
      lastSeq: 0,
    });
  }
  return workers;
}

function readFileEventsSync(file: string): ChannelEvent[] {
  const text = fs.readFileSync(file, "utf-8");
  const events: ChannelEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as ChannelEvent);
    } catch {
      continue;
    }
  }
  return events;
}

function readPid(p: string): number | undefined {
  try {
    const n = Number(fs.readFileSync(p, "utf-8").trim());
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isSupervisorProcess(
  pid: number,
  channel: string,
  worker: string,
): boolean {
  if (process.platform === "win32") return false;
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf-8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const pattern = new RegExp(
      [
        "(?:^|\\s)channel\\s+__supervisor\\s+",
        escapeRegExp(channel),
        "\\s+",
        escapeRegExp(worker),
        "(?:\\s|$)",
      ].join(""),
    );
    return pattern.test(command);
  } catch {
    return false;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pure predicate: is this live worker eligible for idle-cleanup right
 * now? Mid-turn workers and workers without `idleSince` (e.g. they
 * never spawned cleanly) are never killed by the guard.
 */
export function isIdleCleanupEligible(
  live: LiveWorker,
  idleTimeoutMs: number,
  now: number,
): boolean {
  if (idleTimeoutMs <= 0) return false;
  const { state } = live;
  if (state.activity !== "idle") return false;
  if (!state.idleSince) return false;
  if (state.terminal) return false;
  const idleSinceMs = Date.parse(state.idleSince);
  if (!Number.isFinite(idleSinceMs)) return false;
  return now - idleSinceMs >= idleTimeoutMs;
}

export interface CleanupResult {
  killed: LiveWorker[];
  failed: { worker: LiveWorker; error: string }[];
}

/**
 * Kill workers whose idle TTL has expired. Writes a one-shot shutdown
 * reason sidecar before signalling the supervisor so the supervisor's
 * existing shutdown funnel emits the single terminal `killed` event.
 *
 * Returns the workers that were signalled. Failures are collected — a
 * dead pid or read race is not fatal; the next scan re-evaluates.
 */
export async function cleanupExpiredIdleWorkers(
  candidates: LiveWorker[],
  idleTimeoutMs: number,
  opts: { project?: string; now?: number } = {},
): Promise<CleanupResult> {
  const result: CleanupResult = { killed: [], failed: [] };
  if (idleTimeoutMs <= 0) return result;
  const now = opts.now ?? Date.now();

  for (const live of candidates) {
    if (!isIdleCleanupEligible(live, idleTimeoutMs, now)) continue;
    try {
      const project = opts.project ?? currentProjectKey();
      if (
        live.supervisorPid === undefined ||
        live.supervisorVerified !== true ||
        !pidAlive(live.supervisorPid)
      ) {
        continue;
      }
      const reasonFile = workerFile(
        live.channel,
        live.workerId,
        "shutdown-reason",
        project,
      );
      fs.writeFileSync(reasonFile, "idle-timeout\n", "utf-8");
      try {
        process.kill(live.supervisorPid, "SIGTERM");
      } catch (err) {
        try {
          fs.unlinkSync(reasonFile);
        } catch {
          // already gone
        }
        throw err;
      }
      result.killed.push(live);
    } catch (err) {
      result.failed.push({
        worker: live,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

export interface EnforceBudgetInput {
  /** Project bucket key (default current). */
  projectKey?: string;
  /** Override channel root scan path (used by tests). */
  root?: string;
  /** Effective guard policy. */
  policy: WorkerGuardConfig;
  /** Override `now` for deterministic tests. */
  now?: number;
  /** Override supervisor process verification (used by tests). */
  isSupervisorProcess?: ScanLiveWorkersOptions["isSupervisorProcess"];
}

export interface EnforceBudgetResult {
  /** Workers killed by expired-idle cleanup during this enforcement. */
  cleaned: LiveWorker[];
  /** Live workers remaining after cleanup. */
  remaining: LiveWorker[];
  /** True when a new spawn is allowed; false when budget is exceeded. */
  allowed: boolean;
}

/**
 * Run the spawn-time guard for a project bucket. Cleans expired idle
 * workers, re-scans, then decides whether the live worker budget has
 * room for one more spawn.
 */
export async function enforceSpawnBudget(
  input: EnforceBudgetInput,
): Promise<EnforceBudgetResult> {
  const project = input.projectKey ?? currentProjectKey();
  const scanOpts: ScanLiveWorkersOptions = {
    projectKey: project,
    ...(input.root !== undefined ? { root: input.root } : {}),
    ...(input.isSupervisorProcess !== undefined
      ? { isSupervisorProcess: input.isSupervisorProcess }
      : {}),
  };

  const initial = scanLiveWorkers(scanOpts);

  const cleanup = await cleanupExpiredIdleWorkers(
    initial,
    input.policy.idleTimeoutMs,
    { project, ...(input.now !== undefined ? { now: input.now } : {}) },
  );

  // Re-probe after cleanup so we don't double-count workers that have
  // been signalled but haven't actually torn down their pid files yet.
  // Wait briefly for the SIGTERM to translate into pid-file removal; if
  // a worker is taking its grace period, just exclude killed workers
  // from the count.
  const killedIds = new Set(
    cleanup.killed.map((w) => `${w.channel}::${w.workerId}`),
  );
  const remaining = scanLiveWorkers(scanOpts).filter(
    (w) => !killedIds.has(`${w.channel}::${w.workerId}`),
  );

  const allowed =
    input.policy.maxLiveWorkers <= 0 ||
    remaining.length < input.policy.maxLiveWorkers;

  return { cleaned: cleanup.killed, remaining, allowed };
}

/** Build a multi-line, actionable overflow error string. */
export function formatBudgetOverflowError(args: {
  projectKey: string;
  live: LiveWorker[];
  limit: number;
}): string {
  const { projectKey, live, limit } = args;
  const header = `Live worker budget exhausted for project '${projectKey}': ${live.length}/${limit} live worker(s).`;
  const rows = live
    .map((w) => {
      const provider = w.state.provider ?? "?";
      const lifecycle = w.state.lifecycle;
      const activity = w.state.activity;
      const pid = w.supervisorPid ?? "?";
      const verified =
        w.supervisorVerified === false ? " supervisor=unverified" : "";
      return `  • channel='${w.channel}' worker='${w.workerId}' provider=${provider} lifecycle=${lifecycle} activity=${activity} pid=${pid}${verified}`;
    })
    .join("\n");
  const hint = [
    "Free a slot before spawning, e.g.:",
    `  trellis channel kill <channel> --as <worker>`,
    "Or override per spawn:",
    `  trellis channel spawn ... --max-live-workers ${live.length + 1}`,
    "Or raise the default in .trellis/config.yaml under channel.worker_guard.max_live_workers.",
  ].join("\n");
  return [header, rows, hint].join("\n");
}

/**
 * Convenience helper: ensure `channelRoot()` is initialised before scan
 * (otherwise the project dir may not yet exist on first spawn).
 */
export function ensureRootExists(): void {
  fs.mkdirSync(channelRoot(), { recursive: true });
}
