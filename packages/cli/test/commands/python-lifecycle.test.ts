import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));
import {
  collectTemplateFiles,
  collectProspectiveTemplateFiles,
} from "../../src/commands/update.js";
import { preflightDeliveryWorkflow } from "../../src/utils/delivery-workflow.js";
import {
  pythonInvocation,
  resolveSupportedPython,
} from "../../src/utils/python.js";
import {
  resetResolvedPythonCommand,
  setResolvedPythonCommand,
} from "../../src/configurators/shared.js";
import { deliveryWorkflowMdTemplate } from "../../src/templates/trellis/index.js";
import { VERSION } from "../../src/constants/version.js";
import { validateToolsInstallation } from "../../src/commands/maintenance/tools.js";
import type { PreparedMaintenancePlan } from "../../src/commands/maintenance/shared.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-python-lifecycle-"));
  fs.mkdirSync(path.join(root, ".trellis"));
  fs.mkdirSync(path.join(root, ".codex"));
  fs.writeFileSync(
    path.join(root, ".trellis/.template-hashes.json"),
    JSON.stringify({
      __version: 2,
      hashes: { ".codex/config.toml": "tracked" },
    }),
  );
  fs.writeFileSync(path.join(root, ".trellis/.version"), VERSION);
  resetResolvedPythonCommand();
  vi.mocked(execSync).mockReset();
  vi.mocked(spawnSync).mockReset();
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  resetResolvedPythonCommand();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("operation-scoped Python selection", () => {
  it("renders direct prospective collection using the current override, replacing stale process state", async () => {
    setResolvedPythonCommand("python");
    vi.stubEnv("TRELLIS_PYTHON_CMD", "py -3");
    const files = await collectProspectiveTemplateFiles(root, {
      registrySpecs: false,
    });
    expect(files.get(".codex/hooks.json")).toContain("py -3 -X utf8");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("resolves before update's installed native preflight and renders the same choice", async () => {
    vi.stubEnv("TRELLIS_PYTHON_CMD", "py -3");
    fs.writeFileSync(
      path.join(root, ".trellis/workflow.md"),
      deliveryWorkflowMdTemplate,
    );
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '{"delivery_api":"1.0","task_schema":"2.0"}',
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
    });
    const files = await collectTemplateFiles(root, { registrySpecs: false });
    expect(spawnSync).toHaveBeenCalledWith(
      "py",
      [
        "-3",
        path.join(root, ".trellis/scripts/delivery.py"),
        "contract",
        "--json",
      ],
      expect.any(Object),
    );
    expect(files.get(".codex/hooks.json")).toContain("py -3 -X utf8");
  });

  it("rejects failed automatic detection before native preflight", async () => {
    vi.stubEnv("TRELLIS_PYTHON_CMD", "");
    vi.stubEnv("TRELLIS_SKIP_PYTHON_CHECK", "");
    fs.writeFileSync(
      path.join(root, ".trellis/workflow.md"),
      deliveryWorkflowMdTemplate,
    );
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    await expect(collectTemplateFiles(root)).rejects.toThrow(
      "No supported Python command found",
    );
    expect(spawnSync).not.toHaveBeenCalled();
    expect(fs.readdirSync(path.join(root, ".trellis")).sort()).toEqual([
      ".template-hashes.json",
      ".version",
      "workflow.md",
    ]);
  });

  it("skip-check chooses the platform default instead of a previous operation's override", () => {
    setResolvedPythonCommand("py -3.12");
    vi.stubEnv("TRELLIS_PYTHON_CMD", "");
    vi.stubEnv("TRELLIS_SKIP_PYTHON_CHECK", "1");
    expect(resolveSupportedPython().command).toBe(
      process.platform === "win32" ? "python" : "python3",
    );
    expect(execSync).not.toHaveBeenCalled();
  });

  it("uses launcher prefix arguments in both standalone tools postvalidation calls", () => {
    vi.stubEnv("TRELLIS_PYTHON_CMD", "py -3");
    fs.writeFileSync(path.join(root, ".trellis/workflow.md"), "# legacy");
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '{"delivery_api":"1.0","task_schema":"2.0"}',
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
    });
    validateToolsInstallation({
      kind: "tools_install",
      target_root: root,
    } as PreparedMaintenancePlan);
    expect(
      vi
        .mocked(spawnSync)
        .mock.calls.map(([executable, args]) => [executable, args]),
    ).toEqual([
      [
        "py",
        [
          "-3",
          path.join(root, ".trellis/scripts/delivery.py"),
          "contract",
          "--json",
        ],
      ],
      [
        "py",
        ["-3", path.join(root, ".trellis/scripts/get_context.py"), "--json"],
      ],
    ]);
  });

  it("keeps quoted Windows executable paths intact without treating launcher arguments as executable text", () => {
    expect(
      pythonInvocation('"C:\\Program Files\\Python\\python.exe" -X utf8'),
    ).toEqual({
      executable: "C:\\Program Files\\Python\\python.exe",
      args: ["-X", "utf8"],
    });
    expect(() => pythonInvocation('"python')).toThrow("unterminated quote");
  });

  it("retains native preflight errors when a correctly split launcher fails", () => {
    setResolvedPythonCommand("py -3");
    fs.writeFileSync(
      path.join(root, ".trellis/workflow.md"),
      deliveryWorkflowMdTemplate,
    );
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "launcher failed",
      pid: 1,
      output: [],
      signal: null,
    });
    expect(() =>
      preflightDeliveryWorkflow(root, deliveryWorkflowMdTemplate),
    ).toThrow("unsupported_delivery_install");
  });
});
