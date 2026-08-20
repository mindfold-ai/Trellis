/**
 * Channel events local module.
 *
 * Canonical types, reducers, and seq-allocating append come from
 * `@mindfoldhq/trellis-core`. Supervisor / spawn / kill still import
 * `appendEvent` from here so their call sites stay stable; the
 * implementation is core's, including torn-tail seq recovery.
 *
 * `readChannelEvents` stays a CLI-local full-file reader until those
 * callers move to core's paginated API.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";

import {
  reduceChannelMetadata,
  type ChannelEvent,
  type ChannelMetadata,
} from "@mindfoldhq/trellis-core/channel";

import { eventsPath } from "./paths.js";

export {
  CHANNEL_EVENT_KINDS,
  parseChannelKind,
  parseChannelKinds,
  isCreateEvent,
  isThreadEvent,
  isContextEvent,
  isChannelMetadataEvent,
  reduceChannelMetadata,
  appendEvent,
  readLastSeq,
} from "@mindfoldhq/trellis-core/channel";

export type {
  ChannelEvent,
  ChannelEventKind,
  CreateChannelEvent,
  MessageChannelEvent,
  ThreadChannelEvent,
  ContextChannelEvent,
  ChannelMetadataEvent,
  SpawnedChannelEvent,
  KilledChannelEvent,
  DoneChannelEvent,
  ErrorChannelEvent,
  ProgressChannelEvent,
  SupervisorWarningChannelEvent,
  AppendablePartial,
} from "@mindfoldhq/trellis-core/channel";

export async function readChannelEvents(
  name: string,
  project?: string,
): Promise<ChannelEvent[]> {
  const file = eventsPath(name, project);
  if (!fs.existsSync(file)) return [];
  const text = await fsp.readFile(file, "utf-8");
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

/**
 * Read projected channel metadata from disk. Delegates to the core
 * reducer so list / messages / forum commands share projection
 * semantics with downstream consumers.
 */
export async function readChannelMetadata(
  name: string,
  project?: string,
): Promise<ChannelMetadata> {
  return reduceChannelMetadata(await readChannelEvents(name, project));
}
