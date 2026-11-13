import {
  readChannelEvents as readEventsInternal,
  type ChannelEvent,
  type MessageChannelEvent,
} from "../internal/store/events.js";
import { matchesInboxPolicy } from "../internal/store/inbox.js";
import { watchEvents } from "../internal/store/watch.js";
import { reduceWorkerRegistry } from "../internal/store/worker-state.js";
import { resolveChannelRef } from "./resolve.js";
import type { ChannelAddressOptions } from "./types.js";

export type WorkerInboxErrorCode =
  | "WORKER_INBOX_WORKER_NOT_FOUND"
  | "WORKER_INBOX_WORKER_TERMINAL";

export class WorkerInboxError extends Error {
  readonly code: WorkerInboxErrorCode;
  readonly channel: string;
  readonly workerId: string;

  constructor(
    code: WorkerInboxErrorCode,
    channel: string,
    workerId: string,
    message?: string,
  ) {
    super(message ?? defaultMessage(code, channel, workerId));
    this.name = "WorkerInboxError";
    this.code = code;
    this.channel = channel;
    this.workerId = workerId;
  }
}

function defaultMessage(
  code: WorkerInboxErrorCode,
  channel: string,
  workerId: string,
): string {
  switch (code) {
    case "WORKER_INBOX_WORKER_NOT_FOUND":
      return `Worker '${workerId}' not found in channel '${channel}'`;
    case "WORKER_INBOX_WORKER_TERMINAL":
      return `Worker '${workerId}' in channel '${channel}' is terminal`;
  }
}

export interface ReadWorkerInboxInput extends ChannelAddressOptions {
  workerId: string;
  afterSeq?: number;
  limit?: number;
  includeTerminal?: boolean;
}

export interface WatchWorkerInboxInput extends ChannelAddressOptions {
  workerId: string;
  sinceSeq?: number;
  fromStart?: boolean;
  signal?: AbortSignal;
}

export interface WorkerInboxMessage {
  workerId: string;
  event: MessageChannelEvent;
  seq: number;
  cursor: number;
}

function resolve(input: ChannelAddressOptions): ReturnType<typeof resolveChannelRef> {
  return resolveChannelRef({
    channel: input.channel,
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.projectKey !== undefined ? { projectKey: input.projectKey } : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
  });
}

/**
 * Read durable inbox messages for a specific worker.
 *
 * Reduces the worker registry from the channel event log, finds the worker,
 * and filters `message` events through `matchesInboxPolicy()` using the
 * worker's latest `inboxPolicy`. Core only reasons from the durable event
 * log; it does not claim the OS process is live.
 */
export async function readWorkerInbox(
  input: ReadWorkerInboxInput,
): Promise<WorkerInboxMessage[]> {
  const ref = resolve(input);
  const events = await readEventsInternal(input.channel, ref.project, undefined, input.cwd);
  const registry = reduceWorkerRegistry(events, ref);
  const worker = registry.workers.find((w) => w.workerId === input.workerId);
  if (!worker) {
    throw new WorkerInboxError(
      "WORKER_INBOX_WORKER_NOT_FOUND",
      input.channel,
      input.workerId,
    );
  }
  if (worker.terminal && !input.includeTerminal) {
    throw new WorkerInboxError(
      "WORKER_INBOX_WORKER_TERMINAL",
      input.channel,
      input.workerId,
    );
  }

  if (
    input.limit !== undefined &&
    (!Number.isInteger(input.limit) || input.limit < 0)
  ) {
    throw new Error("readWorkerInbox: limit must be a non-negative integer");
  }
  if (input.limit === 0) return [];

  const afterSeq = input.afterSeq ?? 0;
  const out: WorkerInboxMessage[] = [];
  for (const ev of events) {
    if (ev.seq <= afterSeq) continue;
    if (!matchesInboxPolicy(ev, input.workerId, worker.inboxPolicy)) continue;
    out.push({
      workerId: input.workerId,
      event: ev,
      seq: ev.seq,
      cursor: ev.seq,
    });
    if (input.limit !== undefined && out.length >= input.limit) break;
  }
  return out;
}

/**
 * Watch future inbox messages for a specific worker.
 *
 * Performs upfront worker validation and captures the current `lastSeq`,
 * then returns a generator that yields future inbox-matching messages
 * through the channel watch primitives. The generator ends when a terminal
 * event for the watched worker arrives; it does not cross a terminal event
 * into a later respawn with the same id.
 *
 * Eager validation means errors surface from the outer call, and the
 * watch's `sinceSeq` snapshot is taken before the caller can append more
 * events.
 */
