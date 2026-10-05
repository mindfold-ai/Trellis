import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { getExtensionTemplate } from "../../src/templates/pi/index.js";

interface ToolInput {
  agent: string;
  prompt?: string;
  prompts?: string[];
  mode?: "single" | "parallel" | "chain";
}

interface ToolResult {
  content: { type: string; text: string }[];
  details: {
    runs: { status: string; finalText: string; errorMessage?: string }[];
  };
}

interface RegisteredTool {
  execute: (
    id: string,
    input: ToolInput,
    signal?: AbortSignal,
    update?: undefined,
    ctx?: { cwd: string },
  ) => Promise<ToolResult>;
}

function loadTool(
  root: string,
  cli: string,
): {
  tool: RegisteredTool;
  patchResult: (result: ToolResult) => { isError?: boolean } | undefined;
} {
  const compiled = ts.transpileModule(getExtensionTemplate(), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleObject: { exports: Record<string, unknown> } = { exports: {} };
  const sandboxProcess = Object.create(process) as NodeJS.Process;
  const env = { ...process.env, TRELLIS_PI_CLI_JS: cli };
  delete env.TRELLIS_SUBAGENT_CHILD;
  Object.defineProperty(sandboxProcess, "cwd", { value: () => root });
  Object.defineProperty(sandboxProcess, "env", { value: env });
  vm.runInNewContext(compiled, {
    Buffer,
    console,
    setTimeout,
    clearTimeout,
    process: sandboxProcess,
    exports: moduleObject.exports,
    module: moduleObject,
    require: createRequire(import.meta.url),
  });
  const extension = moduleObject.exports.default as (pi: {
    registerTool: (tool: RegisteredTool) => void;
    on: (event: string, handler: (event: unknown) => unknown) => void;
  }) => void;
  let tool: RegisteredTool | undefined;
  let resultHandler: ((event: unknown) => unknown) | undefined;
  extension({
    registerTool(value) {
      tool = value;
    },
    on(event, handler) {
      if (event === "tool_result") resultHandler = handler;
    },
  });
  if (!tool) throw new Error("trellis_subagent was not registered");
  return {
    tool,
    patchResult: (result) =>
      resultHandler?.({ ...result, toolName: "trellis_subagent" }) as
        | { isError?: boolean }
        | undefined,
  };
}

function assistant(
  text: string,
  stopReason = "stop",
  errorMessage?: string,
): object {
  return {
    type: "message_end",
    message: {
      role: "assistant",
      stopReason,
      errorMessage,
      content: text ? [{ type: "text", text }] : [],
    },
  };
}

describe("Pi subagent result boundary (#625, #626, #636)", () => {
  let root: string;
  let cli: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "trellis-pi-result-"));
    cli = join(root, "fake-pi.cjs");
    mkdirSync(join(root, ".trellis"), { recursive: true });
    mkdirSync(join(root, ".pi", "agents"), { recursive: true });
    writeFileSync(
      join(root, ".pi", "agents", "trellis-check.md"),
      "---\nname: trellis-check\n---\nCheck the task.\n",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("ships identical result-boundary regions in template and dogfood copies", () => {
    const template = getExtensionTemplate();
    const dogfood = readFileSync(
      resolve(__dirname, "../../../../.pi/extensions/trellis/index.ts"),
      "utf-8",
    );
    for (const [start, end] of [
      ["const MAX_FINAL_OUTPUT", "const MAX_STDERR"],
      ["function applyEvent(", "// ── Permission-forwarding"],
      ["function runPi(", "// ── Extension ─"],
    ]) {
      const region = (source: string): string =>
        source.slice(
          source.indexOf(start),
          source.indexOf(end, source.indexOf(start)),
        );
      expect(region(dogfood)).toBe(region(template));
    }
  });

  async function run(
    events: object[],
    exitCode = 0,
    input?: Partial<ToolInput>,
  ): Promise<{
    text: string;
    result: ToolResult;
    isError: boolean;
  }> {
    writeFileSync(
      cli,
      [
        'const fs = require("node:fs");',
        `fs.appendFileSync(${JSON.stringify(join(root, "child-runs.txt"))}, "run\\n");`,
        `for (const event of ${JSON.stringify(events)}) console.log(JSON.stringify(event));`,
        `process.exitCode = ${exitCode};`,
      ].join("\n"),
    );
    const { tool, patchResult } = loadTool(root, cli);
    const result = await tool.execute(
      "result-test",
      {
        agent: "trellis-check",
        prompt: "Check the task",
        ...input,
      },
      undefined,
      undefined,
      { cwd: root },
    );
    return {
      text: result.content[0]?.text ?? "",
      result,
      isError: patchResult(result)?.isError ?? false,
    };
  }

  it.each(["", "toolUse", "stop"])(
    "fails a zero exit without agent_end after %s text",
    async (reason) => {
      const events = [
        {
          type: "message_update",
          assistantMessageEvent: {
            type: "thinking_delta",
            delta: "RAW_STREAM_SENTINEL".repeat(1000),
          },
        },
        ...(reason ? [assistant("preliminary response", reason)] : []),
      ];
      const { text, result, isError } = await run(events);
      expect(result.details.runs[0]?.status).toBe("failed");
      expect(isError).toBe(true);
      expect(text).toContain("agent_end");
      expect(text).not.toContain("RAW_STREAM_SENTINEL");
      expect(text).not.toContain("preliminary response");
    },
  );

  it("preserves an assistant error after agent_end and a zero exit", async () => {
    const { text, result, isError } = await run([
      { type: "agent_start" },
      assistant("earlier text", "toolUse"),
      assistant("", "error", "synthetic upstream failure"),
      { type: "agent_end" },
    ]);
    expect(text).toBe("synthetic upstream failure");
    expect(result.details.runs[0]?.status).toBe("failed");
    expect(isError).toBe(true);
  });

  it("treats an assistant abort without errorMessage as cancellation", async () => {
    const { text, result, isError } = await run([
      assistant("", "aborted"),
      { type: "agent_end" },
    ]);
    expect(text).toContain("aborted");
    expect(result.details.runs[0]?.status).toBe("cancelled");
    expect(isError).toBe(true);
  });

  it("recovers an earlier assistant error after a successful retry", async () => {
    const { text, result, isError } = await run([
      assistant("", "error", "temporary error"),
      { type: "turn_start" },
      assistant("recovered final response"),
      { type: "agent_end" },
    ]);
    expect(text).toBe("recovered final response");
    expect(result.details.runs[0]?.status).toBe("succeeded");
    expect(result.details.runs[0]?.errorMessage).toBeUndefined();
    expect(isError).toBe(false);
  });

  it("does not return raw event stdout for a nonzero exit without stderr", async () => {
    const { text, result, isError } = await run(
      [{ type: "session", privateData: "RAW_STREAM_SENTINEL" }],
      7,
    );
    expect(text).toContain("7");
    expect(text).not.toContain("RAW_STREAM_SENTINEL");
    expect(result.details.runs[0]?.status).toBe("failed");
    expect(isError).toBe(true);
  });

  it("keeps tool-use text out of a completed run's final answer", async () => {
    const { text, result } = await run([
      assistant("I'll run a tool", "toolUse"),
      { type: "agent_end" },
    ]);
    expect(text).not.toContain("I'll run a tool");
    expect(result.details.runs[0]?.finalText).toBe("");
  });

  it("preserves a valid completed final response", async () => {
    const { text, result, isError } = await run([
      assistant("final answer"),
      { type: "agent_end" },
    ]);
    expect(text).toBe("final answer");
    expect(result.details.runs[0]?.status).toBe("succeeded");
    expect(isError).toBe(false);
  });

  it.each(["single", "parallel"] as const)(
    "caps %s output at 64 KiB without splitting UTF-8",
    async (mode) => {
      const { text, result } = await run(
        [assistant("漢".repeat(40000)), { type: "agent_end" }],
        0,
        {
          mode,
          ...(mode === "parallel" ? { prompts: ["one", "two"] } : {}),
        },
      );
      expect(Buffer.byteLength(text, "utf-8")).toBeLessThanOrEqual(64 * 1024);
      expect(text).toContain("truncated");
      expect(text).not.toContain("\uFFFD");
      for (const state of result.details.runs) {
        expect(Buffer.byteLength(state.finalText, "utf-8")).toBeLessThanOrEqual(
          64 * 1024,
        );
      }
    },
  );

  it("stops a chain when an assistant error occurs despite exit zero", async () => {
    const { result, isError } = await run(
      [assistant("", "error", "chain failure"), { type: "agent_end" }],
      0,
      {
        mode: "chain",
        prompts: ["first", "must not run"],
      },
    );
    expect(result.details.runs).toHaveLength(1);
    expect(readFileSync(join(root, "child-runs.txt"), "utf-8")).toBe("run\n");
    expect(isError).toBe(true);
  });
});
