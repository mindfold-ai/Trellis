/**
 * Session orchestration: source fan-out, platform dispatch, sub-agent child
 * merging, session lookup, phase slicing, and the public `listMemSessions`,
 * `searchMemSessions`, and `extractMemDialogue` entry points.
 */

import {
  claudeExtractDialogue,
  claudeListSessions,
  claudeSearch,
  collectClaudeTurnsAndEvents,
} from "./adapters/claude.js";
import {
  codexExtractDialogue,
  codexListSessions,
  codexSearch,
  collectCodexTurnsAndEvents,
} from "./adapters/codex.js";
import {
  collectGrokTurnsAndEvents,
  grokExtractDialogue,
  grokListSessions,
  grokSearch,
} from "./adapters/grok.js";
import {
  opencodeExtractDialogue,
  opencodeListSessions,
  opencodeSearch,
  prepareOpencodeSessionStore,
  releaseOpencodeSessionStore,
} from "./adapters/opencode.js";
import {
  collectPiTurnsAndEvents,
  piExtractDialogue,
  piListSessions,
  piSearch,
} from "./adapters/pi.js";
import {
  collectZcodeTurnsAndEvents,
  prepareZcodeSessionStore,
  releaseZcodeSessionStore,
  zcodeExtractDialogue,
  zcodeListSessions,
  zcodeSearch,
} from "./adapters/zcode.js";
import { buildBrainstormWindows } from "./phase.js";
import { relevanceScore, searchInDialogue } from "./search.js";
import type {
  DialogueTurn,
  ExtractMemDialogueOptions,
  ListMemSessionsOptions,
  MemDialogueGroup,
  MemExtractResult,
  MemFilter,
  MemPhase,
  MemSearchMatch,
  MemSearchResult,
  MemSessionInfo,
  MemWarning,
  SearchHit,
  SearchMemSessionsOptions,
  TaskPyEvent,
} from "./types.js";

/** Internal wide limit — `limit` only caps display; search recall and session
 * lookup must scan everything. */
export const WIDE_LIMIT = 1_000_000;

/** Thrown by `readMemContext` / `extractMemDialogue` when the requested
 * session id cannot be resolved. */
export class MemSessionNotFoundError extends Error {
  readonly sessionId: string;
  readonly warnings: MemWarning[];
  constructor(sessionId: string, warnings: MemWarning[] = []) {
    super(`mem session not found: ${sessionId}`);
    this.name = "MemSessionNotFoundError";
    this.sessionId = sessionId;
    this.warnings = warnings;
  }
}

/** Fill platform / limit defaults so internal helpers see a complete filter. */
export function resolveFilter(filter?: MemFilter): MemFilter {
  return {
    platform: filter?.platform ?? "all",
    since: filter?.since,
    until: filter?.until,
    cwd: filter?.cwd,
    limit: filter?.limit ?? 50,
  };
}

/** Fan out to every in-scope platform, merge by recency, cap at `f.limit`. */
export function listAll(
  f: MemFilter,
  warnings: MemWarning[] = [],
): MemSessionInfo[] {
  const all: MemSessionInfo[] = [];
  if (f.platform === "all" || f.platform === "claude")
    all.push(...claudeListSessions(f));
  if (f.platform === "all" || f.platform === "codex")
    all.push(...codexListSessions(f));
  if (f.platform === "all" || f.platform === "grok")
    all.push(...grokListSessions(f));
  if (f.platform === "all" || f.platform === "opencode")
    all.push(...opencodeListSessions(f, warnings));
  if (f.platform === "all" || f.platform === "pi")
    all.push(...piListSessions(f));
  if (f.platform === "all" || f.platform === "zcode")
    all.push(...zcodeListSessions(f, warnings));
  all.sort((a, b) =>
    (b.updated ?? b.created ?? "").localeCompare(a.updated ?? a.created ?? ""),
  );
  return all.slice(0, f.limit);
}

function extractDialogue(
  s: MemSessionInfo,
  warnings: MemWarning[] = [],
): DialogueTurn[] {
  switch (s.platform) {
    case "claude":
      return claudeExtractDialogue(s);
    case "codex":
      return codexExtractDialogue(s, warnings);
    case "grok":
      return grokExtractDialogue(s, warnings);
    case "opencode":
      return opencodeExtractDialogue(s, warnings);
    case "pi":
      return piExtractDialogue(s);
    case "zcode":
      return zcodeExtractDialogue(s, warnings);
  }
}

function searchSession(
  s: MemSessionInfo,
  kw: string,
  warnings: MemWarning[] = [],
): SearchHit {
  switch (s.platform) {
    case "claude":
      return claudeSearch(s, kw);
    case "codex":
      return codexSearch(s, kw);
    case "grok":
      return grokSearch(s, kw);
    case "opencode":
      return opencodeSearch(s, kw, warnings);
    case "pi":
      return piSearch(s, kw);
    case "zcode":
      return zcodeSearch(s, kw, warnings);
  }
}

