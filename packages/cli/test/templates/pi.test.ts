import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { collectPiTemplates } from "../../src/configurators/pi.js";
import {
  getAllAgents,
  getExtensionTemplate,
  getSettingsTemplate,
} from "../../src/templates/pi/index.js";

interface AgentConfig {
  model?: string;
  thinking?: string;
  tools?: string[];
  fallbackModels: string[];
}

interface PiRunConfig {
  model?: string;
  thinking?: string;
  tools?: string[];
}

interface ContextInjectionLimits {
  max_file_bytes: number;
  max_artifact_bytes: number;
  max_total_bytes: number;
}

interface PiExtensionInternals {
  normalizeAgent: (agent: string | undefined) => string;
  isTrellisAgent: (root: string, agent: string) => boolean;
  parseAgentFM: (content: string) => AgentConfig;
  buildPiArgs: (config: PiRunConfig) => string[];
  resolveRunCfg: (
    input: { model?: string; thinking?: string },
    agentCfg: AgentConfig,
    inheritedThinking?: string,
  ) => PiRunConfig;
  cmdHasTrellisCtx: (cmd: string) => boolean;
  shellQuote: (v: string) => string;
  trellisExtension: (pi: {
    registerTool?: (tool: unknown) => void;
    registerShortcut?: (key: string, opts: unknown) => void;
    on?: (event: string, handler: (event: unknown, ctx?: unknown) => unknown) => void;
  }) => void;
  truncateUtf8: (buf: Buffer, cap: number) => Buffer;
  readContextInjectionLimits: (repoRoot: string) => ContextInjectionLimits;
  buildContextForTest: (
    root: string,
    agent: string,
    key: string | null,
  ) => string;
}

function loadExtensionInternals(cwd = process.cwd()): PiExtensionInternals {
  const source = `${getExtensionTemplate()}

export {
  normalizeAgent,
  isTrellisAgent,
  parseAgentFM,
  buildPiArgs,
  resolveRunCfg,
  cmdHasTrellisCtx,
  shellQuote,
  trellisExtension,
  truncateUtf8,
  readContextInjectionLimits,
  buildContext as buildContextForTest,
};
`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = createRequire(import.meta.url);
  const moduleObject: { exports: Record<string, unknown> } = { exports: {} };
  const sandboxProcess = Object.create(process) as NodeJS.Process;
  const sandboxEnv = { ...process.env };
  delete sandboxEnv.TRELLIS_SUBAGENT_CHILD;
  Object.defineProperty(sandboxProcess, "cwd", { value: () => cwd });
  Object.defineProperty(sandboxProcess, "env", { value: sandboxEnv });
  const sandbox = vm.createContext({
    Buffer,
    console,
    exports: moduleObject.exports,
    module: moduleObject,
    process: sandboxProcess,
    require,
  });
  vm.runInContext(compiled, sandbox);
  return moduleObject.exports as unknown as PiExtensionInternals;
}

function createMinimalTrellisRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "trellis-pi-355-"));
  mkdirSync(join(root, ".pi"), { recursive: true });
  mkdirSync(join(root, ".trellis", "scripts"), { recursive: true });
  writeFileSync(
    join(root, ".trellis", "workflow.md"),
    [
      "[workflow-state:no_task]",
      "No active task. First classify the current turn and ask for task-creation consent before creating any Trellis task.",
      "[/workflow-state:no_task]",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, ".trellis", "scripts", "get_context.py"),
    [
      "#!/usr/bin/env python3",
      "import sys",
      "if '--mode' in sys.argv and 'phase' in sys.argv:",
      "    print('## Phase Index\\nPhase 1: Plan')",
      "else:",
      "    print('SESSION CONTEXT\\nCurrent task: none.')",
      "",
    ].join("\n"),
  );
  return root;
}

