import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { collectPiDesktopTemplates } from "../../src/configurators/pi-desktop.js";
import { collectPiTemplates } from "../../src/configurators/pi.js";
import { ALL_MANAGED_DIRS } from "../../src/configurators/index.js";
import { VERSION } from "../../src/constants/version.js";
import { getExtensionTemplate } from "../../src/templates/pi/index.js";
import { PI_DESKTOP_PLUGIN_ID } from "../../src/constants/pi-desktop.js";
import { getGlobalSubagentFiles } from "../../src/templates/pi-desktop/subagents.js";
import { getManagedPaths } from "../../src/types/ai-tools.js";

interface Extension {
  trellisExtension: (pi: Record<string, unknown>) => void;
}

function loadExtension(cwd: string): Extension {
  const source = `${getExtensionTemplate()}

export { trellisExtension };
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
  return moduleObject.exports as unknown as Extension;
}

/** A repository with one active task, as `task.py start` would leave it. */
function taskRepo(): { root: string; taskPath: string } {
  const root = mkdtempSync(join(tmpdir(), "trellis-pidesk-"));
  const taskPath = ".trellis/tasks/01-01-demo";
  mkdirSync(join(root, ".trellis", ".runtime", "sessions"), { recursive: true });
  mkdirSync(join(root, ...taskPath.split("/")), { recursive: true });
  writeFileSync(
    join(root, ".trellis", ".runtime", "sessions", "pi_demo.json"),
    JSON.stringify({ current_task: "tasks/01-01-demo" }),
  );
  return { root, taskPath };
}

describe("pi-desktop templates", () => {
  const files = collectPiDesktopTemplates();
  const piFiles = collectPiTemplates();

  it("writes exactly the pi surface plus the plugin wrapper", () => {
    const expected = [
      ...[...piFiles.keys()].filter(
        (path) => path !== ".pi/settings.json" && path !== ".pi/extensions/trellis/index.ts",
      ),
      ".pi-desktop/trellis/agent/index.ts",
      ".pi-desktop/trellis/main.js",
      ".pi-desktop/trellis/manifest.json",
    ].sort();
    expect([...files.keys()].sort()).toEqual(expected);
  });

  it("skips the two files the desktop host never reads", () => {
    expect(files.has(".pi/settings.json")).toBe(false);
    expect(files.has(".pi/extensions/trellis/index.ts")).toBe(false);
  });

  it("declares a manifest the host accepts", () => {
    const raw = files.get(".pi-desktop/trellis/manifest.json");
    expect(raw).toBeDefined();
    const manifest = JSON.parse(raw as string) as {
      schemaVersion: number;
      id: string;
      version: string;
      main: string;
      permissions: string[];
      contributes: { agentExtensions: string[] };
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.id).toBe(PI_DESKTOP_PLUGIN_ID);
    // The host validates ids with this pattern; `local.` marks a folder plugin.
    expect(manifest.id).toMatch(/^[a-z0-9]+(\.[a-z0-9_-]+)+$/);
    expect(manifest.version).toBe(VERSION);
    expect(manifest.permissions).toContain("agent.extension");
    expect(manifest.contributes.agentExtensions.length).toBeGreaterThan(0);
    for (const entry of manifest.contributes.agentExtensions) {
      expect(files.has(`.pi-desktop/trellis/${entry}`)).toBe(true);
    }
    expect(files.has(`.pi-desktop/trellis/${manifest.main}`)).toBe(true);
  });

  it("ships the pi extension byte for byte instead of a second copy", () => {
    expect(files.get(".pi-desktop/trellis/agent/index.ts")).toBe(
      piFiles.get(".pi/extensions/trellis/index.ts"),
    );
  });

  it("keeps the shared .pi and .agents files byte-identical to the pi platform", () => {
    const shared = [...files.keys()].filter(
      (path) =>
        path.startsWith(".pi/prompts/") ||
        path.startsWith(".pi/agents/") ||
        path.startsWith(".agents/skills/"),
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const path of shared) {
      expect(files.get(path), `${path} differs from the pi platform's copy`).toBe(
        piFiles.get(path),
      );
    }
  });

  it("claims the shared paths without duplicating managed dirs", () => {
    expect(getManagedPaths("pi-desktop")).toContain(".pi-desktop");
    expect(getManagedPaths("pi-desktop")).toContain(".agents/skills");
    expect(new Set(ALL_MANAGED_DIRS).size).toBe(ALL_MANAGED_DIRS.length);
  });
});

