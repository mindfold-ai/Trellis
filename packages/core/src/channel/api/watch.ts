import {
  watchEvents,
  type WatchFilter,
} from "../internal/store/watch.js";
import type { ChannelEvent } from "../internal/store/events.js";
import { resolveChannelRef } from "./resolve.js";
import type { ChannelAddressOptions } from "./types.js";

export interface WatchChannelOptions extends ChannelAddressOptions {
  filter?: WatchFilter;
  signal?: AbortSignal;
  fromStart?: boolean;
  sinceSeq?: number;
}

export function watchChannelEvents(
  opts: WatchChannelOptions,
): AsyncGenerator<ChannelEvent, void, unknown> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  return watchEvents(opts.channel, opts.filter ?? {}, {
    project: ref.project,
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    ...(opts.fromStart !== undefined ? { fromStart: opts.fromStart } : {}),
    ...(opts.sinceSeq !== undefined ? { sinceSeq: opts.sinceSeq } : {}),
  });
}
