/**
 * Integration tests for path-scoped on-demand spec injection (v2: ticket-refresh).
 *
 * Covers three surfaces:
 *   - `src/templates/trellis/scripts/common/spec_match.py` — glob→regex
 *     translation semantics, frontmatter parsing, `match_specs_for_file`
 *     (matching engine is unchanged from v1)
 *   - `src/templates/shared-hooks/inject-spec-context.py` — PostToolUse hook
 *     E2E state machine: FULL on first touch, silent within the refresh window,
 *     TICKET past the window, FULL again when the spec's sha changes, ticket-only
 *     for stateless payloads, identity-ladder separation (agent_id), Read trigger,
 *     TRELLIS_SPEC_STATE_DIR hermeticity + JSONL state schema, GC pruning, plus
 *     the still-valid v1 cases (budget truncation / overflow degradation / config
 *     gate / malformed frontmatter / broken stdin)
 *   - `get_context.py --mode spec --file <path>` — pull mode output
 *
 * Scripts are stamped into a fresh temp dir and exercised through the real
 * `python3` interpreter (no mocking of file I/O or config parsing). Every hook
 * run pins `TRELLIS_SPEC_STATE_DIR` under the per-test temp dir so the global
 * (`~/.trellis/spec-inject`) state store is never touched.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);
const HOOK_PATH = path.resolve(
  __dirname,
  "../../src/templates/shared-hooks/inject-spec-context.py",
);

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function setupRepo(tmp: string): void {
  fs.mkdirSync(path.join(tmp, ".trellis", "scripts"), { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, path.join(tmp, ".trellis", "scripts"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(tmp, ".trellis", "spec"), { recursive: true });
}

function writeConfig(tmp: string, yaml: string): void {
  fs.writeFileSync(path.join(tmp, ".trellis", "config.yaml"), yaml, "utf-8");
}

/** Write a spec file under .trellis/spec/ and return its absolute path. */
function writeSpec(tmp: string, rel: string, content: string): string {
  const abs = path.join(tmp, ".trellis", "spec", rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
  return abs;
}

/** The out-of-repo, user-global state base for a given fixture repo. Pinned
 * under the temp dir via TRELLIS_SPEC_STATE_DIR so tests never touch
 * ~/.trellis/spec-inject. */
function stateBase(tmp: string): string {
  return path.join(tmp, "spec-inject-state");
}

/** Every *.jsonl state shard under `dir`, recursively (state files live at
 * <base>/<project16>/<identity>.<pid>.jsonl). */
function listJsonl(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsonl(full));
    } else if (entry.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
  return out;
}

/** Run a Python snippet with spec_match helpers preloaded and the repo root
 * available as `REPO_ROOT`. Returns the raw spawn result so callers can
 * assert on stderr warnings too. */
