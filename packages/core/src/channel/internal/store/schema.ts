import path from "node:path";

export const GLOBAL_PROJECT_KEY = "_global";

export type ChannelScope = "project" | "global";
/**
 * Channel structural type. `chat` is timeline-first; `forum` is a topic
 * area whose threads are individual topics. Legacy event logs may carry
 * the old `"threads"` / `"thread"` values — readers do NOT normalize them
 * to `forum`; they are treated as non-forum channels. New writes always
 * emit `"forum"`.
 */
export type ChannelType = "chat" | "forum";

export type ThreadAction =
  | "opened"
  | "comment"
  | "status"
  | "labels"
  | "summary"
  | "processed"
  | "rename";

export type ContextTarget = "channel" | "thread";

export type ContextMutationAction = "add" | "delete";

export type EventOrigin = "cli" | "api" | "worker";

/**
 * Worker inbox delivery policy. `explicitOnly` consumes only messages
 * whose `to` targets the worker (current CLI behavior).
 * `broadcastAndExplicit` also consumes broadcast messages (no `to`).
 * Applies to `kind:"message"` events only.
 */
export type InboxPolicy = "explicitOnly" | "broadcastAndExplicit";

export const INBOX_POLICIES: ReadonlySet<InboxPolicy> = new Set([
  "explicitOnly",
  "broadcastAndExplicit",
]);

export function parseInboxPolicy(
  v: string | undefined,
): InboxPolicy | undefined {
  if (v === undefined) return undefined;
  if (!INBOX_POLICIES.has(v as InboxPolicy)) {
    throw new Error(
      `Invalid inbox policy '${v}'. Must be one of: ${[...INBOX_POLICIES].join(", ")}`,
    );
  }
  return v as InboxPolicy;
}

export const CHANNEL_TYPES: ReadonlySet<ChannelType> = new Set([
  "chat",
  "forum",
]);

export const THREAD_ACTIONS: ReadonlySet<ThreadAction> = new Set([
  "opened",
  "comment",
  "status",
  "labels",
  "summary",
  "processed",
  "rename",
]);

export const EVENT_ORIGINS: ReadonlySet<EventOrigin> = new Set([
  "cli",
  "api",
  "worker",
]);

export interface FileContextEntry {
  type: "file";
  path: string;
}

export interface RawContextEntry {
  type: "raw";
  text: string;
}

export type ContextEntry = FileContextEntry | RawContextEntry;

/**
 * Legacy alias kept while old code spells the field "linkedContext". New
 * APIs use `ContextEntry`.
 *
 * @deprecated Use {@link ContextEntry} instead.
 */
export type LinkedContextEntry = ContextEntry;

export interface ChannelRef {
  name: string;
  scope: ChannelScope;
  /** Storage project bucket key (not the metadata `project` slug). */
  project: string;
  dir: string;
}

export interface ChannelMetadata {
  type: ChannelType;
  title?: string;
  description?: string;
  context?: ContextEntry[];
  labels?: string[];
}

export function parseChannelScope(
  v: string | undefined,
): ChannelScope | undefined {
  if (v === undefined) return undefined;
  if (v !== "project" && v !== "global") {
    throw new Error("Invalid --scope. Must be one of: project, global");
  }
  return v;
}

export function parseChannelType(v: string | undefined): ChannelType {
  if (v === undefined) return "chat";
  if (v === "thread" || v === "threads") {
    throw new Error(`Invalid --type '${v}'. Use '--type forum'.`);
  }
  if (!CHANNEL_TYPES.has(v as ChannelType)) {
    throw new Error("Invalid --type. Must be one of: chat, forum");
  }
  return v as ChannelType;
}

export function parseThreadAction(v: string): ThreadAction {
  if (!THREAD_ACTIONS.has(v as ThreadAction)) {
    throw new Error(
      `Invalid thread action '${v}'. Must be one of: ${[...THREAD_ACTIONS].join(", ")}`,
    );
  }
  return v as ThreadAction;
}

export function parseEventOrigin(
  v: string | undefined,
): EventOrigin | undefined {
  if (v === undefined) return undefined;
  if (!EVENT_ORIGINS.has(v as EventOrigin)) {
    throw new Error(
      `Invalid origin '${v}'. Must be one of: ${[...EVENT_ORIGINS].join(", ")}`,
    );
  }
  return v as EventOrigin;
}

export function normalizeThreadKey(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) throw new Error("Thread key must not be empty");
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(
      "Thread key may only contain letters, numbers, '.', '_' and '-'",
    );
  }
  return trimmed;
}

/**
 * Build a context entry list from absolute file paths + raw strings. The
 * inputs are typically a CLI flag list and a raw-text list. Returns
 * `undefined` when both lists are empty so callers can spread the field
 * only when present.
 */
export function buildContextEntries(
  files: string[] | undefined,
  raw: string[] | undefined,
): ContextEntry[] | undefined {
  const entries: ContextEntry[] = [];
  for (const file of files ?? []) {
    const value = file.trim();
    if (!path.isAbsolute(value)) {
      throw new Error(`context file must be absolute path: ${file}`);
    }
    entries.push({ type: "file", path: value });
  }
  for (const text of raw ?? []) {
    if (!text.trim()) {
      throw new Error("context raw text must not be empty");
    }
    entries.push({ type: "raw", text });
  }
  return entries.length > 0 ? entries : undefined;
}

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item) => typeof item === "string") as string[];
}

export function asContextEntries(
  value: unknown,
): ContextEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is ContextEntry => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Record<string, unknown>;
    if (candidate.type === "file") return typeof candidate.path === "string";
    if (candidate.type === "raw") return typeof candidate.text === "string";
    return false;
  });
  return entries.length > 0 ? entries : undefined;
}

/**
 * Identity key for a context entry, used for add/delete projection.
 * File entries identify by absolute path; raw entries identify by the
 * full text body.
 */
export function contextEntryKey(entry: ContextEntry): string {
  return entry.type === "file" ? `file:${entry.path}` : `raw:${entry.text}`;
}
