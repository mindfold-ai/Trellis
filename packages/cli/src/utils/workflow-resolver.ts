/**
 * Workflow template resolver.
 *
 * Centralizes how `trellis init --workflow` and `trellis workflow` discover and
 * fetch workflow.md content. Reuses `template-fetcher` helpers for registry
 * parsing, index probing, and git/http transport. The `native` workflow is a
 * virtual entry resolved directly from the bundled `workflowMdTemplate` to
 * avoid a duplicate file on disk that could drift out of sync.
 *
 * Boundary: command-layer callers (init.ts, commands/workflow.ts) should NOT
 * touch raw marketplace structures. They go through `resolveWorkflowTemplate`
 * and `listWorkflowTemplates` only.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { workflowMdTemplate } from "../templates/trellis/index.js";
import { hasRetiredInstructions } from "../migrations/retirement.js";
import {
  TIMEOUTS,
  TEMPLATE_INDEX_URL,
  RegistryBackendError,
  parseRegistrySource,
  probeRegistryIndex,
  type RegistryBackend,
  type RegistrySource,
  type SpecTemplate,
} from "./template-fetcher.js";

/**
 * The id used to refer to the bundled native workflow.
 *
 * Treated as Trellis-managed for hash-tracking: when this id is selected by
 * `init --workflow` or `trellis workflow`, `.trellis/workflow.md` stays in
 * `.template-hashes.json`. Any other id is user-managed local workflow and
 * must be removed from the hash file (the durable-state contract in
 * design.md "Durable-state contract").
 */
export const NATIVE_WORKFLOW_ID = "native";

/**
 * Resolved workflow template entry.
 *
 * `content` is the workflow.md body bytes (LF-normalized in storage).
 * `path` is the marketplace-relative path for remote entries, or
 *   `bundled:trellis/workflow.md` for the native virtual entry.
 */
export interface ResolvedWorkflowTemplate {
  id: string;
  type: "workflow";
  name: string;
  description?: string;
  path: string;
  content: string;
  /** Where the content came from (for error messages). */
  source: "bundled" | "marketplace";
}

/**
 * Workflow template listing (metadata only, no content).
 */
export interface WorkflowTemplateListing {
  id: string;
  type: "workflow";
  name: string;
  description?: string;
  path: string;
  source: "bundled" | "marketplace";
}

export interface WorkflowResolveOptions {
  /**
   * Optional marketplace source (giget-style or HTTPS URL).
   * Omitted = use the default marketplace via TEMPLATE_INDEX_URL.
   */
  source?: string;
}

export class WorkflowResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowResolveError";
  }
}

/**
 * Bundled native workflow entry — virtual, resolved without network access.
 */
function nativeListingEntry(): WorkflowTemplateListing {
  return {
    id: NATIVE_WORKFLOW_ID,
    type: "workflow",
    name: "Native Trellis Workflow",
    description:
      "Default Trellis Plan / Execute / Finish workflow bundled with the CLI",
    path: "bundled:trellis/workflow.md",
    source: "bundled",
  };
}

function nativeResolvedEntry(): ResolvedWorkflowTemplate {
  return {
    ...nativeListingEntry(),
    content: workflowMdTemplate,
  };
}