describe("the shared extension adapts to the desktop host", () => {
  it("registers the spawn-based subagent tool on the pi CLI only", () => {
    const { trellisExtension } = loadExtension(process.cwd());

    const cliRegisterTool = vi.fn();
    trellisExtension({ registerTool: cliRegisterTool });
    expect(cliRegisterTool).toHaveBeenCalledTimes(1);

    const desktopRegisterTool = vi.fn();
    trellisExtension({ registerTool: desktopRegisterTool, agent: {} });
    expect(desktopRegisterTool).not.toHaveBeenCalled();
  });

  it("prefixes an Active task line onto host Task dispatches", () => {
    const { root, taskPath } = taskRepo();
    const { trellisExtension } = loadExtension(root);

    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
    trellisExtension({
      registerTool: vi.fn(),
      agent: {},
      on: (event: string, handler: (event: unknown, ctx?: unknown) => unknown) => {
        handlers.set(event, handler);
      },
    });

    const event = {
      toolName: "Task",
      input: { prompt: "Implement the reviewed artifacts." },
    };
    handlers.get("tool_call")?.(event, {
      cwd: root,
      sessionManager: { getSessionId: () => "demo" },
    });

    expect(event.input.prompt).toBe(
      `Active task: ${taskPath}\n\nImplement the reviewed artifacts.`,
    );
  });

  it("leaves an already-prefixed dispatch prompt alone", () => {
    const { root, taskPath } = taskRepo();
    const { trellisExtension } = loadExtension(root);

    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
    trellisExtension({
      registerTool: vi.fn(),
      agent: {},
      on: (event: string, handler: (event: unknown, ctx?: unknown) => unknown) => {
        handlers.set(event, handler);
      },
    });

    const prompt = `Active task: ${taskPath}\n\nDo the work.`;
    const event = { toolName: "Task", input: { prompt } };
    handlers.get("tool_call")?.(event, {
      cwd: root,
      sessionManager: { getSessionId: () => "demo" },
    });

    expect(event.input.prompt).toBe(prompt);
    expect(existsSync(join(root, taskPath))).toBe(true);
  });

  it("leaves the desktop shell command alone and writes a runtime ticket", () => {
    const { root } = taskRepo();
    const { trellisExtension } = loadExtension(root);

    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
    trellisExtension({
      agent: {},
      on: (event: string, handler: (event: unknown, ctx?: unknown) => unknown) => {
        handlers.set(event, handler);
      },
    });

    const command = "python .trellis/scripts/task.py current --source";
    const event = { toolName: "Bash", input: { command } };
    handlers.get("tool_call")?.(event, {
      cwd: root,
      sessionManager: { getSessionId: () => "demo" },
    });

    // The host shell is user-configurable, so the command must reach it intact.
    expect(event.input.command).toBe(command);
    const ticketDir = join(root, ".trellis", ".runtime", "shell-tickets");
    const tickets = readdirSync(ticketDir).map((name) =>
      JSON.parse(readFileSync(join(ticketDir, name), "utf-8")),
    );
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      platform: "pi-desktop",
      context_key: "pi_demo",
      cwd: root,
      subcommands: [{ name: "current" }],
    });
  });

  it("writes no ticket for a shell command that never reads the session", () => {
    const { root } = taskRepo();
    const { trellisExtension } = loadExtension(root);

    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
    trellisExtension({
      agent: {},
      on: (event: string, handler: (event: unknown, ctx?: unknown) => unknown) => {
        handlers.set(event, handler);
      },
    });

    const event = { toolName: "Bash", input: { command: "git status --short" } };
    handlers.get("tool_call")?.(event, {
      cwd: root,
      sessionManager: { getSessionId: () => "demo" },
    });

    expect(event.input.command).toBe("git status --short");
    expect(existsSync(join(root, ".trellis", ".runtime", "shell-tickets"))).toBe(
      false,
    );
  });

  it("prunes an expired ticket and never a live one from another window", () => {
    const { root } = taskRepo();
    const { trellisExtension } = loadExtension(root);
    const ticketDir = join(root, ".trellis", ".runtime", "shell-tickets");
    mkdirSync(ticketDir, { recursive: true });
    writeFileSync(
      join(ticketDir, "1-expired.json"),
      JSON.stringify({ context_key: "pi_old", expires_at_epoch: 1 }),
    );
    writeFileSync(
      join(ticketDir, "2-live.json"),
      JSON.stringify({
        context_key: "pi_other",
        expires_at_epoch: Date.now() / 1000 + 30,
      }),
    );

    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
    trellisExtension({
      agent: {},
      on: (event: string, handler: (event: unknown, ctx?: unknown) => unknown) => {
        handlers.set(event, handler);
      },
    });
    handlers.get("tool_call")?.(
      { toolName: "Bash", input: { command: "python .trellis/scripts/task.py finish" } },
      { cwd: root, sessionManager: { getSessionId: () => "demo" } },
    );

    const names = readdirSync(ticketDir);
    expect(names).toContain("2-live.json");
    expect(names).not.toContain("1-expired.json");
    expect(names).toHaveLength(2);
  });

  it("keeps the env prefix on the pi CLI, whose shell tool is always bash", () => {
    const { root } = taskRepo();
    const { trellisExtension } = loadExtension(root);

    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>();
    trellisExtension({
      registerTool: vi.fn(),
      on: (event: string, handler: (event: unknown, ctx?: unknown) => unknown) => {
        handlers.set(event, handler);
      },
    });

    const event = {
      toolName: "bash",
      input: { command: "python .trellis/scripts/task.py current" },
    };
    handlers.get("tool_call")?.(event, {
      cwd: root,
      sessionManager: { getSessionId: () => "demo" },
    });

    expect(event.input.command).toBe(
      "export TRELLIS_CONTEXT_ID='pi_demo'; python .trellis/scripts/task.py current",
    );
    expect(existsSync(join(root, ".trellis", ".runtime", "shell-tickets"))).toBe(
      false,
    );
  });
});

