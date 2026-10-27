import { sameProject } from "./filter.js";
/** Unified local recall: source-scoped discovery, lexical evidence, versioned refs. */
import { createHash } from "node:crypto";
import * as path from "node:path";
import {
  allowedDocPath,
  discoverDocs,
  readDocText,
  type DocDiscovery,
} from "./docs.js";
import { excerptAround, matchTerms, queryTerms, windowAt } from "./lexical.js";
import { parseDocLineage, parseLineageMarks } from "./lineage.js";
import { MEM_PLATFORMS } from "./platforms.js";
import { listAll, resolveFilter, WIDE_LIMIT } from "./sessions.js";
import type {
  DialogueTurn,
  MemWarning,
  ReadMemRefsOptions,
  LineageFault,
  RecallHit,
  RecallMemOptions,
  RecallRead,
  RecallReadResult,
  RecallResult,
} from "./types.js";

const EXCERPT_CHARS = 400;
const SUCCESSOR_EXCERPT_CHARS = 240;
const MAX_LINEAGE_HOPS = 8;
const MAX_QUERY_CHARS = 2000;
const MAX_REFS = 30;

/** Function words that can wrap a query without adding an answer.
 * A user turn made only of these plus the query terms is a question echo. */
const QUERY_ECHO_WORDS = new Set([
  "a", "an", "about", "any", "are", "can", "could", "describe", "did", "do",
  "does", "explain", "for", "how", "in", "is", "me", "my", "of", "on", "our",
  "please", "should", "tell", "that", "the", "there", "this", "to", "was",
  "were", "what", "when", "where", "which", "who", "why", "will", "would",
]);

interface EvidenceRef {
  kind: "doc" | "session";
  path?: string;
  platform?: "claude" | "codex" | "opencode" | "pi";
  id?: string;
  turn?: number;
  start: number;
  end: number;
  hash: string;
}
interface Candidate {
  hit: RecallHit;
  source: string;
  anchorStart: number;
  anchorEnd: number;
  coverage: number;
  /** Required terms matched in the body, after the first heading. */
  bodyEvidence: boolean;
  /** Required terms that contain a digit, such as TASK-4419. */
  idCoverage: number;
  derivedCoverage: number;
  titleCoverage: number;
  pathCoverage: number;
  duplicateKey: string;
}

function fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 24);
}
function encodeRef(ref: EvidenceRef): string {
  return `${ref.kind}:v1:${Buffer.from(JSON.stringify(ref)).toString("base64url")}`;
}
function decodeRef(ref: string): EvidenceRef | undefined {
  if (ref.length > 8192) return undefined;
  const match = /^(doc|session):v1:([A-Za-z0-9_-]+)$/.exec(ref);
  if (!match) return undefined;
  try {
    const x = JSON.parse(
      Buffer.from(match[2] ?? "", "base64url").toString("utf8"),
    ) as EvidenceRef;
    if (
      x?.kind !== match[1] ||
      !Number.isSafeInteger(x.start) ||
      !Number.isSafeInteger(x.end) ||
      x.start < 0 ||
      x.end < x.start ||
      typeof x.hash !== "string" ||
      !/^[a-f0-9]{24}$/.test(x.hash)
    )
      return undefined;
    if (x.kind === "doc") return typeof x.path === "string" ? x : undefined;
    return typeof x.id === "string" &&
      Number.isSafeInteger(x.turn) &&
      (x.turn ?? -1) >= 0 &&
      ["claude", "codex", "opencode", "pi"].includes(x.platform ?? "")
      ? x
      : undefined;
  } catch {
    return undefined;
  }
}
function positive(value: number | undefined, fallback: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError("memory limits must be non-negative integers");
  return n;
}
function headingBefore(text: string, index: number): string | undefined {
  let heading: string | undefined;
  for (const match of text.matchAll(/^(#{1,6})\s+(.*\S)\s*$/gm)) {
    if (match.index > index) break;
    heading = match[2];
  }
  return heading;
}

/** Effective notes outrank archived / superseded ones at equal coverage. */
function inactiveRank(hit: RecallHit): number {
  return hit.status === "archived" || hit.status === "superseded" ? 1 : 0;
}

function hasBodyEvidence(bodyCoverage: number, requiredCount: number): boolean {
  return bodyCoverage >= 2 && bodyCoverage * 2 >= requiredCount;
}

/** Current body evidence beats an archived title. An archived body beats a
 * current note that only matched in its title. One shared word is not enough. */
function preferRecordedBody(a: Candidate, b: Candidate): number {
  const aCurrent = a.bodyEvidence && inactiveRank(a.hit) === 0;
  const bCurrent = b.bodyEvidence && inactiveRank(b.hit) === 0;
  if (aCurrent && !b.bodyEvidence && inactiveRank(b.hit) > 0) return -1;
  if (bCurrent && !a.bodyEvidence && inactiveRank(a.hit) > 0) return 1;
  const aOld = a.bodyEvidence && inactiveRank(a.hit) > 0;
  const bOld = b.bodyEvidence && inactiveRank(b.hit) > 0;
  if (aOld && !b.bodyEvidence && inactiveRank(b.hit) === 0) return -1;
  if (bOld && !a.bodyEvidence && inactiveRank(a.hit) === 0) return 1;
  return 0;
}

const ANSWER_SIGNAL =
  /(?:^|[^\p{L}\p{N}])(?:no|not|never|nor|yes|rejected|reject|allow|allows|allowed|most|least|one|two|three|four|five|six|seven|eight|nine|ten|once|twice|confirmed|确认|\d+)(?=$|[^\p{L}\p{N}])/iu;

/** A digit, denial, limit, or explicit confirmation. Instructions around a question do not count. */
function hasAnswerSignal(text: string): boolean {
  return ANSWER_SIGNAL.test(text.normalize("NFKC").toLowerCase());
}

/** A user turn that only asks the query, with no confirmation, correction, or denial. */
function isQueryEcho(text: string, required: readonly string[]): boolean {
  if (!required.length) return false;
  const tokens = text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 || /^\d+$/.test(token));
  const known = new Set(required);
  if (!required.every((term) => tokens.includes(term))) return false;
  return tokens.every((token) => known.has(token) || QUERY_ECHO_WORDS.has(token));
}

/** The last current note in a declared chain ranks immediately before the note
 * it replaces. A higher-coverage unrelated note stays above that pair.
 * Cycles are not lifted. */
function liftDeclaredSuccessors(hits: RecallHit[]): RecallHit[] {
  const out = [...hits];
  for (let i = out.length - 1; i >= 0; i--) {
    const hit = out[i];
    if (!hit?.supersededBy || hit.lineageFault === "cycle") continue;
    const successorAt = out.findIndex((item) => item.path === hit.supersededBy);
    if (successorAt > i) {
      const [successor] = out.splice(successorAt, 1);
      if (successor) out.splice(i, 0, successor);
    }
  }
  return out;
}

function boundedSuccessorExcerpt(text: string | undefined): string | undefined {
  if (!text) return undefined;
  let body = text;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) body = body.slice(end + 4);
  }
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length <= SUCCESSOR_EXCERPT_CHARS
    ? flat
    : flat.slice(0, SUCCESSOR_EXCERPT_CHARS);
}

interface FollowedLineage {
  superseded: boolean;
  supersededBy?: string;
  fault?: LineageFault;
  successorExcerpt?: string;
}

/** A successor is readable only when ordinary discovery already accepted it. */
function successorInSources(discovery: DocDiscovery, rel: string): boolean {
  return discovery.docs.some((doc) => doc.relPath === rel);
}

