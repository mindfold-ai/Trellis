import {
  isContextEvent,
  isThreadEvent,
  type ChannelEvent,
  type ContextChannelEvent,
  type ThreadChannelEvent,
} from "./events.js";
import {
  asContextEntries,
  asStringArray,
  contextEntryKey,
  type ContextEntry,
} from "./schema.js";

export interface ThreadState {
  thread: string;
  title?: string;
  status: string;
  labels: string[];
  description?: string;
  context?: ContextEntry[];
  summary?: string;
  openedAt?: string;
  updatedAt?: string;
  lastSeq: number;
  comments: number;
  /** Previous thread keys after rename. Resolved-from-old-key consumers
   *  use this set to recover history that references the rename source. */
  aliases: string[];
}

interface ThreadInternalState extends ThreadState {
  contextMap: Map<string, ContextEntry>;
}

/**
 * Resolve thread aliases over an event stream. Returns a function that
 * maps any (current or previous) thread key to its current canonical
 * key, plus the set of historical aliases for each current key.
 */
export interface ThreadAliasResolver {
  resolve(key: string): string;
  aliasesFor(currentKey: string): string[];
}

export function buildThreadAliasResolver(
  events: ChannelEvent[],
): ThreadAliasResolver {
  // Map from any historical key -> current key (chain-flattened).
  const aliasToCurrent = new Map<string, string>();
  // Reverse index: current key -> set of historical aliases (excluding self).
  const aliasesByCurrent = new Map<string, Set<string>>();

  const currentFor = (key: string): string => {
    let cur = aliasToCurrent.get(key) ?? key;
    // Flatten any chain that may form if the same key was renamed more
    // than once. We rebuild on each call so callers do not see stale
    // pointers when this function is called mid-stream.
    const seen = new Set<string>();
    while (aliasToCurrent.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = aliasToCurrent.get(cur) as string;
    }
    return cur;
  };

  for (const ev of events) {
    if (!isThreadEvent(ev) || ev.action !== "rename") continue;
    const newKey =
      typeof ev.newThread === "string" ? ev.newThread.trim() : undefined;
    const oldKey = ev.thread;
    if (!newKey || !oldKey || newKey === oldKey) continue;

    const oldCurrent = currentFor(oldKey);
    const targetCurrent = currentFor(newKey);
    if (oldCurrent === targetCurrent) continue;

    // Migrate the alias group rooted at `oldCurrent` onto `targetCurrent`.
    const movingAliases =
      aliasesByCurrent.get(oldCurrent) ?? new Set<string>();
    movingAliases.add(oldCurrent);
    aliasesByCurrent.delete(oldCurrent);

    const targetAliases =
      aliasesByCurrent.get(targetCurrent) ?? new Set<string>();
    for (const alias of movingAliases) {
      if (alias !== targetCurrent) targetAliases.add(alias);
      aliasToCurrent.set(alias, targetCurrent);
    }
    aliasesByCurrent.set(targetCurrent, targetAliases);
  }

  return {
    resolve(key: string): string {
      return currentFor(key);
    },
    aliasesFor(currentKey: string): string[] {
      const set = aliasesByCurrent.get(currentKey);
      return set ? [...set] : [];
    },
  };
}

