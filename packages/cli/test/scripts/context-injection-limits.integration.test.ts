/**
 * Integration tests for sub-agent context injection limits (issue #441).
 *
 * Covers two templates:
 *   - `src/templates/trellis/scripts/common/config.py` — config parsing
 *     (`get_context_injection_limits`)
 *   - `src/templates/shared-hooks/inject-subagent-context.py` — truncation,
 *     total-budget degradation, UTF-8 safety
 *   - `src/templates/trellis/scripts/common/task_context.py` — `task.py
 *     validate` hygiene warnings
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
  "../../src/templates/shared-hooks/inject-subagent-context.py",
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
}

function writeConfig(tmp: string, yaml: string): void {
  fs.writeFileSync(path.join(tmp, ".trellis", "config.yaml"), yaml, "utf-8");
}

/** Run a Python snippet with the hook module preloaded as `mod` and the repo
 * root available as `REPO_ROOT`. Returns trimmed stdout. Throws with stderr
 * on non-zero exit. */
function runHookProbe(tmp: string, code: string): string {
  const probePath = path.join(tmp, "probe.py");
  const script = `
import sys, importlib.util
sys.argv[0] = ${JSON.stringify(path.join(tmp, "hook.py"))}
REPO_ROOT = ${JSON.stringify(tmp)}
spec = importlib.util.spec_from_file_location("h", ${JSON.stringify(HOOK_PATH)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
${code}
`;
  fs.writeFileSync(probePath, script, "utf-8");
  const r = spawnSync("python3", [probePath], {
    cwd: tmp,
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    throw new Error(`probe failed (rc=${r.status}): ${r.stderr}`);
  }
  return r.stdout;
}

function runConfigProbe(tmp: string, code: string): string {
  const probePath = path.join(tmp, "config_probe.py");
  const script = `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(tmp, ".trellis", "scripts"))})
from pathlib import Path
from common.config import get_context_injection_limits
REPO_ROOT = Path(${JSON.stringify(tmp)})
${code}
`;
  fs.writeFileSync(probePath, script, "utf-8");
  const r = spawnSync("python3", [probePath], {
    cwd: tmp,
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    throw new Error(`probe failed (rc=${r.status}): ${r.stderr}`);
  }
  return r.stdout;
}

function makeTask(tmp: string, dirName: string): string {
  const taskDir = path.join(tmp, ".trellis", "tasks", dirName);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, "task.json"),
    JSON.stringify({ id: dirName, title: dirName, status: "in_progress" }) +
      "\n",
    "utf-8",
  );
  return taskDir;
}

