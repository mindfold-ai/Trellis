/**
 * Resolve a list of `--file` / `--jsonl` specs into the concatenated context
 * string to be embedded in the worker's system prompt.
 *
 * --file <path-or-glob>     direct file inclusion (glob expanded via fs.globSync)
 * --jsonl <path>            parse a Trellis jsonl manifest where each line is
 *                           {"file": "<path>", "reason": "<why>"} and include
 *                           each referenced file (reason becomes part of header)
 *
 * All paths are resolved relative to `cwd` (the spawn caller's cwd).
 * Missing files are skipped with a stderr warning, not fatal.
 * Each block is delimited with a header so the model can attribute content
 * to its source file.
 */

import fs from "node:fs";
import path from "node:path";

interface ContextBlock {
  path: string; // display path (relative to cwd if possible)
  source: "file" | "jsonl";
  reason?: string;
  content: string;
}

const MAX_PER_FILE_BYTES = 1_000_000; // 1MB hard cap per file
const WARN_PER_FILE_BYTES = 200_000; // stderr warn at 200KB
const WARN_TOTAL_BYTES = 500_000; // stderr warn when assembled context > 500KB

/**
 * True when `real` is `root` itself or a descendant of `root`.
 */
function isUnderRoot(real: string, root: string): boolean {
  return real === root || real.startsWith(root + path.sep);
}

/**
 * Path-traversal guard: resolve `target` and `cwd` to realpaths and
 * verify `target` is `cwd` or a descendant, OR under one of `trustedRoots`
 * (see `context-trust.ts`). Refuses absolute paths outside cwd/trusted
 * roots, `..`-escapes, and symlinks pointing outside.
 *
 * Returns the resolved realpath, or null if blocked (with stderr warning).
 */
function jailedRealpath(
  target: string,
  cwd: string,
  trustedRoots: string[] = [],
): string | null {
  const cwdReal = fs.realpathSync(cwd);
  let real: string;
  try {
    real = fs.realpathSync(target);
  } catch {
    // Target doesn't exist — fall back to the lexical resolution. The
    // existence check happens later; we just need to ensure the lexical
    // form is inside the jail.
    real = path.resolve(target);
  }
  if (
    !isUnderRoot(real, cwdReal) &&
    !trustedRoots.some((root) => isUnderRoot(real, root))
  ) {
    process.stderr.write(
      `[channel spawn] context path escapes cwd, refusing: ${path.relative(cwd, target) || target} ` +
        `(add its real directory to channel.trusted_context_dirs in .trellis/config.yaml to allow)\n`,
    );
    return null;
  }
  return real;
}

/** Strip control characters that would break header lines in the system prompt. */
function safeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\r\n\x00-\x08\x0b-\x1f\x7f]/g, " ");
}

export interface AssembledContext {
  /** Composed prompt body for `# CONTEXT FILES` (or "" if nothing loaded). */
  prompt: string;
  /** Relative paths of every file actually injected — surfaced on `spawned`. */
  paths: string[];
  /** Relative paths of every `--jsonl` manifest processed (regardless of
   *  whether the manifest yielded any entries) — surfaced on `spawned`
   *  so users can see "I passed --jsonl X but the manifest was empty". */
  manifests: string[];
}

