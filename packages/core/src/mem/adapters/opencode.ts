/**
 * OpenCode 1.2+ persisted-session reader.
 *
 * OpenCode stores sessions in a WAL-mode SQLite database under its XDG data
 * dir (see `internal/paths.ts:opencodeDbPath`). The three tables this adapter
 * reads, confirmed against a live 1.18 store:
 *
 *   - `session`  — id / parent_id (sub-agent chain) / title / directory
 *                  (workspace cwd) / time_created / time_updated
 *   - `message`  — id / session_id / time_created / data (JSON: {role, ...})
 *   - `part`     — message_id / session_id / time_created /
 *                  data (JSON: {type: "text"|"tool"|"reasoning"|..., ...})
 *
 * SQLite access is via the zero-dependency parser in
 * `internal/sqlite-readonly.ts`. A `better-sqlite3`-backed reader shipped in
 * 0.6.0-beta.3 and was reverted one release later because its prebuild
 * download + node-gyp fallback broke `npm install` on Windows and restricted
 * networks; no native module, WASM blob, system `sqlite3`, or install-time
 * build step may come back with this adapter.
 *
 * Everything here is read-only: the database is snapshotted and parsed, never
 * opened for write, locked, checkpointed, or copied over.
 */

import * as fs from "node:fs";

import {
  compactionBoundaryTurn,
  stripInjectionTags,
  isBootstrapTurn,
} from "../dialogue.js";
import { inRangeOverlap, sameProject } from "../filter.js";
import {
  openSqliteReadOnly,
  SqliteParseError,
  SqliteSnapshotUnstableError,
  type SqliteRow,
  type SqliteTableInfo,
} from "../internal/sqlite-readonly.js";
import { opencodeDbPath } from "../internal/paths.js";
import { searchInDialogue } from "../search.js";
import type {
  DialogueRole,
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  MemWarning,
  SearchHit,
} from "../types.js";

// ---------- loose external shapes ----------

interface OpencodeMessageData {
  role?: string;
}

interface OpencodePartData {
  type?: string;
  text?: string;
  summaryMessageId?: unknown;
  tail_start_id?: unknown;
  compactBoundary?: unknown;
  replace?: unknown;
}

function parseDialogueRole(v: unknown): DialogueRole | undefined {
  return v === "user" || v === "assistant" ? v : undefined;
}

/** Safely parse the JSON stored in a `data` column. Returns null on failure —
 * a row carrying hostile or truncated JSON is dropped, never thrown on. */