function readScopedDoc(
  discovery: DocDiscovery,
  rel: string,
  docTexts: Map<string, string>,
  warnings: MemWarning[],
): string | undefined {
  const cached = docTexts.get(rel);
  if (cached !== undefined) return cached;
  const doc = discovery.docs.find((item) => item.relPath === rel);
  if (!doc) return undefined;
  const text = readDocText(discovery.root, doc.filePath, warnings);
  if (text !== undefined) docTexts.set(rel, text);
  return text;
}

/**
 * Walk a declared chain to the last note that does not point further.
 * Every hop stays inside the documents discovery already accepted, so Git
 * ignore, knowledge-dir exceptions, and file safety match ordinary reads.
 * A cycle or a chain longer than the hop cap does not pick an intermediate
 * note as the current rule.
 */
function followLineage(
  text: string,
  rel: string,
  discovery: DocDiscovery,
  docTexts: Map<string, string>,
  warnings: MemWarning[],
): FollowedLineage {
  const start = parseDocLineage(text, discovery.root, rel);
  if (start.fault || !start.supersededBy) {
    return {
      superseded: start.superseded,
      ...(start.fault ? { fault: start.fault } : {}),
    };
  }
  if (!successorInSources(discovery, start.supersededBy)) {
    return {
      superseded: parseLineageMarks(text).statusSuperseded,
      fault: "missing-target",
    };
  }
  const seen = new Set<string>([rel]);
  const direct = start.supersededBy;
  let nextRel = start.supersededBy;
  for (let hop = 0; hop < MAX_LINEAGE_HOPS; hop++) {
    if (seen.has(nextRel)) {
      return { superseded: true, supersededBy: direct, fault: "cycle" };
    }
    seen.add(nextRel);
    const successorText = readScopedDoc(discovery, nextRel, docTexts, warnings);
    if (successorText === undefined) {
      return { superseded: true, fault: "missing-target" };
    }
    const next = parseDocLineage(successorText, discovery.root, nextRel);
    if (
      next.fault === "self" ||
      next.fault === "escapes-project" ||
      next.fault === "missing-target"
    ) {
      return { superseded: true, fault: next.fault };
    }
    if (next.supersededBy && !successorInSources(discovery, next.supersededBy)) {
      return { superseded: true, fault: "missing-target" };
    }
    if (!next.supersededBy) {
      if (next.superseded) return { superseded: true, fault: "missing-target" };
      return {
        superseded: true,
        supersededBy: nextRel,
        successorExcerpt: boundedSuccessorExcerpt(successorText),
      };
    }
    if (seen.has(next.supersededBy)) {
      return { superseded: true, supersededBy: direct, fault: "cycle" };
    }
    nextRel = next.supersededBy;
  }
  return { superseded: true, fault: "bounded" };
}

