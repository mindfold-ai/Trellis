/**
 * Integration test for the Antigravity output branch of the shared per-turn and
 * shell-session hooks.
 *
 * Antigravity expects PreInvocation hooks to return:
 *   {"injectSteps": [{"ephemeralMessage": "..."}]}
 * and PreToolUse hooks for run_command to return:
 *   {"decision": "allow"}
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPythonCommandForPlatform } from "../../src/configurators/shared";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);
const SHARED_HOOKS = path.resolve(
  __dirname,
  "../../src/templates/shared-hooks",
);

const pythonCmd = getPythonCommandForPlatform();

function hasPython(): boolean {
  try {
    execFileSync(pythonCmd, ["--version"], { stdio: "ignore" });
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
  fs.mkdirSync(path.join(tmp, ".agent", "hooks"), { recursive: true });
  fs.cpSync(
    path.join(SHARED_HOOKS, "inject-workflow-state.py"),
    path.join(tmp, ".agent", "hooks", "inject-workflow-state.py"),
  );
  fs.cpSync(
    path.join(SHARED_HOOKS, "inject-shell-session-context.py"),
    path.join(tmp, ".agent", "hooks", "inject-shell-session-context.py"),
  );

  // workflow.md with a no_task breadcrumb so the body is deterministic.
  fs.writeFileSync(
    path.join(tmp, ".trellis", "workflow.md"),
    [
      "# Workflow",
      "",
      "## Phase Index",
      "",
      "[workflow-state:no_task]",
      "No active task. Classify the turn before creating a Trellis task.",
      "[/workflow-state:no_task]",
      "",
      "## Phase 1: Plan",
      "",
    ].join("\n"),
  );
}

const describeFn = hasPython() ? describe : describe.skip;

describeFn("Antigravity hook integration", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-antigravity-hook-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("inject-workflow-state.py emits injectSteps ephemeralMessage for Antigravity", () => {
    const agentDir = path.join(tmp, ".agent");
    const r = spawnSync(
      pythonCmd,
      ["hooks/inject-workflow-state.py"],
      {
        cwd: agentDir,
        encoding: "utf-8",
        input: JSON.stringify({
          conversationId: "test-conversation-42",
          workspacePaths: [tmp],
          cwd: tmp,
          prompt: "hello",
        }),
        env: { ...process.env },
      },
    );

    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      injectSteps?: Array<{ ephemeralMessage?: string }>;
    };
    expect(parsed).toHaveProperty("injectSteps");
    expect(Array.isArray(parsed.injectSteps)).toBe(true);
    expect(parsed.injectSteps?.[0]?.ephemeralMessage).toContain("<workflow-state>");
    expect(parsed.injectSteps?.[0]?.ephemeralMessage).toContain("Status: no_task");
  });

  it("inject-shell-session-context.py handles Antigravity run_command toolCall", () => {
    const agentDir = path.join(tmp, ".agent");
    const r = spawnSync(
      pythonCmd,
      ["hooks/inject-shell-session-context.py"],
      {
        cwd: agentDir,
        encoding: "utf-8",
        input: JSON.stringify({
          conversationId: "test-conversation-42",
          workspacePaths: [tmp],
          cwd: tmp,
          toolCall: {
            name: "run_command",
            args: {
              CommandLine: `${pythonCmd} .trellis/scripts/task.py start 01-my-task`,
            },
          },
        }),
        env: { ...process.env },
      },
    );

    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as { decision?: string };
    expect(parsed.decision).toBe("allow");

    // Check that shell ticket was created
    const ticketDir = path.join(tmp, ".trellis", ".runtime", "shell-tickets");
    expect(fs.existsSync(ticketDir)).toBe(true);
    const ticketFiles = fs.readdirSync(ticketDir);
    expect(ticketFiles.length).toBe(1);
    const ticketContent = JSON.parse(
      fs.readFileSync(path.join(ticketDir, ticketFiles[0]), "utf-8"),
    );
    expect(ticketContent.context_key).toContain("antigravity");
    expect(ticketContent.context_key).toContain("test-conversation-42");
  });
});
