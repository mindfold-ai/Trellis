import {
  appendEvent,
  type ChannelMetadataEvent,
} from "../internal/store/events.js";
import { resolveChannelRef } from "./resolve.js";
import type {
  ClearChannelTitleOptions,
  SetChannelTitleOptions,
} from "./types.js";

export async function setChannelTitle(
  opts: SetChannelTitleOptions,
): Promise<ChannelMetadataEvent> {
  if (!opts.title || opts.title.length === 0) {
    throw new Error("Channel title must not be empty (use clearChannelTitle)");
  }
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const event = await appendEvent(
    opts.channel,
    {
      kind: "channel",
      action: "title",
      by: opts.by,
      title: opts.title,
      ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
      ...(opts.meta !== undefined ? { meta: opts.meta } : {}),
    },
    ref.project,
    opts.cwd,
  );
  return event as ChannelMetadataEvent;
}

export async function clearChannelTitle(
  opts: ClearChannelTitleOptions,
): Promise<ChannelMetadataEvent> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const event = await appendEvent(
    opts.channel,
    {
      kind: "channel",
      action: "title",
      by: opts.by,
      title: null,
      ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
      ...(opts.meta !== undefined ? { meta: opts.meta } : {}),
    },
    ref.project,
    opts.cwd,
  );
  return event as ChannelMetadataEvent;
}