function parseDataJson(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ---------- schema contract ----------

const SESSION_TABLE = "session";
const MESSAGE_TABLE = "message";
const PART_TABLE = "part";

/** Accepted spellings for the session's workspace directory, in preference
 * order. Current OpenCode uses `directory`; `cwd` is accepted so an older or
 * renamed store still lists rather than failing closed. */
const SESSION_CWD_COLUMNS = ["directory", "cwd"] as const;

/**
 * Thrown when the store is a readable SQLite file whose tables/columns do not
 * match anything this adapter knows how to interpret. Kept distinct from a
 * corrupt file so the CLI can tell "OpenCode changed its schema" apart from
 * "this database is damaged" — both degrade to an empty result.
 */
class OpencodeSchemaError extends SqliteParseError {
  constructor(message: string) {
    super(message);
    this.name = "OpencodeSchemaError";
  }
}

const DB_UNREADABLE_WARNING_CODE = "opencode-db-unreadable";
const DB_SNAPSHOT_UNSTABLE_WARNING_CODE = "opencode-db-snapshot-unstable";
const DB_SCHEMA_WARNING_CODE = "opencode-db-schema-unsupported";

/** Record one degradation per condition per command — repeated failures while
 * scanning many sessions must not produce repeated terminal noise. */
function pushDbWarning(
  warnings: MemWarning[],
  dbPath: string,
  error: SqliteParseError,
): void {
  const code =
    error instanceof SqliteSnapshotUnstableError
      ? DB_SNAPSHOT_UNSTABLE_WARNING_CODE
      : error instanceof OpencodeSchemaError
        ? DB_SCHEMA_WARNING_CODE
        : DB_UNREADABLE_WARNING_CODE;
  if (warnings.some((warning) => warning.code === code)) return;

  const message =
    code === DB_SNAPSHOT_UNSTABLE_WARNING_CODE
      ? `OpenCode is writing to its session database; retry in a moment (${dbPath})`
      : code === DB_SCHEMA_WARNING_CODE
        ? `unsupported OpenCode session schema (${dbPath}): ${error.message}`
        : `cannot read OpenCode session database (${dbPath}): ${error.message}`;
  warnings.push({ code, message });
}

type ReadOnlyDb = ReturnType<typeof openSqliteReadOnly>;

function findTable(db: ReadOnlyDb, name: string): SqliteTableInfo {
  const table = db.listTables().find((item) => item.name === name);
  if (!table) {
    throw new OpencodeSchemaError(`missing table: ${name}`);
  }
  return table;
}

/** True when `CREATE TABLE` sql declares a column of this exact name. Column
 * semantics are matched by name only — never by position, so a reordered or
 * extended schema cannot silently shift values into the wrong field. */
function declaresColumn(table: SqliteTableInfo, name: string): boolean {
  const pattern = new RegExp(
    `(?:\\(|,)\\s*["\`\\[]?${name}(?:["\`\\]]|\\b)`,
    "i",
  );
  return pattern.test(table.sql);
}

function requireColumns(
  table: SqliteTableInfo,
  names: readonly string[],
): void {
  const missing = names.filter((name) => !declaresColumn(table, name));
  if (missing.length > 0) {
    throw new OpencodeSchemaError(
      `table ${table.name} is missing column(s): ${missing.join(", ")}`,
    );
  }
}

/** Pick the first accepted spelling a table actually declares. */
function requireOneOfColumns(
  table: SqliteTableInfo,
  candidates: readonly string[],
): string {
  const found = candidates.find((name) => declaresColumn(table, name));
  if (!found) {
    throw new OpencodeSchemaError(
      `table ${table.name} has none of the expected column(s): ${candidates.join(" / ")}`,
    );
  }
  return found;
}

/** The declared schema and the decoded rows can disagree when the sql failed to
 * parse; re-check against a real row before trusting any of it. */
function requireRowColumns(
  rows: readonly SqliteRow[],
  tableName: string,
  names: readonly string[],
): void {
  const first = rows[0];
  if (!first) return;
  const missing = names.filter((name) => !(name in first));
  if (missing.length > 0) {
    throw new OpencodeSchemaError(
      `table ${tableName} is missing column(s): ${missing.join(", ")}`,
    );
  }
}

// ---------- message / part store ----------

interface OpencodeMessageRow {
  id: string;
  time_created: number;
  /** Scan position, used to break ties so equal timestamps still order
   * deterministically instead of depending on sort stability. */
  seq: number;
  role: DialogueRole;
}

interface OpencodePartRow {
  time_created: number;
  seq: number;
  data: Record<string, unknown>;
}

/**
 * Messages + parts grouped by session. Only the search path builds this for a
 * whole database; extract / context populate it with one session's rows.
 */
interface OpencodeSessionStore {
  messagesBySession: Map<string, OpencodeMessageRow[]>;
  partsByMsg: Map<string, OpencodePartRow[]>;
}

function emptySessionStore(): OpencodeSessionStore {
  return { messagesBySession: new Map(), partsByMsg: new Map() };
}

/** Scan position breaks ties so rows written in the same millisecond still
 * order the same way on every run. */
function byTimeThenScan(
  a: { time_created: number; seq: number },
  b: { time_created: number; seq: number },
): number {
  return a.time_created !== b.time_created
    ? a.time_created - b.time_created
    : a.seq - b.seq;
}

function buildSessionStore(
  allMessages: readonly SqliteRow[],
  allParts: readonly SqliteRow[],
): OpencodeSessionStore {
  const messagesBySession = new Map<string, OpencodeMessageRow[]>();
  for (let i = 0; i < allMessages.length; i++) {
    const row = allMessages[i];
    if (!row) continue;
    const sessionId = typeof row.session_id === "string" ? row.session_id : "";
    const id = typeof row.id === "string" ? row.id : "";
    if (!sessionId || !id) continue;
    const data = parseDataJson(row.data) as OpencodeMessageData | null;
    const role = parseDialogueRole(data?.role);
    if (!role) continue;
    const list = messagesBySession.get(sessionId) ?? [];
    list.push({
      id,
      time_created: typeof row.time_created === "number" ? row.time_created : 0,
      seq: i,
      role,
    });
    messagesBySession.set(sessionId, list);
  }

  const partsByMsg = new Map<string, OpencodePartRow[]>();
  for (let i = 0; i < allParts.length; i++) {
    const row = allParts[i];
    if (!row) continue;
    const msgId = typeof row.message_id === "string" ? row.message_id : "";
    if (!msgId) continue;
    const data = parseDataJson(row.data);
    if (!data) continue;
    const list = partsByMsg.get(msgId) ?? [];
    list.push({
      time_created: typeof row.time_created === "number" ? row.time_created : 0,
      seq: i,
      data,
    });
    partsByMsg.set(msgId, list);
  }

  for (const list of messagesBySession.values()) list.sort(byTimeThenScan);
  for (const list of partsByMsg.values()) list.sort(byTimeThenScan);

  return { messagesBySession, partsByMsg };
}

/** Validate `message` / `part` and return the rows selected by `sessionId`, or
 * every row when `sessionId` is undefined (the search store). */
function scanMessagesAndParts(
  db: ReadOnlyDb,
  sessionId: string | undefined,
): OpencodeSessionStore {
  const messageTable = findTable(db, MESSAGE_TABLE);
  requireColumns(messageTable, ["id", "session_id", "data"]);
  const partTable = findTable(db, PART_TABLE);
  requireColumns(partTable, ["message_id", "data"]);

  const messages =
    sessionId === undefined
      ? db.scanTable(MESSAGE_TABLE)
      : db.scanTable(MESSAGE_TABLE, (row) => row.session_id === sessionId);
  requireRowColumns(messages, MESSAGE_TABLE, ["id", "session_id", "data"]);

  let parts: SqliteRow[];
  if (sessionId === undefined) {
    parts = db.scanTable(PART_TABLE);
  } else if (declaresColumn(partTable, "session_id")) {
    // Current OpenCode denormalizes `session_id` onto `part`, so one session's
    // parts can be selected without first materializing its message ids.
    parts = db.scanTable(PART_TABLE, (row) => row.session_id === sessionId);
  } else {
    const messageIds = new Set(
      messages
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string"),
    );
    parts = db.scanTable(
      PART_TABLE,
      (row) =>
        typeof row.message_id === "string" && messageIds.has(row.message_id),
    );
  }
  requireRowColumns(parts, PART_TABLE, ["message_id", "data"]);

  return buildSessionStore(messages, parts);
}

/** Search-scoped whole-db store, prepared and released by the orchestrator.
 * One-session extract / context calls never populate it. */
let preparedStore: { dbPath: string; store: OpencodeSessionStore } | null =
  null;

export function prepareOpencodeSessionStore(
  dbPath: string,
  warnings: MemWarning[] = [],
): void {
  let store = emptySessionStore();
  if (fs.existsSync(dbPath)) {
    try {
      const db = openSqliteReadOnly(dbPath);
      try {
        store = scanMessagesAndParts(db, undefined);
      } finally {
        db.close();
      }
    } catch (error) {
      if (!(error instanceof SqliteParseError)) throw error;
      pushDbWarning(warnings, dbPath, error);
      store = emptySessionStore();
    }
  }
  preparedStore = { dbPath, store };
}

export function releaseOpencodeSessionStore(): void {
  preparedStore = null;
}

/** Read one session's messages + parts, reusing the search-scoped store when
 * the orchestrator prepared one for this same database. */
function readSessionMessages(
  dbPath: string,
  sessionId: string,
  warnings: MemWarning[],
): {
  messages: OpencodeMessageRow[];
  partsByMsg: Map<string, OpencodePartRow[]>;
} {
  if (preparedStore?.dbPath === dbPath) {
    return {
      messages: preparedStore.store.messagesBySession.get(sessionId) ?? [],
      partsByMsg: preparedStore.store.partsByMsg,
    };
  }
  if (!fs.existsSync(dbPath)) return { messages: [], partsByMsg: new Map() };

  let store: OpencodeSessionStore;
  try {
    const db = openSqliteReadOnly(dbPath);
    try {
      store = scanMessagesAndParts(db, sessionId);
    } finally {
      db.close();
    }
  } catch (error) {
    if (!(error instanceof SqliteParseError)) throw error;
    pushDbWarning(warnings, dbPath, error);
    return { messages: [], partsByMsg: new Map() };
  }
  return {
    messages: store.messagesBySession.get(sessionId) ?? [],
    partsByMsg: store.partsByMsg,
  };
}

// ---------- compaction ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCompactionSummaryPart(data: Record<string, unknown>): boolean {
  return (
    data.type === "compaction" &&
    (typeof data.tail_start_id === "string" || isRecord(data.compactBoundary))
  );
}

