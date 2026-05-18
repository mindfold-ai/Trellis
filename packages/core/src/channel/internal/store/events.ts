import fs from "node:fs";
import fsp from "node:fs/promises";

import { withLock } from "./lock.js";
import {
  channelDir,
  eventsPath,
  lockPath,
  seqSidecarPath,
} from "./paths.js";
import { reconcileSeq, writeSidecar } from "./seq.js";
import type {
  ChannelType,
  ContextEntry,
  ContextMutationAction,
  ContextTarget,
  EventOrigin,
  InboxPolicy,
  ThreadAction,
} from "./schema.js";
import { parseEventOrigin } from "./schema.js";

export type ChannelEventKind =
  | "create"
  | "join"
  | "leave"
  | "message"
  | "thread"
  | "context"
  | "channel"
  | "spawned"
  | "killed"
  | "respawned"
  | "progress"
  | "done"
  | "error"
  | "waiting"
  | "awake"
  | "undeliverable"
  | "interrupt_requested"
  | "turn_started"
  | "turn_finished"
  | "interrupted"
  | "supervisor_warning";

export const CHANNEL_EVENT_KINDS: ReadonlySet<ChannelEventKind> = new Set([
  "create",
  "join",
  "leave",
  "message",
  "thread",
  "context",
  "channel",
  "spawned",
  "killed",
  "respawned",
  "progress",
  "done",
  "error",
  "waiting",
  "awake",
  "undeliverable",
  "interrupt_requested",
  "turn_started",
  "turn_finished",
  "interrupted",
  "supervisor_warning",
]);

export function parseChannelKind(
  v: string | undefined,
): ChannelEventKind | undefined {
  if (v === undefined) return undefined;
  if (!CHANNEL_EVENT_KINDS.has(v as ChannelEventKind)) {
    throw new Error(
      `Invalid --kind '${v}'. Must be one of: ${[...CHANNEL_EVENT_KINDS].join(", ")}`,
    );
  }
  return v as ChannelEventKind;
}

/**
 * Parse a CSV of event kinds into a typed list. Each member is validated
 * through {@link parseChannelKind} so the single-value error message and
 * whitelist remain the SOT. Returns `undefined` when input is undefined
 * or contains no non-empty members.
 */
export function parseChannelKinds(
  v: string | undefined,
): ChannelEventKind[] | undefined {
  if (v === undefined) return undefined;
  const parts = v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  const out: ChannelEventKind[] = [];
  const seen = new Set<ChannelEventKind>();
  for (const part of parts) {
    const parsed = parseChannelKind(part);
    if (parsed === undefined) continue;
    if (seen.has(parsed)) continue;
    seen.add(parsed);
    out.push(parsed);
  }
  return out;
}

export interface BaseChannelEvent<
  K extends ChannelEventKind = ChannelEventKind,
