/**
 * mem.ts — CLI wrapper over `@mindfoldhq/trellis-core/mem`.
 *
 * The reusable retrieval / context-extraction logic lives in core; this file
 * owns only CLI concerns: argument parsing, terminal rendering, warning
 * presentation, and process exit behavior.
 *
 * Commands:
 *   list                          list sessions (default if no command)
 *   search <keyword>              find sessions whose contents match keyword
 *   context <session-id>          drill-down: top-N hit turns + surrounding context
 *   extract <session-id>          dump cleaned dialogue (use --grep KW to filter turns)
 *   projects                      list active project cwds (AI-routing entry point)
 *
 * Run `trellis mem help` for the full flag reference.
 */

import * as os from "node:os";
import * as path from "node:path";

import {
  extractMemDialogue,
  listMemProjects,
  listMemSessions,
  MemSessionNotFoundError,
  readMemContext,
  searchMemSessions,
} from "@mindfoldhq/trellis-core/mem";
import type {
  MemFilter,
  MemPhase,
  MemSessionInfo,
  MemSourceFilter,
  MemSourceKind,
} from "@mindfoldhq/trellis-core/mem";

// ---------- argv ----------

export interface Argv {
  cmd: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgv(argv: readonly string[]): Argv {
  const cmd = argv[0] ?? "list";
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { cmd, positional, flags };
}

const VALID_PLATFORMS: readonly string[] = [
  "claude",
  "codex",
  "grok",
  "opencode",
  "pi",
  "zcode",
  "all",
];

/** Translate parsed CLI flags into a core `MemFilter`. Validation failures
 * exit the process — core never sees raw CLI flags. */
export function buildFilter(flags: Argv["flags"]): MemFilter {
  const platformRaw =
    typeof flags.platform === "string" ? flags.platform : "all";
  if (!VALID_PLATFORMS.includes(platformRaw))
    die(`unknown platform: ${platformRaw}`);
  const platform = platformRaw as MemSourceFilter;

  const sinceRaw = flags.since;
  const since = typeof sinceRaw === "string" ? new Date(sinceRaw) : undefined;
  if (since && Number.isNaN(+since)) die(`bad --since: ${String(sinceRaw)}`);

  const untilRaw = flags.until;
  const until =
    typeof untilRaw === "string"
      ? new Date(`${untilRaw}T23:59:59.999Z`)
      : undefined;
  if (until && Number.isNaN(+until)) die(`bad --until: ${String(untilRaw)}`);

  const cwd = flags.global
    ? undefined
    : path.resolve(typeof flags.cwd === "string" ? flags.cwd : process.cwd());

  const limit = parseOptionalNumberFlag(flags.limit, "--limit", 50);

  return { platform, since, until, cwd, limit };
}

function parseOptionalNumberFlag(
  raw: string | boolean | undefined,
  name: string,
  fallback: number,
): number {
  if (raw === undefined || raw === false) return fallback;
  if (typeof raw !== "string") die(`${name} requires a number`);
  const value = Number(raw);
  if (!Number.isFinite(value)) die(`bad ${name}: ${raw}`);
  return value;
}

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(2);
}

// ---------- formatting ----------

const HOME = os.homedir();

export function shortDate(iso?: string): string {
  if (!iso) return "         ";
  return iso.slice(0, 16).replace("T", " ");
}

export function shortPath(p?: string): string {
  if (!p) return "(no cwd)";
  return p.replace(HOME, "~");
}

function printSessions(rows: readonly MemSessionInfo[]): void {
  if (rows.length === 0) {
    console.log("(no sessions)");
    return;
  }
  for (const s of rows) {
    const id = s.id.length > 12 ? s.id.slice(0, 12) : s.id.padEnd(12);
    const parentTag = s.parent_id
      ? `  ↳ child of ${s.parent_id.slice(0, 12)}`
      : "";
    console.log(
      `[${s.platform.padEnd(8)}] ${shortDate(s.updated ?? s.created)}  ${id}  ${shortPath(s.cwd)}` +
        (s.title ? `  — ${s.title}` : "") +
        parentTag,
    );
  }
}