/** Limit the serialized evidence records, including refs and source metadata. */
function select(
  candidates: Candidate[],
  limit: number,
  maxChars: number,
): { hits: RecallHit[]; truncated: boolean } {
  const ranked = [...candidates].sort(
    (a, b) =>
      b.idCoverage - a.idCoverage ||
      preferRecordedBody(a, b) ||
      b.coverage - a.coverage ||
      b.titleCoverage - a.titleCoverage ||
      b.pathCoverage - a.pathCoverage ||
      b.derivedCoverage - a.derivedCoverage ||
      inactiveRank(a.hit) - inactiveRank(b.hit) ||
      (b.hit.sourceTime ?? "").localeCompare(a.hit.sourceTime ?? ""),
  );
  const hits: RecallHit[] = [];
  let used = 0;
  let truncated = false;
  const emitted = new Set<string>();
  // Resolve declared priority before either result count or character budget
  // can discard the current note. Keep the candidate's own evidence anchor.
  const byRef = new Map(ranked.map((candidate) => [candidate.hit.ref, candidate]));
  const ordered = liftDeclaredSuccessors(ranked.map((candidate) => candidate.hit));
  for (const orderedHit of ordered) {
    const candidate = byRef.get(orderedHit.ref);
    if (!candidate) continue;
    if (emitted.has(candidate.duplicateKey)) continue;
    if (hits.length >= limit) {
      truncated = true;
      break;
    }
    const hit = { ...candidate.hit };
    const overhead = JSON.stringify({ ...hit, excerpt: "" }).length;
    const available = maxChars - used - overhead;
    if (available < 1) {
      truncated = true;
      continue;
    }
    if (JSON.stringify(hit).length > maxChars - used) {
      // JSON escaping and metadata also consume the budget. Keep the anchor.
      let cap = Math.min(hit.excerpt.length, available);
      do {
        hit.excerpt = windowAt(
          candidate.source,
          candidate.anchorStart,
          candidate.anchorEnd,
          cap,
        ).excerpt;
        cap -= Math.max(1, JSON.stringify(hit).length - (maxChars - used));
      } while (cap > 0 && JSON.stringify(hit).length > maxChars - used);
      if (!hit.excerpt || JSON.stringify(hit).length > maxChars - used) {
        truncated = true;
        continue;
      }
      truncated = true;
    }
    hits.push(hit);
    emitted.add(candidate.duplicateKey);
    used += JSON.stringify(hit).length;
  }
  return { hits, truncated };
}

