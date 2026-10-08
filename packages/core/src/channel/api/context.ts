import {
  appendEvent,
  readChannelEvents,
  type ContextChannelEvent,
} from "../internal/store/events.js";
import { reduceChannelMetadata } from "../internal/store/channel-metadata.js";
import {
  normalizeThreadKey,
  type ContextEntry,
} from "../internal/store/schema.js";
import {
  reduceThreads,
  type ThreadState,
} from "../internal/store/thread-state.js";
import { readForumChannelEvents } from "./assert.js";
import { resolveChannelRef } from "./resolve.js";
import type {
  ContextMutationOptions,
  ThreadContextMutationOptions,
} from "./types.js";

async function appendContextEvent(
  ref: { name: string; project: string },
  by: string,
  action: "add" | "delete",
  target: "channel" | "thread",
  context: ContextEntry[],
  thread: string | undefined,
  origin: ContextMutationOptions["origin"],
  meta: ContextMutationOptions["meta"],
  cwd?: string,
): Promise<ContextChannelEvent> {
  if (!context || context.length === 0) {
    throw new Error("context must contain at least one entry");
  }
  const event = await appendEvent(
    ref.name,
    {
      kind: "context",
      by,
      target,
      action,
      context,
      ...(thread !== undefined ? { thread } : {}),
      ...(origin !== undefined ? { origin } : {}),
      ...(meta !== undefined ? { meta } : {}),
    },
    ref.project,
    cwd,
  );
  return event as ContextChannelEvent;
}

export async function addChannelContext(
  opts: ContextMutationOptions,
): Promise<ContextChannelEvent> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  return appendContextEvent(
    { name: opts.channel, project: ref.project },
    opts.by,
    "add",
    "channel",
    opts.context,
    undefined,
    opts.origin,
    opts.meta,
    opts.cwd,
  );
}

export async function deleteChannelContext(
  opts: ContextMutationOptions,
): Promise<ContextChannelEvent> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  return appendContextEvent(
    { name: opts.channel, project: ref.project },
    opts.by,
    "delete",
    "channel",
    opts.context,
    undefined,
    opts.origin,
    opts.meta,
    opts.cwd,
  );
}

export async function listChannelContext(
  opts: {
    channel: string;
    scope?: ContextMutationOptions["scope"];
    projectKey?: string;
    cwd?: string;
  },
): Promise<ContextEntry[]> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const events = await readChannelEvents(opts.channel, ref.project, undefined, opts.cwd);
  const meta = reduceChannelMetadata(events);
  return meta.context ?? [];
}

export async function addThreadContext(
  opts: ThreadContextMutationOptions,
): Promise<ContextChannelEvent> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const thread = normalizeThreadKey(opts.thread);
  const states = reduceThreads(
    await readForumChannelEvents(opts.channel, ref.project, "context add", opts.cwd),
  );
  assertKnownThread(states, thread, opts.channel);
  return appendContextEvent(
    { name: opts.channel, project: ref.project },
    opts.by,
    "add",
    "thread",
    opts.context,
    thread,
    opts.origin,
    opts.meta,
    opts.cwd,
  );
}

export async function deleteThreadContext(
  opts: ThreadContextMutationOptions,
): Promise<ContextChannelEvent> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const thread = normalizeThreadKey(opts.thread);
  const states = reduceThreads(
    await readForumChannelEvents(opts.channel, ref.project, "context delete", opts.cwd),
  );
  assertKnownThread(states, thread, opts.channel);
  return appendContextEvent(
    { name: opts.channel, project: ref.project },
    opts.by,
    "delete",
    "thread",
    opts.context,
    thread,
    opts.origin,
    opts.meta,
    opts.cwd,
  );
}

export async function listThreadContext(opts: {
  channel: string;
  thread: string;
  scope?: ContextMutationOptions["scope"];
  projectKey?: string;
  cwd?: string;
}): Promise<ContextEntry[]> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const events = await readForumChannelEvents(
    opts.channel,
    ref.project,
    "context list",
    opts.cwd,
  );
  const states = reduceThreads(events);
  const key = normalizeThreadKey(opts.thread);
  for (const state of states) {
    if (state.thread === key || state.aliases.includes(key)) {
      return state.context ?? [];
    }
  }
  return [];
}

function assertKnownThread(
  states: ThreadState[],
  thread: string,
  channel: string,
): void {
  const found = states.some(
    (state) => state.thread === thread || state.aliases.includes(thread),
  );
  if (!found) {
    throw new Error(`Thread '${thread}' not found in channel '${channel}'.`);
  }
}
