import fs from "node:fs";
import { Command } from "commander";
import { z } from "zod";
import * as api from "./api.js";
import type { PreparedMaintenancePlan } from "./shared.js";

const read = (file: string): unknown =>
  JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
const envelope = z
  .object({
    kind: z.enum([
      "tools_install",
      "task_conversion",
      "legacy_closeout",
      "task_resume",
      "formal_archive_reactivation",
    ]),
    input: z.unknown(),
  })
  .strict();
async function prepare(file: string): Promise<PreparedMaintenancePlan> {
  const value = envelope.parse(read(file));
  switch (value.kind) {
    case "tools_install":
      return api.prepareToolsInstallation(
        api.parseToolsInstallationInput(value.input),
      );
    case "task_conversion":
      return api.prepareTaskConversion(
        api.parseTaskConversionInput(value.input),
      );
    case "task_resume":
      return api.prepareArchivedTaskResume(
        api.parseArchivedTaskResumeInput(value.input),
      );
    case "formal_archive_reactivation":
      return api.prepareFormalArchiveReactivation(
        api.parseFormalArchiveReactivationInput(value.input),
      );
    case "legacy_closeout":
      return api.prepareLegacyCloseout(
        api.parseLegacyCloseoutInput(value.input),
      );
  }
}
function run(operation: () => unknown | Promise<unknown>): Promise<void> {
  return Promise.resolve()
    .then(operation)
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error: unknown) => {
      console.log(
        JSON.stringify({
          error: {
            code:
              error instanceof api.MaintenanceError
                ? error.code
                : "invalid_maintenance_request",
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      );
      process.exitCode = 1;
    });
}
export function registerMaintenanceCommand(program: Command): void {
  const group = program
    .command("maintain")
    .description(
      "Explicit single-checkout tools and selected-task maintenance",
    );
  const json = (command: Command): Command =>
    command.option("--json", "Output one JSON document (also the default)");
  json(
    group
      .command("contract")
      .description("Inspect executing CLI/Core maintenance capability"),
  ).action(() => run(() => api.getMaintenanceContract()));
  json(
    group
      .command("inspect-tools")
      .requiredOption("--target <root>", "Exact existing checkout"),
  ).action((options: { target: string }) =>
    run(() => api.inspectToolsTarget({ root: options.target })),
  );
  json(
    group
      .command("inspect-task")
      .requiredOption("--target <root>", "Exact existing checkout")
      .option("--task-id <id>", "Expected TaskId (with --generation)")
      .option("--generation <number>", "Expected generation (with --task-id)")
      .requiredOption(
        "--task-ref <ref>",
        "Selected project-relative Task directory",
      )
      .option(
        "--original-task-ref <ref>",
        "Reviewed original active path of selected archive",
      ),
  ).action(
    (options: {
      target: string;
      taskId?: string;
      generation?: string;
      taskRef: string;
      originalTaskRef?: string;
    }) =>
      run(() => {
        if (
          (options.taskId === undefined) !==
          (options.generation === undefined)
        )
          throw new api.MaintenanceError(
            "invalid_input",
            "--task-id and --generation must be supplied together or both omitted",
          );
        const generation =
          options.generation === undefined
            ? undefined
            : Number(options.generation);
        if (
          generation !== undefined &&
          (!Number.isSafeInteger(generation) || generation < 0)
        )
          throw new api.MaintenanceError(
            "invalid_generation",
            "Generation must be a nonnegative integer",
          );
        return api.inspectTaskTarget({
          root: options.target,
          ...(options.taskId !== undefined && generation !== undefined
            ? {
                key: {
                  task_id: options.taskId,
                  lifecycle_generation: generation,
                },
              }
            : {}),
          task_ref: options.taskRef,
          ...(options.originalTaskRef
            ? { original_task_ref: options.originalTaskRef }
            : {}),
        });
      }),
  );
  json(
    group
      .command("inspect-formal-archive")
      .requiredOption("--input <file>", "Selected formal archive facts"),
  ).action((options: { input: string }) =>
    run(() =>
      api.inspectFormalArchiveReactivation(
        read(options.input) as api.InspectFormalArchiveReactivationInput,
      ),
    ),
  );
  json(
    group
      .command("prepare")
      .requiredOption("--input <file>", "Reviewed operation input envelope"),
  ).action((options: { input: string }) => run(() => prepare(options.input)));
  json(
    group
      .command("preview")
      .requiredOption("--plan <file>", "Frozen private operation plan"),
  ).action((options: { plan: string }) =>
    run(() =>
      api.previewMaintenance(read(options.plan) as PreparedMaintenancePlan),
    ),
  );
  json(
    group
      .command("apply")
      .requiredOption("--plan <file>", "Frozen private operation plan")
      .requiredOption(
        "--state-dir <directory>",
        "External or ignored recovery directory",
      ),
  ).action((options: { plan: string; stateDir: string }) =>
    run(() =>
      api.applyMaintenance(read(options.plan) as PreparedMaintenancePlan, {
        state_dir: options.stateDir,
      }),
    ),
  );
  for (const [name, operation] of [
    ["recover", api.recoverMaintenance],
    ["resume", api.resumeMaintenance],
    ["rollback", api.rollbackMaintenance],
  ] as const) {
    json(
      group
        .command(name)
        .requiredOption(
          "--recovery <file>",
          "Original operation recovery reference",
        ),
    ).action((options: { recovery: string }) =>
      run(() => operation({ recovery_ref: options.recovery })),
    );
  }
}
