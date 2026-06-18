/**
 * Supervisor process: owns a single worker (claude or codex) and bridges
 * worker ↔ channel events.jsonl.
 *
 * Run as: `trellis channel __supervisor <channel> <worker> <config-path>`
 *
 * Three concurrent loops:
 *   1. stdout reader  — parse worker stdout → adapter → append events
 *   2. inbox watcher  — read events.jsonl for `to=<worker>` say events,
 *                       translate via adapter.encodeUserMessage → worker stdin
 *   3. signal handler — SIGTERM → close worker stdin → 3s → SIGTERM → 3s → SIGKILL
 *                       → write `killed` event → exit
 */

import { spawn, type ChildProcessByStdio } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

import {
  DEFAULT_INBOX_POLICY,
  type InboxPolicy,
} from "@mindfoldhq/trellis-core/channel";

import { getAdapter, type Provider } from "./adapters/index.js";
import { appendEvent } from "./store/events.js";
import { workerFile } from "./store/paths.js";
import { scheduleSupervisorIdleTimer } from "./supervisor/idle.js";
import { runInboxWatcher } from "./supervisor/inbox.js";
import { createShutdown, type ShutdownReason } from "./supervisor/shutdown.js";
import { startStdoutPump } from "./supervisor/stdout.js";
import { TurnTracker } from "./supervisor/turns.js";
import { scheduleSupervisorTimeoutWarning } from "./supervisor/warning.js";

export interface SupervisorConfig {
  provider: Provider;
  cwd: string;
  /** Combined worker system prompt: channel protocol prefix + agent body.
   *  Injected via Claude `--append-system-prompt` or Codex `developerInstructions`.
   *  No "initial user prompt" — the worker stays idle until the first
   *  inbox `send --to <worker>` arrives. */
  systemPrompt: string;
  /** Extra env vars (TRELLIS_HOOKS=0 etc. are added automatically). */
  env?: Record<string, string>;
  /** Optional model override. */
  model?: string;
  /** Resume an existing session/thread if id is provided. */
  resume?: string;
  /** Auto-kill worker after this many ms (anti-zombie). */
  timeoutMs?: number;
  /** Emit supervisor_warning this many ms before timeout. `<=0` disables it. */
  warnBeforeMs?: number;
  /**
   * OOM-guard idle-cleanup TTL in ms. When a running worker stays idle
   * for this long (no active turn), the supervisor self-terminates with
   * `killed{reason:"idle-timeout"}`. `<=0` or undefined disables.
   */
  idleTimeoutMs?: number;
  /** Caller identity recorded on the `spawned` event (default "main"). */
  spawnedBy?: string;
  /** Agent definition name loaded for this worker, if any (recorded on `spawned`). */
  agent?: string;
  /** Relative paths injected via --file / --jsonl (recorded on `spawned`). */
  contextFiles?: string[];
  /** Relative paths of every `--jsonl` manifest processed, even if empty
   *  (recorded on `spawned` for observability — "I passed --jsonl X but
   *  X contained no real entries"). */
  contextManifests?: string[];
  /** Worker inbox delivery policy (recorded on `spawned`; default
   *  `explicitOnly`). */
  inboxPolicy?: InboxPolicy;
}

type Child = ChildProcessByStdio<Writable, Readable, Readable>;

const SHUTDOWN_GRACE_MS = 3000;

/**
 * On Windows, npm installs CLI tools as `.cmd` shims where the real `.exe`
 * lives in `node_modules/`.  Node.js ≥18.20.2 (CVE-2024-27980) blocks
 * implicit `.cmd` execution via `spawn()` without `shell: true`.  Resolve
 * the real `.exe` path so we can spawn it directly — no shell, no injection.
 */
function resolveProviderPath(provider: string): string {
  if (process.platform !== "win32") return provider;
  try {
    const cmdName = `${provider}.cmd`;
    const dirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of dirs) {
      const cmdFile = path.join(dir, cmdName);
      if (!fs.existsSync(cmdFile)) continue;
      const content = fs.readFileSync(cmdFile, "utf8");
      // npm-generated cmd shim format:  "%dp0%\node_modules\pkg\bin\name.exe" %*
      const m = content.match(/"%dp0%\\(.+\.exe)"/i);
      if (m) {
        const exePath = path.join(dir, m[1]);
        if (fs.existsSync(exePath)) return exePath;
      }
    }
  } catch {
    // resolve failure is non-fatal — fall back to bare name
  }
  return provider;
}

