import { isDeepStrictEqual } from "node:util";
import type { TaskRecordV2 } from "./v2/types.js";

/** Shared identity rules; each public operation owns its generation rule. */
export function validateProjectionIdentity(
  source: Record<string, unknown>,
  record: TaskRecordV2,
): void {
  if (!isDeepStrictEqual(source.artifact_origin, record.artifact_origin))
    throw new Error(
      "Migration cannot initialize or change artifact_origin; explicit relocation owns it",
    );
  for (const field of [
    "id",
    "name",
    "title",
    "description",
    "dev_type",
    "scope",
    "package",
    "priority",
    "createdAt",
    "base_branch",
    "branch",
    "worktree_path",
    "parent",
    "relatedFiles",
    "notes",
    "meta",
    "source",
  ] as const) {
    if (field in source && !isDeepStrictEqual(source[field], record[field])) {
      throw new Error(`Migration must preserve task.${field}`);
    }
  }
  for (const field of ["children", "subtasks"] as const) {
    if (!(field in source)) continue;
    const values = source[field];
    if (
      !Array.isArray(values) ||
      values.some(
        (value: unknown) =>
          typeof value !== "string" || !record.children.includes(value),
      )
    )
      throw new Error(`Migration requires lossless task.${field}`);
  }
  if ("children" in source || "subtasks" in source) {
    const relations = [
      ...(Array.isArray(source.children) ? (source.children as string[]) : []),
    ];
    for (const child of Array.isArray(source.subtasks)
      ? (source.subtasks as string[])
      : [])
      if (!relations.includes(child)) relations.push(child);
    if (!isDeepStrictEqual(relations, record.children))
      throw new Error("Migration must preserve the exact task tree");
  }
}
