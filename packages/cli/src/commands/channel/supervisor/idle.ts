/**
 * Supervisor-side idle-timeout timer.
 *
 * Complements the spawn-time guard: each running worker self-terminates
 * after its own idle TTL so a long-lived supervisor can't keep an
 * otherwise-idle worker alive indefinitely.
 *
 * Behavior:
 *   - Start an idle timer right after `spawned`.
 *   - Reset / restart on `turn_finished` and `interrupted` (worker
 *     transitioned back to idle).
 *   - Pause on `turn_started` (worker is mid-turn; never kill mid-turn).
 *   - On idle timeout, call `shutdown.request("SIGTERM", "idle-timeout")`.
 *
 * Lives outside `createShutdown` so the shutdown funnel only owns the
 * kill ladder + `killed` append. Cancellation is via the returned
 * handle (used on supervisor teardown).
 */

import type { ShutdownController } from "./shutdown.js";

export interface SupervisorIdleProbe {
  isShuttingDown(): boolean;
  hasTerminalEvent(): boolean;
}

export interface IdleTimerHandle {
  /** Restart the timer because the worker just finished a turn. */
  reset(): void;
  /** Suspend the timer because the worker is mid-turn. */
  pause(): void;
  /** Cancel for good (on supervisor teardown). */
  cancel(): void;
}

export interface ScheduleIdleTimerArgs {
  idleTimeoutMs: number;
  shutdown: ShutdownController & SupervisorIdleProbe;
  /** Returns true once the child process has exited. */
  isChildExited: () => boolean;
  log: { write: (data: string) => void };
}

/**
 * Schedule a self-resetting idle timer. `idleTimeoutMs <= 0` short-
 * circuits to a no-op handle (idle cleanup disabled).
 */
export function scheduleSupervisorIdleTimer(
  args: ScheduleIdleTimerArgs,
): IdleTimerHandle {
  const { idleTimeoutMs, shutdown, isChildExited, log } = args;
  if (idleTimeoutMs <= 0) {
    return {
      reset: () => undefined,
      pause: () => undefined,
      cancel: () => undefined,
    };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const clear = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const fire = (): void => {
    timer = undefined;
    if (cancelled) return;
    if (
      shutdown.isShuttingDown() ||
      shutdown.hasTerminalEvent() ||
      isChildExited()
    ) {
      return;
    }
    log.write(
      `[supervisor] idle timeout ${idleTimeoutMs}ms reached, requesting shutdown\n`,
    );
    void shutdown.request("SIGTERM", "idle-timeout");
  };

  const start = (): void => {
    if (cancelled) return;
    clear();
    timer = setTimeout(fire, idleTimeoutMs);
    // Don't keep the supervisor alive solely for the idle timer; if
    // every other handle has gone away the worker has nothing to do.
    timer.unref?.();
  };

  // Initial schedule: worker just spawned, currently idle.
  start();

  return {
    reset: start,
    pause: clear,
    cancel: () => {
      cancelled = true;
      clear();
    },
  };
}
