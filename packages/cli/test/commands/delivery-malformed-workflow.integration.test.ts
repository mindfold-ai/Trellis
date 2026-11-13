import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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
import { readDeliveryWorkflowContract } from "../../src/utils/delivery-workflow.js";
import { deliveryWorkflowMdTemplate } from "../../src/templates/trellis/index.js";

let root: string;
function snapshot(): Map<string, string> {
  const result = new Map<string, string>();
  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else
        result.set(
          full,
          `${fs.readFileSync(full).toString("base64")}:${fs.statSync(full).mode & 0o777}`,
        );
    }
  }
  walk(root);
  return result;
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-malformed-contract-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([
  ["init", () => init({ yes: true, codex: true, force: true })],
  ["update", () => update({ force: true })],
  ["workflow", () => runWorkflowCommand({ template: "native", force: true })],
] as const)(
  "rejects malformed installed declaration before %s writes",
  async (_entry, invoke) => {
    await init({ yes: true, codex: true, workflow: "native-delivery-v1" });
    const workflow = path.join(root, ".trellis/workflow.md");
    fs.writeFileSync(
      workflow,
      deliveryWorkflowMdTemplate.replaceAll(
        "trellis-runtime-contract]",
        "trellis-runtime-contract v1]",
      ),
    );
    const python = process.platform === "win32" ? "python" : "python3";
    const projection = spawnSync(
      python,
      [
        "-B",
        path.join(root, ".trellis/scripts/get_context.py"),
        "--mode",
        "runtime-contract",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(projection.status).not.toBe(0);
    expect(projection.stderr).toContain("invalid_runtime_contract_block");
    const before = snapshot();
    await expect(invoke()).rejects.toThrow("invalid_runtime_contract");
    expect(snapshot()).toEqual(before);
  },
);

it.each([
  "[trellis-runtime-contract v1]\n{}\n[/trellis-runtime-contract v1]",
  " [trellis-runtime-contract\n{}\n [/trellis-runtime-contract",
  "[/trellis-runtime-contract v1]",
  "[trellis-runtime-contract]\n{}",
])(
  "does not interpret malformed marker syntax as a legacy workflow (%s)",
  (content) => {
    expect(() => readDeliveryWorkflowContract(content)).toThrow(
      "invalid_runtime_contract",
    );
  },
);
it("retains declaration-free legacy workflows", () => {
  expect(
    readDeliveryWorkflowContract(
      "# Custom legacy workflow\nNo runtime declaration.",
    ),
  ).toBeNull();
});