function collectTurnsAndEvents(
  s: MemSessionInfo,
  warnings: MemWarning[] = [],
): {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
} {
  switch (s.platform) {
    case "claude":
      return collectClaudeTurnsAndEvents(s);
    case "codex":
      return collectCodexTurnsAndEvents(s, warnings);
    case "grok":
      return collectGrokTurnsAndEvents(s, warnings);
    case "opencode":
      return { turns: opencodeExtractDialogue(s, warnings), events: [] };
    case "pi":
      return collectPiTurnsAndEvents(s);
    case "zcode":
      return collectZcodeTurnsAndEvents(s, warnings);
  }
}

/** Build a parent → descendants index (transitively flattened) for OpenCode
 * sub-agent chains. Other platforms have no native `parent_id`. */
function buildChildIndex(
  sessions: readonly MemSessionInfo[],
): Map<string, MemSessionInfo[]> {
  const directChildren = new Map<string, MemSessionInfo[]>();
  for (const s of sessions) {
    if (!s.parent_id) continue;
    const list = directChildren.get(s.parent_id) ?? [];
    list.push(s);
    directChildren.set(s.parent_id, list);
  }
  const out = new Map<string, MemSessionInfo[]>();
  for (const [pid] of directChildren) {
    const stack = [...(directChildren.get(pid) ?? [])];
    const flat: MemSessionInfo[] = [];
    while (stack.length) {
      const cur = stack.pop();
      if (cur === undefined) break;
      flat.push(cur);
      for (const c of directChildren.get(cur.id) ?? []) stack.push(c);
    }
    out.set(pid, flat);
  }
  return out;
}

function searchSessionWithChildren(
  s: MemSessionInfo,
  kw: string,
  childIndex: Map<string, MemSessionInfo[]>,
  warnings: MemWarning[],
): SearchHit {
  const children = childIndex.get(s.id) ?? [];
  if (children.length === 0) return searchSession(s, kw, warnings);
  const merged: DialogueTurn[] = [...extractDialogue(s, warnings)];
  for (const c of children) merged.push(...extractDialogue(c, warnings));
  return searchInDialogue(merged, kw);
}

/** Resolve a session by exact id or id prefix, scanning every project. */
export function findSessionById(
  id: string,
  f: MemFilter,
  warnings: MemWarning[] = [],
): MemSessionInfo | undefined {
  const wide: MemFilter = { ...f, cwd: undefined, limit: WIDE_LIMIT };
  const all = listAll(wide, warnings);
  return all.find((s) => s.id === id) ?? all.find((s) => s.id.startsWith(id));
}

interface PhaseSlice {
  groups: MemDialogueGroup[];
  windows: MemExtractResult["windows"];
  totalTurns: number;
  warnings: MemWarning[];
}

/** Slice cleaned dialogue by phase. Claude / Codex / Grok / Pi / ZCode have
 * native boundary detection; OpenCode degrades to "all turns + warning". */
function sliceMemPhase(
  s: MemSessionInfo,
  phase: MemPhase,
  warnings: MemWarning[] = [],
): PhaseSlice {
  if (phase === "all" || s.platform === "opencode") {
    if (phase !== "all" && s.platform === "opencode") {
      warnings.push({
        code: "opencode-phase-unsupported",
        message:
          `--phase ${phase} on platform=opencode is not yet supported; ` +
          `returning full dialogue.`,
      });
    }
    const turns = extractDialogue(s, warnings);
    return {
      groups: [{ label: null, turns }],
      windows: [],
      totalTurns: turns.length,
      warnings,
    };
  }

  const { turns, events } = collectTurnsAndEvents(s, warnings);
  const windows = buildBrainstormWindows(events, turns.length);

  if (phase === "brainstorm") {
    if (windows.length === 0) {
      warnings.push({
        code: "no-brainstorm-boundary",
        message: `no task.py create/start boundary found in session — returning full dialogue.`,
      });
      return {
        groups: [{ label: null, turns }],
        windows: [],
        totalTurns: turns.length,
        warnings,
      };
    }
    const groups = windows.map((w) => ({
      label: w.label,
      turns: turns.slice(w.startTurn, w.endTurn),
    }));
    return { groups, windows, totalTurns: turns.length, warnings };
  }

  // phase === "implement": all turns NOT inside any brainstorm window.
  if (windows.length === 0) {
    warnings.push({
      code: "no-brainstorm-boundary",
      message: `no task.py create/start boundary found in session — implement phase is empty.`,
    });
    return {
      groups: [{ label: null, turns: [] }],
      windows: [],
      totalTurns: turns.length,
      warnings,
    };
  }
  const covered = new Set<number>();
  for (const w of windows) {
    for (let i = w.startTurn; i < w.endTurn; i++) covered.add(i);
  }
  const implementTurns: DialogueTurn[] = [];
  for (let i = 0; i < turns.length; i++) {
    if (!covered.has(i)) {
      const t = turns[i];
      if (t) implementTurns.push(t);
    }
  }
  return {
    groups: [{ label: null, turns: implementTurns }],
    windows,
    totalTurns: turns.length,
    warnings,
  };
}

