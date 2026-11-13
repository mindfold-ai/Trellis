import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
import { PATHS } from "../../src/constants/paths.js";
import { loadHashes } from "../../src/utils/template-hash.js";
import { readDeliveryWorkflowContract } from "../../src/utils/delivery-workflow.js";
import { replacePythonCommandLiterals } from "../../src/configurators/shared.js";
import { parseTaskRecordV2 } from "@mindfoldhq/trellis-core/task/v2";
import {
  deliveryWorkflowMdTemplate,
  workflowMdTemplate,
} from "../../src/templates/trellis/index.js";

const CUSTOM_CONTINUATION = "CUSTOM-WORKFLOW-OWNER-CONTINUATION\n";
const CUSTOM_LEGACY = [
  "# User-owned legacy workflow",
  "## Phase Index",
  "Custom owner plans and implements this project.",
  "[trellis-continuation]",
  CUSTOM_CONTINUATION.trimEnd(),
  "[/trellis-continuation]",
  "",
].join("\n");
const CUSTOM_DELIVERY = deliveryWorkflowMdTemplate
  .replace(/"trellis-([a-z-]+)"/g, '"custom-$1"')
  .replace(
    /^\[trellis-continuation\]\n[\s\S]*?^\[\/trellis-continuation\]/m,
    `[trellis-continuation]\n${CUSTOM_CONTINUATION}[/trellis-continuation]`,
  );

const WORKFLOWS = [
  {
    name: "legacy",
    content: CUSTOM_LEGACY,
    bundledId: "native",
    bundled: workflowMdTemplate,
  },
  {
    name: "Delivery v2",
    content: CUSTOM_DELIVERY,
    bundledId: "native-delivery-v1",
    bundled: deliveryWorkflowMdTemplate,
  },
];

