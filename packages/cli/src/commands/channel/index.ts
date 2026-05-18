import chalk from "chalk";
import { InvalidArgumentError, type Command } from "commander";

import { isProvider, listProviders, type Provider } from "./adapters/index.js";
import {
  channelContextAdd,
  channelContextDelete,
  channelContextList,
} from "./context.js";
import { createChannel } from "./create.js";
import { parseTrace } from "./dev-parse-trace.js";
import { channelKill } from "./kill.js";
import { channelInterrupt } from "./interrupt.js";
import { channelList } from "./list.js";
import { channelMessages } from "./messages.js";
import { channelPrune, channelRm } from "./rm.js";
import { channelSend } from "./send.js";
import { channelRun } from "./run.js";
import { channelSpawn } from "./spawn.js";
import {
  channelThreadPost,
  channelThreadRename,
  channelThreadShow,
  channelForumList,
} from "./threads.js";
import { channelTitleClear, channelTitleSet } from "./title.js";
import { runSupervisor } from "./supervisor.js";
import { channelWait, parseDuration } from "./wait.js";
import { parseCsv } from "./store/schema.js";
import { parseInboxPolicy } from "@mindfoldhq/trellis-core/channel";

function parseNonNegativeInteger(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError(
      `expected a non-negative integer, got '${value}'`,
    );
  }
  return Number(value);
}