export function assembleContext(
  cwd: string,
  files: string[] = [],
  jsonls: string[] = [],
  trustedRoots: string[] = [],
): AssembledContext {
  const blocks: ContextBlock[] = [];
  const manifestPaths: string[] = [];

  for (const spec of files) {
    for (const resolved of expandGlob(cwd, spec)) {
      const jailed = jailedRealpath(resolved, cwd, trustedRoots);
      if (!jailed) continue;
      const block = readFileBlock(jailed, cwd, "file", undefined, trustedRoots);
      if (block) blocks.push(block);
    }
  }

  for (const jsonlPath of jsonls) {
    const jailedJsonl = jailedRealpath(
      path.resolve(cwd, jsonlPath),
      cwd,
      trustedRoots,
    );
    if (!jailedJsonl) continue;
    if (!fs.existsSync(jailedJsonl)) {
      process.stderr.write(
        `[channel spawn] --jsonl: file not found, skipping: ${jsonlPath}\n`,
      );
      continue;
    }
    // Record the manifest path BEFORE consuming entries, so the spawned
    // event reflects "user passed this manifest" even if it's empty.
    manifestPaths.push(path.relative(cwd, jailedJsonl) || jsonlPath);
    // Stream the manifest line-by-line instead of `readFileSync + split`,
    // so a giant jsonl file doesn't double-allocate the string into memory.
    for (const line of iterFileLines(jailedJsonl)) {
      const t = line.trim();
      if (!t) continue;
      let obj: { file?: string; reason?: string; _example?: unknown };
      try {
        obj = JSON.parse(t) as typeof obj;
      } catch {
        process.stderr.write(
          `[channel spawn] --jsonl: skipping unparseable line in ${jsonlPath}\n`,
        );
        continue;
      }
      if (obj._example !== undefined) continue;
      if (!obj.file) continue;
      const jailed = jailedRealpath(
        path.resolve(cwd, obj.file),
        cwd,
        trustedRoots,
      );
      if (!jailed) continue;
      const block = readFileBlock(
        jailed,
        cwd,
        "jsonl",
        obj.reason,
        trustedRoots,
      );
      if (block) blocks.push(block);
    }
  }

  if (blocks.length === 0) {
    return { prompt: "", paths: [], manifests: manifestPaths };
  }

  // Use Buffer.byteLength so multi-byte (CJK / emoji etc.) content isn't
  // undercounted vs. its on-the-wire size. The user is paying tokens by
  // bytes, not characters.
  const totalBytes = blocks.reduce(
    (n, b) => n + Buffer.byteLength(b.content, "utf-8"),
    0,
  );
  if (totalBytes > WARN_TOTAL_BYTES) {
    process.stderr.write(
      `[channel spawn] warning: context is ${Math.round(totalBytes / 1024)}KB across ${blocks.length} files — large system prompt may exceed model context\n`,
    );
  }

  return {
    prompt: blocks.map(formatBlock).join("\n\n---\n\n"),
    paths: blocks.map((b) => b.path),
    manifests: manifestPaths,
  };
}

/**
 * Stream a UTF-8 file line by line without loading the whole file as one
 * giant string. Yields each line (without trailing `\n`). Crashes /
 * non-UTF8 content fall back gracefully.
 */
function* iterFileLines(filePath: string): Generator<string, void, unknown> {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.allocUnsafe(64 * 1024);
    let carry = "";
    while (true) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      const chunk = carry + buf.subarray(0, n).toString("utf-8");
      const lines = chunk.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) yield line;
    }
    if (carry.length > 0) yield carry;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // ignore
    }
  }
}

/**
 * Minimal glob matcher. Supports:
 *   foo/bar.md         — literal path
 *   foo/* .md          — single segment wildcard within a directory
 *   foo/** /*.md       — recursive subtree
 *   foo/** /*.md       — recursive subtree
 *
 * Doesn't aim for full POSIX semantics — `?`, `{a,b}`, character classes etc.
 * are out of scope for MVP. Quoting passes the literal pattern from shell.
 */