/**
 * Entry point invoked by `trellis channel __supervisor <channel> <worker> <config>`.
 */
export async function runSupervisor(
  channelName: string,
  workerName: string,
  configPath: string,
): Promise<void> {
  const config = readConfig(configPath);

  // Self-pid file lets `trellis channel kill` find us.
  const project = process.env.TRELLIS_CHANNEL_PROJECT;
  fs.writeFileSync(
    workerFile(channelName, workerName, "pid", project),
    String(process.pid),
  );

  // ── adapter selection ──
  const adapter = getAdapter(config.provider);
  const adapterCtx = adapter.createCtx();
  const view = {
    resume: config.resume,
    model: config.model,
    systemPrompt: config.systemPrompt,
    cwd: config.cwd,
  };
  const args = adapter.buildArgs(view);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...config.env,
    TRELLIS_HOOKS: "0",
    TRELLIS_CHANNEL: channelName,
    TRELLIS_CHANNEL_AS: workerName,
  };

  const logPath = workerFile(channelName, workerName, "log", project);
  const log = fs.createWriteStream(logPath);
  const providerPath = resolveProviderPath(adapter.provider);
  log.write(
    `[supervisor] starting ${adapter.provider} (resolved: ${providerPath}) ${args.join(" ")}\n`,
  );

  const child = spawn(providerPath, args, {
    cwd: config.cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  }) as Child;

  // ── shutdown controller declared before listener attachment ──
  // Node fires `error` on next tick when spawn fails (ENOENT / EACCES);
  // create the controller and attach listeners synchronously, with no
  // await between spawn() and child.on("error").
  const shutdown = createShutdown({
    channelName,
    workerName,
    log,
    getChild: () => child,
    graceMs: SHUTDOWN_GRACE_MS,
    timeoutMs: config.timeoutMs,
    ...(config.idleTimeoutMs !== undefined
      ? { idleTimeoutMs: config.idleTimeoutMs }
      : {}),
  });

  // Gate the `spawned` event behind whichever child lifecycle event fires
  // first: `spawn` (success) or `error` (launch failure, e.g. ENOENT).
  // Without this gate the post-spawn path writes `spawned` even when the
  // process never actually started — and the racing error append makes
  // `spawned` vs `error` ordering non-deterministic. Both rounds of CR
  // converged on this.
  let spawnFailed = false;
  let settleSpawn: () => void = () => undefined;
  const spawnSettled = new Promise<void>((resolve) => {
    settleSpawn = resolve;
  });

  // Attach listeners SYNCHRONOUSLY — no awaits between spawn() and these
  // lines. Node fires `error` on next tick when spawn fails (ENOENT etc.),
  // and if no listener is attached by then the supervisor dies with an
  // unhandled error and leaves a stale .pid behind.
  child.stderr.on("data", (b: Buffer) => log.write(b));
  child.once("spawn", () => {
    settleSpawn();
  });
  child.on("error", (err) => {
    // L1 fix: guard against double-fire of `error` (Node can re-emit it
    // during pipe teardown). The startup-failed path runs an IIFE that
    // owns process.exit; subsequent fires must be no-ops or we'd queue
    // duplicate error events.
    if (spawnFailed) return;
    log.write(`[supervisor] worker error: ${err.message}\n`);
    if (!child.pid) {
      // Pre-spawn failure (ENOENT / EACCES): emit ONE `error` event,
      // skip the misleading `spawned{pid:undefined}`, clean up, and exit
      // so the supervisor doesn't linger as a zombie waiting for an
      // `exit` event that Node won't deliver.
      spawnFailed = true;
      settleSpawn();
      void (async () => {
        try {
          await appendEvent(
            channelName,
            {
              kind: "error",
              by: `supervisor:${workerName}`,
              message: `worker spawn failed: ${err.message}`,
              provider: config.provider,
            },
            project,
          );
        } catch {
          // ignore — we're exiting anyway
        }
        await cleanup(channelName, workerName).catch(() => undefined);
        process.exit(1);
      })();
      return;
    }
    // Post-spawn error (worker already running). Claude M2 fix: await
    // the `error` append BEFORE requesting shutdown so `killed` can't
    // land first in events.jsonl.
    //
    // Sync-claim the shutdown reason FIRST so other code paths (e.g.
    // the `await spawnSettled` re-check, future inbox-handler probes)
    // observe `isShuttingDown=true` immediately, before the IIFE
    // suspends on its first await.
    shutdown.claim("crash");
    void (async () => {
      try {
        await appendEvent(
          channelName,
          {
            kind: "error",
            by: `supervisor:${workerName}`,
            message: `worker process error: ${err.message}`,
            provider: config.provider,
          },
          project,
        );
      } catch {
        // ignore
      }
      await shutdown.request("SIGTERM", "crash");
    })();
  });
  child.on("exit", (code, sig) => {
    // Codex #1 + #2 fix: synthesise a fallback terminal event when the
    // adapter never produced one (otherwise `wait --kind done` hangs),
    // and await any in-flight `killed` append from a concurrent shutdown
    // before exiting so the event doesn't race the process death.
    void (async () => {
      await shutdown.finalizeOnExit(code, sig).catch(() => undefined);
      await cleanup(channelName, workerName).catch(() => undefined);
      process.exit(0);
    })();
  });

  // Signal handlers MUST be registered before any await so a SIGTERM
  // arriving during the spawn-settle / spawned-append window funnels
  // into `shutdown.request` instead of using Node's default behaviour
  // (which would orphan the child and skip the `killed` event).
  process.on("SIGTERM", () => {
    void shutdown.request(
      "SIGTERM",
      readExternalShutdownReason(channelName, workerName, project),
    );
  });
  process.on("SIGINT", () => void shutdown.request("SIGINT", "explicit-kill"));
  // SIGHUP arrives when the parent terminal closes — without this
  // handler Node's default behaviour exits the supervisor before the
  // killed-append lands.
  process.on("SIGHUP", () => void shutdown.request("SIGHUP", "explicit-kill"));

  // Wait until either `spawn` or pre-spawn `error` fires before writing
  // the `spawned` event. The error handler exits the process directly,
  // so reaching this point with `spawnFailed=true` means we already kicked
  // off cleanup and can bail cleanly.
  await spawnSettled;
  if (spawnFailed) return;
  // Codex #3 fix: if a signal/timeout requested shutdown while we were
  // waiting for spawn-settled, don't write a misleading `spawned` event;
  // let the in-flight `killed` append complete and bail.
  if (shutdown.isShuttingDown()) {
    await shutdown.awaitFinalize();
    return;
  }

  fs.writeFileSync(
    workerFile(channelName, workerName, "worker-pid", project),
    String(child.pid),
  );

  await appendEvent(
    channelName,
    {
      kind: "spawned",
      by: config.spawnedBy ?? "main",
      as: workerName,
      provider: config.provider,
      pid: child.pid,
      inboxPolicy: config.inboxPolicy ?? DEFAULT_INBOX_POLICY,
      ...(config.agent ? { agent: config.agent } : {}),
      ...(config.contextFiles && config.contextFiles.length > 0
        ? { files: config.contextFiles }
        : {}),
      ...(config.contextManifests && config.contextManifests.length > 0
        ? { manifests: config.contextManifests }
        : {}),
    },
    project,
  );

  // OOM-guard idle timer: start only after `spawned` is durable. Hooks
  // wired through the TurnTracker pause it mid-turn and reset it on
  // turn finish / interrupted (the same transitions that drive durable
  // `idleSince`). `<=0` short-circuits the timer to a no-op.
  const idleTimer = scheduleSupervisorIdleTimer({
    idleTimeoutMs: config.idleTimeoutMs ?? 0,
    shutdown,
    isChildExited: () => child.exitCode !== null || child.signalCode !== null,
    log,
  });
  const turnTracker = new TurnTracker({
    onIdleExit: () => idleTimer.pause(),
    onIdleEnter: () => idleTimer.reset(),
  });
  process.on("exit", () => idleTimer.cancel());

  // ── 1. stdout reader ──
  startStdoutPump({
    channelName,
    workerName,
    child,
    adapter,
    adapterCtx,
    log,
    shutdown,
    turnTracker,
  });

  // ── timeout guard (anti-zombie) ──
  if (config.timeoutMs && config.timeoutMs > 0) {
    setTimeout(() => {
      log.write(
        `[supervisor] timeout ${config.timeoutMs}ms reached, killing worker\n`,
      );
      // shutdown.request emits a single `killed{reason:"timeout"}` event;
      // no need to emit a separate one here.
      void shutdown.request("SIGTERM", "timeout");
    }, config.timeoutMs).unref();

    // Fire-and-forget pre-timeout observability warning. One-shot, guarded
    // by shutdown/terminal/exit state so it stays quiet once the worker is
    // already on its way out.
    scheduleSupervisorTimeoutWarning({
      channelName,
      workerName,
      timeoutMs: config.timeoutMs,
      warnBeforeMs: config.warnBeforeMs,
      shutdown,
      isChildExited: () => child.exitCode !== null || child.signalCode !== null,
      log,
      project,
    });
  }

  // ── 3. inbox watcher ──
  // Start BEFORE adapter.handshake() so messages arriving during the
  // handshake window are captured. The adapter's `isReady()` is checked
  // inside runInboxWatcher; codex blocks there until thread/start lands.
  const abort = new AbortController();
  process.on("exit", () => abort.abort());
  void runInboxWatcher({
    channelName,
    workerName,
    adapter,
    ctx: adapterCtx,
    child,
    signal: abort.signal,
    inboxPolicy: config.inboxPolicy ?? DEFAULT_INBOX_POLICY,
    turnTracker,
  });

  // ── adapter handshake (no initial user prompt) ──
  if (adapter.handshake) {
    try {
      await adapter.handshake({ child, ctx: adapterCtx, view });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.write(`[supervisor] adapter handshake failed: ${msg}\n`);
      // Codex #4 fix: emit an `error` event with the handshake message
      // BEFORE requesting shutdown — otherwise the channel only sees a
      // `killed{reason:"crash"}` with no detail on what went wrong.
      void (async () => {
        try {
          await appendEvent(
            channelName,
            {
              kind: "error",
              by: `supervisor:${workerName}`,
              message: `handshake failed: ${msg}`,
              provider: config.provider,
              detail: { source: "handshake" },
            },
            project,
          );
        } catch {
          // ignore
        }
        await shutdown.request("SIGTERM", "crash");
      })();
    }
  }
}