describe("pi templates", () => {
  it("provides the three Trellis sub-agent definitions", () => {
    const agents = getAllAgents();
    expect(agents.map((agent) => agent.name).sort()).toEqual([
      "trellis-check",
      "trellis-implement",
      "trellis-research",
    ]);

    for (const agent of agents) {
      expect(agent.content).toContain(`name: ${agent.name}`);
      expect(agent.content).not.toContain("inject-subagent-context.py");
    }
  });

  it("settings no longer list a private skills root — Pi discovers shared .agents/skills/ natively (#447)", () => {
    const settings = JSON.parse(getSettingsTemplate().content) as {
      enableSkillCommands?: boolean;
      extensions?: string[];
      skills?: string[];
      prompts?: string[];
      packages?: unknown[];
    };

    expect(settings.enableSkillCommands).toBe(true);
    expect(settings.extensions).toEqual(["./extensions/trellis/index.ts"]);
    expect(settings.skills).toBeUndefined();
    expect(settings.prompts).toEqual(["./prompts"]);
    expect(settings.packages).toBeUndefined();
  });

  it("writes shared skills to .agents/skills/, not a private .pi/skills/ root (#447)", () => {
    const templates = collectPiTemplates();

    expect(
      templates.get(".agents/skills/trellis-check/SKILL.md"),
    ).toBeDefined();
    for (const key of templates.keys()) {
      expect(key.startsWith(".pi/skills/")).toBe(false);
    }
  });

  it("collects a manual trellis-start prompt for Pi fallback bootstrap", () => {
    const templates = collectPiTemplates();

    expect(templates.get(".pi/prompts/trellis-start.md")).toContain(
      "# Start Session",
    );
    expect(templates.get(".pi/prompts/trellis-continue.md")).toContain(
      "get_context.py --mode phase",
    );
    expect(templates.get(".pi/prompts/trellis-finish-work.md")).toContain(
      "finish-work",
    );
  });

  it("extension registers the trellis_subagent tool with mode+thinking schema", () => {
    const extension = getExtensionTemplate();

    // Tool name + label avoid collision with community subagent packages.
    expect(extension).toContain('name: "trellis_subagent"');
    expect(extension).toContain('label: "Trellis Subagent"');

    // Schema must declare the three dispatch modes and the thinking enum so the LLM
    // can pick a valid mode and override thinking per call.
    expect(extension).toContain(
      'enum: ["single", "parallel", "chain"]',
    );
    expect(extension).toContain(
      'enum: ["off", "minimal", "low", "medium", "high", "xhigh"]',
    );

    // Dispatch protocol carries the "Active task: <path>" prefix rule.
    expect(extension).toContain("Active task:");
  });

  it("extension wires the Pi events Trellis needs for context flow", () => {
    const extension = getExtensionTemplate();

    // session_start: notify-only welcome
    expect(extension).toContain('pi.on?.("session_start"');
    // input: not used; Trellis must not rewrite submitted user text
    expect(extension).not.toContain('pi.on?.("input"');
    // before_agent_start: preserves system prompt context and persists hidden runtime context
    expect(extension).toContain('pi.on?.("before_agent_start"');
    // context: preserves the existing context-key establishment behavior only
    expect(extension).toContain('pi.on?.("context"');
    // tool_call: inject TRELLIS_CONTEXT_ID into bash commands
    expect(extension).toContain('pi.on?.("tool_call"');
    // tool_result: mark failed/cancelled subagent runs as errors
    expect(extension).toContain('pi.on?.("tool_result"');
  });

  it("keeps user input clean while persisting hidden runtime context", () => {
    const root = createMinimalTrellisRoot();
    const { trellisExtension } = loadExtensionInternals(root);
    const handlers = new Map<
      string,
      (event: unknown, ctx?: unknown) => unknown
    >();

    trellisExtension({
      registerTool: vi.fn(),
      registerShortcut: vi.fn(),
      on(event, handler) {
        handlers.set(event, handler);
      },
    });

    const ctx = {
      sessionManager: { getSessionId: () => "pi-unit-355" },
      ui: { notify: vi.fn() },
    };

    expect(handlers.has("input")).toBe(false);

    const beforeAgentStart = handlers.get("before_agent_start");
    const first = beforeAgentStart?.(
      {
        type: "before_agent_start",
        prompt: "Adjust service routing",
        systemPrompt: "BASE",
        systemPromptOptions: {},
      },
      ctx,
    ) as {
      systemPrompt?: string;
      message: { customType?: string; content?: string; display?: boolean };
    };

    expect(first.systemPrompt).toContain("BASE");
    expect(first.systemPrompt).toContain(
      "Trellis compact SessionStart context",
    );
    expect(first.systemPrompt).toContain("<first-reply-notice>");
    expect(first.systemPrompt).toContain("the user's current request");
    expect(first.systemPrompt).toContain(
      "the user message that triggered this reply",
    );
    expect(first.systemPrompt).toContain("has no clear natural language");
    expect(first.systemPrompt).toContain(
      "explicitly established project communication language",
    );
    expect(first.systemPrompt).toContain("Trellis SessionStart ✓");
    expect(first.systemPrompt).toContain(
      "Continue directly with the user's request",
    );
    expect(first.systemPrompt).toContain(
      "must not alter the language used for the remainder of the response",
    );
    expect(first.systemPrompt).toContain("This notice is one-shot");
    expect(first.systemPrompt).not.toContain("say once in Chinese");
    expect(first.systemPrompt).not.toContain(
      "exactly one short Chinese sentence",
    );
    expect(first.systemPrompt).not.toContain(
      "Trellis SessionStart 已注入：workflow、当前任务状态、开发者身份、git 状态、active tasks、spec 索引已加载。",
    );
    expect(first.systemPrompt).toContain("<trellis-workflow>");
    expect(first.systemPrompt).toContain("Phase 1: Plan");
    expect(first.systemPrompt).toContain("No active Trellis task found");
    expect(first.systemPrompt).not.toContain("<workflow-state>");
    // The system prompt carries startup's session-overview snapshot.
    expect(first.systemPrompt).toContain("<session-overview>");
    expect(first.message).toEqual(
      expect.objectContaining({
        customType: "trellis-runtime-context",
        display: false,
      }),
    );
    expect("role" in first.message).toBe(false);
    expect("timestamp" in first.message).toBe(false);
    expect(first.message.content).not.toContain("BASE");
    expect(first.message.content).not.toContain(
      "Trellis compact SessionStart context",
    );
    expect(first.message.content).toContain("<workflow-state>");
    expect(first.message.content).toContain("Status: no_task");
    expect(first.message.content).toContain("<session-overview>");

    const second = beforeAgentStart?.(
      {
        type: "before_agent_start",
        prompt: "Continue",
        systemPrompt: "BASE",
        systemPromptOptions: {},
      },
      ctx,
    ) as {
      systemPrompt?: string;
      message?: { customType?: string; content?: string; display?: boolean };
    };

    // Provider prefix caches invalidate from byte 0 on any systemPrompt
    // change, so later turns must return the exact same bytes as turn one.
    expect(second.systemPrompt).toBe(first.systemPrompt);
    // Unchanged runtime context is not re-sent: the persisted message from
    // turn one is already in the session history.
    expect(second.message).toBeUndefined();
    expect(handlers.has("context")).toBe(true);
  });

  it("delivers task context changes as persisted messages, not systemPrompt churn", () => {
    const root = createMinimalTrellisRoot();
    const { trellisExtension } = loadExtensionInternals(root);
    const handlers = new Map<
      string,
      (event: unknown, ctx?: unknown) => unknown
    >();

    trellisExtension({
      registerTool: vi.fn(),
      registerShortcut: vi.fn(),
      on(event, handler) {
        handlers.set(event, handler);
      },
    });

    const ctx = {
      sessionManager: { getSessionId: () => "pi-unit-task-update" },
      ui: { notify: vi.fn() },
    };
    const beforeAgentStart = handlers.get("before_agent_start");
    const fire = () =>
      beforeAgentStart?.(
        {
          type: "before_agent_start",
          prompt: "Continue",
          systemPrompt: "BASE",
          systemPromptOptions: {},
        },
        ctx,
      ) as {
        systemPrompt?: string;
        message?: { customType?: string; content?: string; display?: boolean };
      };

    const first = fire();
    expect(first.systemPrompt).toContain("No active Trellis task found");

    // A task is created and activated mid-session.
    const taskDir = join(root, ".trellis", "tasks", "07-07-cache-fix");
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "prd.md"), "# PRD\nStable prefix matters.");
    writeFileSync(
      join(taskDir, "task.json"),
      JSON.stringify({ id: "07-07-cache-fix", status: "in_progress" }),
    );
    mkdirSync(join(root, ".trellis", ".runtime", "sessions"), {
      recursive: true,
    });
    writeFileSync(
      join(root, ".trellis", ".runtime", "sessions", "pi_pi-unit-task-update.json"),
      JSON.stringify({ current_task: "tasks/07-07-cache-fix" }),
    );

    const second = fire();
    // systemPrompt keeps the turn-one snapshot byte-for-byte...
    expect(second.systemPrompt).toBe(first.systemPrompt);
    // ...and the new task context arrives as a persisted hidden message.
    expect(second.message?.customType).toBe("trellis-runtime-context");
    expect(second.message?.content).toContain("<trellis-task-context-update>");
    expect(second.message?.content).toContain("Stable prefix matters.");

    // No further changes -> nothing new to persist.
    const third = fire();
    expect(third.systemPrompt).toBe(first.systemPrompt);
    expect(third.message).toBeUndefined();
  });

  it("extension bash tool_call handler prefixes TRELLIS_CONTEXT_ID", () => {
    const extension = getExtensionTemplate();

    // Bash tool calls get TRELLIS_CONTEXT_ID exported in front so spawned
    // python scripts (e.g. task.py current) inherit session identity.
    expect(extension).toContain('ev.toolName === "bash"');
    expect(extension).toContain("export TRELLIS_CONTEXT_ID=");
    expect(extension).toContain("cmdHasTrellisCtx");
  });

  it("extension tool_result handler marks failed/cancelled subagent runs as errors", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain('ev.toolName === "trellis_subagent"');
    expect(extension).toContain('r.status === "failed"');
    expect(extension).toContain('r.status === "cancelled"');
    expect(extension).toContain("isError: true");
  });

  it("normalizeAgent prefixes bare names with trellis- and leaves prefixed names alone", () => {
    const { normalizeAgent } = loadExtensionInternals();

    expect(normalizeAgent("implement")).toBe("trellis-implement");
    expect(normalizeAgent("check")).toBe("trellis-check");
    expect(normalizeAgent("trellis-research")).toBe("trellis-research");
    expect(normalizeAgent(undefined)).toBe("trellis-implement");
    expect(normalizeAgent("trellis-custom")).toBe("trellis-custom");
  });

  it("isTrellisAgent gates on a real .pi/agents/*.md definition file", () => {
    const { isTrellisAgent } = loadExtensionInternals();

    const root = mkdtempSync(join(tmpdir(), "trellis-pi-test-"));
    mkdirSync(join(root, ".pi", "agents"), { recursive: true });
    writeFileSync(
      join(root, ".pi", "agents", "trellis-implement.md"),
      "---\nname: trellis-implement\n---\n",
    );

    expect(isTrellisAgent(root, "trellis-implement")).toBe(true);
    expect(isTrellisAgent(root, "trellis-foo")).toBe(false);
    expect(existsSync(root)).toBe(true);
  });

  it("parseAgentFM reads model/thinking/fallbackModels/tools from agent frontmatter", () => {
    const { parseAgentFM } = loadExtensionInternals();

    // Mixed-case tool names in frontmatter must be normalized to lowercase:
    // Pi's built-in tools are lowercase (read, bash, edit, write, grep, find, ls)
    // and pi applies the allowlist without case normalization, so uppercase names
    // would silently fail to enable any tool.
    const cfg = parseAgentFM(`---
name: reviewer
model: anthropic/claude-sonnet-4
thinking: high
tools: Read, Write, Bash, find, Grep
fallbackModels:
  - openai/gpt-5-mini
  - "google/gemini-2.5-pro"
---
# Reviewer
`);

    expect(cfg).toEqual({
      model: "anthropic/claude-sonnet-4",
      thinking: "high",
      tools: ["read", "write", "bash", "find", "grep"],
      fallbackModels: ["openai/gpt-5-mini", "google/gemini-2.5-pro"],
    });
    // Belt-and-suspenders: no tool name survives with uppercase letters.
    expect(cfg.tools?.every((t) => t === t.toLowerCase())).toBe(true);
  });

  it("buildPiArgs maps PiRunConfig onto Pi CLI args", () => {
    const { buildPiArgs } = loadExtensionInternals();

    // model + thinking → composes "model:thinking" suffix when not already present
    expect(buildPiArgs({ model: "anthropic/claude-sonnet-4", thinking: "high" })).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--model",
      "anthropic/claude-sonnet-4:high",
    ]);

    // model already has thinking suffix → passed through unchanged
    expect(
      buildPiArgs({ model: "anthropic/claude-sonnet-4:low", thinking: "high" }),
    ).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--model",
      "anthropic/claude-sonnet-4:low",
    ]);

    // thinking-only (no model) → standalone --thinking flag
    expect(buildPiArgs({ thinking: "minimal" })).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--thinking",
      "minimal",
    ]);

    // thinking=off is suppressed
    expect(buildPiArgs({ model: "gpt-5", thinking: "off" })).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--model",
      "gpt-5",
    ]);

    // tools → --tools flag
    expect(
      buildPiArgs({ tools: ["Read", "Write", "Bash", "find", "Grep"] }),
    ).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--tools",
      "Read,Write,Bash,find,Grep",
    ]);
  });

  it("resolveRunCfg lets per-call input override agent frontmatter defaults", () => {
    const { resolveRunCfg } = loadExtensionInternals();

    const agentCfg: AgentConfig = {
      model: "anthropic/claude-sonnet-4",
      thinking: "high",
      tools: ["Read", "Write", "Edit", "Bash", "find", "Grep"],
      fallbackModels: [],
    };

    // Per-call model + thinking win over agent config
    expect(
      resolveRunCfg(
        { model: "openai/gpt-5", thinking: "xhigh" },
        agentCfg,
      ),
    ).toEqual({ model: "openai/gpt-5:xhigh", thinking: "xhigh", tools: agentCfg.tools });

    // No overrides → fall back to agent config
    expect(resolveRunCfg({}, agentCfg)).toEqual({
      model: "anthropic/claude-sonnet-4:high",
      thinking: "high",
      tools: agentCfg.tools,
    });

    // Inherited thinking is the last fallback
    expect(
      resolveRunCfg(
        {},
        { model: "gpt-5", fallbackModels: [] },
        "medium",
      ),
    ).toEqual({ model: "gpt-5:medium", thinking: "medium" });
  });

  it("cmdHasTrellisCtx detects already-prefixed bash commands", () => {
    const { cmdHasTrellisCtx } = loadExtensionInternals();

    expect(cmdHasTrellisCtx("export TRELLIS_CONTEXT_ID=foo; ls")).toBe(true);
    expect(cmdHasTrellisCtx("TRELLIS_CONTEXT_ID=foo ls")).toBe(true);
    expect(cmdHasTrellisCtx("env TRELLIS_CONTEXT_ID=foo ls")).toBe(true);
    expect(cmdHasTrellisCtx("ls -la")).toBe(false);
    expect(cmdHasTrellisCtx("")).toBe(false);
  });

  it("shellQuote single-quotes values and escapes embedded single quotes", () => {
    const { shellQuote } = loadExtensionInternals();

    expect(shellQuote("simple")).toBe("'simple'");
    expect(shellQuote("with space")).toBe("'with space'");
    expect(shellQuote("with 'quote'")).toBe("'with '\\''quote'\\'''");
  });

  it("extension forwards TRELLIS_CONTEXT_ID into spawned Pi child env", () => {
    const extension = getExtensionTemplate();

    // The child pi process must inherit TRELLIS_CONTEXT_ID so sub-agent
    // task.py current resolves to the same task.
    expect(extension).toContain("TRELLIS_CONTEXT_ID:");
    expect(extension).toContain("...process.env");
  });

  it("extension validates agent definition before spawning a child pi process", () => {
    const extension = getExtensionTemplate();

    // Non-Trellis agent calls must short-circuit and point users to community
    // subagent packages instead of silently spawning a child pi process with
    // a missing agent definition.
    expect(extension).toContain("isTrellisAgent(root, agentName)");
    expect(extension).toContain("npm:@tintinweb/pi-subagents");
    expect(extension).toContain("npm:pi-subagents");
  });
});