function parseSourceOrThrow(source: string): RegistrySource {
  try {
    return parseRegistrySource(source);
  } catch (err) {
    throw new WorkflowResolveError(
      `Invalid workflow marketplace source "${source}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

async function fetchWorkflowEntries(
  registry: RegistrySource | undefined,
  indexUrl: string,
): Promise<{
  templates: SpecTemplate[];
  backend?: RegistryBackend;
  errorMessage?: string;
}> {
  const probe = await probeRegistryIndex(indexUrl, registry);
  if (probe.error) {
    return {
      templates: [],
      backend: probe.backend,
      errorMessage: probe.error.message,
    };
  }
  if (probe.isNotFound) {
    return {
      templates: [],
      backend: probe.backend,
      errorMessage:
        "No marketplace index.json found at the configured source. Workflow templates require an index.json.",
    };
  }
  return { templates: probe.templates, backend: probe.backend };
}

/**
 * List available workflow templates from the default marketplace (or a
 * user-supplied source). The bundled native entry is always included first.
 *
 * Returns metadata only — no content is fetched. Use `resolveWorkflowTemplate`
 * to fetch the actual workflow.md bytes for a chosen id.
 *
 * Network errors are surfaced as `errorMessage`. The native entry is still
 * returned so callers can fall back to it offline.
 */
export async function listWorkflowTemplates(
  options: WorkflowResolveOptions = {},
): Promise<{
  templates: WorkflowTemplateListing[];
  errorMessage?: string;
}> {
  const result: WorkflowTemplateListing[] = [nativeListingEntry()];

  let registry: RegistrySource | undefined;
  let indexUrl = TEMPLATE_INDEX_URL;
  if (options.source) {
    registry = parseSourceOrThrow(options.source);
    indexUrl = `${registry.rawBaseUrl}/index.json`;
  }

  const fetched = await fetchWorkflowEntries(registry, indexUrl);
  if (fetched.errorMessage) {
    return { templates: result, errorMessage: fetched.errorMessage };
  }

  for (const t of fetched.templates) {
    if (t.type !== "workflow") continue;
    if (t.id === NATIVE_WORKFLOW_ID) continue;
    result.push({
      id: t.id,
      type: "workflow",
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      path: t.path,
      source: "marketplace",
    });
  }

  return { templates: result };
}

/**
 * Resolve a workflow id to its content.
 *
 * - `native` → bundled `workflowMdTemplate` (offline, never errors).
 * - other id → fetch index via `template-fetcher`, find the matching
 *   `type: "workflow"` entry, then fetch its single file content.
 *
 * Errors are workflow-specific (do NOT reuse "spec template not found" copy).
 */
export async function resolveWorkflowTemplate(
  id: string,
  options: WorkflowResolveOptions = {},
): Promise<ResolvedWorkflowTemplate> {
  if (id === NATIVE_WORKFLOW_ID) {
    return nativeResolvedEntry();
  }

  let registry: RegistrySource | undefined;
  let indexUrl = TEMPLATE_INDEX_URL;
  if (options.source) {
    registry = parseSourceOrThrow(options.source);
    indexUrl = `${registry.rawBaseUrl}/index.json`;
  }

  const fetched = await fetchWorkflowEntries(registry, indexUrl);
  if (fetched.errorMessage) {
    throw new WorkflowResolveError(
      `Could not fetch workflow template index: ${fetched.errorMessage}`,
    );
  }

  const entry = fetched.templates.find(
    (t) => t.id === id && t.type === "workflow",
  );
  if (!entry) {
    const available = fetched.templates
      .filter((t) => t.type === "workflow")
      .map((t) => t.id);
    const hint =
      available.length > 0
        ? ` Available workflow templates: ${available.join(", ")}`
        : "";
    throw new WorkflowResolveError(
      `Workflow template "${id}" not found in marketplace index.${hint}`,
    );
  }
  if (!entry.path?.endsWith(".md")) {
    throw new WorkflowResolveError(
      `Workflow template "${id}" has invalid path "${entry.path}" — must point to a workflow.md file.`,
    );
  }

  const backend = fetched.backend;
  const content = await fetchWorkflowFile(entry.path, registry, backend);
  if (hasRetiredInstructions(content)) {
    throw new WorkflowResolveError(
      `Workflow template "${id}" still requires retired identity or workspace operations. Reconcile its instructions or explicitly select the bundled native workflow.`,
    );
  }

  return {
    id: entry.id,
    type: "workflow",
    name: entry.name,
    ...(entry.description ? { description: entry.description } : {}),
    path: entry.path,
    content,
    source: "marketplace",
  };
}

async function fetchWorkflowFile(
  relativePath: string,
  registry: RegistrySource | undefined,
  backend: RegistryBackend | undefined,
): Promise<string> {
  validateWorkflowPath(relativePath);
  const useGit = registry?.preferGit ?? backend === "git";
  if (registry && useGit) {
    return fetchWorkflowFileGit(registry, relativePath);
  }
  const rawBase = registry
    ? registry.rawBaseUrl
    : TEMPLATE_INDEX_URL.replace(/\/index\.json$/, "");
  return fetchWorkflowFileHttp(rawBase, relativePath);
}

async function fetchWorkflowFileHttp(
  rawBaseUrl: string,
  relativePath: string,
): Promise<string> {
  const url = `${rawBaseUrl.replace(/\/$/, "")}/${relativePath}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUTS.DOWNLOAD_MS),
    });
    if (res.status === 404) {
      throw new WorkflowResolveError(
        `Workflow template file not found at ${url}.`,
      );
    }
    if (!res.ok) {
      throw new WorkflowResolveError(
        `Could not fetch workflow template (HTTP ${res.status}) from ${url}.`,
      );
    }
    return await res.text();
  } catch (err) {
    if (err instanceof WorkflowResolveError) throw err;
    throw new WorkflowResolveError(
      `Workflow template download failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function validateWorkflowPath(relativePath: string): void {
  const normalized = relativePath.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === "..")
  ) {
    throw new WorkflowResolveError(
      `Workflow template path "${relativePath}" must stay inside the marketplace root.`,
    );
  }
}

async function fetchWorkflowFileGit(
  registry: RegistrySource,
  relativePath: string,
): Promise<string> {
  // Single shallow clone of the registry ref, then read one file. We don't
  // share clone state with template-fetcher's downloadGitRegistryPath because
  // workflow resolution is a single-file fetch (not a directory copy).
  const { execFile } = await import("node:child_process");
  const dir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "trellis-workflow-"),
  );

  function run(args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      execFile(
        "git",
        args,
        {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
          timeout: TIMEOUTS.DOWNLOAD_MS,
        },
        (error) => {
          if (error) reject(error);
          else resolve();
        },
      );
    });
  }

  try {
    try {
      await run([
        "clone",
        "--filter=blob:none",
        "--no-checkout",
        registry.gitUrl,
        dir,
      ]);
      await run(["-C", dir, "fetch", "--depth", "1", "origin", registry.ref]);
      await run(["-C", dir, "checkout", "--detach", "FETCH_HEAD"]);
    } catch (err) {
      throw new RegistryBackendError(
        "network",
        `Could not clone registry ${registry.gitUrl}#${registry.ref}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const subdir = registry.subdir.length > 0 ? registry.subdir : ".";
    const sourceRoot = path.resolve(dir, subdir);
    const candidatePath = path.resolve(sourceRoot, relativePath);
    const rel = path.relative(sourceRoot, candidatePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new WorkflowResolveError(
        `Workflow template path "${relativePath}" escapes the marketplace root.`,
      );
    }
    if (!fs.existsSync(candidatePath)) {
      throw new WorkflowResolveError(
        `Workflow template file "${relativePath}" not found in ${registry.gitUrl}#${registry.ref}.`,
      );
    }
    return await fs.promises.readFile(candidatePath, "utf-8");
  } catch (err) {
    if (err instanceof WorkflowResolveError) throw err;
    if (err instanceof RegistryBackendError) {
      throw new WorkflowResolveError(err.message);
    }
    throw new WorkflowResolveError(
      `Workflow template download failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {
      // best-effort cleanup; the OS will reap tmp dirs eventually
    });
  }
}
