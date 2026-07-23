/**
 * Integration tests for path-scoped on-demand spec injection.
 *
 * Covers three surfaces:
 *   - `src/templates/trellis/scripts/common/spec_match.py` — glob→regex
 *     translation semantics, frontmatter parsing, `match_specs_for_file`
 *   - `src/templates/shared-hooks/inject-spec-context.py` — PostToolUse hook
 *     E2E: inject / dedup / mtime re-arm / truncation / budget overflow /
 *     config gate / broken stdin
 *   - `get_context.py --mode spec --file <path>` — pull mode output
 *
 * Scripts are stamped into a fresh temp dir and exercised through the real
 * `python3` interpreter (no mocking of file I/O or config parsing).
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
): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env };
  delete env.TRELLIS_HOOKS;
  delete env.TRELLIS_DISABLE_HOOKS;
  const r = spawnSync("python3", [HOOK_PATH], {
    cwd: tmp,
    encoding: "utf-8",
    input,
    env,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function editPayload(
  tmp: string,
  filePath: string,
  session = "sess-1",
  toolName = "Edit",
): string {
  return JSON.stringify({
    hook_event_name: "PostToolUse",
    session_id: session,
    cwd: tmp,
    tool_name: toolName,
    tool_input: { file_path: filePath },
  });
}

function additionalContext(stdout: string): string {
  const parsed = JSON.parse(stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
  return parsed.hookSpecificOutput.additionalContext;
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

  describe("inject-spec-context.py: hook E2E", () => {
    it("injects matching spec content wrapped in a <spec-context> block", () => {
      writeSpec(
        tmp,
        "cli/commands.md",
        "---\ndescription: command conventions\npaths:\n  - src/commands/**\n---\nCommand spec body.\n",
      );

      const r = runHook(tmp, editPayload(tmp, "src/commands/update.ts"));
      expect(r.status).toBe(0);
      const ctx = additionalContext(r.stdout);
      expect(ctx).toContain(
        '<spec-context file="src/commands/update.ts" spec=".trellis/spec/cli/commands.md">',
      );
      expect(ctx).toContain("Command spec body.");
      expect(ctx).toContain("</spec-context>");
    });

    it("exits 0 with empty stdout when no spec matches the edited file", () => {
      writeSpec(
        tmp,
        "cli/commands.md",
        "---\npaths:\n  - src/commands/**\n---\nBody\n",
      );

      const r = runHook(tmp, editPayload(tmp, "README.md"));
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("");
    });

    it("dedups within a session and re-arms when the spec mtime changes", () => {
      const specAbs = writeSpec(
        tmp,
        "cli/commands.md",
        "---\npaths:\n  - src/commands/**\n---\nBody\n",
      );
      const payload = editPayload(tmp, "src/commands/update.ts");

      const first = runHook(tmp, payload);
      expect(first.status).toBe(0);
      expect(first.stdout).toContain("spec-context");

      const statePath = path.join(
        tmp,
        ".trellis",
        ".runtime",
        "spec-injection",
        "sess-1.json",
      );
      expect(fs.existsSync(statePath)).toBe(true);

      // Second edit, same session, unchanged spec → nothing.
      const second = runHook(tmp, payload);
      expect(second.status).toBe(0);
      expect(second.stdout.trim()).toBe("");

      // Touch the spec (deterministic mtime bump) → eligible again.
      const future = new Date(Date.now() + 10_000);
      fs.utimesSync(specAbs, future, future);
      const third = runHook(tmp, payload);
      expect(third.status).toBe(0);
      expect(third.stdout).toContain("spec-context");
    });

    it("truncates an oversized spec at max_spec_bytes with the truncation notice", () => {
      writeSpec(
        tmp,
        "big.md",
        "---\npaths:\n  - src/**\n---\n" + "X".repeat(500) + "\nBODY_END\n",
      );
      writeConfig(tmp, ["spec_injection:", "  max_spec_bytes: 64"].join("\n"));

      const r = runHook(tmp, editPayload(tmp, "src/app.ts"));
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
      writeSpec(tmp, "mb.md", "---\npaths:\n  - src/**\n---\n" + "é".repeat(100));
      writeConfig(tmp, ["spec_injection:", "  max_spec_bytes: 28"].join("\n"));

      const r = runHook(tmp, editPayload(tmp, "src/app.ts"));
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
          "  max_total_bytes: 400", // fits aa.md fully, degrades bb.md
        ].join("\n"),
      );

      const r = runHook(tmp, editPayload(tmp, "src/app.ts"));
      expect(r.status).toBe(0);
      const ctx = additionalContext(r.stdout);
      expect(ctx).toContain(
        '<spec-context file="src/app.ts" spec=".trellis/spec/aa.md">',
      );
      expect(ctx).not.toContain('spec=".trellis/spec/bb.md"');
      expect(ctx).toContain("<spec-index>");
      expect(ctx).toContain("- .trellis/spec/bb.md — second spec");

      // Index-degraded specs are NOT recorded in dedup state — they stay
      // eligible for full injection on a later qualifying edit.
      const state = JSON.parse(
        fs.readFileSync(
          path.join(
            tmp,
            ".trellis",
            ".runtime",
            "spec-injection",
            "sess-1.json",
          ),
          "utf-8",
        ),
      ) as Record<string, number>;
      expect(Object.keys(state)).toEqual([".trellis/spec/aa.md"]);
    });

    it("spec_injection.enabled: false disables injection entirely", () => {
      writeSpec(tmp, "cli/commands.md", "---\npaths:\n  - src/**\n---\nBody\n");
      writeConfig(tmp, ["spec_injection:", "  enabled: false"].join("\n"));

      const r = runHook(tmp, editPayload(tmp, "src/app.ts"));
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("");
    });

    it("exits 0 with empty stdout on broken stdin", () => {
      const r = runHook(tmp, "not json{{");
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("");
    });

    it("ignores non-edit tools (only Edit/Write/MultiEdit trigger matching)", () => {
      writeSpec(tmp, "cli/commands.md", "---\npaths:\n  - src/**\n---\nBody\n");

      const r = runHook(tmp, editPayload(tmp, "src/app.ts", "sess-1", "Read"));
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
