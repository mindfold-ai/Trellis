import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
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
  sendMessage?: (message: unknown) => Promise<void>;
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

function makeOmpProject(): { root: string; taskDir: string; sessionId: string } {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "trellis-omp-") );
  const taskDir = path.join(root, ".trellis", "tasks", "08-13-context-limits");
  const sessionId = "context_limits";
  fs.mkdirSync(path.join(root, ".trellis", ".runtime", "sessions"), { recursive: true });
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "task.json"), JSON.stringify({ status: "in_progress", title: "Context limits" }));
  fs.writeFileSync(
    path.join(root, ".trellis", ".runtime", "sessions", "omp_context_limits.json"),
    JSON.stringify({ current_task: ".trellis/tasks/08-13-context-limits" }),
  );
  return { root, taskDir, sessionId };
}

async function runSessionStart(root: string, sessionId: string): Promise<string> {
  const messages: { customType?: string; content?: string }[] = [];
  const handlers = new Map<string, OmpEventHandler>();
  loadOmpExtension()({
    on: (event, handler) => handlers.set(event, handler),
    sendMessage: async (message: { customType?: string; content?: string }) => {
      messages.push(message);
    },
  } as never);
  const handler = handlers.get("session_start");
  if (!handler) throw new Error("OMP extension did not register session_start");
  await handler({}, {
    cwd: root,
    sessionManager: { getSessionId: () => sessionId },
    ui: { notify: () => undefined },
  });
  return messages.find((message) => message.customType === "trellis-task-context")?.content ?? "";
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
    expect(extension).toContain("readFilePrefix(targetPath");
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

  it("deduplicates files referenced by both main-session manifests", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "trellis-omp-dedupe-"),
    );
    const taskDir = path.join(projectRoot, ".trellis", "tasks", "demo-task");
    const sessionDir = path.join(
      projectRoot,
      ".trellis",
      ".runtime",
      "sessions",
    );
    const sharedFile = path.join(projectRoot, "docs", "shared.md");
    const checkOnlyFile = path.join(projectRoot, "docs", "check-only.md");
    const contextKey = "omp_session_dedupe";
    const taskRef = ".trellis/tasks/demo-task";
    const messages: { customType?: string; content?: string }[] = [];

    try {
      fs.mkdirSync(path.join(taskDir, "research"), { recursive: true });
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.mkdirSync(path.dirname(sharedFile), { recursive: true });
      fs.writeFileSync(
        path.join(taskDir, "task.json"),
        JSON.stringify({
          title: "OMP context dedupe",
          status: "in_progress",
        }),
      );
      fs.writeFileSync(sharedFile, "shared context body");
      fs.writeFileSync(checkOnlyFile, "check-only context body");
      fs.writeFileSync(
        path.join(taskDir, "implement.jsonl"),
        `${JSON.stringify({ file: "docs/shared.md" })}\n`,
      );
      fs.writeFileSync(
        path.join(taskDir, "check.jsonl"),
        `${JSON.stringify({ file: "./docs/../docs/shared.md" })}\n${JSON.stringify({ file: "docs/check-only.md" })}\n`,
      );
      fs.writeFileSync(
        path.join(sessionDir, `${contextKey}.json`),
        JSON.stringify({ current_task: taskRef }),
      );

      const handlers = new Map<string, OmpEventHandler>();
      loadOmpExtension()({
        on: (event, handler) => handlers.set(event, handler),
        sendMessage: async (message) =>
          messages.push(message as { customType?: string; content?: string }),
      });
      const sessionStart = handlers.get("session_start");
      if (!sessionStart)
        throw new Error("OMP extension did not register session_start");

      await sessionStart(
        {},
        {
          cwd: projectRoot,
          sessionManager: { getSessionId: () => "session/dedupe" },
          ui: { notify: () => undefined },
        },
      );

      const taskContext = messages.find(
        (message) => message.customType === "trellis-task-context",
      );
      expect(taskContext?.content).toContain("## implement.jsonl");
      expect(taskContext?.content).toContain("## check.jsonl");
      expect(taskContext?.content?.match(/shared context body/g)).toHaveLength(
        1,
      );
      expect(taskContext?.content).toContain("check-only context body");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("refreshes task context when a referenced file changes mid-session", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-omp-refresh-"));
    const taskDir = path.join(projectRoot, ".trellis", "tasks", "demo-task");
    const sessionsDir = path.join(projectRoot, ".trellis", ".runtime", "sessions");
    const referencedFile = path.join(projectRoot, "docs", "changing.md");
    const messages: { customType?: string; content?: string }[] = [];

    try {
      fs.mkdirSync(taskDir, { recursive: true });
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.mkdirSync(path.dirname(referencedFile), { recursive: true });
      fs.writeFileSync(path.join(taskDir, "task.json"), JSON.stringify({ status: "in_progress" }));
      fs.writeFileSync(referencedFile, "old context body");
      fs.writeFileSync(
        path.join(taskDir, "implement.jsonl"),
        `${JSON.stringify({ file: "docs/changing.md" })}\n${JSON.stringify({ file: "docs/created-later.md" })}\n`,
      );
      fs.writeFileSync(
        path.join(sessionsDir, "omp_session_refresh.json"),
        JSON.stringify({ current_task: ".trellis/tasks/demo-task" }),
      );

      const handlers = new Map<string, OmpEventHandler>();
      loadOmpExtension()({
        on: (event, handler) => handlers.set(event, handler),
        sendMessage: async (message) => messages.push(message as { customType?: string; content?: string }),
      });
      const sessionStart = handlers.get("session_start");
      const context = handlers.get("context");
      if (!sessionStart || !context) throw new Error("OMP extension did not register required handlers");
      const ctx = {
        cwd: projectRoot,
        sessionManager: { getSessionId: () => "session/refresh" },
        ui: { notify: () => undefined },
      };

      await sessionStart({}, ctx);
      const initial = messages.find((message) => message.customType === "trellis-task-context");
      expect(initial?.content).toContain("old context body");
      expect(initial?.content).not.toContain("created later body");

      fs.writeFileSync(referencedFile, "new context body with changed size");
      fs.writeFileSync(path.join(projectRoot, "docs", "created-later.md"), "created later body");
      const result = await context(
        {
          messages: [
            { role: "custom", customType: "trellis-task-context", content: initial?.content },
            { role: "custom", customType: "trellis-workflow-state", content: "workflow" },
          ],
        },
        ctx,
      ) as { messages?: { customType?: string; content?: string }[] } | undefined;

      const refreshed = result?.messages?.filter(
        (message) => message.customType === "trellis-task-context",
      ) ?? [];
      expect(refreshed).toHaveLength(1);
      expect(refreshed[0]?.content).toContain("new context body with changed size");
      expect(refreshed[0]?.content).toContain("created later body");
      expect(refreshed[0]?.content).not.toContain("old context body");

      const unchanged = await context({ messages: result?.messages }, ctx);
      expect(unchanged).toBeUndefined();
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("re-evaluates later budgeted files when an earlier file shrinks mid-session", async () => {
    const project = makeOmpProject();
    const messages: { customType?: string; content?: string }[] = [];

    try {
      fs.writeFileSync(
        path.join(project.root, ".trellis", "config.yaml"),
        "context_injection:\n  max_file_bytes: 0\n  max_artifact_bytes: 64\n  max_total_bytes: 900\n",
      );
      const earlierFile = path.join(project.root, "earlier.md");
      fs.writeFileSync(earlierFile, "a".repeat(450));
      fs.writeFileSync(path.join(project.root, "later.md"), "later content ".repeat(25));
      fs.writeFileSync(
        path.join(project.taskDir, "implement.jsonl"),
        [
          JSON.stringify({ file: "earlier.md", reason: "earlier budget consumer" }),
          JSON.stringify({ file: "later.md", reason: "later candidate" }),
        ].join("\n") + "\n",
      );

      const handlers = new Map<string, OmpEventHandler>();
      loadOmpExtension()({
        on: (event, handler) => handlers.set(event, handler),
        sendMessage: async (message) =>
          messages.push(message as { customType?: string; content?: string }),
      });
      const sessionStart = handlers.get("session_start");
      const context = handlers.get("context");
      if (!sessionStart || !context)
        throw new Error("OMP extension did not register required handlers");
      const ctx = {
        cwd: project.root,
        sessionManager: { getSessionId: () => project.sessionId },
        ui: { notify: () => undefined },
      };

      await sessionStart({}, ctx);
      const initial = messages.find(
        (message) => message.customType === "trellis-task-context",
      );
      expect(initial?.content).toContain("earlier.md [inline]");
      expect(initial?.content).toContain("later.md [omitted]");

      fs.writeFileSync(earlierFile, "short earlier content");
      const result = (await context(
        {
          messages: [
            {
              role: "custom",
              customType: "trellis-task-context",
              content: initial?.content,
            },
            {
              role: "custom",
              customType: "trellis-workflow-state",
              content: "workflow",
            },
          ],
        },
        ctx,
      )) as
        | { messages?: { customType?: string; content?: string }[] }
        | undefined;

      const refreshed = result?.messages?.filter(
        (message) => message.customType === "trellis-task-context",
      );
      expect(refreshed).toHaveLength(1);
      expect(refreshed?.[0]?.content).toContain("short earlier content");
      expect(refreshed?.[0]?.content).toContain("later.md [inline]");
      expect(refreshed?.[0]?.content).toContain("later content");
      expect(refreshed?.[0]?.content).not.toContain("later.md [omitted]");
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
  });

  it("bounds referenced files and marks truncated content as recoverable", async () => {
    const project = makeOmpProject();
    try {
      fs.writeFileSync(path.join(project.taskDir, "prd.md"), "requirements");
      fs.writeFileSync(path.join(project.root, "large.md"), "x".repeat(40_000));
      fs.writeFileSync(
        path.join(project.taskDir, "implement.jsonl"),
        JSON.stringify({ file: "large.md", reason: "large reference" }) + "\n",
      );

      const context = await runSessionStart(project.root, project.sessionId);
      expect(context).toContain("large.md [truncated]");
      expect(context).toContain("read large.md for the full content");
      expect(context).toContain("Context is bounded by .trellis/config.yaml");
      expect(Buffer.byteLength(context, "utf-8")).toBeLessThan(140_000);
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
  });

  it("continues with later files after an earlier file is omitted by the total budget", async () => {
    const project = makeOmpProject();
    try {
      fs.writeFileSync(
        path.join(project.root, ".trellis", "config.yaml"),
        "context_injection:\n  max_file_bytes: 0\n  max_total_bytes: 500\n",
      );
      fs.writeFileSync(path.join(project.root, "large.md"), "x".repeat(800));
      fs.writeFileSync(path.join(project.root, "small.md"), "small reference");
      fs.writeFileSync(
        path.join(project.taskDir, "implement.jsonl"),
        [
          JSON.stringify({ file: "large.md", reason: "large first" }),
          JSON.stringify({ file: "small.md", reason: "small later" }),
        ].join("\n") + "\n",
      );

      const context = await runSessionStart(project.root, project.sessionId);
      expect(context).toContain("large.md [omitted]");
      expect(context).toContain("required_read: large.md");
      expect(context).toContain("small.md [inline]");
      expect(context).toContain("small reference");
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
  });

  it("reports an oversized JSONL manifest instead of silently truncating it", async () => {
    const project = makeOmpProject();
    try {
      fs.writeFileSync(
        path.join(project.taskDir, "implement.jsonl"),
        " ".repeat(1024 * 1024 + 1),
      );
      const context = await runSessionStart(project.root, project.sessionId);
      expect(context).toContain(".trellis/tasks/08-13-context-limits/implement.jsonl [omitted]");
      expect(context).toContain("required_read: .trellis/tasks/08-13-context-limits/implement.jsonl");
      expect(context).toContain("manifest exceeds 1048576 byte parse limit");
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
  });

  it("omits a file when an invalid UTF-8 byte is exactly at the file limit", async () => {
    const project = makeOmpProject();
    try {
      fs.writeFileSync(
        path.join(project.root, ".trellis", "config.yaml"),
        "context_injection:\n  max_file_bytes: 3\n  max_artifact_bytes: 64\n  max_total_bytes: 2000\n",
      );
      fs.writeFileSync(path.join(project.root, "invalid.md"), Buffer.from([0x61, 0x62, 0x63, 0x80, 0x64]));
      fs.writeFileSync(
        path.join(project.taskDir, "implement.jsonl"),
        JSON.stringify({ file: "invalid.md", reason: "invalid boundary" }) + "\n",
      );

      const context = await runSessionStart(project.root, project.sessionId);
      expect(context).toContain("invalid.md [omitted]");
      expect(context).toContain("binary or non-UTF-8 file");
      expect(context).not.toContain("invalid.md [truncated]");
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
  });

  it("omits invalid UTF-8 second-byte boundary pairs", async () => {
    for (const [name, bytes] of [
      ["invalid-e0.md", [0x61, 0xe0, 0x80, 0x62]],
      ["invalid-ed.md", [0x61, 0xed, 0xa0, 0x80, 0x62]],
    ] as const) {
      const project = makeOmpProject();
      try {
        fs.writeFileSync(
          path.join(project.root, ".trellis", "config.yaml"),
          "context_injection:\n  max_file_bytes: 3\n  max_artifact_bytes: 64\n  max_total_bytes: 2000\n",
        );
        fs.writeFileSync(path.join(project.root, name), Buffer.from(bytes));
        fs.writeFileSync(
          path.join(project.taskDir, "implement.jsonl"),
          JSON.stringify({ file: name, reason: "invalid second-byte boundary" }) + "\n",
        );

        const context = await runSessionStart(project.root, project.sessionId);
        expect(context).toContain(`${name} [omitted]`);
        expect(context).not.toContain(`${name} [truncated]`);
      } finally {
        fs.rmSync(project.root, { recursive: true, force: true });
      }
    }
  });

  it("truncates a valid multibyte character that crosses the file limit", async () => {
    const project = makeOmpProject();
    try {
      fs.writeFileSync(
        path.join(project.root, ".trellis", "config.yaml"),
        "context_injection:\n  max_file_bytes: 3\n  max_artifact_bytes: 64\n  max_total_bytes: 2000\n",
      );
      fs.writeFileSync(path.join(project.root, "unicode.md"), "a€tail");
      fs.writeFileSync(
        path.join(project.taskDir, "implement.jsonl"),
        JSON.stringify({ file: "unicode.md", reason: "unicode boundary" }) + "\n",
      );

      const context = await runSessionStart(project.root, project.sessionId);
      expect(context).toContain("unicode.md [truncated]");
      expect(context).toContain("### unicode.md [truncated]\n\na\n[Trellis: truncated at 3 bytes");
      expect(context).not.toContain("€");
      expect(context).not.toContain("unicode.md [omitted]");
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
  });

  it("keeps a valid multibyte character when it ends at the file limit", async () => {
    const project = makeOmpProject();
    try {
      fs.writeFileSync(
        path.join(project.root, ".trellis", "config.yaml"),
        "context_injection:\n  max_file_bytes: 4\n  max_artifact_bytes: 64\n  max_total_bytes: 2000\n",
      );
      fs.writeFileSync(path.join(project.root, "unicode-end.md"), "a€tail");
      fs.writeFileSync(
        path.join(project.taskDir, "implement.jsonl"),
        JSON.stringify({ file: "unicode-end.md", reason: "unicode end boundary" }) + "\n",
      );

      const context = await runSessionStart(project.root, project.sessionId);
      expect(context).toContain("unicode-end.md [truncated]");
      expect(context).toContain("a€");
      expect(context).not.toContain("unicode-end.md [omitted]");
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
  });

  it("never exceeds the total context byte limit with repeated omitted entries", async () => {
    const project = makeOmpProject();
    const maxTotalBytes = 700;
    try {
      fs.writeFileSync(
        path.join(project.root, ".trellis", "config.yaml"),
        `context_injection:\n  max_file_bytes: 0\n  max_artifact_bytes: 64\n  max_total_bytes: ${maxTotalBytes}\n`,
      );
      const rows: string[] = [];
      for (let index = 0; index < 20; index++) {
        const file = `oversized-${index}.md`;
        fs.writeFileSync(path.join(project.root, file), "x".repeat(2000));
        rows.push(JSON.stringify({ file, reason: "budget regression" }));
      }
      fs.writeFileSync(path.join(project.taskDir, "implement.jsonl"), `${rows.join("\n")}\n`);

      const context = await runSessionStart(project.root, project.sessionId);
      expect(Buffer.byteLength(context, "utf-8")).toBeLessThanOrEqual(maxTotalBytes);
      const omittedCount = context.match(/\[omitted\]/g)?.length ?? 0;
      expect(omittedCount).toBeGreaterThan(0);
      expect(omittedCount).toBeLessThan(20);
      expect(context).toContain("context limit reached");
      expect(context).toMatch(/<\/task-context>$/);
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
    }
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