function compactionMarkerSummaryId(
  data: Record<string, unknown>,
): string | undefined {
  return data.type === "compaction" &&
    data.replace === true &&
    typeof data.summaryMessageId === "string"
    ? data.summaryMessageId
    : undefined;
}

/**
 * Identify the messages that carry a compaction summary. The compacted turns
 * remain as rows in the same database, so they stay in the dialogue and the
 * summary message is rendered as a boundary marker in place.
 *
 * The marker shape (`{type:"compaction", replace, summaryMessageId}` plus a
 * summary part with `tail_start_id` / `compactBoundary`) is the one ZCode
 * inherited from its OpenCode fork. If OpenCode never writes it, no message is
 * classified as a summary and every turn reads as ordinary dialogue.
 */
function compactSummaryMessageIds(
  messages: readonly OpencodeMessageRow[],
  partsByMsg: Map<string, OpencodePartRow[]>,
): Set<string> {
  const summaryIds = new Set<string>();
  const markerSummaryIds = new Set<string>();

  for (const msg of messages) {
    if (markerSummaryIds.has(msg.id)) summaryIds.add(msg.id);
    for (const part of partsByMsg.get(msg.id) ?? []) {
      const markerSummaryId = compactionMarkerSummaryId(part.data);
      if (markerSummaryId) markerSummaryIds.add(markerSummaryId);
      if (isCompactionSummaryPart(part.data)) {
        summaryIds.add(msg.id);
        break;
      }
    }
  }
  return summaryIds;
}

