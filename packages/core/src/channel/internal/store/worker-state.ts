import type { ChannelEvent } from "./events.js";
import { matchesInboxPolicy, DEFAULT_INBOX_POLICY } from "./inbox.js";
import type { ChannelRef, InboxPolicy } from "./schema.js";

/**
 * Process lifecycle of a worker, projected purely from durable channel
 * events. Distinct from {@link WorkerActivity}, which tracks whether the
 * worker is mid-turn.
 */
export type WorkerLifecycle =
  | "starting"
  | "running"
  | "done"
  | "error"
  | "killed"
  | "crashed";

/** Turn activity of a worker — is it currently running a turn? */
export type WorkerActivity = "idle" | "mid-turn";

const TERMINAL_LIFECYCLES: ReadonlySet<WorkerLifecycle> = new Set([
  "done",
  "error",
  "killed",
  "crashed",
]);

export interface WorkerState {
  workerId: string;
  /** Channel the worker belongs to. Stamped by the API layer. */
  channel?: ChannelRef;
  agent?: string;
  provider?: string;
  lifecycle: WorkerLifecycle;
  terminal: boolean;
  activity: WorkerActivity;
  activeTurnId?: string;
  activeTurnStartedAt?: string;
  /**
   * Count of deliverable `message` events (matching the worker inbox
   * policy) with seq greater than the latest consumed `turn_started.inputSeq`.
   * Derived only from durable events — never from host-local cursors.
   * Always 0 for terminal workers.
   */
  pendingMessageCount: number;
  inboxPolicy: InboxPolicy;
  spawnedAt?: string;
  updatedAt: string;
  startedBy?: string;
  exitCode?: number;
  signal?: string;
  reason?: string;
  error?: string;
  /**
   * ISO timestamp of the latest durable event that put this worker into
   * the `idle` activity (spawn, turn finish, or interrupt). Cleared while
   * the worker is `mid-turn`, and on terminal lifecycles. Derived purely
   * from the event log — never from pid files or host clocks.
   */
  idleSince?: string;
  /** Seq of the last event applied to this worker. */
  lastSeq: number;
}

export interface WorkerRegistry {
  workers: WorkerState[];
}

interface WorkerAcc extends WorkerState {
  /** Max `turn_started.inputSeq` consumed by this worker. */
  consumedInputSeq: number;
}