> {
  seq: number;
  ts: string;
  kind: K;
  by: string;
  to?: string | string[];
  origin?: EventOrigin;
  meta?: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface CreateChannelEvent extends BaseChannelEvent<"create"> {
  cwd?: string;
  task?: string;
  /**
   * Stored channel type. May carry the legacy `"thread"` / `"threads"`
   * values on old event logs — `reduceChannelMetadata` does NOT upgrade
   * those to `"forum"`; they project to `"chat"`.
   */
  type?: ChannelType | "thread" | "threads";
  description?: string;
  /** Canonical context entries. */
  context?: ContextEntry[];
  /**
   * Legacy alias kept for compatibility with channels created before
   * `context` was the canonical field.
   *
   * @deprecated
   */
  linkedContext?: ContextEntry[];
  labels?: string[];
  ephemeral?: boolean;
}

export interface MessageChannelEvent extends BaseChannelEvent<"message"> {
  text?: string;
}

export interface ThreadChannelEvent extends BaseChannelEvent<"thread"> {
  action?: ThreadAction;
  thread: string;
  title?: string;
  text?: string;
  description?: string;
  status?: string;
  labels?: string[];
  assignees?: string[];
  summary?: string;
  context?: ContextEntry[];
  /** Legacy alias on old event logs. */
  linkedContext?: ContextEntry[];
  /** Rename target (action === "rename"). */
  newThread?: string;
}

export interface ContextChannelEvent extends BaseChannelEvent<"context"> {
  target: ContextTarget;
  action: ContextMutationAction;
  context: ContextEntry[];
  thread?: string;
}

export interface ChannelMetadataEvent extends BaseChannelEvent<"channel"> {
  action: "title";
  title?: string | null;
}

export interface SpawnedChannelEvent extends BaseChannelEvent<"spawned"> {
  as?: string;
  provider?: string;
  pid?: number;
  agent?: string;
  files?: string[];
  manifests?: string[];
  /**
   * Inbox delivery policy selected at spawn. Durable worker state — the
   * worker registry projects `spawned` events without this field as
   * `explicitOnly`.
   */
  inboxPolicy?: InboxPolicy;
}

export interface KilledChannelEvent extends BaseChannelEvent<"killed"> {
  /**
   * Why the worker was killed. Well-known supervisor / CLI reasons:
   * `"explicit-kill"` (CLI `channel kill` or signal),
   * `"timeout"` (explicit `--timeout`), `"crash"` (post-spawn worker
   * error — projected to the `crashed` lifecycle), and
   * `"idle-timeout"` (OOM-guard idle TTL). Additional string values may
   * appear from custom runtimes; consumers should treat unknown reasons
   * as opaque.
   */
  reason?: string;
  signal?: string;
  /** Worker the kill targeted (when written by the CLI kill path). */
  worker?: string;
  timeout_ms?: number;
  /** Idle TTL in ms that the worker exceeded, when `reason="idle-timeout"`. */
  idle_timeout_ms?: number;
}

export interface DoneChannelEvent extends BaseChannelEvent<"done"> {
  duration_ms?: number;
  exit_code?: number;
  synthesized?: boolean;
}

export interface ErrorChannelEvent extends BaseChannelEvent<"error"> {
  message?: string;
  provider?: string;
  synthesized?: boolean;
  exit_code?: number;
  exit_signal?: string;
}

export interface ProgressChannelEvent extends BaseChannelEvent<"progress"> {
  detail?: Record<string, unknown>;
}

/** Why a worker interrupt was requested. */
export type InterruptReason = "user" | "system" | "timeout" | "superseded";

/** How an interrupt was attempted by the worker runtime. */
export type InterruptMethod = "provider" | "stdin" | "signal" | "none";

/** Result of an interrupt attempt as reported by the worker runtime. */
export type InterruptOutcome =
  | "interrupted"
  | "queued"
  | "unsupported"
  | "no-active-turn"
  | "failed";

/** Why a message could not be delivered to a targeted worker. */
export type UndeliverableReason = "worker-terminal" | "worker-unknown";

export interface UndeliverableChannelEvent
  extends BaseChannelEvent<"undeliverable"> {
  targetWorker: string;
  messageSeq: number;
  reason: UndeliverableReason;
}

export interface InterruptRequestedChannelEvent
  extends BaseChannelEvent<"interrupt_requested"> {
  worker: string;
  turnId?: string;
  reason?: InterruptReason;
  message?: string;
}

export interface TurnStartedChannelEvent
  extends BaseChannelEvent<"turn_started"> {
  worker: string;
  /**
   * Durable link to the channel `message` event seq that initiated this
   * turn. The worker registry uses this as the "consumed" marker for
   * pending-message projection.
   */
  inputSeq: number;
  turnId?: string;
}

export interface TurnFinishedChannelEvent
  extends BaseChannelEvent<"turn_finished"> {
  worker: string;
  inputSeq?: number;
  turnId?: string;
  outcome?: "done" | "error" | "aborted";
}

export interface InterruptedChannelEvent
  extends BaseChannelEvent<"interrupted"> {
  worker: string;
  turnId?: string;
  reason?: InterruptReason;
  method: InterruptMethod;
  outcome: InterruptOutcome;
  message?: string;
}

/** Reason for a supervisor pre-terminal warning event. */
export type SupervisorWarningReason = "approaching_timeout";

/**
 * Pre-timeout observability event. Emitted at most once per worker run.
 * Not part of {@link MEANINGFUL_EVENT_KINDS} so plain `wait` does not
 * wake on it; explicit `--kind supervisor_warning` does match.
 */
export interface SupervisorWarningChannelEvent
  extends BaseChannelEvent<"supervisor_warning"> {
  worker: string;
  reason: SupervisorWarningReason;
  timeout_ms: number;
  remaining_ms: number;
}

export type GenericChannelEvent = BaseChannelEvent<
  Exclude<
    ChannelEventKind,
    | "create"
    | "message"
    | "thread"
    | "context"
    | "channel"
    | "spawned"
    | "killed"
    | "done"
    | "error"
    | "progress"
    | "undeliverable"
    | "interrupt_requested"
    | "turn_started"
    | "turn_finished"
    | "interrupted"
    | "supervisor_warning"
  >
>;

export type ChannelEvent =
  | CreateChannelEvent
  | MessageChannelEvent
  | ThreadChannelEvent
  | ContextChannelEvent
  | ChannelMetadataEvent
  | SpawnedChannelEvent
  | KilledChannelEvent
  | DoneChannelEvent
  | ErrorChannelEvent
  | ProgressChannelEvent
  | UndeliverableChannelEvent
  | InterruptRequestedChannelEvent
  | TurnStartedChannelEvent
  | TurnFinishedChannelEvent
  | InterruptedChannelEvent
  | SupervisorWarningChannelEvent
  | GenericChannelEvent;

export function isCreateEvent(ev: ChannelEvent): ev is CreateChannelEvent {
  return ev.kind === "create";
}

export function isThreadEvent(ev: ChannelEvent): ev is ThreadChannelEvent {
  return ev.kind === "thread" && typeof ev.thread === "string";
}

export function isContextEvent(ev: ChannelEvent): ev is ContextChannelEvent {
  return ev.kind === "context";
}

export function isChannelMetadataEvent(
  ev: ChannelEvent,
): ev is ChannelMetadataEvent {
  return ev.kind === "channel";
}

export async function ensureChannelDir(
  name: string,
  project?: string,
): Promise<string> {
  const dir = channelDir(name, project);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Read the last committed seq for a channel. Uses the same reconcile
 * path as `appendEvent` so callers that need a snapshot do not see a
 * stale sidecar.
 */
export async function readLastSeq(
  name: string,
  project?: string,
): Promise<number> {
  const file = eventsPath(name, project);
  if (!fs.existsSync(file)) return 0;
  return reconcileSeq(file, seqSidecarPath(name, project));
}

export interface AppendablePartial {
  kind: ChannelEventKind;
  by: string;
  ts?: string;
  [extra: string]: unknown;
}

/**
 * Append a channel event atomically under the channel lock.
 *
 * Internally reconciles the `.seq` sidecar with the JSONL tail to avoid
 * the legacy full-scan path. Sidecar repair happens automatically on
 * corruption, missing file, or sidecar drift in either direction.
 *
 * @internal Trellis CLI-internal write primitive — downstream consumers
 *   must go through the typed mutation APIs (`createChannel`,
 *   `sendMessage`, etc.).
 */
export async function appendEvent(
  name: string,
  partial: AppendablePartial,
  project?: string,
): Promise<ChannelEvent> {
  validateEventBase(partial);
  await ensureChannelDir(name, project);
  const jsonl = eventsPath(name, project);
  const sidecar = seqSidecarPath(name, project);
  return withLock(lockPath(name, project), async () => {
    const lastSeq = await reconcileSeq(jsonl, sidecar);
    const event = {
      ...partial,
      seq: lastSeq + 1,
      ts: partial.ts ?? new Date().toISOString(),
    } as ChannelEvent;
    await fsp.appendFile(jsonl, JSON.stringify(event) + "\n", "utf-8");
    await writeSidecar(sidecar, event.seq);
    return event;
  });
}

function validateEventBase(partial: AppendablePartial): void {
  const origin = partial.origin;
  if (origin !== undefined) {
    parseEventOrigin(typeof origin === "string" ? origin : String(origin));
  }
  const meta = partial.meta;
  if (
    meta !== undefined &&
    (meta === null || typeof meta !== "object" || Array.isArray(meta))
  ) {
    throw new Error("meta must be a plain JSON object");
  }
}

/**
 * Cursor pagination options for {@link readChannelEvents}. When no field
 * is set the reader returns every event (compatibility default).
 */
export interface ReadChannelEventsPagination {
  /** Return events with `seq > afterSeq`, ascending. */
  afterSeq?: number;
  /** Return events with `seq < beforeSeq`, ascending. */
  beforeSeq?: number;
  /**
   * Cap the page size. With a cursor, caps the page. Without a cursor,
   * returns the latest N events in ascending seq order.
   */
  limit?: number;
}

/** Default page size applied when a cursor is present but `limit` is not. */
export const DEFAULT_CURSOR_PAGE_SIZE = 200;

function readAllEvents(file: string): ChannelEvent[] {
  if (!fs.existsSync(file)) return [];
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

export async function readChannelEvents(
  name: string,
  project?: string,
  pagination?: ReadChannelEventsPagination,
): Promise<ChannelEvent[]> {
  const file = eventsPath(name, project);
  const all = readAllEvents(file);

  if (
    !pagination ||
    (pagination.afterSeq === undefined &&
      pagination.beforeSeq === undefined &&
      pagination.limit === undefined)
  ) {
    return all;
  }

  const { afterSeq, beforeSeq, limit } = pagination;
  if (afterSeq !== undefined && beforeSeq !== undefined) {
    throw new Error(
      "readChannelEvents: pass only one of afterSeq / beforeSeq",
    );
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error("readChannelEvents: limit must be a non-negative integer");
  }

  // Events are appended in monotonic seq order; keep that as the contract.
  if (afterSeq !== undefined) {
    const page = all.filter((ev) => ev.seq > afterSeq);
    const cap = limit ?? DEFAULT_CURSOR_PAGE_SIZE;
    return page.slice(0, cap);
  }

  if (beforeSeq !== undefined) {
    const page = all.filter((ev) => ev.seq < beforeSeq);
    const cap = limit ?? DEFAULT_CURSOR_PAGE_SIZE;
    // Newest page first internally; return ascending for stable consumers.
    return page.slice(Math.max(0, page.length - cap));
  }

  // limit only: latest N events in ascending seq order.
  return limit !== undefined
    ? all.slice(Math.max(0, all.length - limit))
    : all;
}
