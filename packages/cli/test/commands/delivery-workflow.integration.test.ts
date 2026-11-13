import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("figlet", () => ({ default: { textSync: vi.fn(() => "TRELLIS") } }));
vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({ proceed: true }) },
}));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: vi.fn((cmd: string) =>
      cmd.endsWith(" --version") ? "Python 3.11.12" : "",
    ),
  };
});

import { init } from "../../src/commands/init.js";
import { update } from "../../src/commands/update.js";
import { runWorkflowCommand } from "../../src/commands/workflow.js";
import {
  readDeliveryWorkflowContract,
  preflightDeliveryWorkflow,
} from "../../src/utils/delivery-workflow.js";
import { loadHashes } from "../../src/utils/template-hash.js";
import {
  deliveryWorkflowMdTemplate,
  workflowMdTemplate,
} from "../../src/templates/trellis/index.js";
import { VERSION } from "../../src/constants/version.js";
import {
  collectPlatformTemplates,
  PLATFORM_IDS,
} from "../../src/configurators/index.js";
import {
  applyTaskOperation,
  parseTaskRecordV2,
} from "@mindfoldhq/trellis-core/task/v2";
import { seedDeliveryContext } from "../templates/delivery-fixture.js";
import injectSubagentContextPlugin from "../../src/templates/opencode/plugins/inject-subagent-context.js";

function snapshot(root: string): Map<string, string> {
  const result = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isSymbolicLink())
        result.set(
          path.relative(root, target),
          `symlink:${fs.readlinkSync(target)}`,
        );
      else if (entry.isDirectory()) walk(target);
      else
        result.set(
          path.relative(root, target),
          fs.readFileSync(target).toString("base64"),
        );
    }
  };
  walk(root);
  return result;
}