/**
 * One message becomes one turn: its `text` parts concatenated, then cleaned.
 * `reasoning`, `tool`, `step-start` and `step-finish` parts are not dialogue
 * and are skipped. Messages left with no text are dropped.
 */
function buildTextTurn(
  msg: OpencodeMessageRow,
  parts: readonly OpencodePartRow[],
  compactSummaryIds: ReadonlySet<string>,
): DialogueTurn | null {
  const collected: string[] = [];
  let totalRaw = 0;
  for (const part of parts) {
    const pd = part.data as OpencodePartData;
    if (pd.type !== "text") continue;
    const txt = typeof pd.text === "string" ? pd.text : "";
    if (!txt) continue;
    totalRaw += txt.length;
    collected.push(stripInjectionTags(txt));
  }
  if (!collected.length) return null;

  const merged = collected.join("\n\n");
  if (compactSummaryIds.has(msg.id)) {
    return compactionBoundaryTurn(
      "context compacted here; the turns above are still in the OpenCode database",
      merged,
    );
  }
  if (isBootstrapTurn(merged, totalRaw)) return null;
  return merged.trim() ? { role: msg.role, text: merged } : null;
}

// ---------- list ----------

/** Largest absolute time value an ECMAScript Date can represent. */
const MAX_TIME_VALUE = 8.64e15;

