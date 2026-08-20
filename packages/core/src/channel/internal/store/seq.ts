import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const READ_TAIL_BYTES = 4096;
const TAIL_SCAN_CHUNK = 64 * 1024;

/** Parse the sidecar file content. Returns null on missing / non-integer. */
function parseSidecar(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Reject leading +/-/0x/whitespace permutations; require pure digits.
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

async function readSidecar(sidecarPath: string): Promise<number | null> {
  if (!fs.existsSync(sidecarPath)) return null;
  try {
    const text = await fsp.readFile(sidecarPath, "utf-8");
    return parseSidecar(text);
  } catch {
    return null;
  }
}

/**
 * Read the last seq value from the JSONL file by tailing the end of the
 * file without loading the entire content. Returns 0 when the file is
 * absent or empty. Throws when the file has content but no recoverable
 * seq, because guessing would risk duplicate seq assignment.
 *
 * Falls back to a full-scan when the tail cannot establish a max seq
 * (e.g. last event spans the tail window or every line is corrupt).
 */
async function readLastJsonlSeq(jsonlPath: string): Promise<number> {
  if (!fs.existsSync(jsonlPath)) return 0;
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(jsonlPath);
  } catch {
    return 0;
  }
  if (stat.size === 0) return 0;

  const seqFromBuffer = (buf: Buffer): number | null => {
    const text = buf.toString("utf-8");
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as { seq?: number };
        if (typeof parsed.seq === "number" && Number.isFinite(parsed.seq)) {
          return parsed.seq;
        }
      } catch {
        continue;
      }
    }
    return null;
  };

  // Tail-read first.
  const tailLen = Math.min(stat.size, READ_TAIL_BYTES);
  const fh = await fsp.open(jsonlPath, "r");
  try {
    const buf = Buffer.alloc(tailLen);
    await fh.read(buf, 0, tailLen, stat.size - tailLen);
    // Find the first newline so we don't try to JSON.parse a partial
    // first line that the tail window happened to slice mid-event.
    let usable = buf;
    if (stat.size > tailLen) {
      const firstNewline = buf.indexOf(0x0a);
      usable = firstNewline >= 0 ? buf.subarray(firstNewline + 1) : Buffer.alloc(0);
    }
    if (usable.length > 0) {
      const found = seqFromBuffer(usable);
      if (found !== null) return found;
    }
  } finally {
    await fh.close();
  }

  // Tail did not produce a seq — fall back to a full scan.
  const text = await fsp.readFile(jsonlPath, "utf-8");
  const found = seqFromBuffer(Buffer.from(text));
  if (found !== null) return found;
  if (text.split("\n").some((line) => line.trim() !== "")) {
    throw new Error(`Unable to recover channel seq from ${jsonlPath}`);
  }
  return 0;
}

/**
 * If `events.jsonl` ends mid-record (no trailing newline — ENOSPC or
 * SIGKILL during append), truncate to the last complete line. A complete
 * JSONL record is written as stringify(event) plus a trailing newline, so
 * a missing final newline is the torn-tail signal. Complete but
 * unparseable lines are left intact — that is mid-file damage, not a
 * torn tail.
 *
 * Caller must hold the channel lock.
 */
export async function truncateIncompleteTail(jsonlPath: string): Promise<void> {
  if (!fs.existsSync(jsonlPath)) return;
  const fh = await fsp.open(jsonlPath, "r+");
  try {
    const stat = await fh.stat();
    if (stat.size === 0) return;
    const lastByte = Buffer.alloc(1);
    await fh.read(lastByte, 0, 1, stat.size - 1);
    if (lastByte[0] === 0x0a) return;

    let offset = stat.size;
    while (offset > 0) {
      const start = Math.max(0, offset - TAIL_SCAN_CHUNK);
      const length = offset - start;
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, start);
      const newline = buf.lastIndexOf(0x0a);
      if (newline >= 0) {
        await fh.truncate(start + newline + 1);
        return;
      }
      offset = start;
    }
    await fh.truncate(0);
  } finally {
    await fh.close();
  }
}

/**
 * Compute the next seq to assign by reconciling the `.seq` sidecar with
 * the JSONL tail. Repairs the sidecar when it is missing, corrupted,
 * lower than the JSONL tail, or ahead of the JSONL tail (for example,
 * after manual corruption or a stale future reservation).
 *
 * Caller must hold the channel lock when invoking this and the
 * subsequent JSONL append + sidecar write.
 */
export async function reconcileSeq(
  jsonlPath: string,
  sidecarPath: string,
): Promise<number> {
  const sidecar = await readSidecar(sidecarPath);
  const jsonlTail = await readLastJsonlSeq(jsonlPath);

  // Decision matrix:
  //   sidecar = N, jsonl = N      -> normal; next = N+1
  //   sidecar = N, jsonl = N+k    -> sidecar stale; repair forward to N+k
  //   sidecar = N, jsonl = N-k    -> sidecar ahead of JSONL;
  //                                   rewind to JSONL tail so we never
  //                                   leave a seq gap from a stale
  //                                   reservation
  //   sidecar = null, jsonl = M   -> lazy rebuild; use jsonl tail
  const last = jsonlTail;
  if (sidecar !== last) {
    await writeSidecar(sidecarPath, last);
  }
  return last;
}

export async function writeSidecar(
  sidecarPath: string,
  seq: number,
): Promise<void> {
  await fsp.mkdir(path.dirname(sidecarPath), { recursive: true });
  const tmp = `${sidecarPath}.tmp.${process.pid}.${Date.now()}`;
  await fsp.writeFile(tmp, `${seq}\n`, "utf-8");
  await fsp.rename(tmp, sidecarPath);
}
