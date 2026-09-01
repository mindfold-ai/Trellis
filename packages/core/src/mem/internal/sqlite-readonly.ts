/**
 * Zero-dependency read-only SQLite file parser.
 *
 * `@mindfoldhq/trellis-core` is intentionally free of runtime dependencies —
 * `better-sqlite3` was tried for the OpenCode adapter and reverted because its
 * native build chain broke `npm install` on Windows + restricted networks. This
 * parser is the minimum viable reader needed by the ZCode `mem` adapter: list
 * tables, full-scan one table, return rows as `{ [columnName]: value }`. It is
 * NOT a SQL engine: no WHERE pushdown, no index lookup, no writes.
 *
 * Scope:
 *   - Database header (page size, db size, text encoding, WAL flag)
 *   - Table b-tree leaf (0x0d) + interior (0x05) traversal
 *   - Record decode for TEXT / INTEGER / NULL / float64 / BLOB(serial only)
 *   - Overflow page chains (long TEXT rows like ZCode `message.data`)
 *   - WAL replay: stable main/WAL snapshot, WAL-index `mxFrame` end mark, and
 *     cumulative header/frame checksum verification.
 *
 * Out of scope:
 *   - WITHOUT ROWID tables (return [] — their rows live in index b-trees,
 *     which this parser doesn't walk). ZCode's tables are normal rowid tables.
 *
 * Format references:
 *   - https://www.sqlite.org/fileformat2.html
 *   - https://www.sqlite.org/walformat.html
 *
 * All multi-byte integers are big-endian (SQLite's native byte order).
 */

import * as fs from "node:fs";

// ---------- public types ----------

/** One row from `scanTable`, keyed by column name. Values are decoded JS
 * primitives. NULL → null, INTEGER → number, TEXT → string, BLOB →
 * Uint8Array, float → number. Columns are keyed by the CREATE TABLE column
 * order; if the column-name parse failed, keys fall back to `col0`, `col1`... */
export type SqliteRow = Record<string, unknown>;

export interface SqliteTableInfo {
  name: string;
  rootPgno: number;
  /** The raw `CREATE TABLE` SQL (used to recover column names). */
  sql: string;
}

export interface SqliteReadOnly {
  /** List user tables (type='table') from sqlite_master. */
  listTables(): SqliteTableInfo[];
  /** Full-scan a table by name, yielding rows. Returns [] when the table is
   * missing. Throws `SqliteParseError` on structural corruption. */
  scanTable(
    tableName: string,
    predicate?: (row: SqliteRow) => boolean,
  ): SqliteRow[];
  /** The db file path this reader was opened against. */
  readonly dbPath: string;
  close(): void;
}

// ---------- errors ----------

/** Thrown when the SQLite file is structurally invalid. Adapters are expected
 * to catch this and degrade to an empty result rather than crash the CLI. */
export class SqliteParseError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SqliteParseError";
  }
}

/**
 * Thrown when the database files do not remain stable across all snapshot
 * capture attempts. This is deliberately distinct from a malformed database:
 * callers must not parse a snapshot whose consistency they could not verify.
 */
export class SqliteSnapshotUnstableError extends SqliteParseError {
  constructor(mainPath: string) {
    super(
      `SQLite main/WAL files changed while capturing a read snapshot: ${mainPath}`,
    );
    this.name = "SqliteSnapshotUnstableError";
  }
}

// ---------- low-level byte readers (big-endian) ----------

/** Read one byte at `off`, treating out-of-range reads as 0. Avoids the
 * `no-non-null-assertion` lint rule while keeping byte access concise. */
function byteAt(buf: Uint8Array, off: number): number {
  return off >= 0 && off < buf.length ? buf[off] : 0;
}

function readUint32BE(buf: Uint8Array, off: number): number {
  return (
    (byteAt(buf, off) * 0x1000000 +
      ((byteAt(buf, off + 1) << 16) |
        (byteAt(buf, off + 2) << 8) |
        byteAt(buf, off + 3))) >>>
    0
  );
}

function readUint16BE(buf: Uint8Array, off: number): number {
  return ((byteAt(buf, off) << 8) | byteAt(buf, off + 1)) >>> 0;
}

function readUint8(buf: Uint8Array, off: number): number {
  return byteAt(buf, off);
}

/**
 * Decode a SQLite varint (1-9 bytes, big-endian, high bit = continuation).
 * Returns the integer value and the offset past the varint. The 9th byte
 * contributes all 8 bits.
 *
 * Uses multiplication (`* 128` / `* 256`) rather than left-shift (`<< 7`):
 * `<<` coerces to int32 and wraps past 2³¹, which would corrupt large
 * varints (rowids > 2³¹, or TEXT/BLOB serial types > ~2⁴⁰). Multiplication
 * preserves full precision up to 2⁵³ (Number.MAX_SAFE_INTEGER), which covers
 * every value SQLite can store.
 */