export function registerChannelCommand(program: Command): void {
  const channel = program
    .command("channel")
    .description(
      "Multi-agent collaboration runtime — spawn / coordinate / interrupt worker agents through a shared event log",
    );

  channel
    .command("create <name>")
    .description("Create a new channel (collaboration session)")
    .option("--scope <scope>", "channel scope: project | global")
    .option("--type <type>", "channel type: chat | forum", "chat")
    .option("--task <path>", "associated Trellis task directory")
    .option("--project <slug>", "project slug")
    .option("--labels <csv>", "comma-separated labels")
    .option("--description <text>", "stable channel description")
    .option(
      "--context-file <absolute-path>",
      "absolute file path attached as channel context (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option(
      "--context-raw <text>",
      "raw channel context text (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option(
      "--linked-context-file <absolute-path>",
      "[deprecated alias for --context-file] absolute file path (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option(
      "--linked-context-raw <text>",
      "[deprecated alias for --context-raw] raw context text (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option("--cwd <path>", "working directory recorded in the create event")
    .option("--by <agent>", "agent name recorded as the creator", "main")
    .option("--force", "overwrite existing channel with the same name")
    .option(
      "--ephemeral",
      "mark as ephemeral — hidden from `channel list` by default and cleanable via `channel prune --ephemeral`",
    )
    .action(
      async (
        name: string,
        opts: {
          task?: string;
          project?: string;
          labels?: string;
          scope?: string;
          type?: string;
          description?: string;
          contextFile?: string[];
          contextRaw?: string[];
          linkedContextFile?: string[];
          linkedContextRaw?: string[];
          cwd?: string;
          by?: string;
          force?: boolean;
          ephemeral?: boolean;
        },
      ) => {
        try {
          await createChannel(name, opts);
        } catch (err) {
          console.error(
            chalk.red("Error:"),
            err instanceof Error ? err.message : err,
          );
          process.exit(1);
        }
      },
    );

  channel
    .command("send <name>")
    .description("Send a message into the channel")
    .requiredOption("--as <agent>", "agent name sending")
    .option("--scope <scope>", "channel scope: project | global")
    .option(
      "--to <agents>",
      "comma-separated target agents (default: broadcast)",
    )
    .option("--stdin", "read message body from stdin")
    .option("--text-file <path>", "read message body from file")
    .option(
      "--delivery-mode <mode>",
      "targeted delivery validation: appendOnly | requireKnownWorker | requireRunningWorker",
    )
    .argument(
      "[text]",
      "inline text body (otherwise use --stdin / --text-file)",
    )
    .action(
      async (
        name: string,
        text: string | undefined,
        raw: Record<string, unknown>,
      ) => {
        const opts = raw as {
          as: string;
          scope?: string;
          to?: string;
          stdin?: boolean;
          textFile?: string;
          deliveryMode?: string;
        };
        try {
          await channelSend(name, {
            as: opts.as,
            text,
            stdin: opts.stdin,
            textFile: opts.textFile,
            scope: opts.scope,
            to: opts.to,
            deliveryMode: opts.deliveryMode,
          });
        } catch (err) {
          console.error(
            chalk.red("Error:"),
            err instanceof Error ? err.message : err,
          );
          process.exit(1);
        }
      },
    );

  channel
    .command("wait <name>")
    .description("Block until an event matching the filter arrives, or timeout")
    .requiredOption("--as <agent>", "agent name waiting")
    .option("--scope <scope>", "channel scope: project | global")
    .option("--timeout <duration>", "max wait (e.g. 30s, 2m, 1h)")
    .option("--from <agents>", "only wake on events from these agents (CSV)")
    .option(
      "--kind <kind[,kind...]>",
      "only wake on these event kinds (CSV, OR semantics)",
    )
    .option("--thread <key>", "only wake on this thread key")
    .option("--action <action>", "only wake on this thread action")
    .option(
      "--to <target>",
      "only wake on events targeted to this name (default: own agent)",
    )
    .option("--include-progress", "also wake on progress events")
    .option(
      "--all",
      "wait until each agent in --from has produced a matching event (default: first match wins)",
    )
    .action(async (name: string, raw: Record<string, unknown>) => {
      const opts = raw as {
        as: string;
        timeout?: string;
        from?: string;
        kind?: string;
        scope?: string;
        thread?: string;
        action?: string;
        to?: string;
        includeProgress?: boolean;
        all?: boolean;
      };
      try {
        await channelWait(name, {
          as: opts.as,
          timeoutMs: parseDuration(opts.timeout),
          from: opts.from,
          kind: opts.kind,
          scope: opts.scope,
          thread: opts.thread,
          action: opts.action,
          to: opts.to,
          includeProgress: opts.includeProgress,
          all: opts.all,
        });
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  channel
    .command("interrupt <name>")
    .description("Interrupt a worker turn and send a replacement instruction")
    .requiredOption("--as <agent>", "agent name requesting the interrupt")
    .requiredOption("--to <agent>", "target worker name")
    .option("--scope <scope>", "channel scope: project | global")
    .option("--stdin", "read interrupt message body from stdin")
    .option("--text-file <path>", "read interrupt message body from file")
    .argument(
      "[text]",
      "inline interrupt message (otherwise use --stdin / --text-file)",
    )
    .action(
      async (
        name: string,
        text: string | undefined,
        raw: Record<string, unknown>,
      ) => {
        const opts = raw as {
          as: string;
          to: string;
          scope?: string;
          stdin?: boolean;
          textFile?: string;
        };
        try {
          await channelInterrupt(name, {
            as: opts.as,
            to: opts.to,
            text,
            stdin: opts.stdin,
            textFile: opts.textFile,
            scope: opts.scope,
          });
        } catch (err) {
          console.error(
            chalk.red("Error:"),
            err instanceof Error ? err.message : err,
          );
          process.exit(1);
        }
      },
    );

  channel
    .command("spawn <name>")
    .description(
      "Register a worker (claude/codex) into the channel — the worker stays idle until the first `channel send --to <worker>` arrives",
    )
    .option("--scope <scope>", "channel scope: project | global")
    .option(
      "--agent <agent-name>",
      "load .trellis/agents/<name>.md (sets default --provider / --model / system prompt)",
    )
    .option(
      "--provider <provider>",
      "worker provider: claude | codex (overrides agent)",
    )
    .option(
      "--as <name>",
      "worker name in the channel (default: <agent-name> if --agent is set)",
    )
    .option("--cwd <path>", "worker working directory (default: process cwd)")
    .option("--model <id>", "model override")
    .option("--resume <id>", "resume an existing session/thread id")
    .option(
      "--timeout <duration>",
      "auto-kill worker after this duration (e.g. 30m, 1h, 7200s)",
    )
    .option(
      "--warn-before <duration>",
      "emit supervisor_warning before timeout (default 5m; 0ms disables)",
    )
    .option(
      "--file <path>",
      "include a file's content as context in the worker's system prompt (glob supported, repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option(
      "--jsonl <path>",
      "parse a Trellis jsonl manifest ({file, reason} per line) and include each referenced file (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option(
      "--by <agent>",
      "identity recorded as the spawn author (defaults to TRELLIS_CHANNEL_AS env or 'main')",
    )
    .option(
      "--inbox-policy <policy>",
      "worker inbox delivery policy: explicitOnly | broadcastAndExplicit (default explicitOnly)",
    )
    .option(
      "--idle-timeout <duration>",
      "OOM-guard idle-cleanup TTL for this worker (default 5m; 0 disables)",
    )
    .option(
      "--max-live-workers <n>",
      "spawn-time live-worker budget for this project/scope (default 6; 0 disables)",
      parseNonNegativeInteger,
    )
    .action(async (name: string, raw: Record<string, unknown>) => {
      const opts = raw as {
        agent?: string;
        provider?: string;
        as?: string;
        cwd?: string;
        model?: string;
        resume?: string;
        timeout?: string;
        warnBefore?: string;
        file?: string[];
        jsonl?: string[];
        by?: string;
        scope?: string;
        inboxPolicy?: string;
        idleTimeout?: string;
        maxLiveWorkers?: number;
      };
      if (opts.provider !== undefined && !isProvider(opts.provider)) {
        console.error(
          chalk.red("Error:"),
          `--provider must be one of: ${listProviders().join(", ")}`,
        );
        process.exit(1);
      }
      try {
        await channelSpawn(name, {
          agent: opts.agent,
          provider: opts.provider as Provider | undefined,
          as: opts.as,
          cwd: opts.cwd,
          model: opts.model,
          resume: opts.resume,
          timeoutMs: parseDuration(opts.timeout),
          warnBeforeMs: parseDuration(opts.warnBefore),
          files: opts.file,
          jsonls: opts.jsonl,
          by: opts.by,
          scope: opts.scope,
          inboxPolicy: parseInboxPolicy(opts.inboxPolicy),
          idleTimeoutMs: parseDuration(opts.idleTimeout),
          maxLiveWorkers: opts.maxLiveWorkers,
        });
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  channel
    .command("run [name]")
    .description(
      "One-shot: create ephemeral channel, spawn worker, send prompt, wait done, print final answer, cleanup",
    )
    .option(
      "--agent <agent-name>",
      "load .trellis/agents/<name>.md (sets default --provider / --as / system prompt)",
    )
    .option(
      "--provider <provider>",
      "worker provider: claude | codex (overrides agent)",
    )
    .option("--as <name>", "worker name (default: agent name if --agent set)")
    .option("--cwd <path>", "worker working directory")
    .option("--model <id>", "model override")
    .option(
      "--file <path>",
      "include a file as context (glob supported, repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option(
      "--jsonl <path>",
      "parse a Trellis jsonl manifest and include each referenced file (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option("--message <text>", "inline prompt text")
    .option("--message-file <path>", "read prompt body from file")
    .option("--stdin", "read prompt body from stdin")
    .option(
      "--timeout <duration>",
      "max time to wait for done (e.g. 30s, 5m, 1h; default 5m)",
    )
    .action(async (name: string | undefined, raw: Record<string, unknown>) => {
      const opts = raw as {
        agent?: string;
        provider?: string;
        as?: string;
        cwd?: string;
        model?: string;
        file?: string[];
        jsonl?: string[];
        message?: string;
        messageFile?: string;
        stdin?: boolean;
        timeout?: string;
      };
      if (opts.provider !== undefined && !isProvider(opts.provider)) {
        console.error(
          chalk.red("Error:"),
          `--provider must be one of: ${listProviders().join(", ")}`,
        );
        process.exit(1);
      }
      try {
        await channelRun({
          name,
          agent: opts.agent,
          provider: opts.provider as Provider | undefined,
          as: opts.as,
          cwd: opts.cwd,
          model: opts.model,
          files: opts.file,
          jsonls: opts.jsonl,
          message: opts.message,
          textFile: opts.messageFile,
          stdin: opts.stdin,
          timeoutMs: parseDuration(opts.timeout),
        });
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  channel
    .command("rm <name>")
    .description("Kill workers and delete a channel directory entirely")
    .option("--scope <scope>", "channel scope: project | global")
    .action(async (name: string, raw: Record<string, unknown>) => {
      try {
        await channelRm(name, raw as { scope?: string });
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  channel
    .command("prune")
    .description(
      "Bulk-remove channels by criteria (defaults to dry-run preview)",
    )
    .option("--scope <scope>", "channel scope: project | global")
    .option("--all", "remove all channels (except live ones and --keep)")
    .option("--empty", "remove channels with no activity (only create event)")
    .option(
      "--idle <duration>",
      "remove channels whose last event is older than this (e.g. 1h, 7d)",
    )
    .option(
      "--ephemeral",
      "remove only channels marked `--ephemeral` at create time",
    )
    .option("--yes", "actually delete (default is dry-run)")
    .option("--dry-run", "show what would be removed without deleting", true)
    .option(
      "--keep <names>",
      "comma-separated channel names to keep regardless",
    )
    .action(async (raw: Record<string, unknown>) => {
      const opts = raw as {
        all?: boolean;
        empty?: boolean;
        idle?: string;
        ephemeral?: boolean;
        yes?: boolean;
        dryRun?: boolean;
        keep?: string;
        scope?: string;
      };
      try {
        await channelPrune({
          all: opts.all,
          empty: opts.empty,
          idleMs: parseDuration(opts.idle),
          ephemeral: opts.ephemeral,
          yes: opts.yes,
          dryRun: !opts.yes,
          keep: parseCsv(opts.keep),
          scope: opts.scope,
        });
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  channel
    .command("list")
    .description(
      "List channels in ~/.trellis/channels/ with worker / activity summary",
    )
    .option("--scope <scope>", "channel scope: project | global")
    .option("--json", "emit JSON instead of a formatted table")
    .option(
      "--project <slug>",
      "filter channels whose `task` field contains this substring",
    )
    .option(
      "--all",
      "include ephemeral channels (default: hide channels marked ephemeral)",
    )
    .option(
      "--all-projects",
      "scan every project bucket (default: only the current cwd's project)",
    )
    .action(async (raw: Record<string, unknown>) => {
      const opts = raw as {
        json?: boolean;
        project?: string;
        all?: boolean;
        allProjects?: boolean;
        scope?: string;
      };
      try {
        await channelList(opts);
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  channel
    .command("messages <name>")
    .description("View messages and events in the channel")
    .option("--scope <scope>", "channel scope: project | global")
    .option("--raw", "print raw JSON (one event per line)")
    .option("--follow", "stream new events as they arrive (Ctrl-C to stop)")
    .option("--last <N>", "show only the last N matching events", (v) =>
      Number.parseInt(v, 10),
    )
    .option("--since <seq>", "only events with seq > N", (v) =>
      Number.parseInt(v, 10),
    )
    .option(
      "--kind <kind>",
      "filter by event kind (e.g. message, done, killed)",
    )
    .option("--from <agents>", "filter by author (CSV)")
    .option("--to <target>", "filter by routing target")
    .option("--thread <key>", "filter by thread key")
    .option("--action <action>", "filter by thread action")
    .option("--no-progress", "hide progress events (tool calls, deltas)")
    .action(async (name: string, raw: Record<string, unknown>) => {
      const opts = raw as {
        raw?: boolean;
        follow?: boolean;
        last?: number;
        since?: number;
        kind?: string;
        from?: string;
        to?: string;
        scope?: string;
        thread?: string;
        action?: string;
        progress?: boolean; // commander negates --no-progress to progress:false
      };
      try {
        await channelMessages(name, {
          raw: opts.raw,
          follow: opts.follow,
          last: opts.last,
          since: opts.since,
          kind: opts.kind,
          from: opts.from,
          to: opts.to,
          scope: opts.scope,
          thread: opts.thread,
          action: opts.action,
          noProgress: opts.progress === false,
        });
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  channel
    .command("kill <name>")
    .description(
      "Stop a worker in the channel (SIGTERM, or SIGKILL with --force)",
    )
    .requiredOption("--as <agent>", "worker agent name")
    .option("--scope <scope>", "channel scope: project | global")
    .option("--force", "skip graceful shutdown, send SIGKILL immediately")
    .action(async (name: string, raw: Record<string, unknown>) => {
      const opts = raw as { as: string; force?: boolean; scope?: string };
      try {
        await channelKill(name, opts);
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  channel
    .command("post <name> <action>")
    .description("Append a structured thread event to a forum channel")
    .requiredOption("--as <agent>", "agent name posting")
    .option("--scope <scope>", "channel scope: project | global")
    .option("--thread <key>", "thread key (required except opened)")
    .option("--title <text>", "thread title")
    .option("--text <text>", "event body")
    .option("--stdin", "read event body from stdin")
    .option("--text-file <path>", "read event body from file")
    .option("--description <text>", "stable thread description")
    .option("--status <status>", "thread status")
    .option("--labels <csv>", "replace thread labels")
    .option("--assignees <csv>", "replace thread assignees")
    .option("--summary <text>", "thread summary")
    .option(
      "--context-file <absolute-path>",
      "absolute file path attached as thread context (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option(
      "--context-raw <text>",
      "raw thread context text (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option(
      "--linked-context-file <absolute-path>",
      "[deprecated alias for --context-file] absolute file path (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .option(
      "--linked-context-raw <text>",
      "[deprecated alias for --context-raw] raw context text (repeatable)",
      (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
      [] as string[],
    )
    .action(
      async (name: string, action: string, raw: Record<string, unknown>) => {
        try {
          await channelThreadPost(name, {
            ...(raw as unknown as Parameters<typeof channelThreadPost>[1]),
            action,
          });
        } catch (err) {
          console.error(
            chalk.red("Error:"),
            err instanceof Error ? err.message : err,
          );
          process.exit(1);
        }
      },
    );

  channel
    .command("forum <name>")
    .description("List threads in a forum channel")
    .option("--scope <scope>", "channel scope: project | global")
    .option("--status <status>", "filter by thread status")
    .option("--raw", "print raw reduced thread JSON")
    .action(async (name: string, raw: Record<string, unknown>) => {
      try {
        await channelForumList(
          name,
          raw as Parameters<typeof channelForumList>[1],
        );
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  const thread = channel
    .command("thread")
    .description("Show or mutate one thread timeline");

  thread
    .argument("<name>", "channel name")
    .argument("<thread>", "thread key")
    .option("--scope <scope>", "channel scope: project | global")
    .option("--raw", "print raw thread events")
    .action(
      async (name: string, threadKey: string, raw: Record<string, unknown>) => {
        try {
          await channelThreadShow(
            name,
            threadKey,
            raw as Parameters<typeof channelThreadShow>[2],
          );
        } catch (err) {
          console.error(
            chalk.red("Error:"),
            err instanceof Error ? err.message : err,
          );
          process.exit(1);
        }
      },
    );

  thread
    .command("rename <name> <oldThread> <newThread>")
    .description("Rename a thread inside a forum channel")
    .requiredOption("--as <agent>", "agent name")
    .option("--scope <scope>", "channel scope: project | global")
    .action(
      async (
        name: string,
        oldThread: string,
        newThread: string,
        raw: Record<string, unknown>,
      ) => {
        const opts = raw as { as: string; scope?: string };
        try {
          await channelThreadRename(name, oldThread, newThread, opts);
        } catch (err) {
          console.error(
            chalk.red("Error:"),
            err instanceof Error ? err.message : err,
          );
          process.exit(1);
        }
      },
    );

  const context = channel
    .command("context")
    .description("Manage channel-level or thread-level context entries");

  const addContextOptions = (cmd: Command): Command =>
    cmd
      .option("--as <agent>", "agent name", "main")
      .option("--scope <scope>", "channel scope: project | global")
      .option(
        "--thread <key>",
        "mutate thread-level context instead of channel-level",
      )
      .option(
        "--file <absolute-path>",
        "absolute file path (repeatable)",
        (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
        [] as string[],
      )
      .option(
        "--raw <text>",
        "raw text entry (repeatable)",
        (val: string, prev: string[] | undefined) => [...(prev ?? []), val],
        [] as string[],
      );

  addContextOptions(context.command("add <name>"))
    .description("Add context entries")
    .action(async (name: string, raw: Record<string, unknown>) => {
      try {
        await channelContextAdd(
          name,
          raw as unknown as Parameters<typeof channelContextAdd>[1],
        );
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  addContextOptions(context.command("delete <name>"))
    .description("Delete context entries")
    .action(async (name: string, raw: Record<string, unknown>) => {
      try {
        await channelContextDelete(
          name,
          raw as unknown as Parameters<typeof channelContextDelete>[1],
        );
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  context
    .command("list <name>")
    .description("List projected current context entries")
    .option("--scope <scope>", "channel scope: project | global")
    .option(
      "--thread <key>",
      "show thread-level context instead of channel-level",
    )
    .option("--raw", "print one context entry JSON per line")
    .action(async (name: string, raw: Record<string, unknown>) => {
      try {
        await channelContextList(
          name,
          raw as Parameters<typeof channelContextList>[1],
        );
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  const title = channel
    .command("title")
    .description("Set or clear the channel display title");

  title
    .command("set <name>")
    .description("Set the channel display title")
    .option("--as <agent>", "agent name", "main")
    .option("--scope <scope>", "channel scope: project | global")
    .requiredOption("--title <text>", "display title")
    .action(async (name: string, raw: Record<string, unknown>) => {
      const opts = raw as { as: string; scope?: string; title: string };
      try {
        await channelTitleSet(name, opts);
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  title
    .command("clear <name>")
    .description("Clear the channel display title")
    .option("--as <agent>", "agent name", "main")
    .option("--scope <scope>", "channel scope: project | global")
    .action(async (name: string, raw: Record<string, unknown>) => {
      try {
        await channelTitleClear(
          name,
          raw as unknown as Parameters<typeof channelTitleClear>[1],
        );
      } catch (err) {
        console.error(
          chalk.red("Error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  // Hidden: supervisor entry point invoked by `channel spawn` via fork.
  channel
    .command("__supervisor <channel> <worker> <config>")
    .description(
      "[internal] supervisor process entry point — do not invoke directly",
    )
    .action(async (channelName: string, worker: string, configPath: string) => {
      try {
        await runSupervisor(channelName, worker, configPath);
      } catch (err) {
        console.error(
          chalk.red("Supervisor error:"),
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  // Dev-only: feed a recorded stream-json / wire trace through the matching
  // adapter and print the resulting channel events. Used during adapter
  // development to verify against real-CLI fixtures.
  channel
    .command("__parse-trace <adapter> <file>")
    .description(
      "[dev] Run a recorded trace through the parser and print events",
    )
    .action((adapter: string, file: string) => {
      if (!isProvider(adapter)) {
        console.error(
          chalk.red("Error:"),
          `unknown adapter '${adapter}' (registered: ${listProviders().join(", ")})`,
        );
        process.exit(1);
      }
      parseTrace(adapter, file);
    });
}
