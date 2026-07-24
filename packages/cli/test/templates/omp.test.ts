import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import {
  getAllAgents,
  getExtensionTemplate,
} from "../../src/templates/omp/index.js";
import { collectOmpTemplates } from "../../src/configurators/omp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(__dirname, "../../src/templates/omp");

type OmpEventHandler = (event: unknown, ctx?: unknown) => unknown;
type OmpExtension = (pi: {
  on: (event: string, handler: OmpEventHandler) => void;
}) => void;

function loadOmpExtension(): OmpExtension {
  const compiled = ts.transpileModule(getExtensionTemplate(), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = createRequire(import.meta.url);
  const moduleObject: { exports: { default?: OmpExtension } } = { exports: {} };
  const sandboxProcess = Object.create(process) as NodeJS.Process;
  const sandboxEnv = { ...process.env };
  delete sandboxEnv.TRELLIS_CONTEXT_ID;
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
  const extension = moduleObject.exports.default;
  if (!extension) throw new Error("OMP extension template has no default export");
  return extension;
}

function captureOmpHandlers(): Map<string, OmpEventHandler> {
  const handlers = new Map<string, OmpEventHandler>();
  loadOmpExtension()({
    on: (event, handler) => handlers.set(event, handler),
  });
  return handlers;
}

describe("omp templates", () => {
  it("provides the three Trellis sub-agent definitions", () => {
    const agents = getAllAgents();
    expect(agents.map((agent) => agent.name).sort()).toEqual([
      "trellis-check",
      "trellis-implement",
      "trellis-research",
    ]);
  });

  it("each agent has non-empty content and name", () => {
    for (const agent of getAllAgents()) {
      expect(agent.name.length).toBeGreaterThan(0);
      expect(agent.content.length).toBeGreaterThan(0);
    }
  });

  it("getExtensionTemplate returns a non-empty string", () => {
    const extension = getExtensionTemplate();
    expect(extension.length).toBeGreaterThan(0);
  });

  it("extension template contains key markers for OMP integration", () => {
    const extension = getExtensionTemplate();
    expect(extension).toContain("before_agent_start");
    expect(extension).toContain("input");
    expect(extension).toContain("session_start");
    expect(extension).toContain("ExtensionAPI");
  });

  it("extension template avoids known runtime and context-safety regressions", () => {
    const extension = getExtensionTemplate();

    expect(extension).not.toContain("pi.setLabel(");
    expect(extension).not.toContain("process.env.TRELLIS_CONTEXT_ID =");
    expect(extension).toContain('buildContextKey("omp", "session", sessionId)');
    expect(extension).toContain("realpathSync");
    expect(extension).toContain("resolveProjectFile(projectRoot, file, trustedRoots)");
    expect(extension).toContain("readFileSync(targetPath");
    expect(extension).toContain("if (!key) return null;");
    expect(extension).toContain("return key;");
    expect(extension).toContain(`if (existsSync(candidate)) {
         sessionFilePath = candidate;
      } else {
         return { status: "no_task", taskDir: null, taskTitle: null };
      }
   } else {`);
    expect(extension).toContain(
      "No identity: use single-session fallback only when there is exactly one session file.",
    );
    expect(extension).not.toContain("currentContextKey");
  });

  it("injects the derived context key into the original Bash params", () => {
    const handler = captureOmpHandlers().get("tool_call");
    if (!handler) throw new Error("OMP extension did not register tool_call");
    const params: { command: string; env?: Record<string, string> } = {
      command: "python3 ./.trellis/scripts/task.py current",
      env: { EXISTING: "kept" },
    };

    handler(
      { type: "tool_call", toolName: "bash", toolCallId: "call-1", input: params },
      { sessionManager: { getSessionId: () => "session/a" } },
    );

    expect(params.env?.TRELLIS_CONTEXT_ID).toBe("omp_session_a");
    expect(params.env?.EXISTING).toBe("kept");
  });

  it("preserves an explicit Bash env override and leaves inline assignments untouched", () => {
    const handler = captureOmpHandlers().get("tool_call");
    if (!handler) throw new Error("OMP extension did not register tool_call");
    const command =
      "TRELLIS_CONTEXT_ID=inline python3 ./.trellis/scripts/task.py current";
    const params: { command: string; env?: Record<string, string> } = {
      command,
      env: { TRELLIS_CONTEXT_ID: "explicit" },
    };

    handler(
      { type: "tool_call", toolName: "bash", toolCallId: "call-2", input: params },
      { sessionManager: { getSessionId: () => "session/b" } },
    );

    expect(params.command).toBe(command);
    expect(params.env?.TRELLIS_CONTEXT_ID).toBe("explicit");
  });

  it("does not mutate non-Bash tool params", () => {
    const handler = captureOmpHandlers().get("tool_call");
    if (!handler) throw new Error("OMP extension did not register tool_call");
    const params: Record<string, unknown> = { path: "README.md" };

    handler(
      { type: "tool_call", toolName: "read", toolCallId: "call-3", input: params },
      { sessionManager: { getSessionId: () => "session/c" } },
    );

    expect(params).toEqual({ path: "README.md" });
  });

  it("extension template contains session context injection markers", () => {
    const extension = getExtensionTemplate();
    // R1: Session start rich injection via get_context.py
    expect(extension).toContain("buildSessionContext");
    expect(extension).toContain("trellis-session-context");
    expect(extension).toContain("get_context.py");
    expect(extension).toContain("session-context");
  });

  it("extension template contains sub-agent precision injection markers", () => {
    const extension = getExtensionTemplate();
    // R2: Sub-agent detection via PI_BLOCKED_AGENT
    expect(extension).toContain("PI_BLOCKED_AGENT");
    expect(extension).toContain("detectAgentType");
    expect(extension).toContain("trellis-implement");
    expect(extension).toContain("trellis-check");
    expect(extension).toContain("trellis-research");
    // Agent-type-specific jsonl selection
    expect(extension).toContain("implement.jsonl");
    expect(extension).toContain("check.jsonl");
  });

  it("no settings.json or Python hooks exist in the template directory", () => {
    // OMP is extension-backed: native provider auto-discovers .omp/ subdirs,
    // so no settings.json is needed and no Python hooks should be present.
    expect(fs.existsSync(path.join(templateDir, "settings.json"))).toBe(false);
    expect(fs.existsSync(path.join(templateDir, "hooks"))).toBe(false);

    // Agents must not reference Python hook scripts
    for (const agent of getAllAgents()) {
      expect(agent.content).not.toContain("inject-subagent-context.py");
    }
  });
});

describe("omp command frontmatter", () => {
  it("collectOmpTemplates produces commands with YAML frontmatter", () => {
    const templates = collectOmpTemplates();
    const continueCmd = templates.get(".omp/commands/trellis-continue.md");
    const finishCmd = templates.get(".omp/commands/trellis-finish-work.md");

    expect(continueCmd).toBeDefined();
    expect(finishCmd).toBeDefined();

    // Both must start with YAML frontmatter
    expect(continueCmd).toMatch(/^---\ndescription: .+\n---\n\n/);
    expect(finishCmd).toMatch(
      /^---\ndescription: .+\nargument-hint: .+\n---\n\n/,
    );

    // Neither should retain the H1 heading from the source template
    expect(continueCmd).not.toMatch(/^---[\s\S]*?---\n\n# /);
    expect(finishCmd).not.toMatch(/^---[\s\S]*?---\n\n# /);
  });

  it("collectOmpTemplates does not emit a start command", () => {
    const templates = collectOmpTemplates();
    expect(templates.has(".omp/commands/trellis-start.md")).toBe(false);
  });
});
