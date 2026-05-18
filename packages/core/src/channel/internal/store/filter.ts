import {
  isThreadEvent,
  type ChannelEvent,
  type ChannelEventKind,
} from "./events.js";
import type { ThreadAction } from "./schema.js";

export const MEANINGFUL_EVENT_KINDS: ReadonlySet<ChannelEventKind> = new Set([
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
  "done",
  "error",
] as ChannelEventKind[]);

export interface ChannelEventFilter {
  from?: string[];
  /**
   * Restrict to one kind (legacy single value) or any of a list (OR
   * semantics). An explicit kind constraint bypasses the default
   * meaningful-kinds filter so non-meaningful kinds can still match
   * when requested directly (e.g. `supervisor_warning`).
   */
  kind?: ChannelEventKind | readonly ChannelEventKind[];
  to?: string;
  self?: string;
  includeProgress?: boolean;
  includeNonMeaningful?: boolean;
  thread?: string;
  action?: ThreadAction;
}

function matchesKind(
  evKind: ChannelEventKind,
  filterKind: ChannelEventFilter["kind"],
): boolean {
  if (filterKind === undefined) return true;
  if (typeof filterKind === "string") return evKind === filterKind;
  // Empty array = no kind constraint (treat as if filter.kind was undefined).
  if (filterKind.length === 0) return true;
  return filterKind.includes(evKind);
}

export function matchesEventFilter(
  ev: ChannelEvent,
  filter: ChannelEventFilter,
): boolean {
  if (filter.self && ev.by === filter.self) return false;

  // An explicit kind filter is itself the caller's "I know what I want"
  // signal — bypass the default meaningful-kinds gate so non-meaningful
  // kinds like `supervisor_warning` remain matchable when requested.
  const hasExplicitKind =
    filter.kind !== undefined &&
    (typeof filter.kind === "string" || filter.kind.length > 0);

  if (
    !filter.includeNonMeaningful &&
    !hasExplicitKind &&
    !MEANINGFUL_EVENT_KINDS.has(ev.kind)
  ) {
    return false;
  }

  if (!filter.includeProgress && ev.kind === "progress") return false;

  if (!matchesKind(ev.kind, filter.kind)) return false;

  if (filter.thread !== undefined) {
    if (!isThreadEvent(ev)) return false;
    if (ev.thread !== filter.thread) return false;
  }

  if (filter.action !== undefined) {
    if (!isThreadEvent(ev)) return false;
    if (ev.action !== filter.action) return false;
  }

  if (filter.from && filter.from.length > 0) {
    if (!filter.from.includes(ev.by)) return false;
  }

  if (filter.to) {
    const evTo = (ev as { to?: string | string[] }).to;
    if (filter.to === "exclusive") {
      if (!evTo) return false;
    } else {
      if (!evTo) return true;
      if (Array.isArray(evTo)) return evTo.includes(filter.to);
      return evTo === filter.to;
    }
  }

  return true;
}