export function reduceThreads(events: ChannelEvent[]): ThreadState[] {
  const resolver = buildThreadAliasResolver(events);
  const states = new Map<string, ThreadInternalState>();

  const ensure = (key: string, seq: number): ThreadInternalState => {
    const current = states.get(key);
    if (current) return current;
    const fresh: ThreadInternalState = {
      thread: key,
      status: "open",
      labels: [],
      lastSeq: seq,
      comments: 0,
      aliases: [],
      contextMap: new Map<string, ContextEntry>(),
    };
    states.set(key, fresh);
    return fresh;
  };

  for (const ev of events) {
    if (isThreadEvent(ev)) {
      const current = resolver.resolve(ev.thread);
      const state = ensure(current, ev.seq);
      if (typeof ev.ts === "string") state.updatedAt = ev.ts;
      if (!state.openedAt && typeof ev.ts === "string") {
        state.openedAt = ev.ts;
      }
      state.lastSeq = ev.seq;
      applyThreadAction(state, ev);
      continue;
    }

    if (isContextEvent(ev) && ev.target === "thread" && ev.thread) {
      const current = resolver.resolve(ev.thread);
      const state = states.get(current);
      if (!state) continue;
      const entries = asContextEntries(ev.context);
      if (!entries) continue;
      if (ev.action === "add") {
        for (const entry of entries) {
          state.contextMap.set(contextEntryKey(entry), entry);
        }
      } else if (ev.action === "delete") {
        for (const entry of entries) {
          state.contextMap.delete(contextEntryKey(entry));
        }
      }
      if (typeof ev.ts === "string") state.updatedAt = ev.ts;
      state.lastSeq = ev.seq;
      continue;
    }
  }

  return [...states.entries()]
    .map(([currentKey, state]) => {
      const aliases = resolver.aliasesFor(currentKey);
      const context =
        state.contextMap.size > 0 ? [...state.contextMap.values()] : undefined;
      const result: ThreadState = {
        thread: state.thread,
        ...(state.title !== undefined ? { title: state.title } : {}),
        status: state.status,
        labels: state.labels,
        ...(state.description !== undefined
          ? { description: state.description }
          : {}),
        ...(context !== undefined ? { context } : {}),
        ...(state.summary !== undefined ? { summary: state.summary } : {}),
        ...(state.openedAt !== undefined ? { openedAt: state.openedAt } : {}),
        ...(state.updatedAt !== undefined ? { updatedAt: state.updatedAt } : {}),
        lastSeq: state.lastSeq,
        comments: state.comments,
        aliases,
      };
      return result;
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

function applyThreadAction(
  current: ThreadInternalState,
  ev: ThreadChannelEvent,
): void {
  switch (ev.action) {
    case "opened":
      current.status = typeof ev.status === "string" ? ev.status : "open";
      if (typeof ev.title === "string") current.title = ev.title;
      if (typeof ev.description === "string") {
        current.description = ev.description;
      }
      {
        const initial =
          asContextEntries(ev.context) ?? asContextEntries(ev.linkedContext);
        if (initial) {
          current.contextMap.clear();
          for (const entry of initial) {
            current.contextMap.set(contextEntryKey(entry), entry);
          }
        }
      }
      current.labels = asStringArray(ev.labels) ?? current.labels;
      return;
    case "comment":
      current.comments += 1;
      return;
    case "status":
      if (typeof ev.status === "string") current.status = ev.status;
      return;
    case "labels":
      current.labels = asStringArray(ev.labels) ?? current.labels;
      return;
    case "summary":
      if (typeof ev.summary === "string") current.summary = ev.summary;
      return;
    case "processed":
      current.status = typeof ev.status === "string" ? ev.status : "processed";
      return;
    case "rename":
      // Rename handled by the alias resolver; nothing to do here.
      return;
    default:
      return;
  }
}

/**
 * Return the timeline events that belong to a given thread (or any of
 * its rename aliases), in seq order. Includes thread events and
 * thread-targeted context events.
 */
export function collectThreadTimeline(
  events: ChannelEvent[],
  threadKey: string,
): (ThreadChannelEvent | ContextChannelEvent)[] {
  const resolver = buildThreadAliasResolver(events);
  const current = resolver.resolve(threadKey);
  const aliases = new Set([current, ...resolver.aliasesFor(current)]);

  const out: (ThreadChannelEvent | ContextChannelEvent)[] = [];
  for (const ev of events) {
    if (isThreadEvent(ev)) {
      if (aliases.has(ev.thread)) out.push(ev);
      continue;
    }
    if (isContextEvent(ev) && ev.target === "thread" && ev.thread) {
      if (aliases.has(ev.thread)) out.push(ev);
    }
  }
  return out;
}
