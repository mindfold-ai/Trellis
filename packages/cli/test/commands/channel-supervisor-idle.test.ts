import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleSupervisorIdleTimer } from "../../src/commands/channel/supervisor/idle.js";
import type { ShutdownController } from "../../src/commands/channel/supervisor/shutdown.js";
import { TurnTracker } from "../../src/commands/channel/supervisor/turns.js";

function fakeShutdown(): ShutdownController & {
  request: ReturnType<typeof vi.fn>;
  isShuttingDown: ReturnType<typeof vi.fn>;
  hasTerminalEvent: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn().mockReturnValue(true),
    isShuttingDown: vi.fn().mockReturnValue(false),
    reason: vi.fn().mockReturnValue(null),
    markTerminalEmitted: vi.fn(),
    hasTerminalEvent: vi.fn().mockReturnValue(false),
    finalizeOnExit: vi.fn().mockResolvedValue(undefined),
    awaitFinalize: vi.fn().mockResolvedValue(undefined),
  } as unknown as ShutdownController & {
    request: ReturnType<typeof vi.fn>;
    isShuttingDown: ReturnType<typeof vi.fn>;
    hasTerminalEvent: ReturnType<typeof vi.fn>;
  };
}

const silentLog = { write: (): void => undefined };

describe("scheduleSupervisorIdleTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires shutdown.request after idle TTL with reason 'idle-timeout'", () => {
    const shutdown = fakeShutdown();
    scheduleSupervisorIdleTimer({
      idleTimeoutMs: 1000,
      shutdown,
      isChildExited: () => false,
      log: silentLog,
    });

    vi.advanceTimersByTime(999);
    expect(shutdown.request).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(shutdown.request).toHaveBeenCalledWith(
      "SIGTERM",
      "idle-timeout",
    );
  });

  it("idleTimeoutMs <= 0 is a no-op handle", () => {
    const shutdown = fakeShutdown();
    const handle = scheduleSupervisorIdleTimer({
      idleTimeoutMs: 0,
      shutdown,
      isChildExited: () => false,
      log: silentLog,
    });
    handle.reset();
    handle.pause();
    handle.cancel();
    vi.advanceTimersByTime(10_000_000);
    expect(shutdown.request).not.toHaveBeenCalled();
  });

  it("pause() prevents firing; reset() restarts the timer", () => {
    const shutdown = fakeShutdown();
    const handle = scheduleSupervisorIdleTimer({
      idleTimeoutMs: 1000,
      shutdown,
      isChildExited: () => false,
      log: silentLog,
    });

    vi.advanceTimersByTime(500);
    handle.pause();
    vi.advanceTimersByTime(10_000);
    expect(shutdown.request).not.toHaveBeenCalled();

    handle.reset();
    vi.advanceTimersByTime(999);
    expect(shutdown.request).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(shutdown.request).toHaveBeenCalledTimes(1);
  });

  it("does not fire after cancel()", () => {
    const shutdown = fakeShutdown();
    const handle = scheduleSupervisorIdleTimer({
      idleTimeoutMs: 1000,
      shutdown,
      isChildExited: () => false,
      log: silentLog,
    });
    handle.cancel();
    vi.advanceTimersByTime(5000);
    expect(shutdown.request).not.toHaveBeenCalled();
  });

  it("does not fire once child has already exited", () => {
    const shutdown = fakeShutdown();
    let exited = false;
    scheduleSupervisorIdleTimer({
      idleTimeoutMs: 1000,
      shutdown,
      isChildExited: () => exited,
      log: silentLog,
    });
    exited = true;
    vi.advanceTimersByTime(5000);
    expect(shutdown.request).not.toHaveBeenCalled();
  });

  it("does not fire once shutdown is already in progress", () => {
    const shutdown = fakeShutdown();
    shutdown.isShuttingDown.mockReturnValue(true);
    scheduleSupervisorIdleTimer({
      idleTimeoutMs: 1000,
      shutdown,
      isChildExited: () => false,
      log: silentLog,
    });
    vi.advanceTimersByTime(5000);
    expect(shutdown.request).not.toHaveBeenCalled();
  });
});

describe("TurnTracker hooks", () => {
  it("invokes onIdleExit when the first turn begins, and onIdleEnter when the last finishes", () => {
    const onIdleExit = vi.fn();
    const onIdleEnter = vi.fn();
    const tracker = new TurnTracker({ onIdleExit, onIdleEnter });

    tracker.begin(1);
    expect(onIdleExit).toHaveBeenCalledTimes(1);
    expect(onIdleEnter).not.toHaveBeenCalled();

    // Nested begin (interrupt → new turn) does not re-fire idle exit.
    tracker.begin(2);
    expect(onIdleExit).toHaveBeenCalledTimes(1);

    tracker.finish();
    expect(onIdleEnter).not.toHaveBeenCalled();

    tracker.finish();
    expect(onIdleEnter).toHaveBeenCalledTimes(1);
  });

  it("abortCurrent transitions back to idle when the stack empties", () => {
    const onIdleEnter = vi.fn();
    const tracker = new TurnTracker({ onIdleEnter });
    tracker.begin(1);
    tracker.abortCurrent();
    expect(onIdleEnter).toHaveBeenCalledTimes(1);
  });

  it("constructs cleanly without hooks (back-compat)", () => {
    const tracker = new TurnTracker();
    expect(tracker.begin(1).inputSeq).toBe(1);
    expect(tracker.finish()?.inputSeq).toBe(1);
  });
});