function readVarint(
  buf: Uint8Array,
  off: number,
): { value: number; next: number } {
  let result = 0;
  for (let i = 0; i < 8; i++) {
    const byte = byteAt(buf, off + i);
    if (byte < 0x80) {
      result = result * 128 + byte;
      return { value: result, next: off + i + 1 };
    }
    result = result * 128 + (byte & 0x7f);
  }
  // 9th byte: all 8 bits
  const ninth = byteAt(buf, off + 8);
  result = result * 256 + ninth;
  return { value: result, next: off + 9 };
}

/**
 * Decode a big-endian signed integer of `n` bytes (1,2,3,4,6,8) into a
 * JS number. Used for INTEGER column serial types.
 *
 * Like `readVarint`, this accumulates via multiplication (`* 256`) rather than
 * `<<`, which would wrap to int32 past 2³¹. For n=8 (serial type 6, the full
 * 64-bit INTEGER) values beyond 2⁵³ still lose precision — this is inherent to
 * JS numbers and acceptable here (ZCode never stores such large integers).
 */
function readSignedBE(buf: Uint8Array, off: number, n: number): number {
  let val = 0;
  for (let i = 0; i < n; i++) val = val * 256 + byteAt(buf, off + i);
  // Sign-extend if the high bit is set.
  const bits = n * 8;
  if (val >= 2 ** (bits - 1)) val -= 2 ** bits;
  return val;
}

// ---------- db header ----------

interface DbHeader {
  pageSize: number; // bytes (1 means 65536)
  dbSizePages: number; // page count in main db file
  textEncoding: 1 | 2 | 3; // 1=UTF-8, 2=UTF-16le, 3=UTF-16be
  reservedBytes: number; // per-page reserved region size
}

const DB_HEADER_SIZE = 100;
const WAL_HEADER_SIZE = 32;
const WAL_FRAME_HEADER_SIZE = 24;
const WAL_INDEX_HEADER_SIZE = 96;
const SNAPSHOT_ATTEMPTS = 3;

function parseDbHeader(buf: Uint8Array): DbHeader {
  // Magic "SQLite format 3\0" (note: mixed-case, lowercase 'i').
  if (
    buf[0] !== 0x53 || // S
    buf[1] !== 0x51 || // Q
    buf[2] !== 0x4c || // l
    buf[3] !== 0x69 || // i
    buf[4] !== 0x74 || // t
    buf[5] !== 0x65 // e
  ) {
    throw new SqliteParseError("not a SQLite database (bad magic)");
  }
  const ps = readUint16BE(buf, 16);
  const pageSize = ps === 1 ? 65536 : ps;
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) {
    throw new SqliteParseError(`invalid page size ${pageSize}`);
  }
  const textEncoding = readUint32BE(buf, 56) as 1 | 2 | 3;
  const reservedBytes = readUint8(buf, 20);
  const dbSizePages = readUint32BE(buf, 28);
  return {
    pageSize,
    dbSizePages,
    textEncoding: textEncoding || 1,
    reservedBytes,
  };
}

// ---------- WAL ----------

interface WalState {
  /** pgno → latest page bytes (Uint8Array of length pageSize). */
  pageMap: Map<number, Uint8Array>;
}

interface WalIndexHeader {
  pageSize: number;
  mxFrame: number;
  nPage: number;
  frameChecksum1: number;
  frameChecksum2: number;
  salt1: number;
  salt2: number;
  bigEndianChecksum: boolean;
}

interface FileStamp {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  dev: number;
  ino: number;
}

interface SqliteSnapshot {
  mainFd: number;
  mainStamp: FileStamp;
  walBytes: Uint8Array | null;
  walIndex: WalIndexHeader | null;
}

const HOST_IS_LITTLE_ENDIAN = (() => {
  const bytes = new Uint8Array(4);
  new Uint32Array(bytes.buffer)[0] = 1;
  return bytes[0] === 1;
})();

function readUint32LE(buf: Uint8Array, off: number): number {
  return (
    (byteAt(buf, off) |
      (byteAt(buf, off + 1) << 8) |
      (byteAt(buf, off + 2) << 16) |
      (byteAt(buf, off + 3) * 0x1000000)) >>>
    0
  );
}

function readUint32Native(buf: Uint8Array, off: number): number {
  return HOST_IS_LITTLE_ENDIAN
    ? readUint32LE(buf, off)
    : readUint32BE(buf, off);
}

function readUint16Native(buf: Uint8Array, off: number): number {
  return HOST_IS_LITTLE_ENDIAN
    ? (byteAt(buf, off) | (byteAt(buf, off + 1) << 8)) >>> 0
    : readUint16BE(buf, off);
}

function equalBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function stampFromStat(stat: fs.Stats): FileStamp {
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
    dev: stat.dev,
    ino: stat.ino,
  };
}

function fileStamp(path: string): FileStamp | null {
  try {
    return stampFromStat(fs.statSync(path));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

function fileDescriptorStamp(fd: number): FileStamp {
  return stampFromStat(fs.fstatSync(fd));
}

function sameStamp(a: FileStamp | null, b: FileStamp | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs &&
    a.dev === b.dev &&
    a.ino === b.ino
  );
}

function readOptionalFile(path: string): Uint8Array | null {
  try {
    return fs.readFileSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

function readWalIndexPrefix(path: string): Uint8Array | null {
  const bytes = readOptionalFile(path);
  return bytes === null
    ? null
    : bytes.subarray(0, Math.min(bytes.length, WAL_INDEX_HEADER_SIZE));
}

function walChecksum(
  bytes: Uint8Array,
  off: number,
  length: number,
  bigEndian: boolean,
  seed0: number,
  seed1: number,
): [number, number] {
  if (length % 8 !== 0) {
    throw new SqliteParseError("WAL checksum input is not 8-byte aligned");
  }
  const readWord = bigEndian ? readUint32BE : readUint32LE;
  let s0 = seed0 >>> 0;
  let s1 = seed1 >>> 0;
  for (let i = off; i < off + length; i += 8) {
    s0 = (s0 + readWord(bytes, i) + s1) >>> 0;
    s1 = (s1 + readWord(bytes, i + 4) + s0) >>> 0;
  }
  return [s0, s1];
}

function parseWalIndexHeader(bytes: Uint8Array | null): WalIndexHeader | null {
  if (bytes === null) return null;
  if (bytes.length < WAL_INDEX_HEADER_SIZE) {
    throw new SqliteParseError("WAL-index header is truncated");
  }
  const first = bytes.subarray(0, 48);
  const second = bytes.subarray(48, 96);
  if (!equalBytes(first, second)) {
    throw new SqliteParseError("WAL-index header copies disagree");
  }
  if (byteAt(first, 12) !== 1) {
    throw new SqliteParseError("WAL-index is not initialized");
  }
  const [checksum1, checksum2] = walChecksum(
    first,
    0,
    40,
    !HOST_IS_LITTLE_ENDIAN,
    0,
    0,
  );
  if (
    checksum1 !== readUint32Native(first, 40) ||
    checksum2 !== readUint32Native(first, 44)
  ) {
    throw new SqliteParseError("WAL-index header checksum mismatch");
  }
  const encodedPageSize = readUint16Native(first, 14);
  return {
    pageSize: encodedPageSize === 1 ? 65536 : encodedPageSize,
    mxFrame: readUint32Native(first, 16),
    nPage: readUint32Native(first, 20),
    frameChecksum1: readUint32Native(first, 24),
    frameChecksum2: readUint32Native(first, 28),
    salt1: readUint32BE(first, 32),
    salt2: readUint32BE(first, 36),
    bigEndianChecksum: byteAt(first, 13) !== 0,
  };
}

function captureSnapshot(mainPath: string): SqliteSnapshot {
  const walPath = mainPath + "-wal";
  const shmPath = mainPath + "-shm";
  let lastError: unknown;

  for (let attempt = 0; attempt < SNAPSHOT_ATTEMPTS; attempt++) {
    let mainFd: number | null = null;
    try {
      const shmBefore = readWalIndexPrefix(shmPath);
      const mainBefore = fileStamp(mainPath);
      const walBefore = fileStamp(walPath);
      if (mainBefore === null) {
        throw new SqliteParseError(`cannot read db file: ${mainPath}`);
      }

      mainFd = fs.openSync(mainPath, "r");
      const walBytes = readOptionalFile(walPath);

      const mainAfter = fileStamp(mainPath);
      const walAfter = fileStamp(walPath);
      const shmAfter = readWalIndexPrefix(shmPath);
      if (
        !sameStamp(mainBefore, mainAfter) ||
        !sameStamp(walBefore, walAfter) ||
        !equalBytes(shmBefore, shmAfter)
      ) {
        fs.closeSync(mainFd);
        mainFd = null;
        lastError = new SqliteSnapshotUnstableError(mainPath);
        continue;
      }

      const walIndex = walBytes === null ? null : parseWalIndexHeader(shmAfter);
      return {
        mainFd,
        mainStamp: mainAfter ?? mainBefore,
        walBytes,
        walIndex,
      };
    } catch (error) {
      if (mainFd !== null) fs.closeSync(mainFd);
      lastError = error;
    }
  }

  throw lastError instanceof SqliteParseError
    ? lastError
    : new SqliteParseError(
        `cannot capture SQLite snapshot: ${mainPath}`,
        lastError,
      );
}

/**
 * Validate and replay captured WAL bytes. Returns a page-overrides map or
 * `null` when the WAL is absent.
 *
 * Algorithm (per https://www.sqlite.org/walformat.html):
 *   1. Validate the 32-byte header checksum, salts, and page size.
 *   2. Use WAL-index `mxFrame` as the committed end mark when available;
 *      otherwise stop recovery at the first invalid/stale frame.
 *   3. Validate every frame's cumulative checksum seeded by the header.
 *   4. Replay pages through the committed end mark, with later frames winning.
 */
function loadWal(
  walBytes: Uint8Array | null,
  expectedPageSize: number,
  walIndex: WalIndexHeader | null,
): WalState | null {
  if (walBytes === null) return null;
  if (walBytes.length < WAL_HEADER_SIZE) return null;

  const magic = readUint32BE(walBytes, 0);
  if (magic !== 0x377f0682 && magic !== 0x377f0683) {
    throw new SqliteParseError("invalid WAL magic");
  }
  const bigEndianChecksum = magic === 0x377f0683;
  const walPageSize = readUint32BE(walBytes, 8);
  if (walPageSize !== expectedPageSize) {
    throw new SqliteParseError("WAL page size does not match database");
  }
  const salt1 = readUint32BE(walBytes, 16);
  const salt2 = readUint32BE(walBytes, 20);
  let [checksum1, checksum2] = walChecksum(
    walBytes,
    0,
    24,
    bigEndianChecksum,
    0,
    0,
  );
  if (
    checksum1 !== readUint32BE(walBytes, 24) ||
    checksum2 !== readUint32BE(walBytes, 28)
  ) {
    throw new SqliteParseError("WAL header checksum mismatch");
  }

  if (walIndex) {
    if (
      walIndex.pageSize !== expectedPageSize ||
      walIndex.salt1 !== salt1 ||
      walIndex.salt2 !== salt2 ||
      walIndex.bigEndianChecksum !== bigEndianChecksum
    ) {
      throw new SqliteParseError("WAL-index does not match WAL header");
    }
  }

  const frameSize = WAL_FRAME_HEADER_SIZE + expectedPageSize;
  const frameCount = Math.floor(
    (walBytes.length - WAL_HEADER_SIZE) / frameSize,
  );
  const frameLimit = walIndex?.mxFrame ?? frameCount;
  if (frameLimit > frameCount) {
    throw new SqliteParseError("WAL-index end mark exceeds WAL frame count");
  }

  let lastCommitFrame = -1;
  let validatedFrameCount = 0;
  for (let i = 0; i < frameLimit; i++) {
    const base = WAL_HEADER_SIZE + i * frameSize;
    const fSalt1 = readUint32BE(walBytes, base + 8);
    const fSalt2 = readUint32BE(walBytes, base + 12);
    if (fSalt1 !== salt1 || fSalt2 !== salt2) {
      if (walIndex) {
        throw new SqliteParseError(`WAL frame ${i + 1} salt mismatch`);
      }
      break;
    }
    [checksum1, checksum2] = walChecksum(
      walBytes,
      base,
      8,
      bigEndianChecksum,
      checksum1,
      checksum2,
    );
    [checksum1, checksum2] = walChecksum(
      walBytes,
      base + WAL_FRAME_HEADER_SIZE,
      expectedPageSize,
      bigEndianChecksum,
      checksum1,
      checksum2,
    );
    if (
      checksum1 !== readUint32BE(walBytes, base + 16) ||
      checksum2 !== readUint32BE(walBytes, base + 20)
    ) {
      if (walIndex) {
        throw new SqliteParseError(`WAL frame ${i + 1} checksum mismatch`);
      }
      break;
    }
    validatedFrameCount = i + 1;
    const dbSizeAfterCommit = readUint32BE(walBytes, base + 4);
    if (dbSizeAfterCommit !== 0) lastCommitFrame = i;
  }

  if (walIndex) {
    if (
      checksum1 !== walIndex.frameChecksum1 ||
      checksum2 !== walIndex.frameChecksum2
    ) {
      throw new SqliteParseError(
        "WAL end-mark checksum disagrees with WAL-index",
      );
    }
    if (frameLimit > 0 && lastCommitFrame !== frameLimit - 1) {
      throw new SqliteParseError("WAL-index end mark is not a commit frame");
    }
  }

  if (lastCommitFrame < 0) return { pageMap: new Map() };
  const pageMap = new Map<number, Uint8Array>();
  const replayFrameCount = walIndex
    ? frameLimit
    : Math.min(validatedFrameCount, lastCommitFrame + 1);
  for (let i = 0; i < replayFrameCount; i++) {
    const base = WAL_HEADER_SIZE + i * frameSize;
    const pgno = readUint32BE(walBytes, base);
    const pageStart = base + WAL_FRAME_HEADER_SIZE;
    pageMap.set(
      pgno,
      walBytes.subarray(pageStart, pageStart + expectedPageSize),
    );
  }
  return { pageMap };
}

// ---------- page source ----------

interface PageSource {
  pageSize: number;
  /** Read a page by 1-based number. Falls back to main db file when WAL has no
   * override. Returns a WAL view or a page-sized buffer read on demand. */
  getPage(pgno: number): Uint8Array;
}

function makePageSource(
  snapshot: SqliteSnapshot,
  header: DbHeader,
  wal: WalState | null,
): PageSource {
  return {
    pageSize: header.pageSize,
    getPage(pgno: number): Uint8Array {
      // WAL override first
      if (wal?.pageMap.has(pgno)) {
        const walPage = wal.pageMap.get(pgno);
        if (walPage) return walPage;
      }
      const start = (pgno - 1) * header.pageSize;
      const end = start + header.pageSize;
      if (end > snapshot.mainStamp.size) {
        // Page lives beyond the main file and has no WAL copy — treat as empty.
        return new Uint8Array(header.pageSize);
      }
      const page = new Uint8Array(header.pageSize);
      const bytesRead = readExactly(snapshot.mainFd, page, start);
      if (bytesRead !== header.pageSize) {
        throw new SqliteParseError(`short read for SQLite page ${pgno}`);
      }
      return page;
    },
  };
}

function readExactly(fd: number, target: Uint8Array, position: number): number {
  let offset = 0;
  while (offset < target.length) {
    const bytesRead = fs.readSync(
      fd,
      target,
      offset,
      target.length - offset,
      position + offset,
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return offset;
}

function readMainHeader(snapshot: SqliteSnapshot): Uint8Array {
  const bytes = new Uint8Array(DB_HEADER_SIZE);
  const bytesRead = readExactly(snapshot.mainFd, bytes, 0);
  if (bytesRead !== DB_HEADER_SIZE) {
    throw new SqliteParseError("SQLite database header is truncated");
  }
  return bytes;
}

function isMainSnapshotStable(
  mainPath: string,
  snapshot: SqliteSnapshot,
): boolean {
  try {
    return (
      sameStamp(snapshot.mainStamp, fileStamp(mainPath)) &&
      sameStamp(snapshot.mainStamp, fileDescriptorStamp(snapshot.mainFd))
    );
  } catch {
    return false;
  }
}

// ---------- record decode ----------

interface DecodedRecord {
  values: unknown[];
}

/** Decode a record body (the payload of a table-leaf cell) into an array of
 * JS values. Serial type reference: https://www.sqlite.org/fileformat2.html
 * section 2.1. Only TEXT / INTEGER / NULL / float / BLOB are handled. The
 * caller supplies a reused `TextDecoder` (hoisted per scan) so we don't
 * allocate one per cell. */
function decodeRecord(
  payload: Uint8Array,
  td: InstanceType<typeof TextDecoder>,
): DecodedRecord {
  const headerLenInfo = readVarint(payload, 0);
  const headerLen = headerLenInfo.value;
  const headerEnd = headerLenInfo.next;
  if (headerLen > payload.length) {
    throw new SqliteParseError("record header length exceeds payload");
  }

  // Collect serial types.
  const serialTypes: number[] = [];
  let p = headerEnd;
  while (p < headerLen) {
    const st = readVarint(payload, p);
    serialTypes.push(st.value);
    p = st.next;
  }

  // Decode body values.
  const values: unknown[] = [];
  let bodyOff = headerLen;
  for (const st of serialTypes) {
    if (st === 0) {
      values.push(null);
    } else if (st <= 4) {
      values.push(readSignedBE(payload, bodyOff, st));
      bodyOff += st;
    } else if (st === 5) {
      values.push(readSignedBE(payload, bodyOff, 6));
      bodyOff += 6;
    } else if (st === 6) {
      values.push(readSignedBE(payload, bodyOff, 8));
      bodyOff += 8;
    } else if (st === 7) {
      // float64 big-endian
      const view = new DataView(
        payload.buffer,
        payload.byteOffset + bodyOff,
        8,
      );
      values.push(view.getFloat64(0));
      bodyOff += 8;
    } else if (st === 8) {
      values.push(0);
    } else if (st === 9) {
      values.push(1);
    } else if (st >= 12 && st % 2 === 0) {
      // BLOB
      const len = (st - 12) / 2;
      values.push(payload.subarray(bodyOff, bodyOff + len));
      bodyOff += len;
    } else if (st >= 13 && st % 2 === 1) {
      // TEXT
      const len = (st - 13) / 2;
      values.push(td.decode(payload.subarray(bodyOff, bodyOff + len)));
      bodyOff += len;
    } else {
      // st === 10 or 11 are reserved for internal use; skip defensively.
      values.push(null);
    }
  }
  return { values };
}

function decodeTextDecoderEncoding(
  enc: 1 | 2 | 3,
): "utf-8" | "utf-16le" | "utf-16be" {
  if (enc === 2) return "utf-16le";
  if (enc === 3) return "utf-16be";
  return "utf-8";
}

// ---------- b-tree traversal ----------

const PAGE_LEAF_TABLE = 0x0d;
const PAGE_INTERIOR_TABLE = 0x05;

/** A decoded row paired with its b-tree rowid (the cell key). The rowid is
 * needed because an `INTEGER PRIMARY KEY` column is an alias for the rowid:
 * SQLite stores NULL in that column's record slot and the real value lives in
 * the cell's rowid header. Callers that want correct values for such columns
 * must splice the rowid back in. */
interface DecodedRow {
  rowid: number;
  values: unknown[];
}

/**
 * Visit every row from the table b-tree rooted at `rootPgno`, in b-tree key
 * (rowid) order. The visitor form lets callers filter rows without retaining
 * a decoded copy of the entire table first.
 */
function visitTableBtree(
  src: PageSource,
  rootPgno: number,
  textEncoding: 1 | 2 | 3,
  header: DbHeader,
  visit: (row: DecodedRow) => void,
): void {
  // Hoist one decoder per scan instead of allocating one per cell.
  const td = new TextDecoder(decodeTextDecoderEncoding(textEncoding));
  // Visited-set guards against corrupted interior pages whose child pointer
  // forms a cycle (ancestor → self), which would otherwise recurse until the
  // JS stack overflows. Valid SQLite b-trees are acyclic, so this never trims
  // real data.
  const visited = new Set<number>();
  walk(rootPgno);

  function walk(pgno: number): void {
    if (pgno <= 0 || visited.has(pgno)) return;
    visited.add(pgno);
    const page = src.getPage(pgno);
    // Page 1 has a 100-byte db header before its b-tree header.
    const hdrOff = pgno === 1 ? DB_HEADER_SIZE : 0;
    const pageType = byteAt(page, hdrOff);
    if (pageType === PAGE_INTERIOR_TABLE) {
      walkInterior(page, hdrOff);
    } else if (pageType === PAGE_LEAF_TABLE) {
      walkLeaf(page, hdrOff);
    } else {
      // Not a table b-tree page (could be index/freelist). Silently skip — a
      // corrupted root page will just yield no rows rather than crash.
    }
  }

  function walkInterior(page: Uint8Array, hdrOff: number): void {
    const ncells = readUint16BE(page, hdrOff + 3);
    const cellPtrStart = hdrOff + 12; // interior header is 12 bytes
    for (let i = 0; i < ncells; i++) {
      const cellOff = readUint16BE(page, cellPtrStart + i * 2);
      const childPgno = readUint32BE(page, cellOff);
      walk(childPgno);
    }
    // Right-most pointer (header bytes 8-11).
    const rightMost = readUint32BE(page, hdrOff + 8);
    if (rightMost !== 0) walk(rightMost);
  }

  function walkLeaf(page: Uint8Array, hdrOff: number): void {
    const ncells = readUint16BE(page, hdrOff + 3);
    const cellPtrStart = hdrOff + 8; // leaf header is 8 bytes
    for (let i = 0; i < ncells; i++) {
      const cellOff = readUint16BE(page, cellPtrStart + i * 2);
      const { rowid, values } = decodeLeafCell(page, cellOff, src, header, td);
      visit({ rowid, values });
    }
  }
}

/** Compute the overflow thresholds and reassemble a cell payload, following
 * overflow page chains when the payload spills past the leaf page. */
function decodeLeafCell(
  page: Uint8Array,
  cellOff: number,
  src: PageSource,
  header: DbHeader,
  td: InstanceType<typeof TextDecoder>,
): DecodedRow {
  // leaf cell: payloadLen (varint) | rowid (varint) | payload [| overflow pgno]
  let cur = cellOff;
  const payloadLenInfo = readVarint(page, cur);
  cur = payloadLenInfo.next;
  const rowidInfo = readVarint(page, cur);
  cur = rowidInfo.next;
  const payloadLen = payloadLenInfo.value;

  // Overflow math (https://www.sqlite.org/fileformat2.html §1.6).
  const usableSize = header.pageSize - header.reservedBytes;
  const maxLocal = usableSize - 35;
  const minLocal = Math.floor(((usableSize - 12) * 32) / 255) - 23;
  let localBytes: number;
  let overflowPgno: number | null = null;
  if (payloadLen <= maxLocal) {
    localBytes = payloadLen;
  } else {
    const k = minLocal + ((payloadLen - minLocal) % (usableSize - 4));
    localBytes = k <= maxLocal ? k : minLocal;
    overflowPgno = readUint32BE(page, cur + localBytes);
  }

  // Build the full payload buffer.
  let payload: Uint8Array;
  if (overflowPgno === null) {
    payload = page.subarray(cur, cur + localBytes);
  } else {
    const full = new Uint8Array(payloadLen);
    full.set(page.subarray(cur, cur + localBytes), 0);
    let written = localBytes;
    let nextPgno = overflowPgno;
    // Guard against pathological chains.
    let guard = 0;
    while (nextPgno !== 0 && written < payloadLen && guard < 100000) {
      guard++;
      const ovPage = src.getPage(nextPgno);
      const nextPage = readUint32BE(ovPage, 0);
      const chunkLen = Math.min(payloadLen - written, usableSize - 4);
      full.set(ovPage.subarray(4, 4 + chunkLen), written);
      written += chunkLen;
      nextPgno = nextPage;
    }
    payload = full;
  }

  const { values } = decodeRecord(payload, td);
  return { rowid: rowidInfo.value, values };
}

// ---------- column-name recovery from CREATE TABLE sql ----------

/**
 * Best-effort column-name extractor for `CREATE TABLE name (col1 TYPE, col2, ...)`.
 * Returns the list of column names in order, or `null` when parsing fails (the
 * caller then falls back to `col0`, `col1`, ...).
 *
 * Strategy: split the parenthesised body on top-level commas, then take the
 * first identifier of each segment as the column name. Segments whose first
 * identifier is a table-constraint keyword (PRIMARY KEY / UNIQUE / CHECK /
 * FOREIGN KEY / CONSTRAINT) are dropped — they are table-level constraints,
 * not columns.
 */
function parseColumnNames(sql: string): string[] | null {
  const open = sql.indexOf("(");
  const close = sql.lastIndexOf(")");
  if (open < 0 || close < 0 || close <= open) return null;
  const body = sql.slice(open + 1, close);

  const segments = splitTopLevelCommas(body);
  const cols: string[] = [];
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const ident = firstIdentifier(trimmed);
    if (!ident) continue;
    if (isConstraintKeyword(ident)) continue;
    cols.push(ident);
  }
  return cols.length ? cols : null;
}

/** Split on commas that are not inside any parenthesised group. */
function splitTopLevelCommas(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if ((ch === "," && depth === 0) || i === body.length) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  return out;
}

/** First identifier of a column-definition piece, handling quoted forms. */
function firstIdentifier(piece: string): string | null {
  const m = piece.match(
    /^\s*(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_$]*))/,
  );
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? m[4] ?? null;
}

function isConstraintKeyword(id: string): boolean {
  return /^(primary|unique|check|foreign|constraint)$/i.test(id);
}

// ---------- public entry ----------

/**
 * Open a SQLite database file for read-only access. Automatically loads the
 * sibling `<db>-wal` file when present so active WAL-mode databases (e.g.
 * ZCode's running store) return their latest committed data.
 *
 * Throws `SqliteParseError` if `mainPath` is not a SQLite file or is too
 * corrupted to read the header. Adapters should catch and degrade.
 */
export function openSqliteReadOnly(mainPath: string): SqliteReadOnly {
  const snapshot = captureSnapshot(mainPath);
  let closed = false;
  let header: DbHeader;
  let src: PageSource;

  try {
    if (snapshot.mainStamp.size < DB_HEADER_SIZE) {
      throw new SqliteParseError(`db file too small: ${mainPath}`);
    }
    header = parseDbHeader(readMainHeader(snapshot));
    const wal = loadWal(snapshot.walBytes, header.pageSize, snapshot.walIndex);
    src = makePageSource(snapshot, header, wal);
    if (!isMainSnapshotStable(mainPath, snapshot)) {
      throw new SqliteSnapshotUnstableError(mainPath);
    }
  } catch (error) {
    fs.closeSync(snapshot.mainFd);
    throw error instanceof SqliteParseError
      ? error
      : new SqliteParseError(`cannot read db file: ${mainPath}`, error);
  }

  function assertOpen(): void {
    if (closed) throw new SqliteParseError("SQLite reader is closed");
  }

  function assertMainSnapshotStable(): void {
    if (!isMainSnapshotStable(mainPath, snapshot)) {
      throw new SqliteSnapshotUnstableError(mainPath);
    }
  }

  function readStable<T>(read: () => T): T {
    assertOpen();
    try {
      const value = read();
      assertMainSnapshotStable();
      return value;
    } catch (error) {
      if (error instanceof SqliteSnapshotUnstableError) throw error;
      if (!isMainSnapshotStable(mainPath, snapshot)) {
        throw new SqliteSnapshotUnstableError(mainPath);
      }
      throw error instanceof SqliteParseError
        ? error
        : new SqliteParseError(
            `failed reading SQLite snapshot: ${mainPath}`,
            error,
          );
    }
  }

  // Column-name cache: tableName → column list (or null).
  const columnCache = new Map<string, string[] | null>();

  function readSqliteMaster(): SqliteTableInfo[] {
    const tables: SqliteTableInfo[] = [];
    visitTableBtree(src, 1, header.textEncoding, header, ({ values }) => {
      // sqlite_master columns: type, name, tbl_name, rootpage, sql
      const [type, name, _tbl, rootpage, sql] = values as [
        string?,
        string?,
        string?,
        number?,
        string?,
      ];
      if (
        type === "table" &&
        typeof name === "string" &&
        typeof rootpage === "number"
      ) {
        tables.push({ name, rootPgno: rootpage, sql: sql ?? "" });
      }
    });
    return tables;
  }

  function columnsFor(table: SqliteTableInfo): string[] | null {
    const cached = columnCache.get(table.name);
    if (cached !== undefined) return cached;
    const parsed = table.sql ? parseColumnNames(table.sql) : null;
    columnCache.set(table.name, parsed);
    return parsed;
  }

  /** Find the column index that is `INTEGER PRIMARY KEY` (the rowid alias), or
   * -1 if none. SQLite stores NULL in that column's record slot and the real
   * value in the cell rowid; we splice it back so callers see correct values. */
  function rowidAliasIndex(
    table: SqliteTableInfo,
    columns: string[] | null,
  ): number {
    if (!table.sql || !columns) return -1;
    const open = table.sql.indexOf("(");
    const close = table.sql.lastIndexOf(")");
    if (open < 0 || close < 0) return -1;
    const body = table.sql.slice(open + 1, close);
    const segments = splitTopLevelCommas(body);
    let idx = 0;
    for (const seg of segments) {
      const trimmed = seg.trim();
      const ident = firstIdentifier(trimmed);
      if (!ident || isConstraintKeyword(ident)) continue;
      // Match "INTEGER PRIMARY KEY" anywhere in this column definition (case-
      // insensitive). The trailing \b guards against a false positive on
      // something like `PRIMARY KEYDESC`. This is a heuristic; WITHOUT ROWID
      // and other edge cases are out of scope (ZCode tables don't use them).
      if (/integer\s+primary\s+key\b/i.test(trimmed)) {
        return idx;
      }
      idx++;
    }
    return -1;
  }

  return {
    dbPath: mainPath,
    listTables(): SqliteTableInfo[] {
      return readStable(readSqliteMaster);
    },
    scanTable(
      tableName: string,
      predicate?: (row: SqliteRow) => boolean,
    ): SqliteRow[] {
      return readStable(() => {
        let table: SqliteTableInfo | undefined;
        try {
          table = readSqliteMaster().find((t) => t.name === tableName);
          if (!table || table.rootPgno <= 0) return [];
          const columns = columnsFor(table);
          const aliasIdx = rowidAliasIndex(table, columns);
          const rows: SqliteRow[] = [];
          visitTableBtree(
            src,
            table.rootPgno,
            header.textEncoding,
            header,
            ({ rowid, values }) => {
              const row: SqliteRow = {};
              for (let i = 0; i < values.length; i++) {
                const key = columns?.[i] ?? `col${i}`;
                // INTEGER PRIMARY KEY columns store NULL in the record; the real
                // value is the cell rowid. Splice it in so callers see the integer.
                if (i === aliasIdx && values[i] === null) {
                  row[key] = rowid;
                } else {
                  row[key] = values[i];
                }
              }
              if (!predicate || predicate(row)) rows.push(row);
            },
          );
          return rows;
        } catch (error) {
          // Wrap any non-SqliteParseError (e.g. RangeError from a truncated
          // float64, TypeError from a bad cell pointer) so the adapter's single
          // catch on SqliteParseError degrades cleanly instead of crashing CLI.
          throw error instanceof SqliteParseError
            ? error
            : new SqliteParseError(
                `failed reading table "${tableName}"`,
                error,
              );
        }
      });
    },
    close(): void {
      if (closed) return;
      closed = true;
      fs.closeSync(snapshot.mainFd);
    },
  };
}

/** Convenience: open + scan + close in one call. Returns [] on any parse error
 * or missing table, never throws. Useful for adapters that already decided to
 * degrade silently. */
export function scanTableSafe(
  mainPath: string,
  tableName: string,
): SqliteRow[] {
  try {
    const db = openSqliteReadOnly(mainPath);
    try {
      return db.scanTable(tableName);
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}