// ---------- public API ----------

/** List session metadata across Claude / Codex / Grok / OpenCode / Pi / ZCode,
 * sorted by recency and capped at the filter's `limit` (default 50). */
export function listMemSessions(
  options?: ListMemSessionsOptions,
): MemSessionInfo[] {
  const warnings: MemWarning[] = [];
  const sessions = listAll(resolveFilter(options?.filter), warnings);
  for (const warning of warnings) options?.onWarning?.(warning);
  return sessions;
}

/** Multi-token AND grep over cleaned dialogue across all matching sessions,
 * ranked by weighted-density relevance. `matches` is capped at the filter's
 * `limit`; `totalMatches` is the full match count. */
export function searchMemSessions(
  options: SearchMemSessionsOptions,
): MemSearchResult {
  const f = resolveFilter(options.filter);
  const kw = options.keyword;
  const includeChildren = options.includeChildren === true;
  const warnings: MemWarning[] = [];

  const candidates = listAll({ ...f, limit: WIDE_LIMIT }, warnings);
  const childIndex = includeChildren
    ? buildChildIndex(candidates)
    : new Map<string, MemSessionInfo[]>();
  const candidateIds = new Set(candidates.map((s) => s.id));
  const isAbsorbedChild = (s: MemSessionInfo): boolean =>
    includeChildren &&
    s.parent_id !== undefined &&
    candidateIds.has(s.parent_id);

  const matches: MemSearchMatch[] = [];
  const zcodeCandidate = candidates.find((s) => s.platform === "zcode");
  if (zcodeCandidate) {
    prepareZcodeSessionStore(zcodeCandidate.filePath, warnings);
  }
  try {
    const opencodeCandidate = candidates.find(
      (s) => s.platform === "opencode",
    );
    if (opencodeCandidate) {
      prepareOpencodeSessionStore(opencodeCandidate.filePath, warnings);
    }
    for (const s of candidates) {
      if (isAbsorbedChild(s)) continue;
      const hit = includeChildren
        ? searchSessionWithChildren(s, kw, childIndex, warnings)
        : searchSession(s, kw, warnings);
      if (hit.count === 0) continue;
      matches.push({
        session: s,
        hit,
        score: relevanceScore(hit),
        descendantsMerged: childIndex.get(s.id)?.length ?? 0,
      });
    }
  } finally {
    releaseZcodeSessionStore();
    releaseOpencodeSessionStore();
  }
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.hit.count !== a.hit.count) return b.hit.count - a.hit.count;
    return (b.session.updated ?? b.session.created ?? "").localeCompare(
      a.session.updated ?? a.session.created ?? "",
    );
  });

  return {
    matches: matches.slice(0, f.limit),
    totalMatches: matches.length,
    warnings,
  };
}

/** Dump cleaned dialogue for one session, optionally sliced by brainstorm
 * phase and filtered by a multi-token AND `grep`. */
export function extractMemDialogue(
  options: ExtractMemDialogueOptions,
): MemExtractResult {
  const f = resolveFilter(options.filter);
  const phase: MemPhase = options.phase ?? "all";
  const warnings: MemWarning[] = [];
  const s = findSessionById(options.sessionId, f, warnings);
  if (!s) throw new MemSessionNotFoundError(options.sessionId, warnings);

  const slice = sliceMemPhase(s, phase, warnings);
  const grepLc =
    typeof options.grep === "string" ? options.grep.toLowerCase() : undefined;
  const filterTurns = (turns: DialogueTurn[]): DialogueTurn[] =>
    grepLc ? turns.filter((t) => t.text.toLowerCase().includes(grepLc)) : turns;

  const groups = slice.groups.map((g) => ({
    label: g.label,
    turns: filterTurns(g.turns),
  }));
  const flat = groups.flatMap((g) => g.turns);

  return {
    session: s,
    phase,
    windows: slice.windows,
    totalTurns: slice.totalTurns,
    groups,
    turns: flat,
    warnings: slice.warnings,
  };
}

// Re-exports needed by sibling orchestration modules.
export { extractDialogue, buildChildIndex };
