import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task";
import {
  applyTaskOperation,
  parseTaskRecordV2,
} from "@mindfoldhq/trellis-core/task/v2";
import { readDeliveryWorkflowContract } from "../../src/utils/delivery-workflow.js";
import {
  deliveryWorkflowMdTemplate,
  workflowMdTemplate,
} from "../../src/templates/trellis/index.js";
import { collectPiTemplates } from "../../src/configurators/pi.js";
import { collectOmpTemplates } from "../../src/configurators/omp.js";
import { seedDeliveryContext } from "./delivery-fixture.js";
import sessionStartPlugin from "../../src/templates/opencode/plugins/session-start.js";

type Handler = (event: unknown, ctx?: unknown) => unknown;
type Extension = (api: {
  on: (event: string, handler: Handler) => void;
  sendMessage: (message: unknown) => Promise<void>;
}) => void;

function strings(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(strings).join("\n");
  if (value && typeof value === "object")
    return Object.values(value).map(strings).join("\n");
  return "";
}

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

describe("generated schema-2 SessionStart and extension carriers", () => {
  let root: string;
  let delivery: string;
  const session = "delivery-carrier";
  beforeEach(() => {
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-v2-carriers-")),
    );
    fs.cpSync(
      path.resolve(import.meta.dirname, "../../src/templates/trellis/scripts"),
      path.join(root, ".trellis/scripts"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(root, ".trellis/config.yaml"),
      "task_auto_commit: false\n",
    );
    delivery = seedDeliveryContext(root, "slice-task", "slice-task");
    const sessions = path.join(root, ".trellis/.runtime/sessions");
    fs.mkdirSync(sessions, { recursive: true });
    for (const platform of ["opencode", "pi", "omp"]) {
      fs.writeFileSync(
        path.join(sessions, `${platform}_${session}.json`),
        JSON.stringify({
          schema_version: 3,
          task_id: "slice-task",
          lifecycle_generation: 0,
          delivery_id: delivery,
        }),
      );
    }
    for (const templates of [collectPiTemplates(), collectOmpTemplates()]) {
      for (const [name, content] of templates) {
        const target = path.join(root, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
      }
    }
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function binding(platform: string, id: string | null): void {
    fs.writeFileSync(
      path.join(root, `.trellis/.runtime/sessions/${platform}_${session}.json`),
      JSON.stringify({
        schema_version: 3,
        task_id: "slice-task",
        lifecycle_generation: 0,
        delivery_id: id,
      }),
    );
  }
  async function invoke(platform: string): Promise<string> {
    if (platform === "opencode") {
      const hooks = (await sessionStartPlugin({ directory: root })) as {
        "experimental.chat.messages.transform": (
          input: object,
          output: { messages: unknown[] },
        ) => Promise<void>;
      };
      const output = {
        messages: [
          {
            info: { role: "user", sessionID: session, agent: "build" },
            parts: [{ type: "text", text: "Continue" }],
          },
        ],
      };
      await hooks["experimental.chat.messages.transform"]({}, output);
      return strings(output);
    }
    const source = fs.readFileSync(
      path.join(root, `.${platform}/extensions/trellis/index.ts`),
      "utf8",
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const sandboxProcess = Object.create(process) as NodeJS.Process;
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          !/^(TRELLIS_|GIT_|PI_SESSION|OMP_SESSION|CODEX_|CLAUDE_)/.test(name),
      ),
    );
    env.PYTHONDONTWRITEBYTECODE = "1";
    Object.defineProperty(sandboxProcess, "env", { value: env });
    Object.defineProperty(sandboxProcess, "cwd", { value: () => root });
    const module: { exports: { default?: Extension } } = { exports: {} };
    vm.runInContext(
      compiled,
      vm.createContext({
        Buffer,
        console,
        process: sandboxProcess,
        module,
        exports: module.exports,
        require: createRequire(import.meta.url),
      }),
    );
    const extension = module.exports.default;
    if (!extension) throw new Error("Generated extension has no entrypoint");
    const handlers = new Map<string, Handler>();
    const messages: unknown[] = [];
    extension({
      on: (event, handler) => handlers.set(event, handler),
      sendMessage: async (message) => {
        messages.push(message);
      },
    });
    const ctx = {
      cwd: root,
      sessionManager: { getSessionId: () => session },
      ui: { notify: () => undefined },
    };
    await handlers.get("session_start")?.({}, ctx);
    await handlers.get("input")?.({ text: "Continue" }, ctx);
    const turn = await handlers.get("before_agent_start")?.(
      { prompt: "Continue", systemPrompt: "BASE" },
      ctx,
    );
    return strings([messages, turn]);
  }

  it.each(["opencode", "pi", "omp"])(
    "%s uses the current Delivery and active custom workflow continuation",
    async (platform) => {
      fs.writeFileSync(
        path.join(root, ".trellis/workflow.md"),
        deliveryWorkflowMdTemplate.replace(
          "### Native Delivery continuation",
          "### CUSTOM DELIVERY CONTINUATION",
        ),
      );
      // Add unambiguous producer-owned continuation content, without legacy blocks.
      const workflowFile = path.join(root, ".trellis/workflow.md");
      fs.writeFileSync(
        workflowFile,
        fs
          .readFileSync(workflowFile, "utf8")
          .replace(
            "[trellis-continuation]",
            "[trellis-continuation]\nCUSTOM OWNER ROUTE",
          ),
      );
      const before = snapshot(root);
      const output = await invoke(platform);
      expect(output).toContain("Delivery query:");
      expect(output).toContain('"kind":"current"');
      if (platform !== "opencode") {
        expect(output).toContain("CUSTOM OWNER ROUTE");
        expect(output).toContain("SELECTED DELIVERY PRD");
      }
      expect(output).not.toContain("ROOT TASK ARTIFACT");
      expect(output).not.toContain("status=unknown");
      expect(output).not.toContain("Status: UNKNOWN");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(["opencode", "pi", "omp"])(
    "%s keeps noDelivery distinct from noTask and loads no root plan",
    async (platform) => {
      binding(platform, null);
      const before = snapshot(root);
      const output = await invoke(platform);
      expect(output).toContain("no_current_delivery");
      expect(output).not.toContain("No active Trellis task found");
      expect(output).not.toContain("ROOT TASK ARTIFACT");
      expect(output).not.toContain("SELECTED DELIVERY PRD");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(["opencode", "pi", "omp"])(
    "%s displays terminal Delivery facts without a Task completion guess",
    async (platform) => {
      const recordFile = path.join(root, ".trellis/tasks/slice-task/task.json");
      const record = parseTaskRecordV2(
        JSON.parse(fs.readFileSync(recordFile, "utf8")),
      );
      const workflow = readDeliveryWorkflowContract(deliveryWorkflowMdTemplate);
      if (!workflow || !record.accepted_scope)
        throw new Error("Missing fixture authority");
      const stopped = applyTaskOperation(
        record,
        {
          api_version: "1.0",
          operation: "stop",
          owner_role: "planning",
          owner_id: workflow.owners.planning,
          key: {
            task_id: record.id,
            lifecycle_generation: 0,
            delivery_id: delivery,
          },
          expected_phase: "planning",
          result: {
            result_id: "stop-slice",
            owner_id: workflow.owners.planning,
            evidence: [record.accepted_scope],
            reason: record.accepted_scope,
            scope_decision: record.accepted_scope,
          },
        },
        workflow,
      ).record;
      fs.writeFileSync(recordFile, JSON.stringify(stopped));
      const before = snapshot(root);
      const output = await invoke(platform);
      expect(output).toContain("terminal_delivery");
      expect(output).toContain("stopped");
      expect(output).not.toContain("Status: COMPLETED");
      expect(output).not.toContain("ROOT TASK ARTIFACT");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(["opencode", "pi", "omp"])(
    "%s rejects a deferred legacy Task under the declared schema-2 runtime",
    async (platform) => {
      fs.writeFileSync(
        path.join(root, ".trellis/tasks/slice-task/task.json"),
        JSON.stringify(
          emptyTaskRecord({ id: "slice-task", status: "planning" }),
        ),
      );
      // Old schema-2 session bindings are readable compatibility data; they
      // must not grant old Task records execution authority in the v2 runtime.
      fs.writeFileSync(
        path.join(
          root,
          `.trellis/.runtime/sessions/${platform}_${session}.json`,
        ),
        JSON.stringify({
          schema_version: 2,
          task_id: "slice-task",
          lifecycle_generation: 0,
        }),
      );
      const before = snapshot(root);
      const output = await invoke(platform);
      expect(output).toContain("maintenance_required");
      expect(output).toContain("trellis maintain inspect-task --target");
      expect(output).toContain("--task-id slice-task --generation 0");
      expect(output).not.toContain("ROOT TASK ARTIFACT");
      expect(output).not.toContain("SELECTED DELIVERY PRD");
      expect(output).not.toContain("Status: PLANNING");
      expect(snapshot(root)).toEqual(before);
    },
  );

  it.each(["opencode", "pi", "omp"])(
    "%s reports incompatible active workflow instead of legacy planning fallback",
    async (platform) => {
      fs.writeFileSync(
        path.join(root, ".trellis/workflow.md"),
        workflowMdTemplate,
      );
      const before = snapshot(root);
      const output = await invoke(platform);
      expect(output).toContain("missing_runtime_contract");
      expect(output).not.toContain("ROOT TASK ARTIFACT");
      expect(output).not.toContain("SELECTED DELIVERY PRD");
      expect(output).not.toContain("Status: UNKNOWN");
      expect(snapshot(root)).toEqual(before);
    },
  );
});
