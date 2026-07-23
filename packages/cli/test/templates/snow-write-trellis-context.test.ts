/**
 * Execute Snow's write-trellis-context.py for session / user / subagent modes.
 *
 * Complements platforms.test.ts (which only scans generated source). These
 * tests spawn the real Python hook against a fixture repo so regressions in
 * JSON inject, log breadcrumb policy, UTF-8 byte limits, and session isolation
 * surface without needing a live Snow host.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const HOOK_SCRIPT = path.join(
  path.dirname(__filename),
  "..",
  "..",
  "src",
  "templates",
  "snow",
  "hooks",
  "write-trellis-context.py",
);

function resolvePython(): string | null {
  for (const candidate of ["python", "python3", process.env.PYTHON ?? ""]) {
    if (!candidate) continue;
    const probe = spawnSync(candidate, ["--version"], {
      encoding: "utf-8",
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const PYTHON = resolvePython();

interface HookResult {
  status: number | null;
  stdout: string;
  stderr: string;
  payload: { additionalContext?: string; display?: string } | null;
}

function writeFixtureRepo(root: string): void {
  const taskDir = path.join(root, ".trellis", "tasks", "demo-task");
  fs.mkdirSync(path.join(root, ".trellis", "scripts"), { recursive: true });
  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(path.join(root, ".trellis", ".runtime", "sessions"), {
    recursive: true,
  });

  // Minimal task.py: always reports the fixture active task.
  fs.writeFileSync(
    path.join(root, ".trellis", "scripts", "task.py"),
    [
      "#!/usr/bin/env python3",
      "import sys",
      "if \"current\" in sys.argv:",
      "    print(\"Current task: .trellis/tasks/demo-task\")",
      "    print(\"Source: session\")",
      "    raise SystemExit(0)",
      "print(\"unknown\")",
      "raise SystemExit(1)",
      "",
    ].join("\n"),
    "utf-8",
  );

  fs.writeFileSync(
    path.join(taskDir, "prd.md"),
    "# Demo PRD\n\nAcceptance: snow hook inject works.\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(taskDir, "design.md"),
    "# Design\n\nUse class-1 hooks.\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(taskDir, "implement.md"),
    "# Implement\n\n- [ ] write tests\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(taskDir, "implement.jsonl"),
    Array.from({ length: 11 }, (_, index) =>
      JSON.stringify({
        id: `step-${index + 1}`,
        summary: `Implement summary ${index + 1}`,
      }),
    ).join("\n") + "\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(taskDir, "check.jsonl"),
    JSON.stringify({ id: "check-1", summary: "Verify inject modes" }) + "\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, ".trellis", "identity.md"),
    "# Identity\n\nName: Fixture Dev\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, ".trellis", "workflow.md"),
    "# Workflow\n\nPhase 1 Plan / Phase 2 Execute\n",
    "utf-8",
  );
}

function runHook(
  repo: string,
  mode: "session" | "user" | "subagent",
  opts: {
    stdin?: string;
    env?: Record<string, string | undefined>;
  } = {},
): HookResult {
  if (!PYTHON) {
    throw new Error("Python is required for snow hook execution tests");
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SNOW_CWD: repo,
    // Avoid leaking host Trellis session identity into fixture runs.
    TRELLIS_CONTEXT_ID: "",
    SNOW_SESSION_ID: opts.env?.SNOW_SESSION_ID ?? "",
    ...opts.env,
  };

  const result = spawnSync(
    PYTHON,
    ["-X", "utf8", HOOK_SCRIPT, mode],
    {
      cwd: repo,
      env,
      encoding: "utf-8",
      input: opts.stdin ?? "",
      windowsHide: true,
      timeout: 15_000,
    },
  );

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  let payload: HookResult["payload"] = null;
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);
  if (line) {
    try {
      payload = JSON.parse(line) as HookResult["payload"];
    } catch {
      payload = null;
    }
  }

  return {
    status: result.status,
    stdout,
    stderr,
    payload,
  };
}

describe("snow write-trellis-context.py execution", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const root of tmpRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function makeRepo(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-snow-hook-"));
    tmpRoots.push(root);
    writeFixtureRepo(root);
    return root;
  }

  it.skipIf(!PYTHON)(
    "session mode emits full inject JSON and writes full log",
    () => {
      const repo = makeRepo();
      const res = runHook(repo, "session", {
        stdin: JSON.stringify({
          sessionId: "sess-session-1",
          cwd: repo,
          isResume: false,
        }),
        env: { SNOW_SESSION_ID: "sess-session-1" },
      });

      expect(res.status).toBe(0);
      expect(res.payload).not.toBeNull();
      expect(res.payload?.additionalContext).toContain(
        "# Trellis context (Snow CLI)",
      );
      expect(res.payload?.additionalContext).toContain("Mode: session");
      expect(res.payload?.additionalContext).toContain(
        ".trellis/tasks/demo-task",
      );
      expect(res.payload?.additionalContext).toContain("prd.md summary");
      expect(res.payload?.display).toContain("Trellis session context injected");

      const logPath = path.join(repo, ".snow", "log", "trellis-context.txt");
      expect(fs.existsSync(logPath)).toBe(true);
      const log = fs.readFileSync(logPath, "utf-8");
      expect(log).toContain("Mode: session");
      expect(log).toContain("Demo PRD");
    },
  );

  it.skipIf(!PYTHON)(
    "user mode injects compact context but preserves full log snapshot",
    () => {
      const repo = makeRepo();
      const res = runHook(repo, "user", {
        stdin: JSON.stringify({
          sessionId: "sess-user-1",
          cwd: repo,
          message: "hello",
          source: "normal",
        }),
        env: { SNOW_SESSION_ID: "sess-user-1" },
      });

      expect(res.status).toBe(0);
      expect(res.payload?.additionalContext).toContain("Mode: user");
      // Compact inject should not embed large prd body.
      expect(res.payload?.additionalContext).not.toContain("prd.md summary");
      expect(res.payload?.additionalContext).toContain("prd.md: present");
      expect(res.payload?.display).toContain("Trellis compact breadcrumb");

      const log = fs.readFileSync(
        path.join(repo, ".snow", "log", "trellis-context.txt"),
        "utf-8",
      );
      // Log must stay full (session-depth), not the compact inject.
      expect(log).toContain("Mode: session");
      expect(log).toContain("prd.md summary");
      expect(log).toContain("Demo PRD");
    },
  );

  it.skipIf(!PYTHON)(
    "subagent mode tailors checklist by agent kind",
    () => {
      const repo = makeRepo();

      const implement = runHook(repo, "subagent", {
        stdin: JSON.stringify({
          sessionId: "sess-sub-1",
          cwd: repo,
          agentId: "trellis-implement",
          agentName: "trellis-implement",
          prompt: "Active task: .trellis/tasks/demo-task\nImplement feature",
        }),
        env: { SNOW_SESSION_ID: "sess-sub-1" },
      });
      expect(implement.status).toBe(0);
      expect(implement.payload?.additionalContext).toContain(
        "Mode: subagent | agentKind: implement",
      );
      expect(implement.payload?.additionalContext).toContain(
        "Sub-agent checklist (implement)",
      );
      expect(implement.payload?.additionalContext).toContain(
        "implement.jsonl (recent)",
      );
      expect(implement.payload?.additionalContext).toContain("Implement summary 11");
      expect(implement.payload?.additionalContext).not.toContain(
        "- Implement summary 1\n",
      );
      expect(implement.payload?.display).toContain("implement");

      const check = runHook(repo, "subagent", {
        stdin: JSON.stringify({
          sessionId: "sess-sub-2",
          cwd: repo,
          agentName: "trellis-check",
          prompt: "review changes",
        }),
        env: { SNOW_SESSION_ID: "sess-sub-2" },
      });
      expect(check.payload?.additionalContext).toContain("agentKind: check");
      expect(check.payload?.additionalContext).toContain(
        "Sub-agent checklist (check)",
      );

      const research = runHook(repo, "subagent", {
        stdin: JSON.stringify({
          sessionId: "sess-sub-3",
          cwd: repo,
          agentName: "trellis-research",
          prompt: "research topic",
        }),
        env: { SNOW_SESSION_ID: "sess-sub-3" },
      });
      expect(research.payload?.additionalContext).toContain(
        "agentKind: research",
      );
      expect(research.payload?.additionalContext).toContain(
        "Sub-agent checklist (research)",
      );
      expect(research.payload?.additionalContext).toContain("/research/");
    },
  );

  it.skipIf(!PYTHON)(
    "does not pick another session runtime file by mtime",
    () => {
      const repo = makeRepo();
      const sessionsDir = rootSessions(repo);
      // Newer foreign session should NOT be selected when current id is known.
      fs.writeFileSync(
        path.join(sessionsDir, "foreign-session.json"),
        JSON.stringify({ owner: "other", secret: "DO-NOT-LEAK" }),
        "utf-8",
      );
      // Ensure foreign file is newer.
      const future = Date.now() + 60_000;
      fs.utimesSync(
        path.join(sessionsDir, "foreign-session.json"),
        future / 1000,
        future / 1000,
      );
      fs.writeFileSync(
        path.join(sessionsDir, "mine-session.json"),
        JSON.stringify({ owner: "me", note: "current-session-marker" }),
        "utf-8",
      );

      const res = runHook(repo, "session", {
        stdin: JSON.stringify({
          sessionId: "mine-session",
          cwd: repo,
          isResume: true,
        }),
        env: {
          SNOW_SESSION_ID: "mine-session",
          TRELLIS_CONTEXT_ID: "snow-mine-session",
        },
      });

      expect(res.status).toBe(0);
      const body = res.payload?.additionalContext ?? "";
      expect(body).toContain("current-session-marker");
      expect(body).not.toContain("DO-NOT-LEAK");
      expect(body).toContain("runtime session (mine-session.json)");
    },
  );

  it.skipIf(!PYTHON)("enforces _truncate limits in UTF-8 bytes", () => {
    if (!PYTHON) return;
    // Import helpers by executing a tiny driver against the hook module.
    const driver = `
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("wtc", r"${HOOK_SCRIPT.replace(/\\/g, "/")}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
text = "中" * 200 + "a" * 200
out = mod._truncate(text, 50)
print(json.dumps({"bytes": len(out.encode("utf-8")), "has_marker": "truncated" in out}))
`;
    const res = spawnSync(PYTHON, ["-X", "utf8", "-c", driver], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 10_000,
    });
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout.trim()) as {
      bytes: number;
      has_marker: boolean;
    };
    expect(parsed.bytes).toBeLessThanOrEqual(50);
    expect(parsed.has_marker).toBe(true);
  });

  it.skipIf(!PYTHON)("fail-open returns JSON on unexpected errors", () => {
    // Point SNOW_CWD at a path that cannot be used as repo root write target
    // by making .snow a file instead of a directory after hook starts is hard;
    // instead verify empty-stdin mode still emits valid JSON exit 0.
    const repo = makeRepo();
    const res = runHook(repo, "session", { stdin: "" });
    expect(res.status).toBe(0);
    expect(res.payload).not.toBeNull();
    expect(typeof res.payload?.additionalContext).toBe("string");
    expect(typeof res.payload?.display).toBe("string");
  });
});

function rootSessions(repo: string): string {
  return path.join(repo, ".trellis", ".runtime", "sessions");
}