// ---------- commands ----------

function printWarnings(
  warnings: readonly { message: string }[] | undefined,
): void {
  for (const warning of warnings ?? []) {
    console.error(`warning: ${warning.message}`);
  }
}

function cmdList(argv: Argv): void {
  const f = buildFilter(argv.flags);
  const warnings: { message: string }[] = [];
  const rows = listMemSessions({
    filter: f,
    onWarning: (warning) => warnings.push(warning),
  });
  printWarnings(warnings);
  if (argv.flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log(
    `scope: ${f.cwd ? `project=${shortPath(f.cwd)}` : "global"}  platform=${f.platform}` +
      (f.since ? `  since=${f.since.toISOString().slice(0, 10)}` : "") +
      (f.until ? `  until=${f.until.toISOString().slice(0, 10)}` : ""),
  );
  printSessions(rows);
  console.log(`\n${rows.length} session(s)`);
}

function cmdSearch(argv: Argv): void {
  const kw = argv.positional[0];
  if (!kw) die("usage: search <keyword>");
  const f = buildFilter(argv.flags);
  const includeChildren = argv.flags["include-children"] === true;
  const result = searchMemSessions({
    keyword: kw,
    filter: f,
    includeChildren,
  });
  printWarnings(result.warnings);
  const top = result.matches;

  if (argv.flags.json) {
    console.log(
      JSON.stringify(
        top.map((m) => ({
          session: m.session,
          score: Number(m.score.toFixed(4)),
          hit_count: m.hit.count,
          user_count: m.hit.userCount,
          asst_count: m.hit.asstCount,
          total_turns: m.hit.totalTurns,
          descendants_merged: includeChildren ? m.descendantsMerged : 0,
          excerpts: m.hit.excerpts,
        })),
        null,
        2,
      ),
    );
    return;
  }
  console.log(
    `scope: ${f.cwd ? `project=${shortPath(f.cwd)}` : "global"}  keyword="${kw}"  platform=${f.platform}` +
      (includeChildren ? `  include-children=on` : ""),
  );
  if (top.length === 0) {
    console.log("(no matches)");
    return;
  }
  for (const m of top) {
    const s = m.session;
    const idShort = s.id.slice(0, 12);
    const score = m.score.toFixed(3);
    const childTag =
      includeChildren && m.descendantsMerged > 0
        ? `  +${m.descendantsMerged} child`
        : "";
    console.log(
      `\n[${s.platform.padEnd(8)}] ${shortDate(s.updated ?? s.created)}  ${idShort}  ${shortPath(s.cwd)}` +
        `  score=${score}  hits=${m.hit.count} (u=${m.hit.userCount},a=${m.hit.asstCount})  turns=${m.hit.totalTurns}${childTag}` +
        (s.title ? `  — ${s.title}` : ""),
    );
    for (const ex of m.hit.excerpts) {
      console.log(`    [${ex.role}] ${ex.snippet}`);
    }
  }
  console.log(
    `\n${top.length} session(s)${result.totalMatches > top.length ? ` (of ${result.totalMatches})` : ""}`,
  );
}

function cmdProjects(argv: Argv): void {
  // Distinct cwds across all platforms with last-active timestamp + per-platform
  // session counts. AI calls this first to learn which project paths have
  // recent activity, then picks one for `--cwd` in a follow-up `search`.
  const f = buildFilter({ ...argv.flags, global: true });
  const warnings: { message: string }[] = [];
  const rows = listMemProjects({
    filter: f,
    onWarning: (warning) => warnings.push(warning),
  });
  printWarnings(warnings);
  const limit = parseOptionalNumberFlag(argv.flags.limit, "--limit", 30);
  const top = rows.slice(0, limit);

  if (argv.flags.json) {
    console.log(JSON.stringify(top, null, 2));
    return;
  }
  console.log(
    `active projects` +
      (f.since ? `  since=${f.since.toISOString().slice(0, 10)}` : "") +
      (f.until ? `  until=${f.until.toISOString().slice(0, 10)}` : ""),
  );
  if (top.length === 0) {
    console.log("(none)");
    return;
  }
  for (const r of top) {
    const parts = (Object.entries(r.by_platform) as [MemSourceKind, number][])
      .filter(([, n]) => n > 0)
      .map(([p, n]) => `${p}:${n}`)
      .join(" ");
    console.log(
      `${shortDate(r.last_active)}  sessions=${r.sessions.toString().padStart(3)} (${parts})  ${shortPath(r.cwd)}`,
    );
  }
  console.log(
    `\n${top.length} project(s)${rows.length > top.length ? ` (of ${rows.length})` : ""}`,
  );
}

function cmdContext(argv: Argv): void {
  // Drill-down step 2 in the search workflow: `search <kw>` picks a session,
  // then `context <id> --grep <kw>` returns top-N hit turns with surrounding
  // context, token-budgeted for AI consumption. Without --grep: first N turns.
  const id = argv.positional[0];
  if (!id)
    die("usage: context <session-id> [--grep KW] [--turns N] [--around M]");
  const f = buildFilter(argv.flags);

  const grepRaw = argv.flags.grep;
  const grep = typeof grepRaw === "string" ? grepRaw : undefined;
  if (grep?.split(/\s+/).filter(Boolean).length === 0)
    die("--grep requires non-empty value");
  const nTurns = parseOptionalNumberFlag(argv.flags.turns, "--turns", 3);
  const around = parseOptionalNumberFlag(argv.flags.around, "--around", 1);
  const maxChars = parseOptionalNumberFlag(
    argv.flags["max-chars"],
    "--max-chars",
    6000,
  );
  const includeChildren = argv.flags["include-children"] === true;

  let result;
  try {
    result = readMemContext({
      sessionId: id,
      filter: f,
      grep,
      turns: nTurns,
      around,
      maxChars,
      includeChildren,
    });
  } catch (error) {
    if (error instanceof MemSessionNotFoundError) {
      printWarnings(error.warnings);
      die(`session not found: ${id}`);
    }
    throw error;
  }
  printWarnings(result.warnings);
  const s = result.session;

  if (argv.flags.json) {
    console.log(
      JSON.stringify(
        {
          session: s,
          query: result.query,
          total_turns: result.totalTurns,
          total_hit_turns: result.totalHitTurns,
          merged_children: result.mergedChildren,
          turns: result.turns.map((t) => ({
            idx: t.idx,
            role: t.role,
            text: t.text,
            is_hit: t.isHit,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  // `hitIndices.length` from the legacy implementation — recomputed here for
  // the human-readable header only.
  const shown = grep
    ? Math.min(result.totalHitTurns, nTurns)
    : Math.min(nTurns, result.totalTurns);

  console.log(`# context: [${s.platform}] ${s.id}`);
  if (s.title) console.log(`# title: ${s.title}`);
  if (s.cwd) console.log(`# cwd:   ${shortPath(s.cwd)}`);
  if (grep)
    console.log(
      `# query: "${grep}"  hit_turns=${result.totalHitTurns}  showing top ${shown}`,
    );
  else
    console.log(
      `# no grep — showing first ${shown} turns of ${result.totalTurns}`,
    );
  if (result.mergedChildren > 0)
    console.log(`# merged_children: ${result.mergedChildren}`);
  console.log(
    `# turns shown: ${result.turns.length}  budget_used: ${result.budgetUsed}/${result.maxChars} chars`,
  );
  console.log("");

  for (const t of result.turns) {
    const marker = t.isHit ? "  ← hit" : "";
    console.log(`## turn ${t.idx} (${t.role})${marker}\n`);
    console.log(t.text);
    console.log("\n---\n");
  }
}

function parsePhaseFlag(raw: unknown): MemPhase {
  if (raw === undefined || raw === false) return "all";
  if (raw === "brainstorm" || raw === "implement" || raw === "all") return raw;
  die(`unknown --phase: ${String(raw)} (expected brainstorm|implement|all)`);
}

function cmdExtract(argv: Argv): void {
  const id = argv.positional[0];
  if (!id) die("usage: extract <session-id>");
  const f = buildFilter(argv.flags);

  const phase = parsePhaseFlag(argv.flags.phase);
  const grepRaw = argv.flags.grep;
  const grep = typeof grepRaw === "string" ? grepRaw.toLowerCase() : undefined;

  let result;
  try {
    result = extractMemDialogue({ sessionId: id, filter: f, phase, grep });
  } catch (error) {
    if (error instanceof MemSessionNotFoundError) {
      printWarnings(error.warnings);
      die(`session not found: ${id}`);
    }
    throw error;
  }

  printWarnings(result.warnings);

  const s = result.session;
  if (argv.flags.json) {
    console.log(
      JSON.stringify(
        {
          session: s,
          phase: result.phase,
          windows: result.windows,
          total_turns: result.totalTurns,
          groups: result.groups,
          turns: result.turns,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`# session: [${s.platform}] ${s.id}`);
  if (s.title) console.log(`# title: ${s.title}`);
  if (s.cwd) console.log(`# cwd:   ${shortPath(s.cwd)}`);
  if (s.created) console.log(`# date:  ${shortDate(s.created)}`);
  console.log(
    `# phase: ${result.phase}  turns: ${result.turns.length}/${result.totalTurns}` +
      (grep ? ` (filtered by /${grep}/)` : "") +
      (result.windows.length > 0 ? `  windows: ${result.windows.length}` : ""),
  );
  console.log("");
  for (const g of result.groups) {
    if (g.label !== null) console.log(`--- task: ${g.label} ---\n`);
    for (const t of g.turns) {
      console.log(`## ${t.role === "user" ? "Human" : "Assistant"}\n`);
      console.log(t.text);
      console.log("\n---\n");
    }
  }
}

function cmdHelp(): void {
  console.log(`trellis mem — list/search Claude/Codex/Grok/OpenCode/Pi/ZCode sessions

commands:
  list                          list sessions (default if no command)
  search <keyword>              find sessions whose contents match keyword
  context <session-id>          drill-down: top-N hit turns + surrounding context
                                (paired with search; use --grep KW to anchor)
  extract <session-id>          dump cleaned dialogue (use --grep KW to filter turns)
  projects                      list active projects (cwds) with session counts —
                                use this to discover which --cwd to pass to search

flags:
  --platform claude|codex|grok|opencode|pi|zcode|all   default all
  --since YYYY-MM-DD                     inclusive lower bound
  --until YYYY-MM-DD                     inclusive upper bound
  --global                               include all projects (default: cwd-scoped)
  --cwd <path>                           override the project cwd
  --limit N                              cap output (default 50)
  --grep KW                              extract / context: filter turns by keyword (multi-token AND)
  --phase brainstorm|implement|all       extract: slice by Trellis brainstorm windows
                                         (default all; brainstorm = [task.py create, task.py start);
                                         Claude/Codex/Grok/Pi/ZCode supported; OpenCode warns + returns all)
  --turns N                              context: number of hit turns to return (default 3)
  --around N                             context: turns of surrounding context per hit (default 1)
  --max-chars N                          context: total char budget (default 6000, ~1500 tokens)
  --include-children                     search / context: merge OpenCode sub-agent sessions into parent
  --json                                 emit JSON
  --help, -h                             show this help

examples:
  trellis mem list
  trellis mem list --global --platform claude --since 2026-04-01
  trellis mem search "session insight" --global
  trellis mem extract 5842592d --grep memory
  trellis mem extract 5842592d --phase brainstorm
`);
}

// ---------- entry ----------

export function runMem(args: readonly string[]): void {
  const argv = parseArgv(args);
  if (
    argv.flags.help ||
    argv.flags.h ||
    argv.cmd === "help" ||
    argv.cmd === "--help"
  ) {
    return cmdHelp();
  }
  switch (argv.cmd) {
    case "list":
      return cmdList(argv);
    case "search":
      return cmdSearch(argv);
    case "extract":
      return cmdExtract(argv);
    case "context":
      return cmdContext(argv);
    case "projects":
      return cmdProjects(argv);
    default:
      die(`unknown command: ${argv.cmd} (try 'help')`);
  }
}