export async function watchWorkerInbox(
  input: WatchWorkerInboxInput,
): Promise<AsyncGenerator<WorkerInboxMessage, void, unknown>> {
  const ref = resolve(input);
  const events = await readEventsInternal(input.channel, ref.project, undefined, input.cwd);
  const registry = reduceWorkerRegistry(events, ref);
  const worker = registry.workers.find((w) => w.workerId === input.workerId);
  if (!worker) {
    throw new WorkerInboxError(
      "WORKER_INBOX_WORKER_NOT_FOUND",
      input.channel,
      input.workerId,
    );
  }
  if (worker.terminal) {
    throw new WorkerInboxError(
      "WORKER_INBOX_WORKER_TERMINAL",
      input.channel,
      input.workerId,
    );
  }

  const policy = worker.inboxPolicy;
  const lastSeq = events.length > 0 ? events[events.length - 1].seq : 0;
  const generationFloorSeq = findGenerationFloorSeq(events, input.workerId);
  const watchOpts: {
    project: string;
    signal?: AbortSignal;
    sinceSeq?: number;
    cwd?: string;
  } = { project: ref.project };
  if (input.cwd !== undefined) watchOpts.cwd = input.cwd;
  if (input.signal !== undefined) watchOpts.signal = input.signal;
  if (input.fromStart) {
    watchOpts.sinceSeq = generationFloorSeq;
  } else if (input.sinceSeq !== undefined) {
    watchOpts.sinceSeq = Math.max(input.sinceSeq, generationFloorSeq);
  } else {
    watchOpts.sinceSeq = lastSeq;
  }

  return inboxWatchGenerator(input.channel, input.workerId, policy, watchOpts);
}

async function* inboxWatchGenerator(
  channel: string,
  workerId: string,
  policy: Parameters<typeof matchesInboxPolicy>[2],
  watchOpts: {
    project: string;
    signal?: AbortSignal;
    sinceSeq?: number;
    cwd?: string;
  },
): AsyncGenerator<WorkerInboxMessage, void, unknown> {
  for await (const ev of watchEvents(
    channel,
    { includeNonMeaningful: true, includeProgress: false },
    watchOpts,
  )) {
    if (isTerminalForWorker(ev, workerId)) return;
    if (matchesInboxPolicy(ev, workerId, policy)) {
      yield {
        workerId,
        event: ev,
        seq: ev.seq,
        cursor: ev.seq,
      };
    }
  }
}

function isTerminalForWorker(ev: ChannelEvent, workerId: string): boolean {
  if (ev.kind === "killed") {
    return resolveWorkerId(ev) === workerId;
  }
  if (ev.kind === "done") {
    if ((ev as { synthesized?: unknown }).synthesized !== true) return false;
    return resolveWorkerId(ev) === workerId;
  }
  if (ev.kind === "error") {
    const synthesized = (ev as { synthesized?: unknown }).synthesized === true;
    const fromSupervisor = ev.by.startsWith("supervisor:");
    if (!synthesized && !fromSupervisor) return false;
    return resolveWorkerId(ev) === workerId;
  }
  return false;
}

function findGenerationFloorSeq(events: ChannelEvent[], workerId: string): number {
  let lastTerminalSeq = 0;
  let generationFloorSeq = 0;
  for (const ev of events) {
    if (isTerminalForWorker(ev, workerId)) {
      lastTerminalSeq = ev.seq;
      continue;
    }
    if (isSpawnedForWorker(ev, workerId)) {
      generationFloorSeq = lastTerminalSeq;
    }
  }
  return generationFloorSeq;
}

function isSpawnedForWorker(ev: ChannelEvent, workerId: string): boolean {
  return ev.kind === "spawned" && (ev as { as?: string }).as === workerId;
}

function resolveWorkerId(ev: ChannelEvent): string {
  const explicit =
    (ev as { worker?: string }).worker ?? (ev as { as?: string }).as;
  if (explicit) return explicit;
  return stripSupervisor(ev.by);
}

function stripSupervisor(by: string): string {
  return by.startsWith("supervisor:") ? by.slice("supervisor:".length) : by;
}
