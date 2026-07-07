/**
 * stdout pipeline: line-buffered reader → adapter.parseLine → append
 * events into events.jsonl + persist session/thread IDs + write any
 * adapter `reply` back to the worker's stdin.
 *
 * Step 3 of the supervisor refactor: pulled out of supervisor.ts so the
 * orchestrator stays thin. The pump itself is pure (no fs / process), so
 * unit testing the line-splitting logic is straightforward once we want
 * to. `applyParseResult` still touches fs for session-id persistence —
 * that's intentional, it's the only place that needs to.
 */

import type { ChildProcessByStdio } from "node:child_process";
import fs from "node:fs";
import type { Readable, Writable } from "node:stream";

import type { WorkerAdapter } from "../adapters/index.js";
import type { ParseResult } from "../adapters/types.js";
import { appendEvent } from "../store/events.js";
import { workerFile } from "../store/paths.js";
import type { ShutdownController } from "./shutdown.js";
import type { TurnOutcome, TurnTracker } from "./turns.js";

type Child = ChildProcessByStdio<Writable, Readable, Readable>;

/**
 * 按行读取 stdout，并把非空行串行交给 onLine
 *
 * @param stream 子进程 stdout 可读流
 * @param onLine stdout 单行处理器，按读取顺序串行执行
 * @param onError onLine 抛错时的错误处理器，也在同一队列中执行
 * @returns 无返回值
 */
export function pumpStdout(
  stream: Readable,
  onLine: (line: string) => Promise<void> | void,
  onError?: (err: Error) => Promise<void> | void,
): void {
  let buf = "";
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;
  let paused = false;

  /**
   * 在有待处理行时暂停 stdout 读取
   *
   * @returns 无返回值
   */
  const pauseForBackpressure = (): void => {
    if (!paused) {
      stream.pause();
      paused = true;
    }
  };

  /**
   * 在待处理行全部完成后恢复 stdout 读取
   *
   * @returns 无返回值
   */
  const resumeIfDrained = (): void => {
    if (paused && pending === 0) {
      paused = false;
      stream.resume();
    }
  };

  /**
   * 将 stdout 单行追加到串行处理队列
   *
   * @param line 已切分出的 stdout 单行文本
   * @returns 无返回值
   */
  const enqueue = (line: string): void => {
    pending += 1;
    pauseForBackpressure();
    queue = queue
      .then(async () => {
        try {
          await onLine(line);
        } catch (err) {
          if (onError) {
            try {
              await onError(
                err instanceof Error ? err : new Error(String(err)),
              );
            } catch {
              // 吞掉错误处理器自身的错误
            }
          }
        } finally {
          pending -= 1;
          resumeIfDrained();
        }
      })
      .catch(() => undefined);
  };

  stream.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf-8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.trim()) {
        enqueue(line);
      }
    }
  });
}

/**
 * Translate an adapter `ParseResult` into channel events + adapter-level
 * side-effects (session-id persistence, stdin writes). Also tells the
 * shutdown controller when the adapter emits a `done`/`error` so the
 * fallback synthesiser in `finalizeOnExit` doesn't duplicate.
 */
export async function applyParseResult(
  channelName: string,
  workerName: string,
  result: ParseResult,
  child: Child,
  shutdown: ShutdownController,
  turnTracker?: TurnTracker,
): Promise<void> {
  for (const ev of result.events) {
    // Claim the terminal slot SYNCHRONOUSLY before the await so a
    // racing `child.on("exit") → finalizeOnExit` can't see
    // `terminalEmitted=false` and synthesise a duplicate fallback while
    // we're in the middle of writing the real terminal event.
    if (ev.kind === "done" || ev.kind === "error") {
      shutdown.markTerminalEmitted();
    }
    await appendEvent(channelName, {
      kind: ev.kind,
      by: workerName,
      ...(ev.payload ?? {}),
    });
    if (ev.kind === "done" || ev.kind === "error") {
      const turn = turnTracker?.finish();
      if (turn) {
        const outcome: TurnOutcome = ev.kind === "done" ? "done" : "error";
        await appendEvent(channelName, {
          kind: "turn_finished",
          by: workerName,
          worker: workerName,
          inputSeq: turn.inputSeq,
          turnId: turn.turnId,
          outcome,
        });
      }
    }
  }
  if (result.side) {
    const { reply, persistSessionId, persistThreadId } = result.side;
    if (persistSessionId) {
      fs.writeFileSync(
        workerFile(channelName, workerName, "session-id"),
        persistSessionId,
      );
    }
    if (persistThreadId) {
      fs.writeFileSync(
        workerFile(channelName, workerName, "thread-id"),
        persistThreadId,
      );
    }
    if (reply) {
      for (const r of reply) {
        try {
          child.stdin.write(r);
        } catch {
          // worker stdin closed — supervisor will exit soon
        }
      }
    }
  }
}

/**
 * Convenience wrapper: wire `pumpStdout` to `applyParseResult` with
 * standard error-event-on-failure handling. The orchestrator just calls
 * this and forgets about line buffering / parse plumbing.
 */
export function startStdoutPump(args: {
  channelName: string;
  workerName: string;
  child: Child;
  adapter: WorkerAdapter;
  adapterCtx: unknown;
  log: { write: (data: string) => void };
  shutdown: ShutdownController;
  turnTracker?: TurnTracker;
}): void {
  const {
    channelName,
    workerName,
    child,
    adapter,
    adapterCtx,
    log,
    shutdown,
    turnTracker,
  } = args;
  pumpStdout(
    child.stdout,
    async (line: string) => {
      log.write(line + "\n");
      const result = adapter.parseLine(line, adapterCtx);
      await applyParseResult(
        channelName,
        workerName,
        result,
        child,
        shutdown,
        turnTracker,
      );
    },
    async (err) => {
      log.write(`[supervisor] stdout line handler failed: ${err.message}\n`);
      await appendEvent(channelName, {
        kind: "error",
        by: `supervisor:${workerName}`,
        message: `stdout pipeline error: ${err.message}`,
      }).catch(() => undefined);
    },
  );
}
