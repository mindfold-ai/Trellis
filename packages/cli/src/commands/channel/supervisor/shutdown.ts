/**
 * ShutdownController — the single funnel for every "this worker is going
 * away" trigger (explicit kill, timeout, post-spawn crash, signal, child
 * exit). It owns:
 *
 *   - the `shutdownReason` flag (idempotent — first call wins)
 *   - the SIGTERM → grace → SIGKILL ladder
 *   - the trailing `killed` event append
 *   - a `terminalEmitted` flag tracking adapter-emitted done/error
 *   - `finalizeOnExit` — synthesises a fallback `done`/`error` when the
 *     worker exited without the adapter sending one (otherwise
 *     `wait --kind done` would hang forever)
 *   - `awaitFinalize` — lets `child.on("exit")` block process.exit until
 *     any in-progress killed-append from a concurrent shutdown completes
 *
 * Step 2 of the supervisor refactor: this absorbs the 5 reviewer issues
 * (codex #1 crashed-without-done, #2 fire-and-forget shutdown, #3 spawn
 * after shutdown requested, #4 handshake error detail; claude M2 post-
 * spawn error ordering, L1 pre-spawn double-fire guard) into a single
 * state machine. The supervisor.ts orchestrator stays mostly mechanical.
 */

import type { ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";

import { appendEvent } from "../store/events.js";

type Child = ChildProcessByStdio<Writable, Readable, Readable>;

export type ShutdownReason =
  | "explicit-kill"
  | "timeout"
  | "crash"
  | "idle-timeout";

export interface ShutdownController {
  /** Idempotent: only the first call wins. Returns the killed-append
   *  promise so callers can await ordering if they need to. */
  request(signal: NodeJS.Signals, reason: ShutdownReason): Promise<void>;
  /** Synchronously mark shutdown intent without starting the kill
   *  ladder or appending `killed`. Use when other code must see
   *  `isShuttingDown=true` BEFORE the caller proceeds to any await
   *  (e.g. post-spawn error handler that needs to `await appendEvent`
   *  first, but doesn't want the main flow to keep writing `spawned`).
   *  Returns true if this call claimed the flag, false if already set. */
  claim(reason: ShutdownReason): boolean;
  isShuttingDown(): boolean;
  reason(): ShutdownReason | null;

  /** Mark that the adapter has produced a `done` or `error` event, so
   *  `finalizeOnExit` won't synthesise a fallback. */
  markTerminalEmitted(): void;
  hasTerminalEvent(): boolean;

  /** Call from `child.on("exit")` — synthesises a fallback terminal
   *  event if the adapter never produced one, then awaits any pending
   *  `request()` so `killed` lands before the supervisor exits. */
  finalizeOnExit(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void>;

  /** Promise that resolves when the current (or last) `request()` has
   *  finished writing its `killed` event. No-op when never requested. */
  awaitFinalize(): Promise<void>;
}

export interface CreateShutdownArgs {
  channelName: string;
  workerName: string;
  log: { write: (data: string) => void };
  /** Lazy child getter — the controller is created before `spawn()`
   *  returns, so we read the child handle at shutdown time. */
  getChild: () => Child;
  graceMs: number;
  /** Recorded on the `killed` event for the timeout reason. */
  timeoutMs?: number;
  /** Recorded on the `killed` event when reason is `"idle-timeout"`. */
  idleTimeoutMs?: number;
}

export function createShutdown(args: CreateShutdownArgs): ShutdownController {
  const {
    channelName,
    workerName,
    log,
    getChild,
    graceMs,
    timeoutMs,
    idleTimeoutMs,
  } = args;

  let shutdownReason: ShutdownReason | null = null;
  let requestSignal: NodeJS.Signals | null = null;
  let terminalEmitted = false;
  let killedPromise: Promise<void> | null = null;

  const childStillRunning = (child: Child): boolean =>
    child.exitCode === null && child.signalCode === null;

  const startKillLadder = (child: Child): void => {
    try {
      child.stdin.end();
    } catch {
      // already closed
    }
    setTimeout(() => {
      if (childStillRunning(child)) {
        log.write(`[supervisor] grace expired, SIGTERM worker\n`);
        try {
          child.kill("SIGTERM");
        } catch {
          // already dead
        }
        setTimeout(() => {
          if (childStillRunning(child)) {
            log.write(`[supervisor] still alive, SIGKILL worker\n`);
            try {
              child.kill("SIGKILL");
            } catch {
              // already dead
            }
          }
        }, graceMs);
      }
    }, graceMs);
  };

  const writeKilled = async (
    reason: ShutdownReason,
    signal: NodeJS.Signals,
  ): Promise<void> => {
    await appendEvent(channelName, {
      kind: "killed",
      by: `supervisor:${workerName}`,
      reason,
      signal,
      ...(reason === "timeout" && timeoutMs ? { timeout_ms: timeoutMs } : {}),
      ...(reason === "idle-timeout" && idleTimeoutMs
        ? { idle_timeout_ms: idleTimeoutMs }
        : {}),
    });
  };

  const claim = (reason: ShutdownReason): boolean => {
    if (shutdownReason) return false;
    shutdownReason = reason;
    return true;
  };

  const request = async (
    signal: NodeJS.Signals,
    reason: ShutdownReason,
  ): Promise<void> => {
    // The kill ladder + killed-append are one-shot; whether we got here
    // via `claim()` + `request()` (post-spawn error) or a single
    // `request()` (signal / timeout), only run them once.
    if (killedPromise) {
      await killedPromise.catch(() => undefined);
      return;
    }
    shutdownReason ??= reason;
    requestSignal ??= signal;
    log.write(
      `[supervisor] shutting down worker (reason=${shutdownReason}, signal=${requestSignal})\n`,
    );
    startKillLadder(getChild());
    killedPromise = writeKilled(shutdownReason, requestSignal);
    await killedPromise;
  };

  const finalizeOnExit = async (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> => {
    log.write(
      `[supervisor] worker exit code=${code ?? "null"} signal=${signal ?? "null"}\n`,
    );
    // #1 fix: synthesise a terminal event so consumers blocked on
    // `wait --kind done` don't hang when the adapter never produced
    // one. Only applies to COLD exits (no explicit shutdown requested);
    // when shutdown was requested the `killed` event already serves as
    // the terminal signal and a synthesised error would just duplicate.
    //
    // The flag is claimed SYNCHRONOUSLY before the await so two
    // concurrent `finalizeOnExit` calls (or `applyParseResult` racing
    // with `child.on("exit")`) can't both pass the guard and emit
    // duplicate synthetic events. `by` is the worker name (not
    // `supervisor:<name>`) so `wait --from <worker> --kind done` wakes
    // for the synthesised event same as for an adapter-emitted one.
    if (!terminalEmitted && shutdownReason === null) {
      terminalEmitted = true;
      if (code === 0) {
        await appendEvent(channelName, {
          kind: "done",
          by: workerName,
          synthesized: true,
          exit_code: code,
        });
      } else {
        await appendEvent(channelName, {
          kind: "error",
          by: workerName,
          message: `worker exited without terminal event (code=${code ?? "null"}, signal=${signal ?? "null"})`,
          synthesized: true,
          exit_code: code,
          exit_signal: signal,
        });
      }
    }
    // #2 fix: wait for any in-progress `killed` append from a concurrent
    // shutdown request so it lands before the supervisor exits.
    if (killedPromise) await killedPromise.catch(() => undefined);
  };

  return {
    request,
    claim,
    isShuttingDown: () => shutdownReason !== null,
    reason: () => shutdownReason,
    markTerminalEmitted: () => {
      terminalEmitted = true;
    },
    hasTerminalEvent: () => terminalEmitted,
    finalizeOnExit,
    awaitFinalize: () => killedPromise ?? Promise.resolve(),
  };
}
