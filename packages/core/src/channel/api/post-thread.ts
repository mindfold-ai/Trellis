import {
  appendEvent,
  type ThreadChannelEvent,
} from "../internal/store/events.js";
import { normalizeThreadKey } from "../internal/store/schema.js";
import {
  buildThreadAliasResolver,
} from "../internal/store/thread-state.js";
import { readForumChannelEvents } from "./assert.js";
import { resolveChannelRef } from "./resolve.js";
import type { PostThreadOptions, RenameThreadOptions } from "./types.js";

const VALID_ACTIONS: ReadonlySet<PostThreadOptions["action"]> = new Set([
  "opened",
  "comment",
  "status",
  "labels",
  "assignees",
  "summary",
  "processed",
]);

/**
 * Append a structured thread event. Throws when the channel is not of
 * `forum` type, when `action` is invalid, or when a non-`opened` event
 * is missing a thread key.
 */
export async function postThread(
  opts: PostThreadOptions,
): Promise<ThreadChannelEvent> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  if (!VALID_ACTIONS.has(opts.action)) {
    throw new Error(
      `Invalid thread action '${opts.action}'. Must be one of: ${[...VALID_ACTIONS].join(", ")}`,
    );
  }
  await readForumChannelEvents(opts.channel, ref.project, "post", opts.cwd);
  const thread = resolveThreadKey(opts.action, opts.thread);
  const event = await appendEvent(
    opts.channel,
    {
      kind: "thread",
      by: opts.by,
      ...(opts.idempotencyKey !== undefined
        ? { idempotencyKey: opts.idempotencyKey }
        : {}),
      action: opts.action,
      thread,
      ...(opts.title !== undefined ? { title: opts.title } : {}),
      ...(opts.text !== undefined ? { text: opts.text } : {}),
      ...(opts.description !== undefined
        ? { description: opts.description }
        : {}),
      ...(opts.status !== undefined ? { status: opts.status } : {}),
      ...(opts.labels !== undefined ? { labels: opts.labels } : {}),
      ...(opts.assignees !== undefined ? { assignees: opts.assignees } : {}),
      ...(opts.summary !== undefined ? { summary: opts.summary } : {}),
      ...(opts.context !== undefined && opts.context.length > 0
        ? { context: opts.context }
        : {}),
      ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
      ...(opts.meta !== undefined ? { meta: opts.meta } : {}),
    },
    ref.project,
    opts.cwd,
  );
  return event as ThreadChannelEvent;
}

function resolveThreadKey(
  action: PostThreadOptions["action"],
  value: string | undefined,
): string {
  if (value) return normalizeThreadKey(value);
  if (action === "opened") return `thread-${Date.now().toString(36)}`;
  throw new Error("--thread is required unless action is 'opened'");
}

/**
 * Rename a thread. Records a `kind:"thread", action:"rename"` event so
 * subsequent reducers can flatten alias chains.
 */
export async function renameThread(
  opts: RenameThreadOptions,
): Promise<ThreadChannelEvent> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const events = await readForumChannelEvents(
    opts.channel,
    ref.project,
    "thread rename",
    opts.cwd,
  );
  const oldKey = normalizeThreadKey(opts.thread);
  const newKey = normalizeThreadKey(opts.newThread);
  if (oldKey === newKey) {
    throw new Error("Old and new thread keys are identical");
  }
  // Reject renames that would silently merge two existing threads.
  const resolver = buildThreadAliasResolver(events);
  const oldCurrent = resolver.resolve(oldKey);
  const currentTarget = resolver.resolve(newKey);
  const knownKeys = new Set<string>();
  for (const ev of events) {
    if (
      ev.kind === "thread" &&
      typeof (ev as ThreadChannelEvent).thread === "string"
    ) {
      knownKeys.add(
        resolver.resolve((ev as ThreadChannelEvent).thread),
      );
    }
  }
  if (!knownKeys.has(oldCurrent)) {
    throw new Error(
      `Thread '${oldKey}' not found in channel '${opts.channel}'.`,
    );
  }
  if (knownKeys.has(currentTarget) && currentTarget !== oldCurrent) {
    throw new Error(
      `Thread '${newKey}' already exists in channel '${opts.channel}'. Refusing to merge two timelines.`,
    );
  }

  const event = await appendEvent(
    opts.channel,
    {
      kind: "thread",
      by: opts.by,
      action: "rename",
      thread: oldKey,
      newThread: newKey,
      ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
      ...(opts.meta !== undefined ? { meta: opts.meta } : {}),
    },
    ref.project,
    opts.cwd,
  );
  return event as ThreadChannelEvent;
}