function toIso(epochMs: unknown): string | undefined {
  // A corrupt or hostile timestamp must degrade to "no timestamp", not throw
  // RangeError out of the row loop and fail the whole command.
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return undefined;
  if (epochMs <= 0 || epochMs > MAX_TIME_VALUE) return undefined;
  return new Date(epochMs).toISOString();
}

/**
 * List OpenCode sessions from the `session` table only — listing never touches
 * `message` or `part`. A machine with no OpenCode store lists nothing and
 * warns about nothing.
 */
export function opencodeListSessions(
  f: MemFilter,
  warnings: MemWarning[] = [],
): MemSessionInfo[] {
  const dbPath = opencodeDbPath();
  if (dbPath === undefined || !fs.existsSync(dbPath)) return [];

  let rows: SqliteRow[];
  let cwdColumn: string;
  try {
    const db = openSqliteReadOnly(dbPath);
    try {
      const table = findTable(db, SESSION_TABLE);
      requireColumns(table, ["id", "time_created", "time_updated"]);
      cwdColumn = requireOneOfColumns(table, SESSION_CWD_COLUMNS);
      rows = db.scanTable(SESSION_TABLE);
      requireRowColumns(rows, SESSION_TABLE, [
        "id",
        cwdColumn,
        "time_created",
        "time_updated",
      ]);
    } finally {
      db.close();
    }
  } catch (error) {
    if (!(error instanceof SqliteParseError)) throw error;
    pushDbWarning(warnings, dbPath, error);
    return [];
  }

  const out: MemSessionInfo[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;

    const directory =
      typeof row[cwdColumn] === "string"
        ? (row[cwdColumn] as string)
        : undefined;
    if (f.cwd && !sameProject(directory, f.cwd)) continue;

    const created = toIso(row.time_created);
    const updated = toIso(row.time_updated) ?? created;
    if (!inRangeOverlap(created, updated, f)) continue;

    out.push({
      platform: "opencode",
      id,
      title: typeof row.title === "string" ? row.title : undefined,
      cwd: directory,
      created,
      updated,
      filePath: dbPath,
      // Sub-agent sessions point at their dispatcher; `--include-children`
      // merges them into the parent.
      ...(typeof row.parent_id === "string" && row.parent_id
        ? { parent_id: row.parent_id }
        : {}),
    });
  }
  return out;
}

// ---------- extract / search ----------

export function opencodeExtractDialogue(
  s: MemSessionInfo,
  warnings: MemWarning[] = [],
): DialogueTurn[] {
  const { messages, partsByMsg } = readSessionMessages(
    s.filePath,
    s.id,
    warnings,
  );
  const summaryIds = compactSummaryMessageIds(messages, partsByMsg);
  const turns: DialogueTurn[] = [];
  for (const msg of messages) {
    const turn = buildTextTurn(msg, partsByMsg.get(msg.id) ?? [], summaryIds);
    if (turn) turns.push(turn);
  }
  return turns;
}

export function opencodeSearch(
  s: MemSessionInfo,
  kw: string,
  warnings: MemWarning[] = [],
): SearchHit {
  return searchInDialogue(opencodeExtractDialogue(s, warnings), kw);
}