async function cleanup(channelName: string, workerName: string): Promise<void> {
  // Remove ephemeral runtime files. Keep `log` (forensic), `session-id` /
  // `thread-id` (future resume). The .spawnlock should already be gone
  // because `withLock` released it; we delete it defensively in case the
  // CLI crashed mid-spawn and left a stale one.
  // Keep `log` (forensic), `session-id` / `thread-id` (future resume).
  // `inbox-cursor` is kept so a respawn (same worker name without
  // killing the channel) doesn't replay messages.
  for (const suffix of [
    "pid",
    "worker-pid",
    "config",
    "spawnlock",
    "shutdown-reason",
    "reservation",
  ]) {
    try {
      fs.unlinkSync(
        workerFile(
          channelName,
          workerName,
          suffix,
          process.env.TRELLIS_CHANNEL_PROJECT,
        ),
      );
    } catch {
      // already gone
    }
  }
}

function readExternalShutdownReason(
  channelName: string,
  workerName: string,
  project?: string,
): ShutdownReason {
  const file = workerFile(channelName, workerName, "shutdown-reason", project);
  try {
    const reason = fs.readFileSync(file, "utf-8").trim();
    fs.unlinkSync(file);
    if (reason === "idle-timeout") return "idle-timeout";
  } catch {
    // No sidecar: ordinary external SIGTERM remains an explicit kill.
  }
  return "explicit-kill";
}

function readConfig(p: string): SupervisorConfig {
  return JSON.parse(fs.readFileSync(p, "utf-8")) as SupervisorConfig;
}

// Helper to write a fresh config file before forking the supervisor.
export function writeSupervisorConfig(
  channelName: string,
  workerName: string,
  config: SupervisorConfig,
  project?: string,
): string {
  const p = workerFile(channelName, workerName, "config", project);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
  return p;
}
