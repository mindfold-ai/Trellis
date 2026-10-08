import {
  readChannelEvents as readEventsInternal,
  type ChannelEvent,
  type ContextChannelEvent,
  type ReadChannelEventsPagination,
  type ThreadChannelEvent,
} from "../internal/store/events.js";
import { reduceChannelMetadata } from "../internal/store/channel-metadata.js";
import {
  collectThreadTimeline,
  reduceThreads,
  type ThreadState,
} from "../internal/store/thread-state.js";
import { normalizeThreadKey } from "../internal/store/schema.js";
import type { ChannelMetadata } from "../internal/store/schema.js";
import { readForumChannelEvents } from "./assert.js";
import { resolveChannelRef } from "./resolve.js";
import type { ChannelAddressOptions } from "./types.js";

/**
 * Cursor pagination options. Omitting all of them returns every event,
 * preserving the read-all default for existing callers.
 */
export interface ReadChannelEventsOptions
  extends ChannelAddressOptions,
    ReadChannelEventsPagination {}

export async function readChannelEvents(
  opts: ReadChannelEventsOptions,
): Promise<ChannelEvent[]> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  return readEventsInternal(opts.channel, ref.project, {
    ...(opts.afterSeq !== undefined ? { afterSeq: opts.afterSeq } : {}),
    ...(opts.beforeSeq !== undefined ? { beforeSeq: opts.beforeSeq } : {}),
    ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
  }, opts.cwd);
}

export async function readChannelMetadata(
  opts: ChannelAddressOptions,
): Promise<ChannelMetadata> {
  const events = await readChannelEvents(opts);
  return reduceChannelMetadata(events);
}

export async function listForumThreads(
  opts: ChannelAddressOptions,
): Promise<ThreadState[]> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const events = await readForumChannelEvents(
    opts.channel,
    ref.project,
    "forum",
    opts.cwd,
  );
  return reduceThreads(events);
}

export async function showThread(
  opts: ChannelAddressOptions & { thread: string },
): Promise<(ThreadChannelEvent | ContextChannelEvent)[]> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const events = await readForumChannelEvents(
    opts.channel,
    ref.project,
    "thread",
    opts.cwd,
  );
  return collectThreadTimeline(events, normalizeThreadKey(opts.thread));
}
