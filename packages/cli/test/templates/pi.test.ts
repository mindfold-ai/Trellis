import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import {
  getAllAgents,
  getExtensionTemplate,
  getSettingsTemplate,
} from "../../src/templates/pi/index.js";

interface AgentConfig {
  model?: string;
  thinking?: string;
  fallbackModels: string[];
}

interface PiExtensionInternals {
  parseAgentConfig: (content: string) => AgentConfig;
  buildPiModelArgs: (config: { model?: string; thinking?: string }) => string[];
  resolveSubagentRunConfig: (
    input: { model?: string; thinking?: string },
    agentConfig: AgentConfig,
  ) => { model?: string; thinking?: string };
  extractFinalAssistantText: (output: string) => string | null;
}

function loadExtensionInternals(): PiExtensionInternals {
  const source = `${getExtensionTemplate()}

export {
  parseAgentConfig,
  buildPiModelArgs,
  resolveSubagentRunConfig,
  extractFinalAssistantText,
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
  const sandbox = vm.createContext({
    Buffer,
    console,
    exports: moduleObject.exports,
    module: moduleObject,
    process,
    require,
  });
  vm.runInContext(compiled, sandbox);
  return moduleObject.exports as unknown as PiExtensionInternals;
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

  it("settings keep Pi-owned skills until shared Agent Skills are platform-neutral", () => {
    const settings = JSON.parse(getSettingsTemplate().content) as {
      enableSkillCommands?: boolean;
      extensions?: string[];
      skills?: string[];
      prompts?: string[];
    };

    expect(settings.enableSkillCommands).toBe(true);
    expect(settings.extensions).toEqual(["./extensions/trellis/index.ts"]);
    expect(settings.skills).toEqual(["./skills"]);
    expect(settings.skills).not.toEqual(["../.agents/skills"]);
    expect(settings.prompts).toEqual(["./prompts"]);
  });

  it("extension exposes subagent tool and hook-equivalent Pi events", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain('name: "subagent"');
    expect(extension).not.toContain(
      '["--mode", "json", "-p", "--no-session", toPiPromptArgument(prompt)]',
    );
    expect(extension).toContain("sessionManager?:");
    expect(extension).toContain("getSessionId?: () => string");
    expect(extension).toContain('pi.on?.("session_start"');
    expect(extension).toContain('pi.on?.("input"');
    expect(extension).toContain('pi.on?.("before_agent_start"');
    expect(extension).toContain('pi.on?.("context"');
    expect(extension).toContain('pi.on?.("tool_call"');
    expect(extension).not.toContain("inject-subagent-context.py");
  });

  it("extension resolves active task from session runtime only", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain('".runtime", "sessions"');
    expect(extension).toContain("function resolveContextKey");
    expect(extension).toContain("ctx?.sessionManager?.getSessionId");
    expect(extension).toContain("process.env.PI_SESSIONID");
    expect(extension).toContain("function adoptExistingContextKey");
    expect(extension).toContain("function activeRuntimeContextKeys");
    expect(extension).toContain('key.startsWith("pi_process_")');
    expect(extension).not.toContain(".current-task");
    expect(extension).not.toContain("global fallback");
  });

  it("extension injects Trellis context into Pi bash tool calls", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain("function injectTrellisContextIntoBash");
    expect(extension).toContain('toolCall.toolName !== "bash"');
    expect(extension).toContain(
      "toolCall.input.command = `export TRELLIS_CONTEXT_ID=",
    );
    expect(extension).toContain("function commandStartsWithTrellisContext");
    expect(extension).toContain("function shellQuote");
    expect(extension).toContain(
      "injectTrellisContextIntoBash(event, contextKey)",
    );
  });

  it("extension resolves Windows npm-shim Pi installs through the CLI JS entrypoint", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain("function resolvePiInvocation");
    expect(extension).toContain("TRELLIS_PI_CLI_JS");
    expect(extension).toContain("TRELLIS_PI_CLI_JS points to a missing file");
    expect(extension).toContain("process.execPath");
    expect(extension).toContain("PI_CLI_JS_SEGMENTS");
    expect(extension).toContain("process.env.APPDATA");
    expect(extension).toContain("process.env.npm_config_prefix");
    expect(extension).toContain("pathValue.split(delimiter)");
    expect(extension).toContain('return { command: "pi", argsPrefix: [] }');
  });

  it("extension forwards Trellis context into spawned Pi subagents", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain(
      "runSubagent(projectRoot, input, contextKey, _signal)",
    );
    expect(extension).toContain("buildSubagentPrompt(");
    expect(extension).toContain("runConfig");
    expect(extension).toContain(
      "{ ...process.env, TRELLIS_CONTEXT_ID: contextKey }",
    );
    expect(extension).toContain("signal?: AbortSignal");
    expect(extension).toContain("child.kill()");
    expect(extension).toContain('new Error("pi subagent cancelled")');
  });

  it("extension sends subagent prompts through stdin with bounded output buffers", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain('"--mode",\n        "text"');
    expect(extension).toContain('stdio: ["pipe", "pipe", "pipe"]');
    expect(extension).toContain("child.stdin?.end(prompt)");
    expect(extension).toContain("class BoundedBufferCollector");
    expect(extension).toContain("MAX_SUBAGENT_STDOUT_BYTES");
    expect(extension).toContain("MAX_SUBAGENT_STDERR_BYTES");
    expect(extension).not.toContain("toPiPromptArgument");
  });

  it("extension builds subagent prompts from Trellis agent context", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain("function stripMarkdownFrontmatter");
    expect(extension).toContain("content: stripMarkdownFrontmatter(raw)");
    expect(extension).toContain("parseAgentConfig(raw)");
    expect(extension).toContain('"## Trellis Agent Definition"');
  });

  it("extension parses agent frontmatter and per-call model/thinking overrides", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain("type ThinkingLevel");
    expect(extension).toContain("interface AgentConfig");
    expect(extension).toContain("fallbackModels: string[]");
    expect(extension).toContain("function parseAgentConfig");
    expect(extension).toContain('key === "model"');
    expect(extension).toContain('key === "thinking"');
    expect(extension).toContain('key === "fallbackModels"');
    expect(extension).toContain("function resolveSubagentRunConfig");
    expect(extension).toContain(
      "model: stringValue(input.model) ?? agentConfig.model",
    );
    expect(extension).toContain(
      "thinking: normalizeThinking(input.thinking) ?? agentConfig.thinking",
    );
  });

  it("extension maps model/thinking config onto Pi CLI args", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain("function buildPiModelArgs");
    expect(extension).toContain("THINKING_SUFFIX_RE");
    expect(extension).toContain("modelHasThinkingSuffix(model)");
    expect(extension).toContain('"--model"');
    expect(extension).toContain("`${model}:${thinking}`");
    expect(extension).toContain(
      'return thinking ? ["--thinking", thinking] : []',
    );
    expect(extension).toContain("...modelArgs");
  });

  it("extension model/thinking helpers behave correctly", () => {
    const internals = loadExtensionInternals();
    const agentConfig = internals.parseAgentConfig(`---
name: reviewer
model: anthropic/claude-sonnet-4
thinking: high
fallbackModels:
  - openai/gpt-5-mini
  - "google/gemini-2.5-pro"
---
# Reviewer
`);

    expect(agentConfig).toEqual({
      model: "anthropic/claude-sonnet-4",
      thinking: "high",
      fallbackModels: ["openai/gpt-5-mini", "google/gemini-2.5-pro"],
    });
    expect(internals.buildPiModelArgs(agentConfig)).toEqual([
      "--model",
      "anthropic/claude-sonnet-4:high",
    ]);
    expect(
      internals.buildPiModelArgs({
        model: "anthropic/claude-sonnet-4:low",
        thinking: "high",
      }),
    ).toEqual(["--model", "anthropic/claude-sonnet-4:low"]);
    expect(internals.buildPiModelArgs({ thinking: "minimal" })).toEqual([
      "--thinking",
      "minimal",
    ]);
    expect(
      internals.resolveSubagentRunConfig(
        { model: "openai/gpt-5", thinking: "xhigh" },
        agentConfig,
      ),
    ).toEqual({ model: "openai/gpt-5", thinking: "xhigh" });
  });

  it("subagent tool schema accepts model and thinking overrides", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain(
      "Optional Pi model override for the child sub-agent process.",
    );
    expect(extension).toContain(
      "Optional Pi thinking level override for the child sub-agent process.",
    );
    expect(extension).toContain(
      'enum: ["off", "minimal", "low", "medium", "high", "xhigh"]',
    );
  });

  it("extension preserves final assistant text extraction for structured Pi output", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain("function extractFinalAssistantText");
    expect(extension).toContain("function extractTextContent");
    expect(extension).toContain(
      "return extractFinalAssistantText(stdout) ?? (stdout || stderr)",
    );
    expect(extension).toContain('message?.role !== "assistant"');
    expect(extension).toContain(
      "Pi can print non-JSON diagnostics around structured output",
    );
  });

  it("extension extracts the last assistant text from diagnostic-wrapped structured output", () => {
    const internals = loadExtensionInternals();
    const output = [
      "Warning: diagnostic before JSON",
      JSON.stringify({
        message: {
          role: "assistant",
          content: [{ type: "text", text: "first" }],
        },
      }),
      JSON.stringify({
        message: {
          role: "user",
          content: [{ type: "text", text: "ignored" }],
        },
      }),
      JSON.stringify({
        message: {
          role: "assistant",
          content: [{ type: "text", text: "final" }],
        },
      }),
    ].join("\n");

    expect(internals.extractFinalAssistantText(output)).toBe("final");
  });

  it("extension uses Pi runtime-safe event and tool result shapes", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain("Promise<PiToolResult>");
    expect(extension).toContain('content: [{ type: "text", text: output }]');
    expect(extension).toContain("details: {\n          agent: input.agent");
    expect(extension).toContain("ctx?.ui?.notify?.(");
    expect(extension).toContain("systemPrompt:");
    expect(extension).toContain('pi.on?.("input", (event, ctx) => {');
    expect(extension).toContain('return { action: "continue" };');
    expect(extension).not.toContain("message: buildTrellisContext");
    expect(extension).not.toContain('message:\n      "Trellis project context');
    expect(extension).not.toContain("persistent: true");
  });
});
