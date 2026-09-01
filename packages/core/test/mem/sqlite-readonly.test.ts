/**
 * Unit tests for the zero-dependency read-only SQLite parser.
 *
 * Fixtures are real SQLite files built with the system `python3`/`py` sqlite3
 * module (core cannot ship `better-sqlite3`, and writing a full SQLite *writer*
 * is out of scope). Tests skip gracefully when no Python interpreter is on
 * PATH so CI environments without Python do not fail.
 */

import { describe, it, expect, afterAll, vi } from "vitest";
import nodeFsDefault, * as nodeFs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { execFileSync } from "node:child_process";
import {
  openSqliteReadOnly,
  SqliteParseError,
} from "../../src/mem/internal/sqlite-readonly.js";

// ---------- python detection ----------

/** Detect a usable Python interpreter with the `sqlite3` stdlib module. */
function findPython(): string[] | null {
  const candidates =
    process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ["-c", "import sqlite3"], { stdio: "ignore" });
      return [cmd];
    } catch {
      /* try next */
    }
  }
  return null;
}

const PYTHON = findPython();
const SKIP = PYTHON === null;

/** Run a Python script by writing it to a temp file (avoids shell-quoting
 * issues with embedded JSON/SQL). */
function runPy(script: string): string {
  if (!PYTHON || PYTHON.length === 0) throw new Error("python not available");
  const pyCmd = PYTHON[0];
  if (!pyCmd) throw new Error("python not available");
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "py-build-"));
  const file = nodePath.join(dir, "build.py");
  nodeFs.writeFileSync(file, script);
  try {
    return execFileSync(pyCmd, [file], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } finally {
    nodeFs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Python literal for a JS value (string/number/null). */
function pyLit(v: unknown): string {
  if (v === null) return "None";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  throw new Error(`unsupported pyLit type for ${String(v)}`);
}

// ---------- fixture builders ----------

interface FixtureSpec {
  schema: string[];
  rows: Record<string, Record<string, unknown>[]>;
}

/** Build a SQLite file at `dbPath` with the given schema + rows. */
function buildSqlite(dbPath: string, spec: FixtureSpec): void {
  nodeFs.mkdirSync(nodePath.dirname(dbPath), { recursive: true });
  const tableCreates = spec.schema
    .map((s) => `db.executescript(${JSON.stringify(s)})`)
    .join("\n");
  const inserts = Object.entries(spec.rows)
    .flatMap(([table, rows]) =>
      rows.map((r) => {
        const cols = Object.keys(r);
        const placeholders = cols.map(() => "?").join(", ");
        const pyVals = cols.map((c) => pyLit(r[c])).join(", ");
        return `db.execute(${JSON.stringify(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`)}, (${pyVals},))`;
      }),
    )
    .join("\n");
  runPy(`import sqlite3, os
if os.path.exists(${JSON.stringify(dbPath)}):
    os.remove(${JSON.stringify(dbPath)})
db = sqlite3.connect(${JSON.stringify(dbPath)})
${tableCreates}
${inserts}
db.commit()
db.close()
`);
}

/** Build a SQLite file in WAL mode with extra rows committed only to the WAL.
 * `wal_autocheckpoint=0` prevents close-time checkpoint from folding the WAL
 * back into the main db. */
function buildSqliteWithWal(
  dbPath: string,
  spec: FixtureSpec,
  walRows: { table: string; row: Record<string, unknown> }[],
): void {
  nodeFs.mkdirSync(nodePath.dirname(dbPath), { recursive: true });
  const tableCreates = spec.schema
    .map((s) => `db.executescript(${JSON.stringify(s)})`)
    .join("\n");
  const mainInserts = Object.entries(spec.rows)
    .flatMap(([table, rows]) =>
      rows.map((r) => {
        const cols = Object.keys(r);
        const placeholders = cols.map(() => "?").join(", ");
        const pyVals = cols.map((c) => pyLit(r[c])).join(", ");
        return `db.execute(${JSON.stringify(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`)}, (${pyVals},))`;
      }),
    )
    .join("\n");
  const walInserts = walRows
    .map((w) => {
      const cols = Object.keys(w.row);
      const placeholders = cols.map(() => "?").join(", ");
      const pyVals = cols.map((c) => pyLit(w.row[c])).join(", ");
      return `db.execute(${JSON.stringify(`INSERT INTO ${w.table} (${cols.join(", ")}) VALUES (${placeholders})`)}, (${pyVals},))`;
    })
    .join("\n");
  runPy(`import sqlite3, os
if os.path.exists(${JSON.stringify(dbPath)}):
    os.remove(${JSON.stringify(dbPath)})
db = sqlite3.connect(${JSON.stringify(dbPath)})
db.execute("PRAGMA journal_mode=WAL")
db.execute("PRAGMA wal_autocheckpoint=0")
${tableCreates}
${mainInserts}
db.commit()
${walInserts}
db.commit()
# Do NOT call db.close() — Python's sqlite3 runs a final checkpoint on close,
# which would fold the WAL back into the main file and defeat this test. Force
# an exit so the WAL frames stay on disk.
os._exit(0)
`);
}

// ---------- test suite ----------

describe.skipIf(SKIP)("sqlite-readonly parser", () => {
  const tmpDir = nodeFs.mkdtempSync(
    nodePath.join(nodeOs.tmpdir(), "trellis-sqlite-"),
  );
  const dbPath = nodePath.join(tmpDir, "test.db");

  afterAll(() => {
    nodeFs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists tables and reads rows", () => {
    buildSqlite(dbPath, {
      schema: [
        "CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, directory TEXT)",
        "CREATE TABLE count_only (n INTEGER)",
      ],
      rows: {
        session: [
          { id: "s1", title: "first", directory: "/a/b" },
          { id: "s2", title: "second", directory: "/c" },
        ],
        count_only: [{ n: 42 }],
      },
    });

    const db = openSqliteReadOnly(dbPath);
    const tables = db.listTables().map((t) => t.name);
    expect(tables).toContain("session");
    expect(tables).toContain("count_only");

    const rows = db.scanTable("session");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("s1");
    expect(rows[0]?.title).toBe("first");
    expect(rows[1]?.directory).toBe("/c");

    const nums = db.scanTable("count_only");
    expect(nums[0]?.n).toBe(42);
    db.close();
  });

  it.skipIf(process.platform === "win32")(
    "reads a sparse database larger than the readFileSync limit",
    () => {
      const largeDbPath = nodePath.join(tmpDir, "large.db");
      buildSqlite(largeDbPath, {
        schema: ["CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT)"],
        rows: { session: [{ id: "s1", title: "still-readable" }] },
      });
      // APFS/ext4 create a hole here; skip Windows because extending a file is
      // not guaranteed to stay sparse and could allocate or zero-fill 2 GiB.
      nodeFs.truncateSync(largeDbPath, 2 * 1024 ** 3);

      const db = openSqliteReadOnly(largeDbPath);
      expect(db.scanTable("session")).toEqual([
        { id: "s1", title: "still-readable" },
      ]);
      db.close();
    },
  );

  it("retries partial positional reads", () => {
    buildSqlite(dbPath, {
      schema: ["CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT)"],
      rows: { session: [{ id: "s1", title: "partial" }] },
    });
    const readSync = nodeFs.readSync;
    const readSpy = vi
      .spyOn(nodeFsDefault, "readSync")
      .mockImplementation((fd, buffer, offset, length, position) =>
        readSync(
          fd,
          buffer,
          offset,
          Math.max(1, Math.ceil(length / 2)),
          position,
        ),
      );
    syncBuiltinESMExports();

    try {
      const db = openSqliteReadOnly(dbPath);
      try {
        expect(db.scanTable("session")).toEqual([
          { id: "s1", title: "partial" },
        ]);
      } finally {
        db.close();
      }
    } finally {
      readSpy.mockRestore();
      syncBuiltinESMExports();
    }
  });

  it("normalizes lazy read errors as SqliteParseError", () => {
    buildSqlite(dbPath, {
      schema: ["CREATE TABLE session (id TEXT PRIMARY KEY)"],
      rows: { session: [{ id: "s1" }] },
    });
    const db = openSqliteReadOnly(dbPath);
    const readSpy = vi
      .spyOn(nodeFsDefault, "readSync")
      .mockImplementation(() => {
        const error = new Error(
          "simulated read failure",
        ) as NodeJS.ErrnoException;
        error.code = "EIO";
        throw error;
      });
    syncBuiltinESMExports();

    try {
      expect(() => db.listTables()).toThrow(SqliteParseError);
    } finally {
      readSpy.mockRestore();
      syncBuiltinESMExports();
      db.close();
    }
  });

  it("handles NULL values", () => {
    buildSqlite(dbPath, {
      schema: ["CREATE TABLE t (id INTEGER, a TEXT, b INTEGER)"],
      rows: { t: [{ id: 1, a: null, b: null }] },
    });
    const db = openSqliteReadOnly(dbPath);
    const rows = db.scanTable("t");
    expect(rows[0]?.a).toBeNull();
    expect(rows[0]?.b).toBeNull();
    db.close();
  });

  it("reads long TEXT that overflows into overflow pages", () => {
    const long = "x".repeat(30_000);
    buildSqlite(dbPath, {
      schema: ["CREATE TABLE big (id INTEGER, payload TEXT)"],
      rows: { big: [{ id: 1, payload: long }] },
    });
    const db = openSqliteReadOnly(dbPath);
    const rows = db.scanTable("big");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toBe(long);
    db.close();
  });

  it("reads rows committed only to the WAL", () => {
    nodeFs.rmSync(dbPath, { force: true });
    nodeFs.rmSync(dbPath + "-wal", { force: true });
    nodeFs.rmSync(dbPath + "-shm", { force: true });
    buildSqliteWithWal(
      dbPath,
      {
        schema: ["CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT)"],
        rows: { session: [{ id: "main", title: "in-main" }] },
      },
      [{ table: "session", row: { id: "wal1", title: "in-wal" } }],
    );
    // sanity: a WAL file should exist
    expect(nodeFs.existsSync(dbPath + "-wal")).toBe(true);

    const db = openSqliteReadOnly(dbPath);
    const rows = db.scanTable("session");
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(["main", "wal1"]);
    db.close();
  });

  it("keeps its captured WAL snapshot after a later WAL commit", () => {
    nodeFs.rmSync(dbPath, { force: true });
    nodeFs.rmSync(dbPath + "-wal", { force: true });
    nodeFs.rmSync(dbPath + "-shm", { force: true });
    buildSqliteWithWal(
      dbPath,
      {
        schema: ["CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT)"],
        rows: { session: [{ id: "main", title: "in-main" }] },
      },
      [{ table: "session", row: { id: "wal1", title: "captured" } }],
    );

    const mainBefore = nodeFs.readFileSync(dbPath);
    const walSizeBefore = nodeFs.statSync(dbPath + "-wal").size;
    const db = openSqliteReadOnly(dbPath);
    runPy(`import sqlite3, os
db = sqlite3.connect(${JSON.stringify(dbPath)})
db.execute("PRAGMA journal_mode=WAL")
db.execute("PRAGMA wal_autocheckpoint=0")
db.execute("INSERT INTO session (id, title) VALUES (?, ?)", ("wal2", "later"))
db.commit()
os._exit(0)
`);

    expect(nodeFs.readFileSync(dbPath)).toEqual(mainBefore);
    expect(nodeFs.statSync(dbPath + "-wal").size).toBeGreaterThan(
      walSizeBefore,
    );
    expect(
      db
        .scanTable("session")
        .map((row) => row.id)
        .sort(),
    ).toEqual(["main", "wal1"]);
    db.close();
  });

  it("rejects a WAL frame whose cumulative checksum is corrupt", () => {
    nodeFs.rmSync(dbPath, { force: true });
    nodeFs.rmSync(dbPath + "-wal", { force: true });
    nodeFs.rmSync(dbPath + "-shm", { force: true });
    buildSqliteWithWal(
      dbPath,
      {
        schema: ["CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT)"],
        rows: { session: [{ id: "main", title: "in-main" }] },
      },
      [{ table: "session", row: { id: "wal1", title: "in-wal" } }],
    );
    const walPath = dbPath + "-wal";
    const wal = nodeFs.readFileSync(walPath);
    const pageSize = wal.readUInt32BE(8);
    expect(pageSize).toBeGreaterThan(0);
    const firstPageByte = 32 + 24;
    wal[firstPageByte] = (wal[firstPageByte] ?? 0) ^ 0x01;
    nodeFs.writeFileSync(walPath, wal);

    expect(() => openSqliteReadOnly(dbPath)).toThrow(/checksum mismatch/);
  });

  it("filters rows during table traversal", () => {
    buildSqlite(dbPath, {
      schema: ["CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)"],
      rows: {
        t: [
          { id: 1, value: "one" },
          { id: 2, value: "two" },
          { id: 3, value: "three" },
        ],
      },
    });
    const db = openSqliteReadOnly(dbPath);
    expect(db.scanTable("t", (row) => row.id === 2)).toEqual([
      { id: 2, value: "two" },
    ]);
    db.close();
  });

  it("returns [] for a missing table", () => {
    buildSqlite(dbPath, {
      schema: ["CREATE TABLE real (id INTEGER)"],
      rows: { real: [{ id: 1 }] },
    });
    const db = openSqliteReadOnly(dbPath);
    expect(db.scanTable("does_not_exist")).toEqual([]);
    db.close();
  });

  it("throws SqliteParseError on a non-SQLite file", () => {
    const bogus = nodePath.join(tmpDir, "bogus.db");
    nodeFs.writeFileSync(bogus, "this is not sqlite");
    expect(() => openSqliteReadOnly(bogus)).toThrow(SqliteParseError);
  });

  it("scanTableSafe returns [] instead of throwing on a bad file", async () => {
    const { scanTableSafe } =
      await import("../../src/mem/internal/sqlite-readonly.js");
    const bogus = nodePath.join(tmpDir, "bogus2.db");
    nodeFs.writeFileSync(bogus, "nope");
    expect(scanTableSafe(bogus, "session")).toEqual([]);
  });

  it("traverses interior pages for a large multi-page table", () => {
    // ~2000 rows forces the table b-tree to grow an interior page (root) with
    // multiple leaf children at the default 4 KB page size. This exercises
    // walkInterior + the right-most-child pointer.
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      id: i,
      payload: `row-${i}`,
    }));
    buildSqlite(dbPath, {
      schema: ["CREATE TABLE big (id INTEGER PRIMARY KEY, payload TEXT)"],
      rows: { big: rows },
    });
    const db = openSqliteReadOnly(dbPath);
    const out = db.scanTable("big");
    expect(out).toHaveLength(2000);
    // b-tree key order (rowid asc) — check a few spots including first/last.
    expect(out[0]?.id).toBe(0);
    expect(out[1999]?.id).toBe(1999);
    expect(out[1000]?.payload).toBe("row-1000");
    db.close();
  });

  it("decodes float64 and multi-byte UTF-8 text", () => {
    buildSqlite(dbPath, {
      schema: ["CREATE TABLE t (id INTEGER, v REAL, s TEXT)"],
      rows: {
        t: [
          { id: 1, v: 3.14, s: "héllo 世界" },
          { id: 2, v: 1e10, s: "emoji 🎉 naissance" },
        ],
      },
    });
    const db = openSqliteReadOnly(dbPath);
    const rows = db.scanTable("t");
    expect(rows[0]?.v).toBeCloseTo(3.14, 6);
    expect(rows[1]?.v).toBe(1e10);
    expect(rows[0]?.s).toBe("héllo 世界");
    expect(rows[1]?.s).toBe("emoji 🎉 naissance");
    db.close();
  });

  it("returns [] for an empty table (leaf page with ncells=0)", () => {
    buildSqlite(dbPath, {
      schema: [
        "CREATE TABLE empty (id INTEGER)",
        "CREATE TABLE has (id INTEGER)",
      ],
      rows: { empty: [], has: [{ id: 1 }] },
    });
    const db = openSqliteReadOnly(dbPath);
    expect(db.scanTable("empty")).toEqual([]);
    expect(db.scanTable("has")).toHaveLength(1);
    db.close();
  });

  it("sees the WAL-overwritten version of a row (not just new rows)", () => {
    nodeFs.rmSync(dbPath, { force: true });
    nodeFs.rmSync(dbPath + "-wal", { force: true });
    nodeFs.rmSync(dbPath + "-shm", { force: true });
    // Insert a row in the main db, then UPDATE it via WAL without checkpoint.
    buildSqlite(dbPath, {
      schema: ["CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)"],
      rows: { t: [{ id: 1, v: "original" }] },
    });
    // Append a WAL frame that overwrites the row's page with a new value.
    // We do it by re-opening in WAL mode and UPDATE-ing, then os._exit before
    // close-time checkpoint folds it back.
    const walScript = `import sqlite3, os
db = sqlite3.connect(${JSON.stringify(dbPath)})
db.execute("PRAGMA journal_mode=WAL")
db.execute("PRAGMA wal_autocheckpoint=0")
db.execute("UPDATE t SET v = 'updated-in-wal' WHERE id = 1")
db.execute("INSERT INTO t (id, v) VALUES (2, 'new-in-wal')")
db.commit()
os._exit(0)
`;
    const pyDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "py-wal-"));
    const pyFile = nodePath.join(pyDir, "w.py");
    nodeFs.writeFileSync(pyFile, walScript);
    const pyCmd = PYTHON[0];
    if (!pyCmd) throw new Error("python unavailable");
    try {
      execFileSync(pyCmd, [pyFile], { stdio: "ignore" });
    } finally {
      nodeFs.rmSync(pyDir, { recursive: true, force: true });
    }
    expect(nodeFs.existsSync(dbPath + "-wal")).toBe(true);

    const db = openSqliteReadOnly(dbPath);
    const rows = db.scanTable("t");
    // The overwritten value must be the WAL version, not the stale main-db one.
    const r1 = rows.find((r) => r.id === 1);
    const r2 = rows.find((r) => r.id === 2);
    expect(r1?.v).toBe("updated-in-wal");
    expect(r2?.v).toBe("new-in-wal");
    db.close();
  });

  it("parses column names dropping table-level constraints", () => {
    buildSqlite(dbPath, {
      schema: [
        "CREATE TABLE t (id INTEGER, name TEXT, PRIMARY KEY(id), UNIQUE(name))",
      ],
      rows: { t: [{ id: 1, name: "x" }] },
    });
    const db = openSqliteReadOnly(dbPath);
    const row = db.scanTable("t")[0];
    // Columns should be exactly id + name; constraints dropped.
    expect(Object.keys(row ?? {}).sort()).toEqual(["id", "name"]);
    db.close();
  });
});

describe.skipIf(!SKIP)("sqlite-readonly parser (skipped: no python)", () => {
  it.skip("python interpreter unavailable — SQLite fixture tests skipped", () => {
    /* noop */
  });
});
