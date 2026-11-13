import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectPlatformTemplates } from "../../src/configurators/index.js";
import { injectPullBasedPreludeToml } from "../../src/configurators/shared.js";
import { seedDeliveryContext } from "./delivery-fixture.js";
import injectPlugin from "../../src/templates/opencode/plugins/inject-subagent-context.js";

const templates = path.resolve(import.meta.dirname, "../../src/templates");
const python = process.platform === "win32" ? "python" : "python3";
const hosts = ["claude", "codex", "opencode"] as const;
type Host = (typeof hosts)[number];

const pullPlatforms = [
  { platform: "gemini", agentPath: ".gemini/agents/" },
  { platform: "qoder", agentPath: ".qoder/agents/" },
  { platform: "copilot", agentPath: ".github/agents/", suffix: ".agent.md" },
] as const;

function pullPrelude(content: string): string {
  const start = content.indexOf("## Required: Load Trellis Context First");
  if (start < 0) throw new Error("Generated agent has no pull prelude");
  const end = content.indexOf("\n---\n", start);
  if (end < 0) throw new Error("Generated prelude has no closing separator");
  return content.slice(start, end);
}

describe("generated pull checker context profiles", () => {
  it.each(pullPlatforms)(
    "$platform permits Task-scope quality before formal Delivery loading",
    ({ platform, agentPath, ...options }) => {
      const suffix = "suffix" in options ? options.suffix : ".md";
      const content = collectPlatformTemplates(platform)?.get(
        `${agentPath}trellis-check${suffix}`,
      );
      if (!content) throw new Error("Missing generated checker");
      const prelude = pullPrelude(content);
      expect(prelude).toContain("quality is the default");
      expect(prelude).toContain("No selected Delivery is required");
      expect(prelude).toContain("TaskKey and accepted_scope");
      expect(prelude).toContain("caller-supplied quality/evidence inputs");
      expect(prelude).toContain(
        "Do not load root design/implement or manifests",
      );
      expect(prelude).toContain("binding/runtime/stale errors never downgrade");
      expect(prelude).toContain(
        "explicit dispatch profile field or whole line",
      );
      expect(prelude).toContain("DeliveryKey/generation, current candidate");
      expect(prelude).toContain("validated planning_root");
      expect(prelude).toContain("read-only");
      expect(prelude).toContain("retained legacy Task");
      expect(prelude).toContain("<task-path>/check.jsonl");
      expect(prelude).not.toContain("Missing/stale selection is an error");
      // These rules must be in the prelude itself, before the source agent's
      // legacy-loading and self-fix prose, rather than relying on a later override.
      expect(content.indexOf("No selected Delivery is required")).toBeLessThan(
        content.indexOf("# Check Agent"),
      );
    },
  );

  it.each(pullPlatforms)(
    "$platform implementation still requires selected Delivery planning",
    ({ platform, agentPath, ...options }) => {
      const suffix = "suffix" in options ? options.suffix : ".md";
      const content = collectPlatformTemplates(platform)?.get(
        `${agentPath}trellis-implement${suffix}`,
      );
      if (!content) throw new Error("Missing generated implementer");
      const prelude = pullPrelude(content);
      expect(prelude).toContain("Implementation requires a selected Delivery");
      expect(prelude).toContain("DeliveryKey/generation");
      expect(prelude).toContain("validated planning_root");
      expect(prelude).toContain("Missing/stale selection is an error");
      expect(prelude).toContain("never root-artifact fallback");
      expect(prelude).toContain("<task-path>/implement.jsonl");
      expect(prelude).not.toContain("No selected Delivery is required");
      expect(prelude).toContain("retained legacy Task");
    },
  );

  it.each(["implement", "check"] as const)(
    "shared TOML prelude insertion preserves the %s context boundary",
    (role) => {
      const content = collectPlatformTemplates("codex")?.get(
        `.codex/agents/trellis-${role}.toml`,
      );
      if (!content) throw new Error("Missing generated Codex agent");
      // Codex currently uses its own marker-gated fallback. Exercise the
      // exported shared TOML insertion path without claiming collector use.
      const prelude = pullPrelude(injectPullBasedPreludeToml(content, role));
      expect(prelude).toContain(
        role === "check"
          ? "No selected Delivery is required"
          : "Implementation requires a selected Delivery",
      );
      expect(prelude).toContain(`<task-path>/${role}.jsonl`);
    },
  );

  it("actual Codex marker-gated fallback keeps quality separate from formal dispatch", () => {
    const checker = collectPlatformTemplates("codex")?.get(
      ".codex/agents/trellis-check.toml",
    );
    const implementer = collectPlatformTemplates("codex")?.get(
      ".codex/agents/trellis-implement.toml",
    );
    if (!checker || !implementer) throw new Error("Missing Codex agents");
    expect(checker).not.toContain("Required: Load Trellis Context First");
    expect(checker).toContain("including noDelivery");
    expect(checker).toContain("Root design/implement or manifests");
    expect(checker).toContain("binding/runtime errors fail closed");
    expect(checker).toContain("Only an explicit dispatch");
    expect(checker.indexOf("For schema-2 `quality`")).toBeLessThan(
      checker.indexOf("Trellis Context Loading Protocol:"),
    );
    expect(implementer).toContain(
      "missing/stale Delivery selection stops implementation",
    );
  });
});