describe.skipIf(!hasPython())(
  "context injection limits (issue #441)",
  () => {
    let tmp: string;

    beforeEach(() => {
      tmp = fs.mkdtempSync(
        path.join(os.tmpdir(), "trellis-context-limits-test-"),
      );
      setupRepo(tmp);
    });

    afterEach(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    describe("common/config.py: get_context_injection_limits", () => {
      it("returns built-in defaults when config.yaml has no context_injection section", () => {
        writeConfig(tmp, "session_auto_commit: true\n");
        const out = runConfigProbe(
          tmp,
          "print(get_context_injection_limits(REPO_ROOT))",
        );
        expect(out.trim()).toBe(
          "{'max_file_bytes': 32768, 'max_artifact_bytes': 65536, 'max_total_bytes': 131072}",
        );
      });

      it("returns built-in defaults when config.yaml is absent", () => {
        const out = runConfigProbe(
          tmp,
          "print(get_context_injection_limits(REPO_ROOT))",
        );
        expect(out.trim()).toBe(
          "{'max_file_bytes': 32768, 'max_artifact_bytes': 65536, 'max_total_bytes': 131072}",
        );
      });

      it("applies explicit overrides for all three keys", () => {
        writeConfig(
          tmp,
          [
            "context_injection:",
            "  max_file_bytes: 100",
            "  max_artifact_bytes: 200",
            "  max_total_bytes: 300",
          ].join("\n"),
        );
        const out = runConfigProbe(
          tmp,
          "print(get_context_injection_limits(REPO_ROOT))",
        );
        expect(out.trim()).toBe(
          "{'max_file_bytes': 100, 'max_artifact_bytes': 200, 'max_total_bytes': 300}",
        );
      });

      it("0 means unlimited and is preserved as-is (not replaced by default)", () => {
        writeConfig(
          tmp,
          ["context_injection:", "  max_total_bytes: 0"].join("\n"),
        );
        const out = runConfigProbe(
          tmp,
          "print(get_context_injection_limits(REPO_ROOT)['max_total_bytes'])",
        );
        expect(out.trim()).toBe("0");
      });

      it("falls back to default and warns on stderr for a negative value", () => {
        writeConfig(
          tmp,
          ["context_injection:", "  max_file_bytes: -5"].join("\n"),
        );
        const probePath = path.join(tmp, "probe_neg.py");
        fs.writeFileSync(
          probePath,
          `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(tmp, ".trellis", "scripts"))})
from pathlib import Path
from common.config import get_context_injection_limits
print(get_context_injection_limits(Path(${JSON.stringify(tmp)}))["max_file_bytes"])
`,
          "utf-8",
        );
        const r = spawnSync("python3", [probePath], {
          cwd: tmp,
          encoding: "utf-8",
        });
        expect(r.status).toBe(0);
        expect(r.stdout.trim()).toBe("32768");
        expect(r.stderr).toContain("invalid context_injection.max_file_bytes");
      });

      it("falls back to default and warns on stderr for a non-integer value", () => {
        writeConfig(
          tmp,
          ["context_injection:", "  max_artifact_bytes: not-a-number"].join(
            "\n",
          ),
        );
        const probePath = path.join(tmp, "probe_nan.py");
        fs.writeFileSync(
          probePath,
          `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(tmp, ".trellis", "scripts"))})
from pathlib import Path
from common.config import get_context_injection_limits
print(get_context_injection_limits(Path(${JSON.stringify(tmp)}))["max_artifact_bytes"])
`,
          "utf-8",
        );
        const r = spawnSync("python3", [probePath], {
          cwd: tmp,
          encoding: "utf-8",
        });
        expect(r.status).toBe(0);
        expect(r.stdout.trim()).toBe("65536");
        expect(r.stderr).toContain(
          "invalid context_injection.max_artifact_bytes",
        );
      });
    });

    describe("inject-subagent-context.py: truncate_utf8", () => {
      it("leaves data untouched when cap is 0 (unlimited)", () => {
        const out = runHookProbe(
          tmp,
          `print(mod.truncate_utf8(b"X" * 1000, 0) == b"X" * 1000)`,
        );
        expect(out.trim()).toBe("True");
      });

      it("leaves data untouched when data is at or under the cap", () => {
        const out = runHookProbe(
          tmp,
          `
data = b"hello world"
print(mod.truncate_utf8(data, len(data)) == data)
print(mod.truncate_utf8(data, len(data) + 5) == data)
`,
        );
        expect(out.trim().split("\n")).toEqual(["True", "True"]);
      });

      it("truncates ASCII data exactly at the cap (1 byte over cap)", () => {
        const out = runHookProbe(
          tmp,
          `
data = b"abcdefghij"  # 10 bytes
print(mod.truncate_utf8(data, 9) == b"abcdefghi")
`,
        );
        expect(out.trim()).toBe("True");
      });

      it("never splits a multi-byte UTF-8 sequence at the boundary", () => {
        // "café" = c a f + 0xC3 0xA9 (2-byte é). Capping right inside the
        // 2-byte sequence must back off to "caf", not emit a dangling byte.
        const out = runHookProbe(
          tmp,
          `
data = "café".encode("utf-8")
for cap in range(len(data) + 1):
    out = mod.truncate_utf8(data, cap)
    out.decode("utf-8")  # raises UnicodeDecodeError if invalid
print("all-valid")
print(mod.truncate_utf8(data, 4).decode("utf-8"))
`,
        );
        const lines = out.trim().split("\n");
        expect(lines[0]).toBe("all-valid");
        expect(lines[1]).toBe("caf");
      });

      it("never splits a 3-byte UTF-8 sequence (currency sign) at the boundary", () => {
        const out = runHookProbe(
          tmp,
          `
data = ("x" + "\\u20ac").encode("utf-8")  # x + 3-byte euro sign
for cap in range(len(data) + 1):
    out = mod.truncate_utf8(data, cap)
    out.decode("utf-8")
print("all-valid")
`,
        );
        expect(out.trim()).toBe("all-valid");
      });
    });

    describe("inject-subagent-context.py: per-file and per-artifact caps", () => {
      it("under-cap content is byte-identical to unlimited output (golden)", () => {
        const taskDir = makeTask(tmp, "task-golden");
        fs.writeFileSync(
          path.join(tmp, "small.md"),
          "small spec content\n",
          "utf-8",
        );
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({ file: "small.md", reason: "r" }) + "\n",
          "utf-8",
        );
        fs.writeFileSync(path.join(taskDir, "prd.md"), "prd body\n", "utf-8");
        writeConfig(tmp, ""); // defaults — everything here is far under cap
        const relTask = path.relative(tmp, taskDir).split(path.sep).join("/");
        const out = runHookProbe(
          tmp,
          `print(mod.get_implement_context(REPO_ROOT, ${JSON.stringify(relTask)}))`,
        );
        expect(out).toContain("=== small.md ===\nsmall spec content");
        expect(out).toContain(
          `=== ${relTask}/prd.md (Requirements) ===\nprd body`,
        );
        expect(out).not.toContain("[Trellis: truncated");
        expect(out).not.toContain("[Trellis: not inlined");
      });

      it("keeps binary jsonl references as notices even when limits are unlimited", () => {
        const taskDir = makeTask(tmp, "task-binary-reference");
        const binary = Buffer.from([
          0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x41, 0x42,
        ]);
        fs.writeFileSync(path.join(tmp, "design.png"), binary);
        fs.writeFileSync(
          path.join(tmp, "invalid.bin"),
          Buffer.from([0xff, 0xfe, 0xfd]),
        );
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          [
            JSON.stringify({ file: "design.png", reason: "visual baseline" }),
            JSON.stringify({ file: "invalid.bin", reason: "legacy export" }),
          ].join("\n") + "\n",
          "utf-8",
        );
        writeConfig(
          tmp,
          [
            "context_injection:",
            "  max_file_bytes: 0",
            "  max_total_bytes: 0",
          ].join("\n"),
        );
        const relTask = path.relative(tmp, taskDir).split(path.sep).join("/");

        const out = runHookProbe(
          tmp,
          `print(mod.get_implement_context(REPO_ROOT, ${JSON.stringify(relTask)}))`,
        );

        expect(out).toContain(
          "[Trellis: not inlined (binary file) — design.png (10 bytes): visual baseline]",
        );
        expect(out).toContain(
          "[Trellis: not inlined (binary file) — invalid.bin (3 bytes): legacy export]",
        );
        expect(out).not.toContain("=== design.png ===");
        expect(out).not.toContain("=== invalid.bin ===");
        expect(out).not.toContain("\u0000");
        expect(out).not.toContain("�");
      });

      it("does not misclassify legitimate multi-byte UTF-8 content as binary", () => {
        const taskDir = makeTask(tmp, "task-utf8-not-binary");
        const multiByteContent =
          "emoji: 🎉🚀 cjk: 中文测试 bmp: café naïve\n";
        fs.writeFileSync(
          path.join(tmp, "multibyte.md"),
          multiByteContent,
          "utf-8",
        );
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({ file: "multibyte.md", reason: "unicode spec" }) +
            "\n",
          "utf-8",
        );
        writeConfig(tmp, "");
        const relTask = path.relative(tmp, taskDir).split(path.sep).join("/");

        const out = runHookProbe(
          tmp,
          `print(mod.get_implement_context(REPO_ROOT, ${JSON.stringify(relTask)}))`,
        );

        expect(out).toContain(`=== multibyte.md ===\n${multiByteContent}`);
        expect(out).not.toContain("[Trellis: not inlined (binary file)");
      });

      it("classifies a file as binary when binary bytes appear only at the end", () => {
        const taskDir = makeTask(tmp, "task-text-head-binary-tail");
        const mixed = Buffer.concat([
          Buffer.from("looks like a normal text file up front\n", "utf-8"),
          Buffer.from([0x00, 0xff, 0xfe]),
        ]);
        fs.writeFileSync(path.join(tmp, "mixed.dat"), mixed);
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({ file: "mixed.dat", reason: "mixed content" }) +
            "\n",
          "utf-8",
        );
        writeConfig(tmp, "");
        const relTask = path.relative(tmp, taskDir).split(path.sep).join("/");

        const out = runHookProbe(
          tmp,
          `print(mod.get_implement_context(REPO_ROOT, ${JSON.stringify(relTask)}))`,
        );

        expect(out).toContain(
          `[Trellis: not inlined (binary file) — mixed.dat (${mixed.length} bytes): mixed content]`,
        );
        expect(out).not.toContain("=== mixed.dat ===");
      });

      it("truncates an oversized jsonl-referenced file at max_file_bytes with a notice", () => {
        const taskDir = makeTask(tmp, "task-oversize");
        fs.writeFileSync(
          path.join(tmp, "big.txt"),
          "A".repeat(2 * 1024 * 1024), // 2 MiB
          "utf-8",
        );
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({ file: "big.txt", reason: "big" }) + "\n",
          "utf-8",
        );
        writeConfig(tmp, ""); // defaults: 32 KiB file cap, 128 KiB total cap
        const relTask = path.relative(tmp, taskDir).split(path.sep).join("/");
        const out = runHookProbe(
          tmp,
          `print(mod.get_implement_context(REPO_ROOT, ${JSON.stringify(relTask)}))`,
        );
        expect(Buffer.byteLength(out, "utf-8")).toBeLessThanOrEqual(
          128 * 1024 + 256, // total cap + slack for the wrapping print()/notices
        );
        expect(out).toContain(
          "[Trellis: truncated at 32768 bytes — read big.txt for the full content]",
        );
      });

      it("degrades to an index line once the total budget is exhausted (3 files)", () => {
        const taskDir = makeTask(tmp, "task-total-cap");
        fs.writeFileSync(path.join(tmp, "f1.txt"), "1".repeat(50), "utf-8");
        fs.writeFileSync(path.join(tmp, "f2.txt"), "2".repeat(50), "utf-8");
        fs.writeFileSync(path.join(tmp, "f3.txt"), "3".repeat(50), "utf-8");
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          [
            JSON.stringify({ file: "f1.txt", reason: "first" }),
            JSON.stringify({ file: "f2.txt", reason: "second" }),
            JSON.stringify({ file: "f3.txt", reason: "third" }),
          ].join("\n") + "\n",
          "utf-8",
        );
        writeConfig(
          tmp,
          [
            "context_injection:",
            "  max_file_bytes: 0",
            "  max_artifact_bytes: 0",
            "  max_total_bytes: 120", // fits f1 fully, degrades f2/f3
          ].join("\n"),
        );
        const relTask = path.relative(tmp, taskDir).split(path.sep).join("/");
        const out = runHookProbe(
          tmp,
          `print(mod.get_implement_context(REPO_ROOT, ${JSON.stringify(relTask)}))`,
        );
        expect(out).toContain("=== f1.txt ===\n" + "1".repeat(50));
        expect(out).toContain(
          "[Trellis: not inlined (total context limit reached) — f2.txt (50 bytes): second]",
        );
        expect(out).toContain(
          "[Trellis: not inlined (total context limit reached) — f3.txt (50 bytes): third]",
        );
        expect(out).not.toContain("=== f2.txt ===");
        expect(out).not.toContain("=== f3.txt ===");
      });

      it("max_total_bytes: 0 restores fully unlimited inlining", () => {
        const taskDir = makeTask(tmp, "task-unlimited-total");
        const bigContent = "Z".repeat(5000);
        fs.writeFileSync(path.join(tmp, "big.txt"), bigContent, "utf-8");
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({ file: "big.txt", reason: "big" }) + "\n",
          "utf-8",
        );
        writeConfig(
          tmp,
          [
            "context_injection:",
            "  max_file_bytes: 0",
            "  max_total_bytes: 0",
          ].join("\n"),
        );
        const relTask = path.relative(tmp, taskDir).split(path.sep).join("/");
        const out = runHookProbe(
          tmp,
          `print(mod.get_implement_context(REPO_ROOT, ${JSON.stringify(relTask)}))`,
        );
        expect(out).toContain("=== big.txt ===\n" + bigContent);
        expect(out).not.toContain("[Trellis: not inlined");
      });

      it("directory entries respect the per-file cap and total budget", () => {
        const taskDir = makeTask(tmp, "task-dir-entry");
        const dir = path.join(tmp, "refdir");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "a.md"), "A".repeat(1000), "utf-8");
        fs.writeFileSync(path.join(dir, "b.md"), "B".repeat(1000), "utf-8");
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({
            file: "refdir/",
            type: "directory",
            reason: "reference dir",
          }) + "\n",
          "utf-8",
        );
        writeConfig(
          tmp,
          [
            "context_injection:",
            "  max_file_bytes: 10",
            "  max_total_bytes: 0",
          ].join("\n"),
        );
        const relTask = path.relative(tmp, taskDir).split(path.sep).join("/");
        const out = runHookProbe(
          tmp,
          `print(mod.get_implement_context(REPO_ROOT, ${JSON.stringify(relTask)}))`,
        );
        expect(out).toContain(
          "[Trellis: truncated at 10 bytes — read refdir/a.md for the full content]",
        );
        expect(out).toContain(
          "[Trellis: truncated at 10 bytes — read refdir/b.md for the full content]",
        );
      });

      it("artifacts (prd/design/implement.md) obey max_artifact_bytes independently of max_file_bytes", () => {
        const taskDir = makeTask(tmp, "task-artifact-cap");
        fs.writeFileSync(
          path.join(taskDir, "prd.md"),
          "P".repeat(1000),
          "utf-8",
        );
        writeConfig(
          tmp,
          [
            "context_injection:",
            "  max_file_bytes: 0",
            "  max_artifact_bytes: 20",
            "  max_total_bytes: 0",
          ].join("\n"),
        );
        const relTask = path.relative(tmp, taskDir).split(path.sep).join("/");
        const out = runHookProbe(
          tmp,
          `print(mod.get_implement_context(REPO_ROOT, ${JSON.stringify(relTask)}))`,
        );
        expect(out).toContain("P".repeat(20));
        expect(out).not.toContain("P".repeat(21));
        expect(out).toContain(
          `[Trellis: truncated at 20 bytes — read ${relTask}/prd.md for the full content]`,
        );
      });
    });

    describe("task.py validate: JSONL hygiene warnings", () => {
      function runValidate(
        taskDir: string,
      ): { status: number | null; stdout: string; stderr: string } {
        const r = spawnSync(
          "python3",
          [
            path.join(tmp, ".trellis", "scripts", "task.py"),
            "validate",
            taskDir,
          ],
          { cwd: tmp, encoding: "utf-8" },
        );
        return { status: r.status, stdout: r.stdout, stderr: r.stderr };
      }

      it("warns (does not error) on a jsonl entry that looks like a code file", () => {
        const taskDir = makeTask(tmp, "task-code-warn");
        fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
        fs.writeFileSync(
          path.join(tmp, "src", "index.ts"),
          "export const x = 1;\n",
          "utf-8",
        );
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({ file: "src/index.ts", reason: "wrong" }) + "\n",
          "utf-8",
        );
        const { status, stdout } = runValidate(taskDir);
        expect(status).toBe(0);
        expect(stdout).toContain("looks like a code file");
        expect(stdout).toContain("All validations passed");
      });

      it("does not warn about a code-looking path under .trellis/spec/, docs/, or the task's own directory", () => {
        const taskDir = makeTask(tmp, "task-code-exempt");
        fs.mkdirSync(path.join(tmp, ".trellis", "spec"), { recursive: true });
        fs.writeFileSync(
          path.join(tmp, ".trellis", "spec", "example.py"),
          "# example only\n",
          "utf-8",
        );
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({
            file: ".trellis/spec/example.py",
            reason: "spec code sample",
          }) + "\n",
          "utf-8",
        );
        const { status, stdout } = runValidate(taskDir);
        expect(status).toBe(0);
        expect(stdout).not.toContain("looks like a code file");
      });

      it("warns on a jsonl entry whose file size exceeds max_file_bytes", () => {
        const taskDir = makeTask(tmp, "task-size-warn");
        fs.writeFileSync(
          path.join(tmp, "oversized.md"),
          "X".repeat(200),
          "utf-8",
        );
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({ file: "oversized.md", reason: "big" }) + "\n",
          "utf-8",
        );
        writeConfig(
          tmp,
          ["context_injection:", "  max_file_bytes: 100"].join("\n"),
        );
        const { status, stdout } = runValidate(taskDir);
        expect(status).toBe(0);
        expect(stdout).toContain("oversized.md is 200 bytes");
        expect(stdout).toContain("context_injection.max_file_bytes (100)");
      });

      it("stays warning-free for a clean, under-cap, spec-only manifest", () => {
        const taskDir = makeTask(tmp, "task-clean");
        fs.mkdirSync(path.join(tmp, ".trellis", "spec"), { recursive: true });
        fs.writeFileSync(
          path.join(tmp, ".trellis", "spec", "guide.md"),
          "spec guide\n",
          "utf-8",
        );
        fs.writeFileSync(
          path.join(taskDir, "implement.jsonl"),
          JSON.stringify({
            file: ".trellis/spec/guide.md",
            reason: "guide",
          }) + "\n",
          "utf-8",
        );
        const { status, stdout } = runValidate(taskDir);
        expect(status).toBe(0);
        expect(stdout).not.toContain("Warning:");
        expect(stdout).toContain("All validations passed");
      });
    });
  },
);
