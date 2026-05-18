import fs from "node:fs";

import chalk from "chalk";

import {
  parseChannelKind,
  readChannelEvents,
  readChannelMetadata,
  type ChannelEvent,
} from "./store/events.js";
import { matchesEventFilter } from "./store/filter.js";
import { eventsPath, resolveExistingChannelRef } from "./store/paths.js";
import {
  type ContextEntry,
  normalizeThreadKey,
  parseCsv,
  parseChannelScope,
  parseThreadAction,
  type ThreadAction,
} from "./store/schema.js";
import { formatThreadBoard, reduceThreads } from "./store/thread-state.js";
import { watchEvents } from "./store/watch.js";

export interface MessagesOptions {
  raw?: boolean;
  follow?: boolean;
  last?: number;
  since?: number;
  kind?: string;
  from?: string;
  to?: string;
  noProgress?: boolean;
  scope?: string;
  thread?: string;
  action?: string;
}

export async function channelMessages(
  channelName: string,
  opts: MessagesOptions,
): Promise<void> {
  const ref = resolveExistingChannelRef(channelName, {
    scope: parseChannelScope(opts.scope),
  });
  const file = eventsPath(channelName, ref.project);
  if (!fs.existsSync(file)) {
    throw new Error(`Channel '${channelName}' not found at ${file}`);
  }

  const all = await readChannelEvents(channelName, ref.project);

  const fromList = parseCsv(opts.from);

  // Validate --kind against whitelist up front so typos fail fast.
  const kindFilter = parseChannelKind(opts.kind);
  const threadFilter = opts.thread
    ? normalizeThreadKey(opts.thread)
    : undefined;
  const actionFilter: ThreadAction | undefined = opts.action
    ? parseThreadAction(opts.action)
    : undefined;
  const metadata = await readChannelMetadata(channelName, ref.project);
  if (metadata.type === "chat" && (threadFilter || actionFilter)) {
    throw new Error(
      `Channel '${channelName}' is type 'chat'. --thread/--action require a forum channel.`,
    );
  }

  const filter = {
    kind: kindFilter,
    from: fromList,
    to: opts.to,
    thread: threadFilter,
    action: actionFilter,
    includeProgress: !opts.noProgress,
    includeNonMeaningful: true,
  };
  const filtered = all.filter((ev) => {
    if (opts.since !== undefined && ev.seq <= opts.since) return false;
    return matchesEventFilter(ev, filter);
  });

  const view = opts.last ? filtered.slice(-opts.last) : filtered;
  const threadBoardView =
    !opts.raw &&
    metadata.type === "forum" &&
    !threadFilter &&
    !kindFilter &&
    !actionFilter &&
    !opts.from &&
    !opts.to;
  if (threadBoardView) {
    console.log(
      "Forum channel: showing threads. Use --thread <key> for timeline, --raw for event log.",
    );
    printThreadBoard(view);
  } else {
    for (const ev of view) printEvent(ev, opts.raw ?? false);
  }

  if (opts.follow) {
    const abort = new AbortController();
    process.on("SIGINT", () => abort.abort());
    for await (const ev of watchEvents(channelName, filter, {
      signal: abort.signal,
      project: ref.project,
    })) {
      printEvent(ev, opts.raw ?? false);
    }
  }
}