function snapshot(root: string): Map<string, string> {
  const files = new Map<string, string>();
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
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

describe("actual checker carrier quality vs formal Delivery context", () => {
  let root: string;
  let env: NodeJS.ProcessEnv;
  let delivery: string;
  beforeEach(() => {
    vi.stubEnv("TRELLIS_CONTEXT_ID", "");
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-check-profiles-")),
    );
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
    fs.cpSync(
      path.join(templates, "trellis/scripts"),
      path.join(root, ".trellis/scripts"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(root, ".trellis/config.yaml"),
      "task_auto_commit: false\n",
    );
    delivery = seedDeliveryContext(root, "quality-task", "quality-task");
    const task = path.join(root, ".trellis/tasks/quality-task");
    fs.writeFileSync(path.join(task, "prd.md"), "WHOLE TASK ACCEPTED SCOPE");
    fs.writeFileSync(path.join(task, "design.md"), "FORBIDDEN ROOT DESIGN");
    fs.writeFileSync(
      path.join(task, "implement.md"),
      "FORBIDDEN ROOT IMPLEMENTATION",
    );
    fs.writeFileSync(
      path.join(task, "check.jsonl"),
      JSON.stringify({ file: ".trellis/tasks/quality-task/design.md" }) + "\n",
    );
    for (const host of hosts) binding(host, null);
    for (const host of ["claude", "codex"]) {
      const target = path.join(
        root,
        `.${host}/hooks/inject-subagent-context.py`,
      );
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(
        path.join(templates, "shared-hooks/inject-subagent-context.py"),
        target,
      );
    }
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function binding(host: Host, selected: string | null, generation = 0): void {
    const target = path.join(
      root,
      `.trellis/.runtime/sessions/${host}_quality-session.json`,
    );
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      JSON.stringify({
        schema_version: 3,
        task_id: "quality-task",
        lifecycle_generation: generation,
        delivery_id: selected,
      }),
    );
  }
  async function invoke(
    host: Host,
    profile?: string,
    agent = "check",
    session = "quality-session",
    prompt?: string,
  ): Promise<string> {
    const original =
      prompt ??
      `${profile ? "Profile: " + profile + "\n" : ""}Verify whole Task evidence and the explicit changed-code scope.`;
    if (host === "opencode") {
      const hooks = await injectPlugin({ directory: root });
      const output = {
        args: {
          subagent_type: `trellis-${agent}`,
          prompt: original,
          ...(profile ? { profile } : {}),
        },
      };
      await hooks["tool.execute.before"](
        { tool: "task", sessionID: session },
        output,
      );
      return output.args.prompt;
    }
    const payload =
      host === "codex"
        ? {
            cwd: root,
            hook_event_name: "SubagentStart",
            session_id: session,
            agent_type: `trellis-${agent}`,
            ...(profile ? { profile } : {}),
          }
        : {
            cwd: root,
            tool_name: "Task",
            session_id: session,
            tool_input: {
              subagent_type: `trellis-${agent}`,
              prompt: original,
              ...(profile ? { profile } : {}),
            },
          };
    return execFileSync(
      python,
      [path.join(root, `.${host}/hooks/inject-subagent-context.py`)],
      { cwd: root, env, encoding: "utf8", input: JSON.stringify(payload) },
    );
  }

  it.each(hosts)(
    "%s allows default quality with verified Task scope and no Delivery, without writes",
    async (host) => {
      const before = snapshot(root);
      const output = await invoke(host);
      expect(output).toContain("task_scope_only");
      expect(output).toContain("WHOLE TASK ACCEPTED SCOPE");
      expect(output).toContain("quality-task");
      expect(output).toContain("No formal Delivery context was loaded");
      expect(output).not.toContain("FORBIDDEN ROOT DESIGN");
      expect(output).not.toContain("FORBIDDEN ROOT IMPLEMENTATION");
      expect(output).not.toContain("SELECTED DELIVERY PRD");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(hosts)(
    "%s accepts explicit quality without formal lifecycle context",
    async (host) => {
      const before = snapshot(root);
      const output = await invoke(host, "quality");
      expect(output).toContain("task_scope_only");
      expect(output).toContain("WHOLE TASK ACCEPTED SCOPE");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(
    hosts.flatMap((host) =>
      ["delivery_check", "delivery_review"].map((profile) => ({
        host,
        profile,
      })),
    ),
  )(
    "$host rejects missing selection for actual $profile dispatch",
    async ({ host, profile }) => {
      const before = snapshot(root);
      const output = await invoke(host, profile);
      expect(output).toMatch(/delivery_selection_required|no_current_delivery/);
      expect(output).not.toContain("WHOLE TASK ACCEPTED SCOPE");
      expect(output).not.toContain("task_scope_only");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(hosts)(
    "%s never grants implementation Task-scope fallback",
    async (host) => {
      const before = snapshot(root);
      const output = await invoke(host, undefined, "implement");
      expect(output).toMatch(/delivery_selection_required|no_current_delivery/);
      expect(output).not.toContain("WHOLE TASK ACCEPTED SCOPE");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(hosts)(
    "%s fails stale exact identity without downgrading to quality",
    async (host) => {
      binding(host, null, 1);
      const before = snapshot(root);
      const output = await invoke(host);
      expect(output).toContain("stale_lifecycle_generation");
      expect(output).not.toContain("WHOLE TASK ACCEPTED SCOPE");
      expect(output).not.toContain("task_scope_only");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(hosts)(
    "%s does not borrow Task scope from another session",
    async (host) => {
      const before = snapshot(root);
      const output = await invoke(host, undefined, "check", "unknown-session");
      expect(output).not.toContain("WHOLE TASK ACCEPTED SCOPE");
      expect(output).not.toContain("task_scope_only");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(
    hosts.flatMap((host) =>
      ["binding", "runtime"].map((kind) => ({ host, kind })),
    ),
  )(
    "$host does not downgrade $kind errors to Task-scope quality",
    async ({ host, kind }) => {
      if (kind === "binding") {
        fs.writeFileSync(
          path.join(
            root,
            `.trellis/.runtime/sessions/${host}_quality-session.json`,
          ),
          "{broken binding",
        );
      } else {
        const workflow = path.join(root, ".trellis/workflow.md");
        fs.writeFileSync(
          workflow,
          fs
            .readFileSync(workflow, "utf8")
            .replace("[/trellis-runtime-contract]", ""),
        );
      }
      const before = snapshot(root);
      const output = await invoke(host);
      expect(output).toMatch(/error|invalid|malformed/i);
      expect(output).not.toContain("task_scope_only");
      expect(output).not.toContain("WHOLE TASK ACCEPTED SCOPE");
      expect(output).not.toContain("SELECTED DELIVERY PRD");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(hosts)(
    "%s supplies selected formal review context with no self-fix instruction",
    async (host) => {
      binding(host, delivery);
      const before = snapshot(root);
      const output = await invoke(host, "delivery_review");
      expect(output).toContain("SELECTED DELIVERY PRD");
      expect(output).toContain("read-only");
      expect(output).not.toContain("Fix issues yourself");
      expect(output).not.toContain("FORBIDDEN ROOT DESIGN");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it("does not interpret an incidental profile mention as a formal dispatch", async () => {
    for (const host of ["claude", "opencode"] as const) {
      const before = snapshot(root);
      const output = await invoke(
        host,
        undefined,
        "check",
        "quality-session",
        "Explain why Profile: delivery_review requires a selected Delivery, then check Task evidence.",
      );
      expect(output).toContain("task_scope_only");
      expect(snapshot(root)).toEqual(before);
    }
  });

  it.each(hosts)(
    "%s leaves external Task authority verification to the owner",
    async (host) => {
      const file = path.join(root, ".trellis/tasks/quality-task/task.json");
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      record.accepted_scope = {
        locator: "https://example.invalid/accepted-scope",
        revision: "owner-retained-revision",
      };
      fs.writeFileSync(file, JSON.stringify(record));
      const before = snapshot(root);
      const output = await invoke(host);
      expect(output).toContain("example.invalid/accepted-scope");
      expect(output).toContain("task_scope_only");
      expect(output).not.toContain("WHOLE TASK ACCEPTED SCOPE");
      expect(snapshot(root)).toEqual(before);
    },
  );
});