describe("D1 opted native Delivery installation", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-delivery-install-"));
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("loads selected Delivery context through actual Python/OpenCode hooks and fails closed on v2 query errors", async () => {
    await init({
      yes: true,
      codex: true,
      claude: true,
      opencode: true,
      workflow: "native-delivery-v1",
    });
    const task = path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines");
    const deliveryId = seedDeliveryContext(
      cwd,
      "00-bootstrap-guidelines",
      "00-bootstrap-guidelines",
    );
    const key = "codex_native-fixture";
    vi.stubEnv("TRELLIS_CONTEXT_ID", key);
    const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };
    const python = process.platform === "win32" ? "python" : "python3";
    execFileSync(
      python,
      [
        path.join(cwd, ".trellis/scripts/delivery.py"),
        "select",
        "--task",
        task,
        "--delivery",
        deliveryId,
      ],
      { cwd, env },
    );
    const hooks = (await injectSubagentContextPlugin({ directory: cwd })) as {
      "tool.execute.before": (
        input: unknown,
        output: { args: { subagent_type: string; prompt: string } },
      ) => Promise<void>;
    };
    const invoke = async (): Promise<string[]> => {
      const values = ["codex", "claude"].map((platform) =>
        execFileSync(
          python,
          [path.join(cwd, `.${platform}/hooks/inject-subagent-context.py`)],
          {
            cwd,
            env,
            encoding: "utf8",
            input: JSON.stringify(
              platform === "codex"
                ? {
                    cwd,
                    session_id: "native-fixture",
                    hook_event_name: "SubagentStart",
                    agent_type: "trellis-implement",
                  }
                : {
                    cwd,
                    session_id: "native-fixture",
                    tool_name: "Task",
                    tool_input: {
                      subagent_type: "trellis-implement",
                      prompt: "Implement selected slice",
                    },
                  },
            ),
          },
        ),
      );
      const output = {
        args: {
          subagent_type: "trellis-implement",
          prompt: "Implement selected slice",
        },
      };
      await hooks["tool.execute.before"](
        { tool: "task", sessionID: "native-fixture" },
        output,
      );
      values.push(output.args.prompt);
      return values;
    };
    for (const [index, result] of (await invoke()).entries()) {
      expect(result, ["codex", "claude", "opencode"][index]).toContain(
        "SELECTED DELIVERY PRD",
      );
      expect(result).toContain("SELECTED WORKSPACE SPEC");
      expect(result).not.toContain("ROOT TASK ARTIFACT");
    }
    const nativeParent = execFileSync(
      python,
      [path.join(cwd, ".codex/hooks/inject-subagent-context.py")],
      {
        cwd,
        env: { ...env, TRELLIS_CONTEXT_ID: "wrong-inherited-context" },
        encoding: "utf8",
        input: JSON.stringify({
          cwd,
          session_id: "native-fixture",
          hook_event_name: "SubagentStart",
          agent_type: "trellis-implement",
        }),
      },
    );
    expect(nativeParent).toContain("SELECTED DELIVERY PRD");
    expect(nativeParent).not.toContain("ROOT TASK ARTIFACT");
    const binding = path.join(cwd, ".trellis/.runtime/sessions", `${key}.json`);
    const before = fs.readFileSync(path.join(task, "task.json"), "utf8");
    fs.writeFileSync(
      path.join(cwd, ".trellis/workflow.md"),
      workflowMdTemplate,
    );
    for (const result of await invoke()) {
      expect(result).toContain("missing_runtime_contract");
      expect(result).not.toContain("ROOT TASK ARTIFACT");
      expect(result).not.toContain("SELECTED DELIVERY PRD");
    }
    fs.writeFileSync(
      path.join(cwd, ".trellis/workflow.md"),
      deliveryWorkflowMdTemplate,
    );
    fs.writeFileSync(
      binding,
      JSON.stringify({
        schema_version: 3,
        task_id: "00-bootstrap-guidelines",
        lifecycle_generation: 0,
        delivery_id: "22222222-2222-4222-8222-222222222222",
      }),
    );
    for (const result of await invoke()) {
      expect(result).toContain("stale_binding");
      expect(result).not.toContain("ROOT TASK ARTIFACT");
      expect(result).not.toContain("SELECTED DELIVERY PRD");
    }
    expect(fs.readFileSync(path.join(task, "task.json"), "utf8")).toBe(before);
  });

  it("#1 gives a fresh default install native Delivery authority and preserves it on reapply", async () => {
    await init({ yes: true, codex: true });
    expect(
      fs.readFileSync(path.join(cwd, ".trellis/workflow.md"), "utf8"),
    ).toBe(deliveryWorkflowMdTemplate);
    const taskFile = path.join(
      cwd,
      ".trellis/tasks/00-bootstrap-guidelines/task.json",
    );
    const bytes = fs.readFileSync(taskFile, "utf8");
    const record = parseTaskRecordV2(JSON.parse(bytes));
    const bootstrapPrd = fs.readFileSync(
      path.join(path.dirname(taskFile), "prd.md"),
      "utf8",
    );
    expect(bootstrapPrd).toContain("planning_root");
    expect(bootstrapPrd).toContain("Completion");
    expect(bootstrapPrd).toContain("Closure");
    expect(bootstrapPrd).not.toContain("per-task jsonl");
    expect(bootstrapPrd).not.toContain("./.trellis/scripts/task.py finish");
    expect(record).not.toHaveProperty("status");
    expect(record.accepted_scope).not.toBeNull();
    expect(record.deliveries).toHaveLength(1);
    expect(record.deliveries[0]).toMatchObject({
      phase: "planning",
      results: {
        planning: null,
        check: null,
        full_review: null,
        readiness: null,
      },
    });
    await update({ force: true });
    expect(fs.readFileSync(taskFile, "utf8")).toBe(bytes);
    expect(
      fs.readFileSync(path.join(cwd, ".trellis/workflow.md"), "utf8"),
    ).toBe(deliveryWorkflowMdTemplate);
  });

  it.each([
    { schema: "legacy", agent: "trellis-implement" },
    { schema: "legacy", agent: "trellis-check" },
    { schema: "v2", agent: "trellis-implement" },
    { schema: "v2", agent: "trellis-check" },
  ])(
    "keeps identity-less sole-session context fallback restricted to legacy ($schema/$agent)",
    async ({ schema, agent }) => {
      const v2 = schema === "v2";
      await init({
        yes: true,
        claude: true,
        workflow: v2 ? "native-delivery-v1" : "native",
      });
      const task = path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines");
      const python = process.platform === "win32" ? "python" : "python3";
      const cleanEnv = {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) =>
              !/^(TRELLIS_|CODEX_|CLAUDE_|CURSOR_|COPILOT_|GEMINI_|QODER_|KIRO_|CODEBUDDY_|FACTORY_|TRAE_|ZCODE_|GIT_|PI_SESSION|OMP_SESSION)/.test(
                name,
              ),
          ),
        ),
        PYTHONDONTWRITEBYTECODE: "1",
      };
      const bindingEnv = { ...cleanEnv, TRELLIS_CONTEXT_ID: "sole-fixture" };
      if (v2) {
        const deliveryId = seedDeliveryContext(
          cwd,
          "00-bootstrap-guidelines",
          "00-bootstrap-guidelines",
        );
        execFileSync(
          python,
          [
            path.join(cwd, ".trellis/scripts/delivery.py"),
            "select",
            "--task",
            task,
            "--delivery",
            deliveryId,
          ],
          { cwd, env: bindingEnv },
        );
      } else {
        fs.writeFileSync(
          path.join(task, "prd.md"),
          "LEGACY ROOT CONTEXT SENTINEL",
        );
        execFileSync(
          python,
          [path.join(cwd, ".trellis/scripts/task.py"), "start", task],
          { cwd, env: bindingEnv },
        );
        fs.writeFileSync(path.join(task, "implement.jsonl"), "");
        fs.writeFileSync(path.join(task, "check.jsonl"), "");
      }
      const before = snapshot(cwd);
      const output = execFileSync(
        python,
        [path.join(cwd, ".claude/hooks/inject-subagent-context.py")],
        {
          cwd,
          env: cleanEnv,
          encoding: "utf8",
          input: JSON.stringify({
            cwd,
            tool_name: "Task",
            tool_input: {
              subagent_type: agent,
              prompt: "Continue selected slice work",
            },
          }),
        },
      );
      if (v2) {
        expect(output).toContain("context_required");
        expect(output).toContain("no_current_task");
        expect(output).not.toContain("ROOT TASK ARTIFACT");
        expect(output).not.toContain("SELECTED DELIVERY PRD");
      } else {
        expect(output).toContain("LEGACY ROOT CONTEXT SENTINEL");
        expect(output).not.toContain("context_required");
      }
      expect(snapshot(cwd)).toEqual(before);
    },
  );

  it("#2 creates an explicit bootstrap Delivery before Planning and keeps it across reapply", async () => {
    await init({ yes: true, codex: true, workflow: "native-delivery-v1" });
    const task = path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines");
    const bytes = fs.readFileSync(path.join(task, "task.json"), "utf8");
    const record = parseTaskRecordV2(JSON.parse(bytes));
    expect(record.deliveries).toHaveLength(1);
    const delivery = record.deliveries[0];
    expect(delivery).toMatchObject({
      phase: "planning",
      results: {
        planning: null,
        check: null,
        full_review: null,
        readiness: null,
      },
    });
    expect(
      fs.readFileSync(
        path.join(task, delivery.planning_root, "prd.md"),
        "utf8",
      ),
    ).toBe(fs.readFileSync(path.join(task, "prd.md"), "utf8"));
    expect(loadHashes(cwd)).toHaveProperty(".trellis/delivery-contract.md");
    await update({ force: true });
    expect(fs.readFileSync(path.join(task, "task.json"), "utf8")).toBe(bytes);
    expect(
      fs.readFileSync(path.join(cwd, ".trellis/workflow.md"), "utf8"),
    ).toBe(deliveryWorkflowMdTemplate);
    const script = path.join(cwd, ".trellis/scripts/task.py");
    const env = {
      ...process.env,
      TRELLIS_CONTEXT_ID: "native-install-test",
      PYTHONDONTWRITEBYTECODE: "1",
    };
    const python = process.platform === "win32" ? "python" : "python3";
    execFileSync(python, [script, "start", task], { cwd, env });
    const noSelection: unknown = JSON.parse(
      execFileSync(
        python,
        [path.join(cwd, ".trellis/scripts/delivery.py"), "current", "--json"],
        { cwd, env, encoding: "utf8" },
      ),
    );
    expect(noSelection).toMatchObject({ kind: "no_current_delivery" });
    execFileSync(
      python,
      [
        path.join(cwd, ".trellis/scripts/delivery.py"),
        "select",
        "--task",
        task,
        "--delivery",
        delivery.id,
      ],
      { cwd, env },
    );
    const hook = execFileSync(
      python,
      [path.join(cwd, ".codex/hooks/inject-workflow-state.py")],
      { cwd, env, input: JSON.stringify({ cwd }), encoding: "utf8" },
    );
    expect(hook).toContain("planning");
    expect(hook).not.toContain("task_error");
    expect(fs.readFileSync(path.join(task, "task.json"), "utf8")).toBe(bytes);
  });

  it("#3 refuses old same-version installed runtime before changing workflow or hashes", async () => {
    fs.mkdirSync(path.join(cwd, ".trellis"));
    fs.writeFileSync(path.join(cwd, ".trellis/.version"), VERSION);
    fs.writeFileSync(
      path.join(cwd, ".trellis/workflow.md"),
      workflowMdTemplate,
    );
    const before = snapshot(cwd);
    await expect(
      runWorkflowCommand({ template: "native-delivery-v1", force: true }),
    ).rejects.toThrow("unsupported_delivery_install");
    expect(snapshot(cwd)).toEqual(before);
  });

  it("#4 keeps legacy tasks unmigrated and ignores a .new preview at runtime", async () => {
    await init({ yes: true, codex: true, workflow: "native" });
    const before = snapshot(cwd);
    await expect(
      runWorkflowCommand({ template: "native-delivery-v1", force: true }),
    ).rejects.toThrow("delivery_migration_required");
    expect(snapshot(cwd)).toEqual(before);
    await runWorkflowCommand({
      template: "native-delivery-v1",
      createNew: true,
    });
    expect(
      fs.readFileSync(path.join(cwd, ".trellis/workflow.md"), "utf8"),
    ).toBe(workflowMdTemplate);
    expect(
      readDeliveryWorkflowContract(
        fs.readFileSync(path.join(cwd, ".trellis/workflow.md"), "utf8"),
      ),
    ).toBeNull();
  });

  it("#5 protects a custom workflow on forced update", async () => {
    await init({ yes: true, codex: true });
    const target = path.join(cwd, ".trellis/workflow.md");
    fs.writeFileSync(
      target,
      "# Custom owner\n[trellis-continuation]\nCustom routing.\n[/trellis-continuation]\n",
    );
    const before = fs.readFileSync(target, "utf8");
    await update({ force: true });
    expect(fs.readFileSync(target, "utf8")).toBe(before);
  });

  it.each(["legacy-to-v2", "v2-to-legacy"])(
    "rejects incompatible direct Task aliases before switching (%s)",
    async (direction) => {
      const native = direction === "v2-to-legacy";
      await init({
        yes: true,
        codex: true,
        workflow: native ? "native-delivery-v1" : "native",
      });
      const task = path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines");
      const stored = path.join(cwd, "owned-task-store");
      fs.renameSync(task, stored);
      fs.symlinkSync(
        stored,
        task,
        process.platform === "win32" ? "junction" : "dir",
      );
      const before = snapshot(cwd);
      await expect(
        runWorkflowCommand({
          template: native ? "native" : "native-delivery-v1",
          force: true,
        }),
      ).rejects.toThrow("delivery_migration_required");
      expect(snapshot(cwd)).toEqual(before);
    },
  );

  it("rejects unsupported active profiles before writes while retaining stopped history", async () => {
    await init({ yes: true, codex: true, workflow: "native-delivery-v1" });
    const workflow = path.join(cwd, ".trellis/workflow.md");
    const target = deliveryWorkflowMdTemplate.replace(
      '"profiles": ["local_commit", "manual", "pull_request"]',
      '"profiles": ["pull_request"]',
    );
    fs.writeFileSync(workflow, target);
    const before = snapshot(cwd);
    await expect(init({ yes: true, codex: true, force: true })).rejects.toThrow(
      "unsupported_delivery_profile",
    );
    expect(snapshot(cwd)).toEqual(before);
    const recordPath = path.join(
      cwd,
      ".trellis/tasks/00-bootstrap-guidelines/task.json",
    );
    const record = parseTaskRecordV2(
      JSON.parse(fs.readFileSync(recordPath, "utf8")),
    );
    const contract = readDeliveryWorkflowContract(deliveryWorkflowMdTemplate);
    if (!contract || !record.accepted_scope)
      throw new Error("Missing native bootstrap contract/scope");
    const stopped = applyTaskOperation(
      record,
      {
        api_version: "1.0",
        operation: "stop",
        owner_role: "planning",
        owner_id: contract.owners.planning,
        key: {
          task_id: record.id,
          lifecycle_generation: record.lifecycle_generation,
          delivery_id: record.deliveries[0].id,
        },
        expected_phase: "planning",
        result: {
          result_id: "stop-bootstrap",
          owner_id: contract.owners.planning,
          evidence: [record.accepted_scope],
          reason: record.accepted_scope,
          scope_decision: record.accepted_scope,
        },
      },
      contract,
    ).record;
    fs.writeFileSync(recordPath, JSON.stringify(stopped));
    const history = snapshot(cwd);
    expect(() =>
      preflightDeliveryWorkflow(cwd, target, { installingRuntime: true }),
    ).not.toThrow();
    expect(snapshot(cwd)).toEqual(history);
  });

  it("diagnoses non-forced reinit workflow selection before any writes", async () => {
    await init({ yes: true, codex: true, workflow: "native" });
    const task = path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines");
    const archive = path.join(cwd, ".trellis/tasks/archive/history");
    fs.mkdirSync(path.dirname(archive), { recursive: true });
    fs.renameSync(task, archive);
    const before = snapshot(cwd);
    await expect(
      init({ yes: true, codex: true, workflow: "native-delivery-v1" }),
    ).rejects.toThrow("workflow_activation_required");
    expect(snapshot(cwd)).toEqual(before);
  });

  it("leaves custom v2 bootstrap scope/profile judgment with the declared owner", async () => {
    await init({ yes: true, codex: true, workflow: "native-delivery-v1" });
    const task = path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines");
    fs.rmSync(task, { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".trellis/workflow.md"),
      deliveryWorkflowMdTemplate
        .replace(
          '"profiles": ["local_commit", "manual", "pull_request"]',
          '"profiles": ["local_commit"]',
        )
        .replaceAll("trellis-start", "custom-scope-owner"),
    );
    await init({ yes: true, codex: true });
    const record = parseTaskRecordV2(
      JSON.parse(fs.readFileSync(path.join(task, "task.json"), "utf8")),
    );
    expect(record.accepted_scope).toBeNull();
    expect(record.deliveries).toEqual([]);
  });

  it("#6 rejects duplicate, unsupported and missing role declarations without fallback", () => {
    expect(() =>
      readDeliveryWorkflowContract(
        deliveryWorkflowMdTemplate + deliveryWorkflowMdTemplate,
      ),
    ).toThrow("invalid_runtime_contract");
    expect(() =>
      readDeliveryWorkflowContract(
        deliveryWorkflowMdTemplate.replace(
          '"delivery_api": "1.0"',
          '"delivery_api": "9.0"',
        ),
      ),
    ).toThrow("unsupported_runtime_contract");
    expect(() =>
      readDeliveryWorkflowContract(
        deliveryWorkflowMdTemplate.replace('"creation": "trellis-start",', ""),
      ),
    ).toThrow("invalid_runtime_contract");
  });

  it("#7 exposes formal native owners through every declared platform collector", () => {
    for (const id of PLATFORM_IDS) {
      const templates =
        collectPlatformTemplates(id) ?? new Map<string, string>();
      const contents = [...templates.values()].join("\n");
      expect(contents, id).toContain("# Review Delivery");
      expect(contents, id).toContain("# Deliver Selected Slice");
      expect(contents, id).toContain("# Complete Whole Task");
      expect(contents, id).toContain("active workflow");
      const checkCarriers = [...templates].filter(([name]) =>
        /trellis-check\.(md|toml|json)$/.test(name),
      );
      const implementCarriers = [...templates].filter(([name]) =>
        /trellis-implement\.(md|toml|json)$/.test(name),
      );
      for (const [name, content] of checkCarriers) {
        expect(content, `${id}:${name}`).toContain("delivery_review");
        expect(content, `${id}:${name}`).toContain("read-only");
        expect(content, `${id}:${name}`).toContain(
          "Root design/implement or manifests are not replacement Delivery planning.",
        );
        expect(content, `${id}:${name}`).toContain(
          "Never infer selection from inventory or substitute root planning.",
        );
        expect(content, `${id}:${name}`).toContain("validated planning_root");
      }
      for (const [name, content] of implementCarriers) {
        expect(content, `${id}:${name}`).toContain("DeliveryKey/planning_root");
        expect(content, `${id}:${name}`).toContain("Never infer selection");
      }
      if (id === "droid") {
        expect(checkCarriers.map(([name]) => name)).toContain(
          ".factory/droids/trellis-check.md",
        );
        expect(implementCarriers.map(([name]) => name)).toContain(
          ".factory/droids/trellis-implement.md",
        );
      }
    }
  });
});