export function recallMem(options: RecallMemOptions): RecallResult {
  const limit = positive(options.limit, 3);
  const maxChars = positive(options.maxChars, 3000);
  const warnings: MemWarning[] = [];
  const query = options.query.slice(0, MAX_QUERY_CHARS);
  if (query.length !== options.query.length)
    warnings.push({
      code: "query-truncated",
      message: "query exceeded 2000 characters; results are partial",
    });
  const terms = queryTerms(query);
  if (!terms.length)
    return {
      hits: [],
      totalHits: 0,
      incomplete: warnings.length > 0,
      truncated: false,
      warnings,
    };
  const required = [
    ...new Set(
      query
        .normalize("NFKC")
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 2),
    ),
  ];
  const discovery = discoverDocs(path.resolve(options.cwd ?? process.cwd()));
  warnings.push(...discovery.warnings);
  const candidates: Candidate[] = [];
  const add = (
    text: string,
    hit: Omit<RecallHit, "ref" | "excerpt" | "matchedTerms" | "strength">,
    ref: Omit<EvidenceRef, "start" | "end">,
  ): void => {
    const matches = matchTerms(text, terms);
    const pathMatches = hit.path ? matchTerms(hit.path, terms) : [];
    const title = ref.kind === "doc"
      ? /^#{1,6}\s+(.+)$/m.exec(text)?.[1] ?? hit.title ?? ""
      : "";
    const titleMatches = matchTerms(title, terms);
    if (!matches.length && !pathMatches.length) return;
    const window = matches.length
      ? excerptAround(text, matches.map((h) => h.term), EXCERPT_CHARS)
      : windowAt(text, 0, 0, EXCERPT_CHARS);
    const matchedTerms = [...new Set([...matches, ...pathMatches].map((h) => h.term))];
    const coverage = required.filter((t) => matchedTerms.includes(t)).length;
    const bodySource =
      ref.kind === "doc" ? text.replace(/^#{1,6}[ \t].*$/m, "") : "";
    const bodyHits = bodySource ? matchTerms(bodySource, terms) : [];
    const bodyCoverage = required.filter((term) =>
      bodyHits.some((match) => match.term === term),
    ).length;
    const titleCoverage = titleMatches.length / terms.length;
    const pathCoverage = pathMatches.length / terms.length;
    // A user question can match every term without stating a rule. Keep that
    // request as a weak clue so it cannot fill the default hits.
    const userTurn = ref.kind === "session" && hit.section === "user";
    const echo =
      userTurn &&
      (isQueryEcho(text, required) ||
        (coverage === required.length && !hasAnswerSignal(text)));
    const record: RecallHit = {
      ...hit,
      ...(title ? { title } : {}),
      ref: encodeRef({
        ...ref,
        start: window.anchorStart,
        end: window.anchorEnd,
      }),
      excerpt: window.excerpt,
      matchedTerms,
      strength: !echo && coverage === required.length ? "strong" : "weak",
    };
    if (ref.kind === "doc") {
      record.line = text.slice(0, window.anchorStart).split("\n").length;
      record.section = headingBefore(text, window.anchorStart);
    }
    candidates.push({
      hit: record,
      source: text,
      anchorStart: window.anchorStart,
      anchorEnd: window.anchorEnd,
      coverage: echo ? 0 : coverage,
      bodyEvidence: hasBodyEvidence(bodyCoverage, required.length),
      idCoverage: required.filter(
        (term) => /\d/.test(term) && matchedTerms.includes(term),
      ).length,
      derivedCoverage: matchedTerms.length / Math.max(1, terms.length),
      titleCoverage,
      pathCoverage,
      // The full versioned neighborhood and speaker must agree. Equal excerpts
      // alone may hide different qualifiers, denials, or attribution.
      duplicateKey: JSON.stringify([hit.sourceKind, hit.path ?? hit.sessionId,
        hit.section, ref.hash, window.anchorStart, window.anchorEnd]),
    });
  };
  const docTexts = new Map<string, string>();
  for (const doc of discovery.docs) {
    const text = readDocText(discovery.root, doc.filePath, warnings);
    if (text === undefined) continue;
    docTexts.set(doc.relPath, text);
    const lineage = followLineage(
      text,
      doc.relPath,
      discovery,
      docTexts,
      warnings,
    );
    const status = lineage.superseded
      ? ("superseded" as const)
      : doc.archived
        ? ("archived" as const)
        : undefined;
    add(
      text,
      {
        sourceKind: "doc",
        title: doc.relPath,
        path: doc.relPath,
        ...(status ? { status } : {}),
        ...(lineage.supersededBy ? { supersededBy: lineage.supersededBy } : {}),
        ...(lineage.successorExcerpt
          ? { successorExcerpt: lineage.successorExcerpt }
          : {}),
        ...(lineage.fault ? { lineageFault: lineage.fault } : {}),
      },
      { kind: "doc", path: doc.relPath, hash: fingerprint(text) },
    );
  }
  const filter = resolveFilter({
    cwd: discovery.root,
    platform: options.platform,
    limit: WIDE_LIMIT,
  });
  for (const session of listAll(filter, warnings)) {
    const adapter = MEM_PLATFORMS[session.platform];
    try {
      adapter.prepare?.(session.filePath, warnings);
      const turns = adapter.extract(session, warnings);
      turns.forEach((turn, idx) => {
        if (turn.kind === "marker") return;
        add(
          turn.text,
          {
            sourceKind: session.platform,
            title: session.id,
            section: turn.role,
            sessionId: session.id,
            turn: idx,
            ...(session.created ? { sourceTime: session.created } : {}),
          },
          {
            kind: "session",
            platform: session.platform,
            id: session.id,
            turn: idx,
            hash: fingerprint(
              JSON.stringify(turns.slice(Math.max(0, idx - 1), idx + 2)),
            ),
          },
        );
      });
    } finally {
      adapter.release?.();
    }
  }
  const strong = candidates.filter((c) => c.hit.strength === "strong");
  // A user question, even one that states a correction, does not by itself
  // drop every weaker document.
  const strongCurrent = strong.filter(
    (c) => inactiveRank(c.hit) === 0 && c.hit.section !== "user",
  );
  const successors = new Set(strong.filter((c) => !c.hit.lineageFault)
    .map((c) => c.hit.supersededBy).filter(Boolean));
  // A current rule may use fewer query terms than the note it replaces.
  // Archived title matches alone must not drop that current note.
  const pool = strongCurrent.length
    ? candidates.filter((c) => c.hit.strength === "strong" || successors.has(c.hit.path))
    : candidates;
  const selected = select(pool, limit, maxChars);
  return {
    ...selected,
    totalHits: pool.length,
    incomplete: warnings.length > 0,
    warnings,
  };
}