function runSpecProbe(
  tmp: string,
  code: string,
): { status: number | null; stdout: string; stderr: string } {
  const probePath = path.join(tmp, "spec_probe.py");
  const script = `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(tmp, ".trellis", "scripts"))})
from pathlib import Path
from common.spec_match import glob_to_regex, validate_glob, match_specs_for_file
REPO_ROOT = Path(${JSON.stringify(tmp)})
${code}
`;
  fs.writeFileSync(probePath, script, "utf-8");
  const r = spawnSync("python3", [probePath], { cwd: tmp, encoding: "utf-8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Evaluate glob→path pairs through glob_to_regex; returns "1"/"0" per pair. */
function globMatches(tmp: string, cases: [string, string][]): string[] {
  const r = runSpecProbe(
    tmp,
    `
cases = ${JSON.stringify(cases)}
for g, p in cases:
    print("1" if glob_to_regex(g).match(p) else "0")
`,
  );
  expect(r.status, `glob probe failed: ${r.stderr}`).toBe(0);
  return r.stdout.trim().split("\n");
}

/** Print `rel_path|description` lines for match_specs_for_file. */
function runMatch(
  tmp: string,
  filePath: string,
): { status: number | null; stdout: string; stderr: string } {
  return runSpecProbe(
    tmp,
    `
for m in match_specs_for_file(REPO_ROOT, ${JSON.stringify(filePath)}):
    print(f"{m.rel_path}|{m.description}")
`,
  );
}

function runHook(
  tmp: string,
  input: string,
  extraEnv: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Sibling-hook convention: pin locale so byte-oriented assertions are stable.
    LC_ALL: "C",
    LANG: "C",
    // Hermetic state: keep every shard under the per-test temp dir.
    TRELLIS_SPEC_STATE_DIR: stateBase(tmp),
  };
  delete env.TRELLIS_HOOKS;
  delete env.TRELLIS_DISABLE_HOOKS;
  // Identity delegates to common.active_task.resolve_context_key, which also
  // consults env fallbacks (TRELLIS_CONTEXT_ID override plus per-platform
  // *_SESSION_ID / *_CONVERSATION_ID / *_TRANSCRIPT_PATH keys). The dev shell
  // running vitest may carry those (e.g. CLAUDE_CODE_SESSION_ID inside a
  // Claude Code session), so strip every identity-bearing key for hermetic
  // no-identity cases; tests opt back in via extraEnv.
  delete env.TRELLIS_CONTEXT_ID;
  const identityBearing =
    /(_SESSION_?ID|_CONVERSATION_?ID|_TRANSCRIPT_PATH|_THREAD_ID|_RUN_ID)$/i;
  const cleanEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => !identityBearing.test(key)),
  );
  Object.assign(cleanEnv, extraEnv);
  const r = spawnSync("python3", [HOOK_PATH], {
    cwd: tmp,
    encoding: "utf-8",
    input,
    env: cleanEnv,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

interface PayloadOpts {
  filePath: string;
  /** session_id; defaults to "sess-1". Pass `null` to omit all identity keys. */
  session?: string | null;
  toolName?: string;
  agentId?: string;
  transcriptPath?: string;
}

function buildPayload(tmp: string, opts: PayloadOpts): string {
  const payload: Record<string, unknown> = {
    hook_event_name: "PostToolUse",
    cwd: tmp,
    tool_name: opts.toolName ?? "Edit",
    tool_input: { file_path: opts.filePath },
  };
  if (opts.session !== null) {
    payload.session_id = opts.session ?? "sess-1";
  }
  if (opts.agentId !== undefined) {
    payload.agent_id = opts.agentId;
  }
  if (opts.transcriptPath !== undefined) {
    payload.transcript_path = opts.transcriptPath;
  }
  return JSON.stringify(payload);
}

function additionalContext(stdout: string): string {
  const parsed = JSON.parse(stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
  return parsed.hookSpecificOutput.additionalContext;
}

/** Extract the 12-hex sha256 attr the FULL/TICKET tags carry; fail loudly if
 * the frozen `sha256="<12hex>"` attribute is missing. */
function requireSha(ctx: string): string {
  const m = /sha256="([0-9a-f]{12})"/.exec(ctx);
  if (!m) {
    throw new Error(`expected sha256 attr in: ${ctx.slice(0, 200)}`);
  }
  return m[1];
}

function runGetContext(
  tmp: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(
    "python3",
    [path.join(tmp, ".trellis", "scripts", "get_context.py"), ...args],
    { cwd: tmp, encoding: "utf-8" },
  );
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe.skipIf(!hasPython())("spec injection (path-scoped on-demand)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-spec-injection-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe("common/spec_match.py: glob semantics", () => {
    it("* matches within a segment and never crosses /", () => {
      expect(
        globMatches(tmp, [
          ["src/commands/*.ts", "src/commands/update.ts"],
          ["src/commands/*.ts", "src/commands/channel/spawn.ts"],
          ["src/*", "src/app.ts"],
          ["src/*", "src/nested/app.ts"],
        ]),
      ).toEqual(["1", "0", "1", "0"]);
    });

    it("** as a whole segment crosses segments, but only strictly under the prefix", () => {
      expect(
        globMatches(tmp, [
          ["packages/**", "packages/cli/src/index.ts"],
          ["packages/**", "packages/index.ts"],
          // gitignore-like: `a/**` does not match `a` itself
          ["packages/**", "packages"],
        ]),
      ).toEqual(["1", "1", "0"]);
    });

    it("** in the middle spans zero or more segments", () => {
      expect(
        globMatches(tmp, [
          ["packages/**/index.ts", "packages/index.ts"],
          ["packages/**/index.ts", "packages/cli/src/index.ts"],
          ["packages/**/index.ts", "packages/cli/src/other.ts"],
        ]),
      ).toEqual(["1", "1", "0"]);
    });

    it("? matches exactly one character within a segment", () => {
      expect(
        globMatches(tmp, [
          ["src/util?.py", "src/utils.py"],
          ["src/util?.py", "src/util.py"],
          ["src/util?.py", "src/utilXY.py"],
          ["a?b", "a/b"],
        ]),
      ).toEqual(["1", "0", "0", "0"]);
    });

    it("trailing / is sugar for /** (matches strictly under the directory)", () => {
      expect(
        globMatches(tmp, [
          ["packages/cli/", "packages/cli/src/index.ts"],
          ["packages/cli/", "packages/cli"],
        ]),
      ).toEqual(["1", "0"]);
    });

    it("** embedded in a segment with other characters degrades to *", () => {
      expect(
        globMatches(tmp, [
          ["src/foo**.ts", "src/foobar.ts"],
          ["src/foo**.ts", "src/foo/bar.ts"],
        ]),
      ).toEqual(["1", "0"]);
    });

    it("literal characters are escaped (dot is not a wildcard)", () => {
      expect(
        globMatches(tmp, [
          ["src/app.ts", "src/app.ts"],
          ["src/app.ts", "src/appxts"],
        ]),
      ).toEqual(["1", "0"]);
    });

    it("validate_glob rejects absolute paths, .. segments, and charset violations", () => {
      const r = runSpecProbe(
        tmp,
        `
for g in ["/abs/path.ts", "a/../b.ts", "src/{a,b}.ts", "src/app.ts"]:
    print("ok" if validate_glob(g) is None else "err")
`,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split("\n")).toEqual(["err", "err", "err", "ok"]);
    });
  });

  describe("common/spec_match.py: match_specs_for_file", () => {
    it("returns matching specs in stable rel_path order; specs without frontmatter are ignored", () => {
      writeSpec(
        tmp,
        "cli/commands.md",
        "---\ndescription: command conventions\npaths:\n  - src/commands/**\n---\nBody\n",
      );
      writeSpec(tmp, "guides/style.md", "# Plain spec without frontmatter\n");
      writeSpec(tmp, "zz.md", "---\npaths:\n  - src/**\n---\nBody\n");

      const r = runMatch(tmp, "src/commands/update.ts");
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split("\n")).toEqual([
        ".trellis/spec/cli/commands.md|command conventions",
        ".trellis/spec/zz.md|None",
      ]);

      const miss = runMatch(tmp, "docs/readme.md");
      expect(miss.status).toBe(0);
      expect(miss.stdout.trim()).toBe("");
    });

    it("skips a spec with malformed frontmatter (non-list paths) with a stderr warning; siblings still match", () => {
      writeSpec(tmp, "bad.md", "---\npaths: src/**\n---\nBody\n");
      writeSpec(tmp, "good.md", "---\npaths:\n  - src/**\n---\nBody\n");

      const r = runMatch(tmp, "src/app.ts");
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe(".trellis/spec/good.md|None");
      expect(r.stderr).toContain(
        "malformed frontmatter in .trellis/spec/bad.md",
      );
    });

    it("treats unclosed frontmatter that runs into body prose as malformed (warn + skip)", () => {
      writeSpec(
        tmp,
        "unclosed.md",
        "---\npaths:\n  - src/**\n\nSome body prose here.\n",
      );

      const r = runMatch(tmp, "src/app.ts");
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("");
      expect(r.stderr).toContain(
        "malformed frontmatter in .trellis/spec/unclosed.md",
      );
    });

    it("skips an invalid glob with a stderr warning; the file's remaining globs still apply", () => {
      writeSpec(
        tmp,
        "mixed.md",
        "---\npaths:\n  - /absolute/path.ts\n  - src/**\n---\nBody\n",
      );

      const r = runMatch(tmp, "src/app.ts");
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe(".trellis/spec/mixed.md|None");
      expect(r.stderr).toContain("invalid glob");
      expect(r.stderr).toContain("/absolute/path.ts");
    });
  });

  describe("inject-spec-context.py: hook E2E (v2 ticket-refresh)", () => {
    const SPEC_REL = ".trellis/spec/cli/commands.md";
    const EDITED = "src/commands/update.ts";

    function writeGoverningSpec(body = "Command spec body.\n"): string {
      return writeSpec(
        tmp,
        "cli/commands.md",
        `---\ndescription: command conventions\npaths:\n  - src/commands/**\n---\n${body}`,
      );
    }

    it("emits a full <spec-context sha256> block on the first touch", () => {
      writeGoverningSpec();

      const r = runHook(tmp, buildPayload(tmp, { filePath: EDITED }));
      expect(r.status).toBe(0);
      const ctx = additionalContext(r.stdout);
      expect(ctx).toContain(
        `<spec-context file="${EDITED}" spec="${SPEC_REL}" sha256="`,
      );
      expect(requireSha(ctx)).toMatch(/^[0-9a-f]{12}$/);
      expect(ctx).toContain("Command spec body.");
      expect(ctx).toContain("</spec-context>");
    });

    it("goes silent on a second touch of the same session within the refresh window", () => {
      writeGoverningSpec();
      const payload = buildPayload(tmp, { filePath: EDITED });

      const first = runHook(tmp, payload);
      expect(first.status).toBe(0);
      expect(additionalContext(first.stdout)).toContain("<spec-context");

      // No transcript → wall-clock window (default 2700s); a second touch this
      // soon is well inside it → nothing emitted.
      const second = runHook(tmp, payload);
      expect(second.status).toBe(0);
      expect(second.stdout.trim()).toBe("");

      // State landed under TRELLIS_SPEC_STATE_DIR, not in the repo's .runtime.
      expect(listJsonl(stateBase(tmp)).length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(tmp, ".trellis", ".runtime"))).toBe(false);
    });

    it("emits a <spec-ticket> once the transcript line-window elapses (sha unchanged)", () => {
      writeGoverningSpec();
      writeConfig(
        tmp,
        ["spec_injection:", "  refresh_window_lines: 5"].join("\n"),
      );

      const transcript = path.join(tmp, "transcript.jsonl");
      fs.writeFileSync(transcript, "line-1\nline-2\n", "utf-8");
      const payload = buildPayload(tmp, {
        filePath: EDITED,
        transcriptPath: transcript,
      });

      const first = runHook(tmp, payload);
      expect(first.status).toBe(0);
      const firstCtx = additionalContext(first.stdout);
      expect(firstCtx).toContain(`<spec-context file="${EDITED}"`);
      const sha = requireSha(firstCtx);

      // Grow the transcript well beyond refresh_window_lines between calls.
      fs.appendFileSync(
        transcript,
        Array.from({ length: 30 }, (_, i) => `more-${i}`).join("\n") + "\n",
        "utf-8",
      );

      const second = runHook(tmp, payload);
      expect(second.status).toBe(0);
      const ctx = additionalContext(second.stdout);
      const ticketBody = [
        "You were shown this spec earlier in this session and its content is unchanged.",
        "It still governs edits to matching files. If you no longer remember it, Read",
        `${SPEC_REL} before continuing.`,
      ].join("\n");
      expect(ctx).toContain(
        `<spec-ticket file="${EDITED}" spec="${SPEC_REL}" sha256="${sha}">`,
      );
      expect(ctx).toContain(ticketBody);
      expect(ctx).toContain("</spec-ticket>");
      // A ticket is a small pointer, not the full spec body.
      expect(ctx).not.toContain("Command spec body.");
    });

    it("treats a shrunken transcript (negative line delta, e.g. /compact) as past-window → ticket", () => {
      writeGoverningSpec();
      writeConfig(
        tmp,
        ["spec_injection:", "  refresh_window_lines: 100"].join("\n"),
      );

      // First touch with a LONG transcript records a high line clock.
      const transcript = path.join(tmp, "transcript.jsonl");
      fs.writeFileSync(
        transcript,
        Array.from({ length: 50 }, (_, i) => `line-${i}`).join("\n") + "\n",
        "utf-8",
      );
      const payload = buildPayload(tmp, {
        filePath: EDITED,
        transcriptPath: transcript,
      });

      const first = runHook(tmp, payload);
      expect(first.status).toBe(0);
      expect(additionalContext(first.stdout)).toContain(
        `<spec-context file="${EDITED}"`,
      );

      // Compaction rewrites the transcript SHORTER: delta goes negative while
      // still far inside the 100-line window. The earlier injection was likely
      // compacted away, so the hook must re-emit (ticket), not stay silent.
      fs.writeFileSync(transcript, "line-1\nline-2\n", "utf-8");

      const second = runHook(tmp, payload);
      expect(second.status).toBe(0);
      const ctx = additionalContext(second.stdout);
      expect(ctx).toContain(`<spec-ticket file="${EDITED}"`);
      expect(ctx).toContain("</spec-ticket>");
    });

    it("re-teaches the full spec when its content changes (sha change beats the window)", () => {
      writeGoverningSpec("Original body.\n");
      const payload = buildPayload(tmp, { filePath: EDITED });

      const first = runHook(tmp, payload);
      expect(first.status).toBe(0);
      const firstCtx = additionalContext(first.stdout);
      const firstSha = requireSha(firstCtx);
      expect(firstCtx).toContain("Original body.");

      // Rewrite the spec (new sha). Without the change, a second touch this soon
      // would be silent (within window) — a FULL emission proves sha wins.
      writeGoverningSpec("Rewritten body.\n");

      const second = runHook(tmp, payload);
      expect(second.status).toBe(0);
      const secondCtx = additionalContext(second.stdout);
      expect(secondCtx).toContain(
        `<spec-context file="${EDITED}" spec="${SPEC_REL}" sha256="`,
      );
      expect(secondCtx).toContain("Rewritten body.");
      expect(requireSha(secondCtx)).not.toBe(firstSha);
    });

    it("emits ticket-only on every hit and writes zero state when the payload has no identity", () => {
      writeGoverningSpec();
      // No session_id/conversation_id/sessionID and no transcript_path → T4 stateless.
      const payload = buildPayload(tmp, { filePath: EDITED, session: null });

      const first = runHook(tmp, payload);
      expect(first.status).toBe(0);
      const ctx1 = additionalContext(first.stdout);
      expect(ctx1).toContain(
        `<spec-ticket file="${EDITED}" spec="${SPEC_REL}" sha256="`,
      );
      expect(ctx1).not.toContain("Command spec body.");

      const second = runHook(tmp, payload);
      expect(second.status).toBe(0);
      expect(additionalContext(second.stdout)).toContain("<spec-ticket");

      // Stateless tier does no state IO: no shards written.
      expect(listJsonl(stateBase(tmp))).toEqual([]);
    });

    it("honors TRELLIS_CONTEXT_ID as identity when the payload carries none (shared-resolver env tier)", () => {
      writeGoverningSpec();
      const payload = buildPayload(tmp, { filePath: EDITED, session: null });
      const env = { TRELLIS_CONTEXT_ID: "explicit-ctx" };

      // With an explicit context override the hook is NOT stateless: first
      // touch teaches in full and records state.
      const first = runHook(tmp, payload, env);
      expect(first.status).toBe(0);
      expect(additionalContext(first.stdout)).toContain(
        `<spec-context file="${EDITED}" spec="${SPEC_REL}" sha256="`,
      );
      expect(listJsonl(stateBase(tmp)).length).toBe(1);

      // Second touch within the window: silent, like any stateful identity.
      const second = runHook(tmp, payload, env);
      expect(second.status).toBe(0);
      expect(second.stdout.trim()).toBe("");

      // Payload identity beats the env override: a session_id in the payload
      // resolves to a DIFFERENT identity, so its first touch is full again.
      const other = runHook(
        tmp,
        buildPayload(tmp, { filePath: EDITED, session: "payload-sess" }),
        env,
      );
      expect(other.status).toBe(0);
      expect(additionalContext(other.stdout)).toContain("<spec-context");
    });

    it("keeps agent_id state separate from the same session_id without it (both first touches are full)", () => {
      writeGoverningSpec();

      const parent = runHook(
        tmp,
        buildPayload(tmp, { filePath: EDITED, session: "shared-sess" }),
      );
      expect(parent.status).toBe(0);
      expect(additionalContext(parent.stdout)).toContain(
        `<spec-context file="${EDITED}" spec="${SPEC_REL}" sha256="`,
      );

      // Same session_id, now carrying agent_id → independent identity → still
      // first → full (parent and subagent must NOT share dedup state).
      const sub = runHook(
        tmp,
        buildPayload(tmp, {
          filePath: EDITED,
          session: "shared-sess",
          agentId: "sub-7",
        }),
      );
      expect(sub.status).toBe(0);
      expect(additionalContext(sub.stdout)).toContain(
        `<spec-context file="${EDITED}" spec="${SPEC_REL}" sha256="`,
      );

      // Two distinct identity shards were written.
      expect(listJsonl(stateBase(tmp)).length).toBe(2);
    });

    it("fires on a Read tool event exactly like Edit (touching a file counts)", () => {
      writeGoverningSpec();

      const r = runHook(
        tmp,
        buildPayload(tmp, { filePath: EDITED, toolName: "Read" }),
      );
      expect(r.status).toBe(0);
      const ctx = additionalContext(r.stdout);
      expect(ctx).toContain(
        `<spec-context file="${EDITED}" spec="${SPEC_REL}" sha256="`,
      );
      expect(ctx).toContain("Command spec body.");
    });

    it("ignores tools outside Read/Edit/Write/MultiEdit (miss path is a fast exit)", () => {
      writeSpec(tmp, "cli/commands.md", "---\npaths:\n  - src/**\n---\nBody\n");

      const r = runHook(
        tmp,
        buildPayload(tmp, { filePath: "src/app.ts", toolName: "Bash" }),
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("");
    });

    it("writes state under TRELLIS_SPEC_STATE_DIR with the frozen JSONL schema", () => {
      writeGoverningSpec();

      const r = runHook(tmp, buildPayload(tmp, { filePath: EDITED }));
      expect(r.status).toBe(0);
      additionalContext(r.stdout);

      const shards = listJsonl(stateBase(tmp));
      expect(shards.length).toBe(1);
      const lines = fs
        .readFileSync(shards[0], "utf-8")
        .trim()
        .split("\n")
        .filter(Boolean);
      const record = JSON.parse(lines[lines.length - 1]) as {
        v: number;
        spec: string;
        sha256: string;
        mode: string;
        ts: number;
        lines: number | null;
        pid: number;
      };
      expect(record.v).toBe(1);
      expect(record.spec).toBe(SPEC_REL);
      expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.mode).toBe("full");
      expect(typeof record.ts).toBe("number");
      // No transcript_path → the line clock is unavailable.
      expect(record.lines).toBeNull();
      expect(typeof record.pid).toBe("number");
    });

    it("garbage-collects state shards older than 48h once past the 1h GC interval", () => {
      writeGoverningSpec();

      const base = stateBase(tmp);
      const staleDir = path.join(base, "oldproject");
      fs.mkdirSync(staleDir, { recursive: true });
      const stale = path.join(staleDir, "s-old.111.jsonl");
      fs.writeFileSync(stale, '{"v":1,"spec":"x"}\n', "utf-8");
      // Age the shard past 48h so it is eligible for pruning.
      const old = new Date(Date.now() - 72 * 3600 * 1000);
      fs.utimesSync(stale, old, old);
      // Age the GC marker past 1h so the GC pass actually fires this run.
      const lastGc = path.join(base, ".last-gc");
      fs.writeFileSync(lastGc, "", "utf-8");
      const hourAgo = new Date(Date.now() - 2 * 3600 * 1000);
      fs.utimesSync(lastGc, hourAgo, hourAgo);

      const r = runHook(tmp, buildPayload(tmp, { filePath: EDITED }));
      expect(r.status).toBe(0);
      expect(fs.existsSync(stale)).toBe(false);
    });

    it("exits 0 with empty stdout when no spec matches the edited file", () => {
      writeSpec(
        tmp,
        "cli/commands.md",
        "---\npaths:\n  - src/commands/**\n---\nBody\n",
      );

      const r = runHook(tmp, buildPayload(tmp, { filePath: "README.md" }));
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("");
    });

    it("truncates an oversized spec at max_spec_bytes with the truncation notice", () => {
      writeSpec(
        tmp,
        "big.md",
        "---\npaths:\n  - src/**\n---\n" + "X".repeat(500) + "\nBODY_END\n",
      );
      writeConfig(tmp, ["spec_injection:", "  max_spec_bytes: 64"].join("\n"));

      const r = runHook(tmp, buildPayload(tmp, { filePath: "src/app.ts" }));
      expect(r.status).toBe(0);
      const ctx = additionalContext(r.stdout);
      expect(ctx).toContain(
        "[Trellis: truncated at 64 bytes — read .trellis/spec/big.md for the full content]",
      );
      expect(ctx).not.toContain("BODY_END");
    });

    it("truncation is UTF-8-safe: a cap landing on a multibyte boundary never splits a sequence", () => {
      // Frontmatter is exactly 26 bytes; the body is 2-byte "é" characters.
      // max_spec_bytes: 28 lands exactly after the first complete "é" — a
      // lead-byte-keeping truncation bug would emit U+FFFD here.
      writeSpec(
        tmp,
        "mb.md",
        "---\npaths:\n  - src/**\n---\n" + "é".repeat(100),
      );
      writeConfig(tmp, ["spec_injection:", "  max_spec_bytes: 28"].join("\n"));

      const r = runHook(tmp, buildPayload(tmp, { filePath: "src/app.ts" }));
      expect(r.status).toBe(0);
      const ctx = additionalContext(r.stdout);
      expect(ctx).toContain("é"); // the complete sequence at the cap is kept whole
      expect(ctx).not.toContain("�"); // and no sequence was ever split
      expect(ctx).toContain(
        "[Trellis: truncated at 28 bytes — read .trellis/spec/mb.md for the full content]",
      );
    });

    it("degrades overflow matches to <spec-index> lines once max_total_bytes is exhausted", () => {
      writeSpec(
        tmp,
        "aa.md",
        "---\ndescription: first spec\npaths:\n  - src/app.ts\n---\n" +
          "A".repeat(200) +
          "\n",
      );
      writeSpec(
        tmp,
        "bb.md",
        "---\ndescription: second spec\npaths:\n  - src/app.ts\n---\n" +
          "B".repeat(200) +
          "\n",
      );
      writeConfig(
        tmp,
        [
          "spec_injection:",
          "  max_spec_bytes: 0",
          // Fits aa.md fully plus bb.md's NAMED index line (the index block is
          // budget-counted too; the collapse-to-summary path has its own test).
          "  max_total_bytes: 500",
        ].join("\n"),
      );

      const r = runHook(tmp, buildPayload(tmp, { filePath: "src/app.ts" }));
      expect(r.status).toBe(0);
      const ctx = additionalContext(r.stdout);
      expect(ctx).toContain(
        '<spec-context file="src/app.ts" spec=".trellis/spec/aa.md"',
      );
      expect(ctx).not.toContain('spec=".trellis/spec/bb.md"');
      expect(ctx).toContain("<spec-index>");
      expect(ctx).toContain("- .trellis/spec/bb.md — second spec");
    });

    it("bounds even the <spec-index> block: overflow lines collapse into a (+N more) summary", () => {
      // Pathological fan-out: many specs matching one file must not push the
      // payload past max_total_bytes (the additionalContext ceiling exists
      // precisely for this hook). Long descriptions make each index line
      // expensive so only a few fit the tiny budget.
      for (let i = 0; i < 40; i++) {
        const id = String(i).padStart(2, "0");
        writeSpec(
          tmp,
          `many-${id}.md`,
          `---\ndescription: ${"governing rule detail ".repeat(8)}${id}\npaths:\n  - src/app.ts\n---\n` +
            "X".repeat(300) +
            "\n",
        );
      }
      writeConfig(
        tmp,
        ["spec_injection:", "  max_spec_bytes: 0", "  max_total_bytes: 600"].join(
          "\n",
        ),
      );

      const r = runHook(tmp, buildPayload(tmp, { filePath: "src/app.ts" }));
      expect(r.status).toBe(0);
      const ctx = additionalContext(r.stdout);
      // Bounded: total stays at/under the cap plus the small summary line.
      expect(Buffer.byteLength(ctx, "utf-8")).toBeLessThan(900);
      expect(ctx).toContain("<spec-index>");
      expect(ctx).toMatch(
        /\(\+\d+ more governing specs over budget — run get_context\.py --mode spec --file src\/app\.ts to list them\)/,
      );
      expect(ctx).toContain("</spec-index>");
    });

    it("spec_injection.enabled: false disables injection entirely", () => {
      writeSpec(tmp, "cli/commands.md", "---\npaths:\n  - src/**\n---\nBody\n");
      writeConfig(tmp, ["spec_injection:", "  enabled: false"].join("\n"));

      const r = runHook(tmp, buildPayload(tmp, { filePath: "src/app.ts" }));
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("");
    });

    it("exits 0 with empty stdout on broken stdin", () => {
      const r = runHook(tmp, "not json{{");
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("");
    });
  });

  describe("get_context.py --mode spec: pull mode", () => {
    it("lists matching specs as `<rel path> — <description>` lines", () => {
      writeSpec(
        tmp,
        "cli/commands.md",
        "---\ndescription: command conventions\npaths:\n  - src/commands/**\n---\nBody\n",
      );
      writeSpec(tmp, "zz.md", "---\npaths:\n  - src/**\n---\nBody\n");

      const r = runGetContext(tmp, [
        "--mode",
        "spec",
        "--file",
        "src/commands/update.ts",
      ]);
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split("\n")).toEqual([
        ".trellis/spec/cli/commands.md — command conventions",
        ".trellis/spec/zz.md — (no description)",
      ]);
    });

    it("prints the no-match sentence when nothing matches", () => {
      writeSpec(
        tmp,
        "cli/commands.md",
        "---\npaths:\n  - src/commands/**\n---\nBody\n",
      );

      const r = runGetContext(tmp, [
        "--mode",
        "spec",
        "--file",
        "src/nomatch.ts",
      ]);
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe(
        "No spec files declare paths matching src/nomatch.ts.",
      );
    });
  });
});
