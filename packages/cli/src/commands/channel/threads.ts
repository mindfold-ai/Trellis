import {
  buildContextEntries,
  listForumThreads as coreListForumThreads,
  showThread as coreShowThread,
  postThread as corePostThread,
  reduceThreads,
  renameThread as coreRenameThread,
  type ChannelScope,
  type ContextChannelEvent,
  type ThreadChannelEvent,
} from "@mindfoldhq/trellis-core/channel";

import {
  parseChannelScope,
  parseThreadAction,
  type ThreadAction,
} from "./store/schema.js";
import { parseCsv } from "./store/schema.js";
import { formatThreadBoard } from "./store/thread-state.js";
import { resolveChannelTextBody } from "./text-body.js";

export interface ThreadPostOptions {
  as: string;
  action: string;
  thread?: string;
  title?: string;
  text?: string;
  stdin?: boolean;
  textFile?: string;
  description?: string;
  status?: string;
  labels?: string;
  summary?: string;
  scope?: string;
  /** New canonical flag list. */
  contextFile?: string[];
  contextRaw?: string[];
  /** Legacy aliases accepted while users migrate scripts. */
  linkedContextFile?: string[];
  linkedContextRaw?: string[];
}

export interface ForumOptions {
  scope?: string;
  status?: string;
  raw?: boolean;
}

export interface ThreadShowOptions {
  scope?: string;
  raw?: boolean;
}

export interface ThreadRenameOptions {
  as: string;
  scope?: string;
}

export async function channelThreadPost(
  channelName: string,
  opts: ThreadPostOptions,
): Promise<void> {
  const parsed = parseThreadAction(opts.action);
  if (parsed === "rename") {
    throw new Error(
      "Use `trellis channel thread rename <channel> <old> <new>` instead of `post rename`.",
    );
  }
  const action = parsed as Exclude<ThreadAction, "rename">;

  const context = buildContextEntries(
    [...(opts.contextFile ?? []), ...(opts.linkedContextFile ?? [])],
    [...(opts.contextRaw ?? []), ...(opts.linkedContextRaw ?? [])],
  );
  const labels = parseCsv(opts.labels);
  const text = await resolveChannelTextBody(opts, {
    required: false,
    missingMessage: "No text provided (use --text, --stdin, or --text-file)",
    emptyMessage: "Empty thread event text",
  });

  const scope: ChannelScope | undefined = parseChannelScope(opts.scope);

  const event = await corePostThread({
    channel: channelName,
    by: opts.as,
    action,
    thread: opts.thread ?? "",
    ...(scope !== undefined ? { scope } : {}),
    ...(opts.title ? { title: opts.title } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(labels ? { labels } : {}),
    ...(opts.summary ? { summary: opts.summary } : {}),
    ...(context ? { context } : {}),
    origin: "cli",
  });
  console.log(JSON.stringify(event));
}

export async function channelForumList(
  channelName: string,
  opts: ForumOptions,
): Promise<void> {
  const scope: ChannelScope | undefined = parseChannelScope(opts.scope);
  const states = (
    await coreListForumThreads({
      channel: channelName,
      ...(scope !== undefined ? { scope } : {}),
    })
  ).filter((state) => (opts.status ? state.status === opts.status : true));
  if (opts.raw) {
    for (const state of states) console.log(JSON.stringify(state));
    return;
  }
  for (const line of formatThreadBoard(states)) console.log(line);
}

export async function channelThreadShow(
  channelName: string,
  threadKey: string,
  opts: ThreadShowOptions,
): Promise<void> {
  const scope: ChannelScope | undefined = parseChannelScope(opts.scope);
  const events = await coreShowThread({
    channel: channelName,
    thread: threadKey,
    ...(scope !== undefined ? { scope } : {}),
  });
  if (opts.raw) {
    for (const ev of events) console.log(JSON.stringify(ev));
    return;
  }
  if (events.length === 0) {
    throw new Error(
      `Thread '${threadKey}' not found in channel '${channelName}'`,
    );
  }
  const state = reduceThreads(events)[0];
  console.log(
    `${state.thread} [${state.status}] ${state.title ?? ""}`.trimEnd(),
  );
  if (state.description) console.log(`description: ${state.description}`);
  if (state.labels.length > 0) console.log(`labels: ${state.labels.join(",")}`);
  if (state.summary) console.log(`summary: ${state.summary}`);
  for (const ev of events) printTimelineEvent(ev);
}

export async function channelThreadRename(
  channelName: string,
  oldThread: string,
  newThread: string,
  opts: ThreadRenameOptions,
): Promise<void> {
  const scope: ChannelScope | undefined = parseChannelScope(opts.scope);
  const event = await coreRenameThread({
    channel: channelName,
    by: opts.as,
    thread: oldThread,
    newThread,
    ...(scope !== undefined ? { scope } : {}),
    origin: "cli",
  });
  console.log(JSON.stringify(event));
}

function printTimelineEvent(
  ev: ThreadChannelEvent | ContextChannelEvent,
): void {
  const ts = ev.ts.slice(0, 19).replace("T", " ");
  if (ev.kind === "thread") {
    const action = ev.action ?? "?";
    const text = ev.text ? ` ${ev.text}` : "";
    console.log(`  ${ts} ${action} by=${ev.by}${text}`);
    return;
  }
  // context event
  const action = ev.action ?? "?";
  console.log(`  ${ts} context-${action} by=${ev.by}`);
}