function printEvent(ev: ChannelEvent, raw: boolean): void {
  if (raw) {
    console.log(JSON.stringify(ev));
    return;
  }
  const ts = (ev.ts || "").slice(11, 19);
  const by = colorBy(ev.by);
  switch (ev.kind) {
    case "create": {
      const cwd = ev.cwd ?? "";
      const task = ev.task ?? "";
      printLine(
        `${kindTag("create")} by=${by}  cwd=${cwd}${task ? "  task=" + task : ""}`,
        ts,
      );
      if (ev.description)
        console.log(`         ${chalk.dim("description:")} ${ev.description}`);
      printContext(ev.context ?? ev.linkedContext);
      break;
    }
    case "spawned": {
      const as = ev.as ?? "?";
      const provider = ev.provider ?? "?";
      const pid = ev.pid ?? "?";
      const agent = ev.agent;
      const files = ev.files;
      const manifests = ev.manifests;
      const agentStr = agent ? `  agent=${chalk.magenta(agent)}` : "";
      printLine(
        `${kindTag("spawned")} by=${by}  worker=${colorTo(as)} provider=${provider}${agentStr} pid=${pid}`,
        ts,
      );
      if (files && files.length > 0) {
        console.log(`         ${chalk.dim("files:")} ${files.join(", ")}`);
      }
      if (manifests && manifests.length > 0) {
        console.log(
          `         ${chalk.dim("manifests:")} ${manifests.join(", ")}`,
        );
      }
      break;
    }
    case "killed": {
      const reason = ev.reason ?? "?";
      const sig = ev.signal ?? "?";
      printLine(
        `${kindTag("killed")} by=${by}  reason=${reason} signal=${sig}`,
        ts,
      );
      break;
    }
    case "message": {
      const text = (ev.text ?? "").replace(/\n/g, "\n         ");
      const to = ev.to;
      const toStr = to
        ? `  to=${colorTo(Array.isArray(to) ? to.join(",") : to)}`
        : "";
      printLine(`${kindTag("message")} by=${by}${toStr}`, ts);
      console.log(`         ${text}`);
      break;
    }
    case "thread": {
      const action = ev.action ?? "?";
      const text = (ev.text ?? "").replace(/\n/g, "\n         ");
      printLine(`${kindTag("thread")} by=${by}  ${action} ${ev.thread}`, ts);
      if (ev.description)
        console.log(`         ${chalk.dim("description:")} ${ev.description}`);
      printContext(ev.context ?? ev.linkedContext);
      if (text) console.log(`         ${text}`);
      break;
    }
    case "done": {
      const dur = ev.duration_ms;
      printLine(
        `${kindTag("done")} by=${by}${dur !== undefined ? "  duration=" + dur + "ms" : ""}`,
        ts,
      );
      break;
    }
    case "error": {
      const msg = ev.message ?? "";
      printLine(`${kindTag("error")} by=${by}  ${msg}`, ts);
      break;
    }
    case "progress": {
      const detail = ev.detail ?? {};
      const summary = summarizeProgress(detail);
      printLine(`${kindTag("progress")} by=${by}  ${summary}`, ts);
      break;
    }
    case "supervisor_warning": {
      const worker = typeof ev.worker === "string" ? ev.worker : "?";
      const reason = typeof ev.reason === "string" ? ev.reason : "?";
      const remaining =
        typeof ev.remaining_ms === "number" ? ev.remaining_ms : undefined;
      const timeout =
        typeof ev.timeout_ms === "number" ? ev.timeout_ms : undefined;
      const remainingStr =
        remaining !== undefined ? `  remaining=${remaining}ms` : "";
      const timeoutStr = timeout !== undefined ? `  timeout=${timeout}ms` : "";
      printLine(
        `${kindTag("supervisor_warning")} by=${by}  worker=${colorTo(worker)} reason=${reason}${remainingStr}${timeoutStr}`,
        ts,
      );
      break;
    }
    default: {
      printLine(`${kindTag(ev.kind)} by=${by}`, ts);
    }
  }
}

function printContext(context: ContextEntry[] | undefined): void {
  if (!context || context.length === 0) return;
  for (const entry of context) {
    const detail =
      entry.type === "file" ? entry.path : summarizeContextText(entry.text);
    console.log(`         ${chalk.dim(`context:${entry.type}:`)} ${detail}`);
  }
}

function summarizeContextText(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 100 ? `${oneLine.slice(0, 100)}...` : oneLine;
}

function printThreadBoard(events: ChannelEvent[]): void {
  for (const line of formatThreadBoard(reduceThreads(events))) {
    console.log(line);
  }
}

/**
 * Print `body` right-padded with `ts` at the terminal's right edge. The ANSI
 * escape codes don't count toward visible width, so we strip them before
 * computing the pad amount.
 */
function printLine(body: string, ts: string): void {
  const width = process.stdout.columns || 100;
  // eslint-disable-next-line no-control-regex
  const visible = body.replace(/\x1b\[[0-9;]*m/g, "").length;
  const tsCols = ts.length; // "HH:MM:SS" = 8
  const gap = Math.max(2, width - visible - tsCols);
  console.log(body + " ".repeat(gap) + chalk.dim(ts));
}

function colorBy(name: string): string {
  if (name === "main") return chalk.magenta(name);
  if (name.startsWith("supervisor:") || name.startsWith("cli:")) {
    return chalk.gray(name);
  }
  return chalk.cyan(name);
}

function colorTo(name: string): string {
  return chalk.greenBright(name);
}

function kindTag(k: string): string {
  const padded = `[${k}]`.padEnd(10);
  switch (k) {
    case "done":
      return chalk.green(padded);
    case "error":
    case "killed":
      return chalk.red(padded);
    case "spawned":
      return chalk.cyan(padded);
    case "respawned":
      return chalk.cyan(padded);
    case "message":
      return chalk.yellow(padded);
    case "thread":
      return chalk.blue(padded);
    case "progress":
      return chalk.gray(padded);
    case "create":
      return chalk.blueBright(padded);
    case "supervisor_warning":
      return chalk.yellow(padded);
    default:
      return padded;
  }
}

function summarizeProgress(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["kind", "tool", "tool_name", "server", "status", "cmd"]) {
    if (detail[key] !== undefined) {
      const v = String(detail[key]);
      parts.push(`${key}=${v.length > 60 ? v.slice(0, 60) + "…" : v}`);
    }
  }
  if (detail.text_delta) {
    const t = String(detail.text_delta);
    parts.push(`delta="${t.length > 40 ? t.slice(0, 40) + "…" : t}"`);
  }
  return parts.join(" ");
}