function strField(ev: ChannelEvent, key: string): string | undefined {
  const v = (ev as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

function numField(ev: ChannelEvent, key: string): number | undefined {
  const v = (ev as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

/**
 * Resolve the worker id an event refers to, and whether the event kind
 * is allowed to *create* a worker entry (only `spawned` and clearly
 * worker-identified terminal events can — this avoids phantom workers
 * from plain `by` aliases).
 */
function identifyWorker(
  ev: ChannelEvent,
): { id: string; canCreate: boolean } | null {
  switch (ev.kind) {
    case "spawned": {
      const id = strField(ev, "as");
      return id ? { id, canCreate: true } : null;
    }
    case "turn_started":
    case "turn_finished":
    case "interrupt_requested":
    case "interrupted": {
      const id = strField(ev, "worker");
      return id ? { id, canCreate: false } : null;
    }
    case "killed": {
      const explicit = strField(ev, "worker") ?? strField(ev, "as");
      if (explicit) return { id: explicit, canCreate: true };
      const by = ev.by;
      if (by.startsWith("supervisor:")) {
        return { id: by.slice("supervisor:".length), canCreate: true };
      }
      return { id: by, canCreate: false };
    }
    case "done":
    case "error": {
      const explicit = strField(ev, "worker") ?? strField(ev, "as");
      if (explicit) return { id: explicit, canCreate: true };
      const by = ev.by;
      if (by.startsWith("supervisor:")) {
        return { id: by.slice("supervisor:".length), canCreate: true };
      }
      return { id: by, canCreate: false };
    }
    default:
      return null;
  }
}

function blankWorker(id: string, ev: ChannelEvent): WorkerAcc {
  return {
    workerId: id,
    lifecycle: "running",
    terminal: false,
    activity: "idle",
    pendingMessageCount: 0,
    inboxPolicy: DEFAULT_INBOX_POLICY,
    updatedAt: ev.ts,
    lastSeq: ev.seq,
    consumedInputSeq: 0,
  };
}

/**
 * Project durable channel events into the worker registry. Pure — only
 * the event log feeds the projection (no pid files, no inbox cursors).
 */
export function reduceWorkerRegistry(
  events: ChannelEvent[],
  channel?: ChannelRef,
): WorkerRegistry {
  const acc = new Map<string, WorkerAcc>();

  for (const ev of events) {
    const ident = identifyWorker(ev);
    if (!ident) continue;
    let w = acc.get(ident.id);
    if (!w) {
      if (!ident.canCreate) continue;
      w = blankWorker(ident.id, ev);
      acc.set(ident.id, w);
    }
    w.updatedAt = ev.ts;
    w.lastSeq = ev.seq;

    switch (ev.kind) {
      case "spawned": {
        w.lifecycle = "running";
        w.terminal = false;
        w.activity = "idle";
        delete w.activeTurnId;
        delete w.activeTurnStartedAt;
        delete w.exitCode;
        delete w.signal;
        delete w.reason;
        delete w.error;
        w.spawnedAt = ev.ts;
        w.idleSince = ev.ts;
        w.startedBy = ev.by;
        w.provider = strField(ev, "provider") ?? w.provider;
        w.agent = strField(ev, "agent") ?? w.agent;
        w.inboxPolicy =
          (strField(ev, "inboxPolicy") as InboxPolicy | undefined) ??
          w.inboxPolicy;
        break;
      }
      case "turn_started": {
        w.activity = "mid-turn";
        w.activeTurnId = strField(ev, "turnId");
        w.activeTurnStartedAt = ev.ts;
        delete w.idleSince;
        const inputSeq = numField(ev, "inputSeq");
        if (inputSeq !== undefined && inputSeq > w.consumedInputSeq) {
          w.consumedInputSeq = inputSeq;
        }
        break;
      }
      case "turn_finished": {
        w.activity = "idle";
        delete w.activeTurnId;
        delete w.activeTurnStartedAt;
        w.idleSince = ev.ts;
        break;
      }
      case "interrupted": {
        // An interrupt aborts the active turn.
        w.activity = "idle";
        delete w.activeTurnId;
        delete w.activeTurnStartedAt;
        w.idleSince = ev.ts;
        break;
      }
      case "interrupt_requested":
        // Durable intent only — no lifecycle/activity change.
        break;
      case "done": {
        w.activity = "idle";
        delete w.activeTurnId;
        delete w.activeTurnStartedAt;
        if ((ev as { synthesized?: unknown }).synthesized === true) {
          w.lifecycle = "done";
          w.terminal = true;
          w.exitCode = numField(ev, "exit_code") ?? w.exitCode;
          delete w.idleSince;
        } else {
          w.idleSince = ev.ts;
        }
        break;
      }
      case "error": {
        w.activity = "idle";
        delete w.activeTurnId;
        delete w.activeTurnStartedAt;
        w.error = strField(ev, "message") ?? w.error;
        if (
          (ev as { synthesized?: unknown }).synthesized === true ||
          ev.by.startsWith("supervisor:")
        ) {
          w.lifecycle = "error";
          w.terminal = true;
          w.exitCode = numField(ev, "exit_code") ?? w.exitCode;
          w.signal = strField(ev, "exit_signal") ?? w.signal;
          delete w.idleSince;
        } else {
          w.idleSince = ev.ts;
        }
        break;
      }
      case "killed": {
        const reason = strField(ev, "reason");
        w.lifecycle = reason === "crash" ? "crashed" : "killed";
        w.terminal = true;
        w.activity = "idle";
        delete w.activeTurnId;
        delete w.activeTurnStartedAt;
        delete w.idleSince;
        w.reason = reason ?? w.reason;
        w.signal = strField(ev, "signal") ?? w.signal;
        break;
      }
      default:
        break;
    }
  }

  // Second pass: pending message count from durable events only.
  for (const w of acc.values()) {
    if (w.terminal) {
      w.pendingMessageCount = 0;
      continue;
    }
    let pending = 0;
    for (const ev of events) {
      if (ev.seq <= w.consumedInputSeq) continue;
      if (matchesInboxPolicy(ev, w.workerId, w.inboxPolicy)) pending++;
    }
    w.pendingMessageCount = pending;
  }

  const workers: WorkerState[] = [];
  for (const w of acc.values()) {
    const { consumedInputSeq: _drop, ...state } = w;
    void _drop;
    if (channel) state.channel = channel;
    workers.push(state);
  }
  workers.sort((a, b) => a.workerId.localeCompare(b.workerId));
  return { workers };
}

export function isTerminalLifecycle(lifecycle: WorkerLifecycle): boolean {
  return TERMINAL_LIFECYCLES.has(lifecycle);
}
