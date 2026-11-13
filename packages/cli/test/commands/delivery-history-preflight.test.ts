import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { preflightDeliveryWorkflow } from "../../src/utils/delivery-workflow.js";
import {
  deliveryWorkflowMdTemplate,
  workflowMdTemplate,
} from "../../src/templates/trellis/index.js";
import { VERSION } from "../../src/constants/version.js";
let root: string;
function write(name: string, content: string): void {
  const full = path.join(root, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-history-preflight-"));
  write(".trellis/.version", VERSION);
  write(".trellis/workflow.md", deliveryWorkflowMdTemplate);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
it("allows raw historical-only old active identities only after actual v2 installation", () => {
  write(
    ".trellis/tasks/old/task.json",
    '{"id":"old","status":"unknown historical value","custom":"raw snapshot"}',
  );
  const before = fs.readFileSync(
    path.join(root, ".trellis/tasks/old/task.json"),
  );
  expect(() =>
    preflightDeliveryWorkflow(root, deliveryWorkflowMdTemplate, {
      installingRuntime: true,
    }),
  ).not.toThrow();
  expect(
    fs.readFileSync(path.join(root, ".trellis/tasks/old/task.json")),
  ).toEqual(before);
  write(".trellis/workflow.md", workflowMdTemplate);
  expect(() =>
    preflightDeliveryWorkflow(root, deliveryWorkflowMdTemplate, {
      installingRuntime: true,
    }),
  ).toThrow("delivery_migration_required");
});
it.each(['{"status":"completed"}', '{"id":"../bad"}', "[]", "broken JSON"])(
  "refuses malformed historical identity %s",
  (record) => {
    write(".trellis/tasks/old/task.json", record);
    expect(() =>
      preflightDeliveryWorkflow(root, deliveryWorkflowMdTemplate, {
        installingRuntime: true,
      }),
    ).toThrow();
  },
);
it("does not treat duplicate identity or unsupported task schema as history", () => {
  write(".trellis/tasks/one/task.json", '{"id":"same"}');
  write(".trellis/tasks/two/task.json", '{"id":"SAME"}');
  expect(() =>
    preflightDeliveryWorkflow(root, deliveryWorkflowMdTemplate, {
      installingRuntime: true,
    }),
  ).toThrow("identity_collision");
  write(
    ".trellis/tasks/two/task.json",
    '{"id":"other","schema_version":"future"}',
  );
  expect(() =>
    preflightDeliveryWorkflow(root, deliveryWorkflowMdTemplate, {
      installingRuntime: true,
    }),
  ).toThrow("delivery_migration_required");
});