function expandGlob(cwd: string, spec: string): string[] {
  if (!/[*?[]/.test(spec)) {
    return [path.resolve(cwd, spec)];
  }
  // Split into static prefix + glob segments
  const segments = spec.split(/[\\/]/).filter(Boolean);
  let baseDir = cwd;
  let i = 0;
  while (i < segments.length && !/[*?[]/.test(segments[i])) {
    baseDir = path.resolve(baseDir, segments[i]);
    i++;
  }
  const globSegs = segments.slice(i);
  if (globSegs.length === 0) return [path.resolve(cwd, spec)];

  if (!fs.existsSync(baseDir)) {
    process.stderr.write(
      `[channel spawn] --file: glob base not found: ${path.relative(cwd, baseDir)}\n`,
    );
    return [];
  }

  const matches: string[] = [];
  walkGlob(baseDir, globSegs, matches);
  if (matches.length === 0) {
    process.stderr.write(
      `[channel spawn] --file: glob matched no files: ${spec}\n`,
    );
  }
  return matches;
}

function walkGlob(dir: string, segs: string[], out: string[]): void {
  if (segs.length === 0) return;
  const [head, ...rest] = segs;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  if (head === "**") {
    // ** matches zero or more directories.
    // Zero case: try matching `rest` from current dir.
    if (rest.length > 0) walkGlob(dir, rest, out);
    // Recurse into subdirs with ** still in front.
    for (const e of entries) {
      if (e.isDirectory()) {
        walkGlob(path.join(dir, e.name), segs, out);
      }
    }
    return;
  }

  const re = segmentToRegex(head);
  for (const e of entries) {
    if (!re.test(e.name)) continue;
    const child = path.join(dir, e.name);
    if (rest.length === 0) {
      if (e.isFile()) out.push(child);
    } else if (e.isDirectory()) {
      walkGlob(child, rest, out);
    }
  }
}

function segmentToRegex(seg: string): RegExp {
  let re = "^";
  for (const ch of seg) {
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else if (".+()|^$\\{}[]".includes(ch)) re += "\\" + ch;
    else re += ch;
  }
  return new RegExp(re + "$");
}

function readFileBlock(
  absPath: string,
  cwd: string,
  source: "file" | "jsonl",
  reason?: string,
  trustedRoots: string[] = [],
): ContextBlock | null {
  if (!fs.existsSync(absPath)) {
    process.stderr.write(
      `[channel spawn] --${source}: file not found, skipping: ${path.relative(cwd, absPath)}\n`,
    );
    return null;
  }
  // lstat first: if it's a symlink, the realpath inside jailedRealpath
  // has already verified the target stays inside cwd. Defense-in-depth:
  // explicitly note symlinks so we never read through one we didn't
  // realpath-check.
  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(absPath);
  } catch {
    return null;
  }
  if (lstat.isSymbolicLink()) {
    // Should be impossible — jailedRealpath replaced absPath with the
    // resolved realpath. Defense-in-depth against a TOCTOU race: re-verify
    // containment (cwd or a trusted root) rather than trusting blindly.
    let real: string;
    try {
      real = fs.realpathSync(absPath);
    } catch {
      real = absPath;
    }
    const cwdReal = fs.realpathSync(cwd);
    if (
      !isUnderRoot(real, cwdReal) &&
      !trustedRoots.some((root) => isUnderRoot(real, root))
    ) {
      process.stderr.write(
        `[channel spawn] --${source}: refusing unresolved symlink: ${path.relative(cwd, absPath)}\n`,
      );
      return null;
    }
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  if (stat.size > MAX_PER_FILE_BYTES) {
    process.stderr.write(
      `[channel spawn] --${source}: file too large (${Math.round(stat.size / 1024)}KB > ${MAX_PER_FILE_BYTES / 1024}KB cap), skipping: ${path.relative(cwd, absPath)}\n`,
    );
    return null;
  }
  if (stat.size > WARN_PER_FILE_BYTES) {
    process.stderr.write(
      `[channel spawn] warning: large file (${Math.round(stat.size / 1024)}KB) included: ${path.relative(cwd, absPath)}\n`,
    );
  }
  const content = fs.readFileSync(absPath, "utf-8");
  return {
    path: path.relative(cwd, absPath),
    source,
    reason,
    content,
  };
}

function formatBlock(b: ContextBlock): string {
  const safePath = safeHeader(b.path);
  const safeReason = b.reason ? safeHeader(b.reason) : undefined;
  const header =
    b.source === "jsonl" && safeReason
      ? `# Context: ${safePath}\n# Reason: ${safeReason}`
      : `# Context: ${safePath}`;
  return `${header}\n\n${b.content.trimEnd()}`;
}
