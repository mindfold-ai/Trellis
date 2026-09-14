import fs from "node:fs";
import path from "node:path";
import { assertActiveDataPath } from "../../retired-data.js";

import {
  appendEvent,
  type CreateChannelEvent,
} from "../internal/store/events.js";
import {
  channelDir,
  ensureBucketMarker,
  eventsPath,
} from "../internal/store/paths.js";
import { parseChannelType } from "../internal/store/schema.js";
import { resolveChannelRef } from "./resolve.js";
import type { CreateChannelOptions } from "./types.js";

/**
 * Create a new channel. Throws when the channel already exists unless
 * `force` is set, in which case the existing channel directory is wiped
 * before the create event is appended.
 */
export async function createChannel(
  opts: CreateChannelOptions,
): Promise<CreateChannelEvent> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    scope: opts.scope ?? "project",
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    forCreate: true,
  });
  const channelType = parseChannelType(opts.type);
  const events = eventsPath(opts.channel, ref.project, opts.cwd);
  const dir = ref.dir;

  if (fs.existsSync(events) && !opts.force) {
    throw new Error(
      `Channel '${opts.channel}' already exists at ${dir}. Use --force to overwrite.`,
    );
  }

  if (opts.force && fs.existsSync(dir)) {
    await forceCleanChannel(opts.channel, ref.project, opts.cwd);
  }

  ensureBucketMarker(ref.project, opts.cwd);

  const cwd = opts.cwd ?? process.cwd();

  const event = await appendEvent(
    opts.channel,
    {
      kind: "create",
      by: opts.by,
      cwd,
      scope: ref.scope,
      type: channelType,
      ...(opts.task ? { task: opts.task } : {}),
      ...(opts.project ? { project: opts.project } : {}),
      ...(opts.labels && opts.labels.length > 0 ? { labels: opts.labels } : {}),
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.context && opts.context.length > 0
        ? { context: opts.context }
        : {}),
      ...(opts.ephemeral ? { ephemeral: true } : {}),
      ...(opts.origin ? { origin: opts.origin } : {}),
      ...(opts.meta ? { meta: opts.meta } : {}),
    },
    ref.project,
    cwd,
  );
  return event as CreateChannelEvent;
}

async function forceCleanChannel(name: string, project: string, cwd: string = process.cwd()): Promise<void> {
  const dir = channelDir(name, project, cwd);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const f of entries) {
    if (!f.endsWith(".pid")) continue;
    const pidFile = path.join(dir, f);
    assertActiveDataPath(pidFile, cwd);
    let pid = 0;
    try {
      pid = Number(fs.readFileSync(pidFile, "utf-8").trim());
    } catch {
      continue;
    }
    if (pid && pidAlive(pid)) {
      try {
        process.kill(pid, "SIGTERM");
        const deadline = Date.now() + 1500;
        while (pidAlive(pid) && Date.now() < deadline) {
          await sleep(50);
        }
        if (pidAlive(pid)) process.kill(pid, "SIGKILL");
      } catch {
        // already dead
      }
    }
  }

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    process.stderr.write(
      `[channel create --force] warning: failed to fully clean ${dir}: ${err instanceof Error ? err.message : err}\n`,
    );
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
