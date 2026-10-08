import {
  appendEvent,
  readChannelEvents,
  type ChannelEvent,
  type InterruptReason,
} from "../internal/store/events.js";
import { reduceWorkerRegistry } from "../internal/store/worker-state.js";
import { resolveChannelRef } from "./resolve.js";
import type { WorkerInterruptResult, WorkerRuntime } from "./runtime.js";
import type { ChannelAddressOptions, MutationCommonOptions } from "./types.js";

export interface InterruptWorkerInput
  extends ChannelAddressOptions,
    MutationCommonOptions {
  workerId: string;
  message?: string;
  reason?: InterruptReason;
}

export type InterruptDelivery =
  | "interrupted-current-turn"
  | "no-active-turn"
  | "worker-terminal"
  | "worker-unknown";

export interface InterruptWorkerResult {
  /** Last durable event appended (`interrupted` if attempted, else `interrupt_requested`). */
  event: ChannelEvent;
  interrupted: boolean;
  delivery: InterruptDelivery;
}

/**
 * Durable-event-only interrupt. Appends an `interrupt_requested` event
 * recording intent. Does not touch any worker runtime.
 */
export async function requestInterrupt(
  input: InterruptWorkerInput,
): Promise<ChannelEvent> {
  const ref = resolveChannelRef({
    channel: input.channel,
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.projectKey !== undefined
      ? { projectKey: input.projectKey }
      : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
  });
  return appendEvent(
    input.channel,
    {
      kind: "interrupt_requested",
      by: input.by,
      worker: input.workerId,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      ...(input.origin !== undefined ? { origin: input.origin } : {}),
      ...(input.meta !== undefined ? { meta: input.meta } : {}),
    },
    ref.project,
    input.cwd,
  );
}

/**
 * Orchestration interrupt. Appends `interrupt_requested`, asks the
 * injected runtime to interrupt the worker, then appends `interrupted`
 * with the runtime-reported `method` / `outcome`. Core never imports CLI
 * provider adapters — the runtime is injected.
 *
 * Skips the runtime call (and the `interrupted` event) when the worker
 * is unknown or terminal in the durable registry.
 */
export async function interruptWorker(
  input: InterruptWorkerInput,
  runtime: WorkerRuntime,
): Promise<InterruptWorkerResult> {
  const ref = resolveChannelRef({
    channel: input.channel,
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.projectKey !== undefined
      ? { projectKey: input.projectKey }
      : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
  });

  const events = await readChannelEvents(input.channel, ref.project, undefined, input.cwd);
  const registry = reduceWorkerRegistry(events);
  const worker = registry.workers.find((w) => w.workerId === input.workerId);

  const turnId = worker?.activeTurnId;
  const requestEvent = await appendEvent(
    input.channel,
    {
      kind: "interrupt_requested",
      by: input.by,
      worker: input.workerId,
      ...(turnId !== undefined ? { turnId } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      ...(input.origin !== undefined ? { origin: input.origin } : {}),
      ...(input.meta !== undefined ? { meta: input.meta } : {}),
    },
    ref.project,
    input.cwd,
  );

  if (!worker) {
    return {
      event: requestEvent,
      interrupted: false,
      delivery: "worker-unknown",
    };
  }
  if (worker.terminal) {
    return {
      event: requestEvent,
      interrupted: false,
      delivery: "worker-terminal",
    };
  }

  const result: WorkerInterruptResult = runtime.interrupt
    ? await runtime.interrupt({
        workerId: input.workerId,
        ...(turnId !== undefined ? { turnId } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.message !== undefined ? { message: input.message } : {}),
      })
    : { method: "none", outcome: "unsupported" };

  const interruptedEvent = await appendEvent(
    input.channel,
    {
      kind: "interrupted",
      by: input.by,
      worker: input.workerId,
      method: result.method,
      outcome: result.outcome,
      ...(turnId !== undefined ? { turnId } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(result.message !== undefined ? { message: result.message } : {}),
      ...(input.origin !== undefined ? { origin: input.origin } : {}),
      ...(input.meta !== undefined ? { meta: input.meta } : {}),
    },
    ref.project,
    input.cwd,
  );

  const delivery: InterruptDelivery =
    worker.activity === "mid-turn"
      ? "interrupted-current-turn"
      : "no-active-turn";

  return {
    event: interruptedEvent,
    interrupted: result.outcome === "interrupted",
    delivery,
  };
}