/** Preserve the hit first, then spend the remaining budget on neighboring turns. */
function dialogueWindow(
  turns: readonly DialogueTurn[],
  idx: number,
  start: number,
  end: number,
  budget: number,
): { text: string; truncated: boolean } {
  const selected = new Map<number, string>();
  const hit = turns[idx];
  if (!hit) return { text: "", truncated: false };
  const prefix = `${hit.role}: `;
  if (budget < prefix.length + 1) return { text: "", truncated: true };
  const neighbors = [idx - 1, idx + 1]
    .filter((i) => turns[i] && turns[i]?.kind !== "marker")
    .sort(
      (a, b) => (turns[a]?.text.length ?? 0) - (turns[b]?.text.length ?? 0),
    );
  const hitBudget = neighbors.length
    ? Math.max(1, Math.floor((budget - prefix.length) / 2))
    : budget - prefix.length;
  const window = windowAt(hit.text, start, end, hitBudget);
  selected.set(idx, prefix + window.excerpt);
  let used = prefix.length + window.excerpt.length;
  let truncated = window.truncated;
  for (const neighbor of neighbors) {
    const turn = turns[neighbor];
    if (!turn || turn.kind === "marker") continue;
    const label = `${turn.role}: `;
    const available = budget - used - label.length - 2;
    if (available < 1) {
      truncated = true;
      continue;
    }
    const anchor = neighbor < idx ? turn.text.length : 0;
    const w = windowAt(turn.text, anchor, anchor, available);
    selected.set(neighbor, label + w.excerpt);
    used += label.length + w.excerpt.length + 2;
    truncated ||= w.truncated;
  }
  return {
    text: [...selected]
      .sort(([a], [b]) => a - b)
      .map(([, t]) => t)
      .join("\n\n"),
    truncated,
  };
}

function readDoc(
  ref: string,
  evidence: EvidenceRef,
  discovery: DocDiscovery,
  budget: number,
  warnings: MemWarning[],
): RecallRead | undefined {
  const abs = path.resolve(discovery.root, evidence.path ?? "");
  const real = allowedDocPath(discovery.root, abs);
  if (!real || !discovery.docs.some((d) => d.filePath === real)) {
    warnings.push({
      code: "ref-outside-project",
      message:
        "document ref is missing or outside the allowed project sources; recall again",
    });
    return undefined;
  }
  const text = readDocText(discovery.root, real, warnings);
  if (text === undefined) return undefined;
  const lineage = followLineage(
    text,
    evidence.path ?? "",
    discovery,
    new Map(),
    warnings,
  );
  const lineageFields = {
    ...(lineage.superseded ? { status: "superseded" as const } : {}),
    ...(lineage.supersededBy ? { supersededBy: lineage.supersededBy } : {}),
    ...(lineage.fault ? { lineageFault: lineage.fault } : {}),
  };
  if (fingerprint(text) !== evidence.hash) {
    warnings.push({
      code: "ref-changed",
      message: "document changed since recall; recall again before using it",
    });
    return {
      ref,
      sourceKind: "doc",
      path: evidence.path,
      text: "",
      changed: true,
      ...lineageFields,
    };
  }
  if (evidence.end > text.length) {
    warnings.push({
      code: "ref-invalid",
      message: "document anchor is out of bounds",
    });
    return undefined;
  }
  const w = windowAt(text, evidence.start, evidence.end, budget);
  return {
    ref,
    sourceKind: "doc",
    path: evidence.path,
    title: evidence.path,
    text: w.excerpt,
    changed: false,
    truncated: w.truncated,
    ...lineageFields,
  };
}

