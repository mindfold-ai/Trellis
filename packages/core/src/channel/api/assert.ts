import {
  readChannelEvents,
  type ChannelEvent,
} from "../internal/store/events.js";
import { reduceChannelMetadata } from "../internal/store/channel-metadata.js";

export async function readForumChannelEvents(
  channel: string,
  project: string,
  operation: string,
  cwd?: string,
): Promise<ChannelEvent[]> {
  const events = await readChannelEvents(channel, project, undefined, cwd);
  const metadata = reduceChannelMetadata(events);
  if (metadata.type !== "forum") {
    throw new Error(
      `Channel '${channel}' is type '${metadata.type}'. '${operation}' requires a forum channel.`,
    );
  }
  return events;
}
