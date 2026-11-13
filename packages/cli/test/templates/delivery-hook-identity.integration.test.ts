import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedDeliveryContext } from "./delivery-fixture.js";

const templates = path.resolve(import.meta.dirname, "../../src/templates");
const python = process.platform === "win32" ? "python" : "python3";
const platforms = ["claude", "codex", "copilot"] as const;
const startup = {
  claude: ".claude/hooks/session-start.py",
  codex: ".codex/hooks/session-start.py",
  copilot: ".github/copilot/hooks/session-start.py",
};

function snapshot(root: string): Map<string, string> {
  const files = new Map<string, string>();
  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else
        files.set(
          path.relative(root, target),
          fs.readFileSync(target).toString("base64"),
        );
    }
  }
  walk(root);
  return files;
}

describe("Delivery hook exact native identity", () => {
  let root: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-delivery-hook-identity-")),
    );
    // Hook payload identity must work without a shell override or host session leakage.
    env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        [
          "PATH",
          "Path",
          "SYSTEMROOT",
          "SystemRoot",
          "WINDIR",
          "PATHEXT",
        ].includes(key),
      ),
    );
    env.PYTHONDONTWRITEBYTECODE = "1";
    fs.cpSync(
      path.join(templates, "trellis/scripts"),
      path.join(root, ".trellis/scripts"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(root, ".trellis/config.yaml"),
      "task_auto_commit: false\n",
    );
    for (const [source, destination] of [
      ["shared-hooks/session-start.py", startup.claude],
      ["codex/hooks/session-start.py", startup.codex],
      ["copilot/hooks/session-start.py", startup.copilot],
      [
        "shared-hooks/inject-subagent-context.py",
        ".claude/hooks/inject-subagent-context.py",
      ],
      [
        "shared-hooks/inject-subagent-context.py",
        ".codex/hooks/inject-subagent-context.py",
      ],
    ]) {
      const target = path.join(root, destination);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(templates, source), target);
    }
    for (const task of ["alpha", "beta"]) {
      const delivery = seedDeliveryContext(root, task, task);
      fs.writeFileSync(
        path.join(root, `.trellis/tasks/${task}/deliveries/${delivery}/prd.md`),
        `${task.toUpperCase()} DELIVERY PRD`,
      );
    }
    // Same native session id on different hosts must resolve different bindings.
    // A second session per host also rules out a sole-binding/inventory fallback.
    for (const platform of platforms) {
      for (const session of ["session-a", "session-b"]) {
        const task =
          platform === "claude" && session === "session-a" ? "alpha" : "beta";
        execFileSync(
          python,
          [
            path.join(root, ".trellis/scripts/delivery.py"),
            "select",
            "--task",
            `.trellis/tasks/${task}`,
            "--delivery",
            "11111111-1111-4111-8111-111111111111",
          ],
          {
            cwd: root,
            env: { ...env, TRELLIS_CONTEXT_ID: `${platform}_${session}` },
          },
        );
      }
    }
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function hook(
    relative: string,
    payload: Record<string, unknown>,
    override?: string,
  ): string {
    return execFileSync(python, [path.join(root, relative)], {
      cwd: root,
      encoding: "utf8",
      env: override ? { ...env, TRELLIS_CONTEXT_ID: override } : env,
      input: JSON.stringify({ cwd: root, ...payload }),
    });
  }

  it.each(platforms)(
    "keeps native %s SessionStart identity for both Delivery projections",
    (platform) => {
      const before = snapshot(root);
      for (const session of ["session-a", "session-b"]) {
        const expected =
          platform === "claude" && session === "session-a" ? "alpha" : "beta";
        const output = hook(startup[platform], { session_id: session });
        const context = (
          JSON.parse(output) as {
            hookSpecificOutput: { additionalContext: string };
          }
        ).hookSpecificOutput.additionalContext;
        const queryLine = context
          .split("\n")
          .find((line) => line.startsWith("Delivery query: "));
        expect(queryLine).toBeDefined();
        expect(
          JSON.parse((queryLine ?? "").slice("Delivery query: ".length)),
        ).toMatchObject({
          kind: "current",
          key: {
            task_id: expected,
            delivery_id: "11111111-1111-4111-8111-111111111111",
          },
          phase: "planning",
        });
        expect(context).toContain(
          `Delivery selection: current; key={"task_id": "${expected}"`,
        );
      }
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(["trellis-implement", "trellis-check"])(
    "loads the exact Claude Delivery through actual PreToolUse (%s)",
    (agent) => {
      const before = snapshot(root);
      const invoke = (session: string, override?: string): string =>
        hook(
          ".claude/hooks/inject-subagent-context.py",
          {
            session_id: session,
            tool_name: "Task",
            tool_input: {
              subagent_type: agent,
              prompt: "Continue selected slice",
            },
          },
          override,
        );
      const alpha = invoke("session-a");
      expect(alpha).toContain("ALPHA DELIVERY PRD");
      expect(alpha).not.toContain("BETA DELIVERY PRD");
      expect(alpha).not.toContain("ROOT TASK ARTIFACT");
      const beta = invoke("session-b");
      expect(beta).toContain("BETA DELIVERY PRD");
      expect(beta).not.toContain("ALPHA DELIVERY PRD");
      // PreToolUse retains the public explicit-override precedence.
      expect(invoke("session-a", "claude_session-b")).toContain(
        "BETA DELIVERY PRD",
      );
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(platforms)(
    "retains explicit environment override for %s SessionStart",
    (platform) => {
      const before = snapshot(root);
      const output = hook(
        startup[platform],
        { session_id: "session-a" },
        "claude_session-b",
      );
      const context = (
        JSON.parse(output) as {
          hookSpecificOutput: { additionalContext: string };
        }
      ).hookSpecificOutput.additionalContext;
      expect(context).toContain(
        'Delivery query: {"kind": "current", "key": {"task_id": "beta"',
      );
      expect(context).toContain(
        'Delivery selection: current; key={"task_id": "beta"',
      );
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(["trellis-implement", "trellis-check"])(
    "retains exact Codex parent identity over inherited override (%s)",
    (agent) => {
      const before = snapshot(root);
      const output = hook(
        ".codex/hooks/inject-subagent-context.py",
        {
          session_id: "session-a",
          hook_event_name: "SubagentStart",
          agent_type: agent,
        },
        "claude_session-a",
      );
      expect(output).toContain("BETA DELIVERY PRD");
      expect(output).not.toContain("ALPHA DELIVERY PRD");
      expect(output).not.toContain("ROOT TASK ARTIFACT");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(platforms)(
    "does not borrow an existing binding for unknown %s SessionStart identity",
    (platform) => {
      const before = snapshot(root);
      for (const payload of [{}, { session_id: "unknown-session" }]) {
        const output = hook(startup[platform], payload);
        expect(output).not.toContain('Delivery query: {"kind": "current"');
        expect(output).not.toContain("Delivery selection: current");
        expect(output).not.toContain("ROOT TASK ARTIFACT");
      }
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(["trellis-implement", "trellis-check"])(
    "does not borrow another session's plans when Claude identity is absent or unknown (%s)",
    (agent) => {
      const before = snapshot(root);
      for (const payload of [{}, { session_id: "unknown-session" }]) {
        const output = hook(".claude/hooks/inject-subagent-context.py", {
          ...payload,
          tool_name: "Task",
          tool_input: { subagent_type: agent, prompt: "Continue" },
        });
        expect(output).not.toContain("ALPHA DELIVERY PRD");
        expect(output).not.toContain("BETA DELIVERY PRD");
        expect(output).not.toContain("ROOT TASK ARTIFACT");
      }
      expect(snapshot(root)).toEqual(before);
    },
  );

  it("uses native identities for schema-2 Delivery context in a registered sibling worktree", () => {
    const linked = `${root}-linked`;
    const git = (...args: string[]): void => {
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "-c",
          "commit.gpgsign=false",
          "-c",
          `core.hooksPath=${path.join(root, "empty-hooks")}`,
          ...args,
        ],
        {
          cwd: root,
          env,
          stdio: "pipe",
        },
      );
    };
    // Start a repository with only runtime carriers, keeping Task identities
    // unique to the sibling checkout rather than duplicating task authority.
    fs.rmSync(path.join(root, ".trellis/tasks"), { recursive: true });
    fs.rmSync(path.join(root, ".trellis/.runtime"), { recursive: true });
    git("init", "-q");
    git("add", ".");
    git("commit", "-qm", "Fixture carriers");
    git("worktree", "add", "--detach", linked, "HEAD");
    try {
      const delivery = seedDeliveryContext(
        linked,
        "linked-task",
        "linked-task",
      );
      fs.writeFileSync(
        path.join(
          linked,
          `.trellis/tasks/linked-task/deliveries/${delivery}/prd.md`,
        ),
        "LINKED DELIVERY PRD",
      );
      fs.writeFileSync(
        path.join(linked, "context.md"),
        "LINKED WORKSPACE SPEC",
      );
      for (const platform of platforms) {
        execFileSync(
          python,
          [
            path.join(root, ".trellis/scripts/delivery.py"),
            "select",
            "--task",
            path.join(linked, ".trellis/tasks/linked-task"),
            "--delivery",
            delivery,
          ],
          {
            cwd: root,
            env: { ...env, TRELLIS_CONTEXT_ID: `${platform}_linked-native` },
          },
        );
      }
      const callerBefore = snapshot(root);
      const linkedBefore = snapshot(linked);
      for (const platform of platforms) {
        const output = hook(startup[platform], { session_id: "linked-native" });
        const context = (
          JSON.parse(output) as {
            hookSpecificOutput: { additionalContext: string };
          }
        ).hookSpecificOutput.additionalContext;
        expect(context).toContain(
          'Delivery query: {"kind": "current", "key": {"task_id": "linked-task"',
        );
        expect(context).toContain(
          'Delivery selection: current; key={"task_id": "linked-task"',
        );
        expect(context).toContain(`Task workspace: ${linked}`);
      }
      for (const agent of ["trellis-implement", "trellis-check"]) {
        const output = hook(".claude/hooks/inject-subagent-context.py", {
          session_id: "linked-native",
          tool_name: "Task",
          tool_input: { subagent_type: agent, prompt: "Continue" },
        });
        expect(output).toContain("LINKED DELIVERY PRD");
        expect(output).toContain("LINKED WORKSPACE SPEC");
        expect(output).not.toContain("ROOT TASK ARTIFACT");
      }
      expect(snapshot(root)).toEqual(callerBefore);
      expect(snapshot(linked)).toEqual(linkedBefore);
    } finally {
      git("worktree", "remove", "--force", linked);
    }
  });
});