function readSession(
  ref: string,
  evidence: EvidenceRef,
  root: string,
  budget: number,
  warnings: MemWarning[],
): RecallRead | undefined {
  const platform = evidence.platform;
  if (!platform || evidence.id === undefined || evidence.turn === undefined)
    return undefined;
  const session = listAll(
    resolveFilter({ cwd: root, platform, limit: WIDE_LIMIT }),
    warnings,
  ).find((s) => s.id === evidence.id && sameProject(s.cwd, root));
  if (!session) {
    warnings.push({
      code: "ref-missing",
      message: "session ref no longer resolves in this project",
    });
    return undefined;
  }
  const turns = MEM_PLATFORMS[platform].extract(session, warnings);
  const idx = evidence.turn;
  const turn = turns[idx];
  if (
    !turn ||
    fingerprint(JSON.stringify(turns.slice(Math.max(0, idx - 1), idx + 2))) !==
      evidence.hash
  ) {
    warnings.push({
      code: "ref-changed",
      message: "dialogue window changed since recall; recall again",
    });
    return {
      ref,
      sourceKind: platform,
      sessionId: session.id,
      text: "",
      changed: true,
    };
  }
  if (evidence.end > turn.text.length) {
    warnings.push({
      code: "ref-invalid",
      message: "dialogue anchor is out of bounds",
    });
    return undefined;
  }
  const window = dialogueWindow(
    turns,
    idx,
    evidence.start,
    evidence.end,
    budget,
  );
  return {
    ref,
    sourceKind: platform,
    title: session.id,
    sessionId: session.id,
    ...window,
    changed: false,
  };
}

/** Expand only versioned refs emitted by recall, with one total batch budget. */
export function readMemRefs(options: ReadMemRefsOptions): RecallReadResult {
  const discovery = discoverDocs(path.resolve(options.cwd ?? process.cwd()));
  const warnings = [...discovery.warnings];
  const budget = positive(options.maxChars, 4000);
  const reads: RecallRead[] = [];
  let used = 0;
  let truncated = options.refs.length > MAX_REFS;
  const refs = [...new Set(options.refs)].slice(0, MAX_REFS);
  for (const [index, ref] of refs.entries()) {
    const evidence = decodeRef(ref);
    if (!evidence) {
      warnings.push({
        code: "ref-invalid",
        message:
          "invalid or unversioned ref; run recall to obtain a current ref",
      });
      continue;
    }
    // Reserve metadata before reading, so one batch cannot grow per-ref caps.
    const overhead = JSON.stringify({
      ref,
      sourceKind: evidence.platform ?? "doc",
      title: evidence.path ?? evidence.id,
      ...(evidence.kind === "doc"
        ? { path: evidence.path }
        : { sessionId: evidence.id }),
      text: "",
      changed: false,
      truncated: false,
    }).length;
    const allowance = Math.floor((budget - used) / (refs.length - index));
    const remaining = allowance - overhead;
    if (remaining < 1) {
      truncated = true;
      break;
    }
    let read =
      evidence.kind === "doc"
        ? readDoc(ref, evidence, discovery, remaining, warnings)
        : readSession(ref, evidence, discovery.root, remaining, warnings);
    if (!read) continue;
    let cap = remaining;
    while (JSON.stringify(read).length > allowance && cap > 0) {
      cap -= Math.max(1, JSON.stringify(read).length - allowance);
      if (cap <= 0) break;
      read =
        evidence.kind === "doc"
          ? readDoc(ref, evidence, discovery, cap, warnings)
          : readSession(ref, evidence, discovery.root, cap, warnings);
      if (!read) break;
    }
    if (!read || JSON.stringify(read).length > allowance) {
      truncated = true;
      continue;
    }
    reads.push(read);
    used += JSON.stringify(read).length;
    truncated ||= read.truncated === true;
  }
  return { reads, warnings, truncated };
}