describe("global sub-agent definitions", () => {
  const files = getGlobalSubagentFiles();

  it("covers exactly the three Trellis roles", () => {
    expect(files.map((file) => file.name)).toEqual([
      "trellis-check",
      "trellis-implement",
      "trellis-research",
    ]);
  });

  it("uses only tool names the host accepts", () => {
    // Host whitelist, case-sensitive. `read` would be dropped silently and the
    // definition would then fail with "`tools` lists no usable tool".
    const allowed = new Set([
      "Read",
      "Glob",
      "Grep",
      "BrowserPreview",
      "Bash",
      "Edit",
      "Write",
    ]);
    for (const file of files) {
      const line = file.content.match(/^tools: \[(.*)\]$/m);
      expect(line, `${file.name} has no tools line`).not.toBeNull();
      for (const tool of (line as RegExpMatchArray)[1].split(",")) {
        expect(allowed.has(tool.trim()), `${file.name} lists ${tool}`).toBe(
          true,
        );
      }
    }
  });

  it("carries the ownership marker and the global scope guard", () => {
    for (const file of files) {
      expect(file.content).toContain("trellis-managed: pi-desktop");
      expect(file.content).toContain("## Scope Guard (must run first)");
      // The pi CLI shape must not leak into the global copy.
      expect(file.content).not.toMatch(/^tools: read/m);
      expect(file.content).toMatch(/^description: .+/m);
      expect(file.fileName).toBe(`${file.name}.md`);
    }
  });
});