describe("user-managed workflow ownership across reinit and update", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-custom-reinit-"));
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  async function installCustom(content: string): Promise<void> {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("/index.json")) {
          return new Response(
            JSON.stringify({
              version: 1,
              templates: [
                {
                  id: "custom",
                  type: "workflow",
                  name: "Custom",
                  path: "workflows/custom/workflow.md",
                },
              ],
            }),
          );
        }
        return new Response(content);
      }),
    );
    await init({
      yes: true,
      workflow: "custom",
      workflowSource: "gh:example/workflows",
    });
  }

  function assertCustomPreserved(content: string): void {
    const written = fs.readFileSync(
      path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE),
      "utf8",
    );
    expect(written).toBe(replacePythonCommandLiterals(content));
    expect(loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE]).toBeUndefined();
    const contract = readDeliveryWorkflowContract(content);
    expect(readDeliveryWorkflowContract(written)?.owners).toEqual(
      contract?.owners,
    );
    const python = process.platform === "win32" ? "python" : "python3";
    const projection = spawnSync(
      python,
      [
        "-B",
        path.join(cwd, ".trellis/scripts/get_context.py"),
        "--mode",
        "continuation",
      ],
      { cwd, encoding: "utf8" },
    );
    expect(projection.status, projection.stderr).toBe(0);
    expect(projection.stdout).toBe(CUSTOM_CONTINUATION);
    if (contract) {
      const runtime = spawnSync(
        python,
        [
          "-B",
          path.join(cwd, ".trellis/scripts/get_context.py"),
          "--mode",
          "runtime-contract",
        ],
        { cwd, encoding: "utf8" },
      );
      expect(runtime.status, runtime.stderr).toBe(0);
      expect(JSON.parse(runtime.stdout)).toEqual(contract);
    }
  }

  function readBootstrapTask() {
    return parseTaskRecordV2(
      JSON.parse(
        fs.readFileSync(
          path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines/task.json"),
          "utf8",
        ),
      ),
    );
  }

  // Only remove this test's bootstrap to exercise the empty-task recovery
  // path. Ordinary reinit must retain an existing Task instead of replacing it.
  function removeBootstrapFixture(): void {
    fs.rmSync(path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines"), {
      recursive: true,
    });
  }

  function assertTaskOnlyBootstrap(): void {
    const task = readBootstrapTask();
    expect(task.accepted_scope).toBeNull();
    expect(task.deliveries).toEqual([]);
    expect(task.completion_results).toEqual([]);
    expect(task.closure_results).toEqual([]);
    const prd = fs.readFileSync(
      path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines/prd.md"),
      "utf8",
    );
    expect(prd).toContain("active workflow's declared");
    expect(prd).toContain("planning_root");
    expect(prd).toContain("Closure");
    expect(prd).not.toContain("./.trellis/scripts/task.py finish");
    expect(
      fs.existsSync(
        path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines/deliveries"),
      ),
    ).toBe(false);
    const written = fs.readFileSync(
      path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE),
      "utf8",
    );
    expect(written).toBe(
      replacePythonCommandLiterals(deliveryWorkflowMdTemplate),
    );
    expect(readDeliveryWorkflowContract(written)).toEqual(
      readDeliveryWorkflowContract(deliveryWorkflowMdTemplate),
    );
    expect(loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE]).toBeUndefined();
  }

  it.each([{}, { force: true }, { skipExisting: true }])(
    "preserves managed legacy bytes, receipt ownership and Task on implicit reinit (%j)",
    async (options) => {
      await init({ yes: true, workflow: "native" });
      const target = path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE);
      const originalReceipt = loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE];
      // A retained managed legacy workflow is actual installed authority,
      // including local edits; default selection must not overwrite it.
      const content = `${replacePythonCommandLiterals(workflowMdTemplate)}\nLEGACY LOCAL EDIT\npython3 .trellis/scripts/task.py current\n`;
      fs.writeFileSync(target, content);
      fs.chmodSync(target, 0o640);
      const mode = fs.statSync(target).mode;
      vi.stubEnv("TRELLIS_PYTHON_CMD", "python");
      const taskPath = path.join(
        cwd,
        ".trellis/tasks/00-bootstrap-guidelines/task.json",
      );
      const taskBytes = fs.readFileSync(taskPath, "utf8");
      await init({ yes: true, ...options });
      expect(fs.readFileSync(target, "utf8")).toBe(content);
      expect(fs.statSync(target).mode).toBe(mode);
      expect(loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE]).toBe(originalReceipt);
      expect(fs.readFileSync(taskPath, "utf8")).toBe(taskBytes);
      expect(JSON.parse(taskBytes)).toMatchObject({ status: "in_progress" });
    },
  );

  it.each(["native", "native-delivery-v1"])(
    "preserves the original %s workflow receipt so update still detects local edits",
    async (bundledId) => {
      await init({ yes: true, workflow: bundledId });
      const target = path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE);
      const originalReceipt = loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE];
      const content = `${fs.readFileSync(target, "utf8")}\nRETAIN LOCAL WORKFLOW EDIT\n`;
      fs.writeFileSync(target, content);
      for (const options of [{ force: true }, { skipExisting: true }]) {
        await init({ yes: true, ...options });
        expect(loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE]).toBe(
          originalReceipt,
        );
      }
      await update({ skipAll: true });
      expect(fs.readFileSync(target, "utf8")).toBe(content);
      expect(loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE]).toBe(originalReceipt);
    },
  );

  it.each(WORKFLOWS)(
    "preserves raw custom $name bytes on implicit forced reinit",
    async ({ content }) => {
      await installCustom(content);
      const target = path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE);
      const retained = `${fs.readFileSync(target, "utf8")}\npython3 .trellis/scripts/task.py current\n`;
      fs.writeFileSync(target, retained);
      fs.chmodSync(target, 0o640);
      const mode = fs.statSync(target).mode;
      vi.stubEnv("TRELLIS_PYTHON_CMD", "python");
      await init({ yes: true, force: true });
      expect(fs.readFileSync(target, "utf8")).toBe(retained);
      expect(fs.statSync(target).mode).toBe(mode);
      expect(loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE]).toBeUndefined();
    },
  );

  it("refuses implicit reinit when the installed workflow is missing before writing", async () => {
    await init({ yes: true, workflow: "native" });
    const target = path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE);
    const taskFile = path.join(
      cwd,
      ".trellis/tasks/00-bootstrap-guidelines/task.json",
    );
    const hashFile = path.join(cwd, ".trellis/.template-hashes.json");
    const taskBytes = fs.readFileSync(taskFile);
    const hashBytes = fs.readFileSync(hashFile);
    fs.unlinkSync(target);
    await expect(init({ yes: true, force: true })).rejects.toThrow(/ENOENT/);
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(taskFile)).toEqual(taskBytes);
    expect(fs.readFileSync(hashFile)).toEqual(hashBytes);
  });

  it("keeps a byte-identical custom native copy Task-only on fresh init", async () => {
    await installCustom(deliveryWorkflowMdTemplate);
    assertTaskOnlyBootstrap();
    const taskBytes = fs.readFileSync(
      path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines/task.json"),
      "utf8",
    );
    await init({ yes: true, force: true });
    assertTaskOnlyBootstrap();
    expect(
      fs.readFileSync(
        path.join(cwd, ".trellis/tasks/00-bootstrap-guidelines/task.json"),
        "utf8",
      ),
    ).toBe(taskBytes);
  });

  it.each([
    {
      name: "explicit custom forced reinit",
      options: {
        force: true,
        workflow: "custom",
        workflowSource: "gh:example/workflows",
      },
    },
    { name: "retained custom forced reinit", options: { force: true } },
    { name: "retained custom empty-task recovery", options: {} },
    {
      name: "retained custom skip-existing recovery",
      options: { skipExisting: true },
    },
  ])("keeps byte-identical $name Task-only", async ({ options }) => {
    await installCustom(deliveryWorkflowMdTemplate);
    removeBootstrapFixture();
    await init({ yes: true, ...options });
    assertTaskOnlyBootstrap();
  });

  it("allows an explicit forced bundled transfer to choose native bootstrap policy", async () => {
    await installCustom(deliveryWorkflowMdTemplate);
    removeBootstrapFixture();
    await init({ yes: true, force: true, workflow: "native-delivery-v1" });
    const task = readBootstrapTask();
    expect(task.accepted_scope).not.toBeNull();
    expect(task.deliveries).toHaveLength(1);
    expect(task.deliveries[0]).toMatchObject({
      profile: "manual",
      phase: "planning",
      results: {
        planning: null,
        check: null,
        full_review: null,
        readiness: null,
      },
    });
    expect(loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE]).toBeDefined();
  });

  it("retains bundled native bootstrap policy on empty-task reinit", async () => {
    await init({ yes: true, workflow: "native-delivery-v1" });
    removeBootstrapFixture();
    await init({ yes: true });
    const task = readBootstrapTask();
    expect(task.accepted_scope).not.toBeNull();
    expect(task.deliveries).toHaveLength(1);
    expect(task.deliveries[0]).toMatchObject({
      phase: "planning",
      results: {
        planning: null,
        check: null,
        full_review: null,
        readiness: null,
      },
    });
    expect(loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE]).toBeDefined();
  });

  it.each(WORKFLOWS)(
    "preserves custom $name through forced reinit and normal/forced update",
    async ({ content }) => {
      await installCustom(content);
      assertCustomPreserved(content);
      await init({ yes: true, force: true });
      assertCustomPreserved(content);
      await update({});
      assertCustomPreserved(content);
      await update({ force: true });
      assertCustomPreserved(content);
    },
  );

  it.each(WORKFLOWS)(
    "preserves custom $name through add-platform reinit and update",
    async ({ content }) => {
      await installCustom(content);
      await init({ yes: true, cursor: true });
      expect(fs.existsSync(path.join(cwd, ".cursor"))).toBe(true);
      assertCustomPreserved(content);
      await update({ force: true });
      assertCustomPreserved(content);
    },
  );

  it.each(WORKFLOWS)(
    "explicit forced --workflow transfers custom $name to the bundled owner",
    async ({ content, bundledId, bundled }) => {
      await installCustom(content);
      await init({ yes: true, force: true, workflow: bundledId });
      const written = fs.readFileSync(
        path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE),
        "utf8",
      );
      expect(written).toBe(replacePythonCommandLiterals(bundled));
      expect(loadHashes(cwd)[PATHS.WORKFLOW_GUIDE_FILE]).toBeDefined();
      await update({ force: true });
      expect(
        fs.readFileSync(path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE), "utf8"),
      ).toBe(written);
    },
  );
});
