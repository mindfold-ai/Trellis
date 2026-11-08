import { z } from "zod";

const relative = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes("\0") &&
      !/^[A-Za-z]:/.test(value) &&
      value
        .split("/")
        .every((part) => part !== "" && part !== "." && part !== ".."),
    "Expected contained POSIX relative path",
  );
const mode = z.number().int().min(0).max(0o777);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const rawSnapshotSchema = z
  .object({ content_base64: z.string(), sha256: sha, mode })
  .strict();
const preservedTaskArtifactSnapshotSchema = z
  .object({ sha256: sha, mode })
  .strict();
const projectTarget = z
  .object({
    kind: z.literal("project"),
    workspace: z.string().min(1),
    path: relative,
  })
  .strict();
const sessionTarget = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("common_session"),
      filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal("local_session"),
      workspace: z.string().min(1),
      filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/),
    })
    .strict(),
]);
export const migrationPlan2Schema = z
  .object({
    schema_version: z.literal("2.0"),
    source: z
      .object({
        version: z.string().min(1),
        task_schema: z.enum(["legacy", "1.0", "mixed"]),
        delivery_api: z.null(),
      })
      .strict(),
    target: z
      .object({
        version: z.string().min(1),
        task_schema: z.literal("2.0"),
        delivery_api: z.literal("1.0"),
      })
      .strict(),
    workspaces: z
      .array(
        z
          .object({
            id: z.string().min(1),
            root: z.string().min(1),
            project_relative: relative.nullable(),
          })
          .strict(),
      )
      .min(1),
    installations: z.array(
      z
        .object({
          workspace: z.string().min(1),
          version_source: rawSnapshotSchema,
          receipt_source: rawSnapshotSchema.nullable(),
        })
        .strict(),
    ),
    tasks: z.array(
      z
        .object({
          workspace: z.string().min(1),
          task_ref: relative,
          disposition: z.enum([
            "convert_active",
            "convert_archive",
            "current",
            "defer",
            "history_only",
          ]),
          source: rawSnapshotSchema.nullable(),
          source_task_schema: z.enum(["legacy", "1.0", "2.0"]).optional(),
          record: z.unknown().optional(),
          legacy_facts: z
            .array(
              z.discriminatedUnion("disposition", [
                z
                  .object({
                    field: z.enum(["commit", "pr_url", "completedAt"]),
                    disposition: z.literal("source_snapshot"),
                    owner_id: z.string().min(1),
                    reason: z
                      .object({
                        locator: z.string().min(1),
                        revision: z.string().min(1),
                      })
                      .strict(),
                  })
                  .strict(),
                z
                  .object({
                    field: z.enum(["commit", "pr_url"]),
                    disposition: z.literal("result"),
                    owner_id: z.string().min(1),
                    reason: z
                      .object({
                        locator: z.string().min(1),
                        revision: z.string().min(1),
                      })
                      .strict(),
                    result_id: z.string().min(1),
                  })
                  .strict(),
              ]),
            )
            .optional(),
        })
        .strict()
        .refine(
          (task) => task.source !== null || task.disposition === "history_only",
          "Only missing-record history-only roots may have a null source",
        ),
    ),
    branch_bindings: z
      .array(
        z
          .object({
            task_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
            lifecycle_generation: z.number().int().nonnegative().safe(),
            source: rawSnapshotSchema,
          })
          .strict(),
      )
      .optional(),
    sessions: z.array(
      z
        .object({
          target: sessionTarget,
          source: rawSnapshotSchema,
          record: z.unknown().optional(),
        })
        .strict(),
    ),
    workflows: z.array(
      z
        .object({
          workspace: z.string().min(1),
          template_id: z.string().min(1),
          contract: z.unknown(),
        })
        .strict(),
    ),
    templates: z.array(
      z
        .object({
          workspace: z.string().min(1),
          candidate_sha256: sha,
          files: z.array(
            z.object({ path: relative, sha256: sha, mode }).strict(),
          ),
        })
        .strict(),
    ),
    files: z.array(
      z
        .object({
          target: projectTarget,
          owner: z.enum(["template", "workflow", "artifact", "preserve"]),
          action: z.enum(["write", "preserve", "remove"]),
          source: z
            .union([rawSnapshotSchema, preservedTaskArtifactSnapshotSchema])
            .nullable(),
          target_content_base64: z.string().optional(),
          target_mode: mode.optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((plan, context) => {
    for (const [index, task] of plan.tasks.entries()) {
      const requiresSelector =
        plan.source.task_schema === "mixed" &&
        ["convert_active", "convert_archive", "defer"].includes(
          task.disposition,
        );
      if (requiresSelector && task.source_task_schema === undefined)
        context.addIssue({
          code: "custom",
          path: ["tasks", index, "source_task_schema"],
          message: "Mixed predecessor disposition requires source_task_schema",
        });
      else if (
        task.source_task_schema === "2.0" &&
        task.disposition !== "defer"
      )
        context.addIssue({
          code: "custom",
          path: ["tasks", index, "source_task_schema"],
          message: "Current Task schema selector is only valid for defer",
        });
      else if (!requiresSelector && task.source_task_schema !== undefined)
        context.addIssue({
          code: "custom",
          path: ["tasks", index, "source_task_schema"],
          message:
            "source_task_schema is forbidden for this source mode/disposition",
        });
    }
    for (const [index, file] of plan.files.entries()) {
      if (
        file.source !== null &&
        !("content_base64" in file.source) &&
        !(
          file.owner === "preserve" &&
          file.action === "preserve" &&
          file.target.path.startsWith(".trellis/tasks/")
        )
      )
        context.addIssue({
          code: "custom",
          path: ["files", index, "source"],
          message:
            "Content-free snapshots are limited to preserved Task artifacts",
        });
    }
  });
export type MigrationPlan2 = z.infer<typeof migrationPlan2Schema>;
export type RawSnapshot = z.infer<typeof rawSnapshotSchema>;
export type PreservedTaskArtifactSnapshot = z.infer<
  typeof preservedTaskArtifactSnapshotSchema
>;