describe("pi extension: context injection limits (issue #441)", () => {
  const SESSION_KEY = "ctxlimit-session";

  function createRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "trellis-pi-ctxlimit-"));
    mkdirSync(join(root, ".pi", "agents"), { recursive: true });
    writeFileSync(
      join(root, ".pi", "agents", "trellis-implement.md"),
      "---\nname: trellis-implement\n---\n# Implement\n",
    );
    return root;
  }

  function activateTask(root: string, taskDirName: string): string {
    const taskDir = join(root, ".trellis", "tasks", taskDirName);
    mkdirSync(taskDir, { recursive: true });
    mkdirSync(join(root, ".trellis", ".runtime", "sessions"), {
      recursive: true,
    });
    writeFileSync(
      join(root, ".trellis", ".runtime", "sessions", `${SESSION_KEY}.json`),
      JSON.stringify({ current_task: `tasks/${taskDirName}` }),
    );
    return taskDir;
  }

  function writeConfig(root: string, yaml: string): void {
    writeFileSync(join(root, ".trellis", "config.yaml"), yaml, "utf-8");
  }

  describe("truncateUtf8", () => {
    it("leaves data untouched when cap is 0 (unlimited)", () => {
      const { truncateUtf8 } = loadExtensionInternals();
      const data = Buffer.from("X".repeat(1000));
      expect(truncateUtf8(data, 0)).toEqual(data);
    });

    it("leaves data untouched when data is at or under the cap", () => {
      const { truncateUtf8 } = loadExtensionInternals();
      const data = Buffer.from("hello world");
      expect(truncateUtf8(data, data.length)).toEqual(data);
      expect(truncateUtf8(data, data.length + 5)).toEqual(data);
    });

    it("truncates ASCII data exactly at the cap (1 byte over cap)", () => {
      const { truncateUtf8 } = loadExtensionInternals();
      const data = Buffer.from("abcdefghij"); // 10 bytes
      expect(truncateUtf8(data, 9)).toEqual(Buffer.from("abcdefghi"));
    });

    it("never splits a 2-byte UTF-8 sequence at the boundary (café)", () => {
      const { truncateUtf8 } = loadExtensionInternals();
      const data = Buffer.from("café", "utf-8");
      for (let cap = 0; cap <= data.length; cap++) {
        const out = truncateUtf8(data, cap);
        expect(() => {
          // Buffer#toString silently replaces invalid sequences with U+FFFD;
          // assert no replacement char appears instead of throwing.
          const decoded = out.toString("utf-8");
          if (decoded.includes("�")) throw new Error("invalid utf-8");
        }).not.toThrow();
      }
      expect(truncateUtf8(data, 4).toString("utf-8")).toBe("caf");
    });

    it("never splits a 3-byte UTF-8 sequence at the boundary (euro sign)", () => {
      const { truncateUtf8 } = loadExtensionInternals();
      const data = Buffer.from("x€", "utf-8"); // x + 3-byte euro sign
      for (let cap = 0; cap <= data.length; cap++) {
        const out = truncateUtf8(data, cap);
        expect(out.toString("utf-8")).not.toContain("�");
      }
    });
  });

  describe("readContextInjectionLimits", () => {
    it("returns built-in defaults when config.yaml has no context_injection section", () => {
      const root = createRoot();
      mkdirSync(join(root, ".trellis"), { recursive: true });
      writeConfig(root, "session_auto_commit: true\n");
      const { readContextInjectionLimits } = loadExtensionInternals();
      expect(readContextInjectionLimits(root)).toEqual({
        max_file_bytes: 32768,
        max_artifact_bytes: 65536,
        max_total_bytes: 131072,
      });
    });

    it("returns built-in defaults when config.yaml is absent", () => {
      const root = createRoot();
      const { readContextInjectionLimits } = loadExtensionInternals();
      expect(readContextInjectionLimits(root)).toEqual({
        max_file_bytes: 32768,
        max_artifact_bytes: 65536,
        max_total_bytes: 131072,
      });
    });

    it("applies explicit overrides for all three keys", () => {
      const root = createRoot();
      mkdirSync(join(root, ".trellis"), { recursive: true });
      writeConfig(
        root,
        [
          "context_injection:",
          "  max_file_bytes: 100",
          "  max_artifact_bytes: 200",
          "  max_total_bytes: 300",
        ].join("\n"),
      );
      const { readContextInjectionLimits } = loadExtensionInternals();
      expect(readContextInjectionLimits(root)).toEqual({
        max_file_bytes: 100,
        max_artifact_bytes: 200,
        max_total_bytes: 300,
      });
    });

    it("0 means unlimited and is preserved as-is (not replaced by default)", () => {
      const root = createRoot();
      mkdirSync(join(root, ".trellis"), { recursive: true });
      writeConfig(
        root,
        ["context_injection:", "  max_total_bytes: 0"].join("\n"),
      );
      const { readContextInjectionLimits } = loadExtensionInternals();
      expect(readContextInjectionLimits(root).max_total_bytes).toBe(0);
    });

    it("falls back to default for a negative value", () => {
      const root = createRoot();
      mkdirSync(join(root, ".trellis"), { recursive: true });
      writeConfig(
        root,
        ["context_injection:", "  max_file_bytes: -5"].join("\n"),
      );
      const { readContextInjectionLimits } = loadExtensionInternals();
      expect(readContextInjectionLimits(root).max_file_bytes).toBe(32768);
    });

    it("falls back to default for a non-integer value", () => {
      const root = createRoot();
      mkdirSync(join(root, ".trellis"), { recursive: true });
      writeConfig(
        root,
        ["context_injection:", "  max_artifact_bytes: not-a-number"].join(
          "\n",
        ),
      );
      const { readContextInjectionLimits } = loadExtensionInternals();
      expect(readContextInjectionLimits(root).max_artifact_bytes).toBe(65536);
    });
  });

  describe("buildContext: per-file and per-artifact caps", () => {
    it("under-cap content is inlined with no truncation/index notices (golden)", () => {
      const root = createRoot();
      const taskDir = activateTask(root, "task-golden");
      writeFileSync(join(root, "small.md"), "small spec content\n", "utf-8");
      writeFileSync(
        join(taskDir, "implement.jsonl"),
        JSON.stringify({ file: "small.md", reason: "r" }) + "\n",
        "utf-8",
      );
      writeFileSync(join(taskDir, "prd.md"), "prd body\n", "utf-8");
      const { buildContextForTest } = loadExtensionInternals();
      const out = buildContextForTest(root, "trellis-implement", SESSION_KEY);
      expect(out).toContain("=== small.md ===\nsmall spec content");
      expect(out).toContain("prd body");
      expect(out).not.toContain("[Trellis: truncated");
      expect(out).not.toContain("[Trellis: not inlined");
    });

    it("keeps binary jsonl references as notices even when limits are unlimited", () => {
      const root = createRoot();
      const taskDir = activateTask(root, "task-binary-reference");
      const binary = Buffer.from([
        0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x41, 0x42,
      ]);
      writeFileSync(join(root, "design.png"), binary);
      writeFileSync(join(root, "invalid.bin"), Buffer.from([0xff, 0xfe, 0xfd]));
      writeFileSync(
        join(taskDir, "implement.jsonl"),
        [
          JSON.stringify({ file: "design.png", reason: "visual baseline" }),
          JSON.stringify({ file: "invalid.bin", reason: "legacy export" }),
        ].join("\n") + "\n",
        "utf-8",
      );
      writeConfig(
        root,
        [
          "context_injection:",
          "  max_file_bytes: 0",
          "  max_total_bytes: 0",
        ].join("\n"),
      );

      const { buildContextForTest } = loadExtensionInternals();
      const out = buildContextForTest(root, "trellis-implement", SESSION_KEY);

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
      const root = createRoot();
      const taskDir = activateTask(root, "task-utf8-not-binary");
      const multiByteContent =
        "emoji: 🎉🚀 cjk: 中文测试 bmp: café naïve\n";
      writeFileSync(join(root, "multibyte.md"), multiByteContent, "utf-8");
      writeFileSync(
        join(taskDir, "implement.jsonl"),
        JSON.stringify({ file: "multibyte.md", reason: "unicode spec" }) +
          "\n",
        "utf-8",
      );
      writeConfig(root, "");

      const { buildContextForTest } = loadExtensionInternals();
      const out = buildContextForTest(root, "trellis-implement", SESSION_KEY);

      expect(out).toContain(`=== multibyte.md ===\n${multiByteContent}`);
      expect(out).not.toContain("[Trellis: not inlined (binary file)");
    });

    it("classifies a file as binary when binary bytes appear only at the end", () => {
      const root = createRoot();
      const taskDir = activateTask(root, "task-text-head-binary-tail");
      const mixed = Buffer.concat([
        Buffer.from("looks like a normal text file up front\n", "utf-8"),
        Buffer.from([0x00, 0xff, 0xfe]),
      ]);
      writeFileSync(join(root, "mixed.dat"), mixed);
      writeFileSync(
        join(taskDir, "implement.jsonl"),
        JSON.stringify({ file: "mixed.dat", reason: "mixed content" }) + "\n",
        "utf-8",
      );
      writeConfig(root, "");

      const { buildContextForTest } = loadExtensionInternals();
      const out = buildContextForTest(root, "trellis-implement", SESSION_KEY);

      expect(out).toContain(
        `[Trellis: not inlined (binary file) — mixed.dat (${mixed.length} bytes): mixed content]`,
      );
      expect(out).not.toContain("=== mixed.dat ===");
    });

    it("truncates an oversized jsonl-referenced file at max_file_bytes with a notice", () => {
      const root = createRoot();
      const taskDir = activateTask(root, "task-oversize");
      writeFileSync(join(root, "big.txt"), "A".repeat(2 * 1024 * 1024), "utf-8");
      writeFileSync(
        join(taskDir, "implement.jsonl"),
        JSON.stringify({ file: "big.txt", reason: "big" }) + "\n",
        "utf-8",
      );
      const { buildContextForTest } = loadExtensionInternals();
      const out = buildContextForTest(root, "trellis-implement", SESSION_KEY);
      expect(Buffer.byteLength(out, "utf-8")).toBeLessThanOrEqual(
        128 * 1024 + 1024,
      );
      expect(out).toContain(
        "[Trellis: truncated at 32768 bytes — read big.txt for the full content]",
      );
    });

    it("degrades to an index line once the total budget is exhausted (3 files)", () => {
      const root = createRoot();
      const taskDir = activateTask(root, "task-total-cap");
      writeFileSync(join(root, "f1.txt"), "1".repeat(50), "utf-8");
      writeFileSync(join(root, "f2.txt"), "2".repeat(50), "utf-8");
      writeFileSync(join(root, "f3.txt"), "3".repeat(50), "utf-8");
      writeFileSync(
        join(taskDir, "implement.jsonl"),
        [
          JSON.stringify({ file: "f1.txt", reason: "first" }),
          JSON.stringify({ file: "f2.txt", reason: "second" }),
          JSON.stringify({ file: "f3.txt", reason: "third" }),
        ].join("\n") + "\n",
        "utf-8",
      );
      mkdirSync(join(root, ".trellis"), { recursive: true });
      writeConfig(
        root,
        [
          "context_injection:",
          "  max_file_bytes: 0",
          "  max_artifact_bytes: 0",
          "  max_total_bytes: 120", // fits f1 fully, degrades f2/f3
        ].join("\n"),
      );
      const { buildContextForTest } = loadExtensionInternals();
      const out = buildContextForTest(root, "trellis-implement", SESSION_KEY);
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
      const root = createRoot();
      const taskDir = activateTask(root, "task-unlimited-total");
      const bigContent = "Z".repeat(5000);
      writeFileSync(join(root, "big.txt"), bigContent, "utf-8");
      writeFileSync(
        join(taskDir, "implement.jsonl"),
        JSON.stringify({ file: "big.txt", reason: "big" }) + "\n",
        "utf-8",
      );
      mkdirSync(join(root, ".trellis"), { recursive: true });
      writeConfig(
        root,
        [
          "context_injection:",
          "  max_file_bytes: 0",
          "  max_total_bytes: 0",
        ].join("\n"),
      );
      const { buildContextForTest } = loadExtensionInternals();
      const out = buildContextForTest(root, "trellis-implement", SESSION_KEY);
      expect(out).toContain("=== big.txt ===\n" + bigContent);
      expect(out).not.toContain("[Trellis: not inlined");
    });

    it("artifacts (prd/design/implement.md) obey max_artifact_bytes independently of max_file_bytes", () => {
      const root = createRoot();
      const taskDir = activateTask(root, "task-artifact-cap");
      writeFileSync(join(taskDir, "prd.md"), "P".repeat(1000), "utf-8");
      mkdirSync(join(root, ".trellis"), { recursive: true });
      writeConfig(
        root,
        [
          "context_injection:",
          "  max_file_bytes: 0",
          "  max_artifact_bytes: 20",
          "  max_total_bytes: 0",
        ].join("\n"),
      );
      const { buildContextForTest } = loadExtensionInternals();
      const out = buildContextForTest(root, "trellis-implement", SESSION_KEY);
      const relTaskDir = "tasks/task-artifact-cap".replace(
        "tasks/",
        ".trellis/tasks/",
      );
      expect(out).toContain("P".repeat(20));
      expect(out).not.toContain("P".repeat(21));
      expect(out).toContain(
        `[Trellis: truncated at 20 bytes — read ${relTaskDir}/prd.md for the full content]`,
      );
    });
  });
});
