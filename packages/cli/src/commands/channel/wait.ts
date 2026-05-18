import { parseChannelKinds } from "./store/events.js";
import { resolveExistingChannelRef } from "./store/paths.js";
import {
  normalizeThreadKey,
  parseCsv,
  parseChannelScope,
  parseThreadAction,
} from "./store/schema.js";
import { watchEvents, type WatchFilter } from "./store/watch.js";

export interface WaitOptions {
  as: string;
  timeoutMs?: number;
  from?: string;
  kind?: string;
  to?: string;
  scope?: string;
  thread?: string;
  action?: string;
  includeProgress?: boolean;
  /** Wait until every agent in --from has produced a matching event. */
  all?: boolean;
}

const TIMEOUT_EXIT_CODE = 124;

export async function channelWait(
  channelName: string,
  opts: WaitOptions,
): Promise<void> {
  const ref = resolveExistingChannelRef(channelName, {
    scope: parseChannelScope(opts.scope),
  });
  const fromList = parseCsv(opts.from);

  if (opts.all && (!fromList || fromList.length === 0)) {
    throw new Error("--all requires --from <a,b,...>");
  }

  const filter: WatchFilter = {
    self: opts.as,
    from: fromList,
    kind: parseChannelKinds(opts.kind),
    to: opts.to ?? opts.as, // default: broadcasts to me + explicit-to-me
    thread: opts.thread ? normalizeThreadKey(opts.thread) : undefined,
    action: opts.action ? parseThreadAction(opts.action) : undefined,
    includeProgress: opts.includeProgress,
  };

  const abort = new AbortController();
  const timer = opts.timeoutMs
    ? setTimeout(() => abort.abort(), opts.timeoutMs)
    : undefined;

  // --all: wait for one matching event from EACH named agent before returning.
  // Without --all: return on the first matching event (legacy semantics).
  const pending = opts.all ? new Set(fromList) : null;

  try {
    for await (const ev of watchEvents(channelName, filter, {
      signal: abort.signal,
      project: ref.project,
    })) {
      console.log(JSON.stringify(ev));
      if (!pending) return;
      pending.delete(ev.by);
      if (pending.size === 0) return;
    }
    // Iterator ended without satisfying — timeout
    if (pending && pending.size > 0) {
      process.stderr.write(
        `timeout: still waiting on ${[...pending].join(",")}\n`,
      );
    }
    process.exitCode = TIMEOUT_EXIT_CODE;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Parse a duration like "30s", "2m", "1h" into milliseconds. */
export function parseDuration(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = /^(\d+)(ms|s|m|h)?$/.exec(s.trim());
  if (!m) {
    throw new Error(`Invalid duration: ${s} (use Ns / Nm / Nh / Nms)`);
  }
  const n = Number(m[1]);
  switch (m[2] ?? "s") {
    case "ms":
      return n;
    case "s":
      return n * 1000;
    case "m":
      return n * 60_000;
    case "h":
      return n * 3_600_000;
    default:
      return n * 1000;
  }
}
