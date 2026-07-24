/**
 * `trellis workflow` command — list and switch the active `.trellis/workflow.md`.
 *
 * Behavior contracts:
 *
 * - Hash boundary: after writing native content, refresh the
 *   `.trellis/workflow.md` entry in `.template-hashes.json`. After writing
 *   any non-native content, remove that entry. This prevents `trellis update`
 *   from silently restoring native bytes over a user-selected variant
 *   (see design.md "Durable-state contract").
 *
 * - Modified-file protection: if the on-disk workflow has been edited (hash
 *   mismatch and it isn't already byte-identical to the chosen template),
 *   interactive runs prompt; non-interactive runs fail unless `--force` or
 *   `--create-new` was passed.
 *
 * - `--create-new`: never touches `.trellis/workflow.md`; writes
 *   `.trellis/workflow.md.new` and leaves the hash file alone.
 *
 * - `--save <id>`: resolves a template through the same pipeline but writes it
 *   to the per-task variant library (`.trellis/workflows/<id>.md`) instead of
 *   the active workflow. Library files are user-managed by definition: this
 *   path never touches `.trellis/workflow.md` or `.template-hashes.json`.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES, PATHS } from "../constants/paths.js";
import { collectMissingAgents } from "../utils/agent-refs.js";
import { replacePythonCommandLiterals } from "../configurators/shared.js";
import {
  computeHash,
  loadHashes,
  removeHash,
  updateHashes,
} from "../utils/template-hash.js";
import {
  listWorkflowTemplates,
  resolveWorkflowTemplate,
  NATIVE_WORKFLOW_ID,
  WorkflowResolveError,
  type ResolvedWorkflowTemplate,
  type WorkflowTemplateListing,
} from "../utils/workflow-resolver.js";

export interface WorkflowCommandOptions {
  template?: string;
  marketplace?: string;
  list?: boolean;
  force?: boolean;
  createNew?: boolean;
  save?: string;
}

/**
 * Per-task workflow variant library. Files here are user-managed: never
 * hash-tracked, never touched by `trellis update` (same ownership stance as a
 * non-native `.trellis/workflow.md`).
 */
const WORKFLOWS_LIB_REL = `${DIR_NAMES.WORKFLOW}/workflows`;

/**
 * Library id charset — must match the per-task resolution rule in the runtime
 * consumers (`common/workflow_selection.py`) so a saved id is resolvable and
 * cannot traverse paths.
 */
const WORKFLOW_ID_RE = /^[A-Za-z0-9_-]+$/;

function workflowFilePath(cwd: string): string {
  return path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE);
}

function workflowsLibraryDir(cwd: string): string {
  return path.join(cwd, WORKFLOWS_LIB_REL);
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY);
}

function printListing(templates: WorkflowTemplateListing[]): void {
  console.log(chalk.cyan("\nAvailable workflow templates:\n"));
  for (const t of templates) {
    const tag =
      t.source === "bundled"
        ? chalk.gray(" (bundled)")
        : chalk.gray(" (marketplace)");
    console.log(`  ${chalk.green(t.id)}${tag} — ${t.name}`);
    if (t.description) {
      console.log(chalk.gray(`    ${t.description}`));
    }
  }
  console.log("");
}

/**
 * `--list` addition: ids already saved to the per-task variant library on
 * disk. Skipped entirely when the directory is absent or empty.
 */
function printLibraryListing(cwd: string): void {
  const libDir = workflowsLibraryDir(cwd);
  if (!fs.existsSync(libDir)) return;
  const ids = fs
    .readdirSync(libDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -".md".length))
    .sort();
  if (ids.length === 0) return;
  console.log(chalk.cyan(`Library (${WORKFLOWS_LIB_REL}/):\n`));
  for (const id of ids) {
    console.log(`  ${chalk.green(id)}`);
  }
  console.log("");
}

/**
 * Decide whether the existing workflow.md is byte-identical to the resolved
 * template (treat as "safe to overwrite"), pristine (matches tracked hash —
 * also safe), or user-modified (needs confirmation / --force).
 */
function classifyExistingWorkflow(
  cwd: string,
  newContent: string,
):
  | { kind: "missing" }
  | { kind: "identical" }
  | { kind: "pristine" }
  | { kind: "modified" } {
  const filePath = workflowFilePath(cwd);
  if (!fs.existsSync(filePath)) {
    return { kind: "missing" };
  }
  const current = fs.readFileSync(filePath, "utf-8");
  if (current === newContent) {
    return { kind: "identical" };
  }
  const hashes = loadHashes(cwd);
  const storedHash = hashes[PATHS.WORKFLOW_GUIDE_FILE];
  if (storedHash && storedHash === computeHash(current)) {
    return { kind: "pristine" };
  }
  return { kind: "modified" };
}

async function chooseTemplateInteractively(
  templates: WorkflowTemplateListing[],
): Promise<string | null> {
  if (templates.length === 0) return null;
  const { id } = await inquirer.prompt<{ id: string }>([
    {
      type: "list",
      name: "id",
      message: "Select a workflow template:",
      choices: templates.map((t) => ({
        name: `${t.id} — ${t.name}${t.source === "bundled" ? " (bundled)" : ""}`,
        value: t.id,
      })),
    },
  ]);
  return id;
}

async function confirmOverwriteInteractively(): Promise<
  "overwrite" | "skip" | "create-new"
> {
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: "list",
      name: "action",
      message:
        "Your .trellis/workflow.md has local edits. What do you want to do?",
      choices: [
        { name: "Overwrite (replace local edits)", value: "overwrite" },
        {
          name: "Write to .trellis/workflow.md.new and keep current",
          value: "create-new",
        },
        { name: "Skip (no changes)", value: "skip" },
      ],
    },
  ]);
  return action as "overwrite" | "skip" | "create-new";
}

function applyHashContract(cwd: string, templateId: string): void {
  const relPath = PATHS.WORKFLOW_GUIDE_FILE;
  if (templateId === NATIVE_WORKFLOW_ID) {
    const filePath = workflowFilePath(cwd);
    const current = fs.readFileSync(filePath, "utf-8");
    const files = new Map<string, string>();
    files.set(relPath, current);
    updateHashes(cwd, files);
  } else {
    // Non-native workflow is user-managed local content. Drop the hash entry
    // so `trellis update` treats it as modified and does not silently restore
    // native bytes.
    removeHash(cwd, relPath);
  }
}

async function writeWorkflow(
  cwd: string,
  template: ResolvedWorkflowTemplate,
  options: WorkflowCommandOptions,
): Promise<void> {
  const filePath = workflowFilePath(cwd);
  const dest = path.dirname(filePath);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const finalContent = replacePythonCommandLiterals(template.content);

  // `--create-new` always writes the `.new` sibling, regardless of disk state.
  if (options.createNew) {
    const newPath = `${filePath}.new`;
    fs.writeFileSync(newPath, finalContent, "utf-8");
    console.log(
      chalk.cyan(
        `  + Wrote ${path.relative(cwd, newPath)} (workflow.md unchanged)`,
      ),
    );
    return;
  }

  const classification = classifyExistingWorkflow(cwd, finalContent);

  if (classification.kind === "identical") {
    console.log(
      chalk.gray(
        `  ○ ${PATHS.WORKFLOW_GUIDE_FILE} already matches "${template.id}" — refreshing hash entry`,
      ),
    );
    applyHashContract(cwd, template.id);
    return;
  }

  if (classification.kind === "modified" && !options.force) {
    const explicitTemplate = Boolean(options.template);
    if (explicitTemplate || !isInteractive()) {
      throw new WorkflowCommandError(
        `${PATHS.WORKFLOW_GUIDE_FILE} has local edits. Re-run with --force to overwrite or --create-new to write ${PATHS.WORKFLOW_GUIDE_FILE}.new.`,
      );
    }
    const action = await confirmOverwriteInteractively();
    if (action === "skip") {
      console.log(chalk.gray("  ○ Skipped"));
      return;
    }
    if (action === "create-new") {
      const newPath = `${filePath}.new`;
      fs.writeFileSync(newPath, finalContent, "utf-8");
      console.log(
        chalk.cyan(
          `  + Wrote ${path.relative(cwd, newPath)} (workflow.md unchanged)`,
        ),
      );
      return;
    }
    // fall through to overwrite
  }

  fs.writeFileSync(filePath, finalContent, "utf-8");
  console.log(
    chalk.green(
      `  ✓ Replaced ${PATHS.WORKFLOW_GUIDE_FILE} with "${template.id}"`,
    ),
  );
  applyHashContract(cwd, template.id);
}

/**
 * The six breadcrumb statuses used by the bundled native template. Kept in
 * sync with `.trellis/spec/cli/backend/workflow-state-contract.md` (status
 * writer + reachability tables) — update both together.
 */
const REQUIRED_WORKFLOW_STATE_IDS = [
  "no_task",
  "planning",
  "planning-inline",
  "in_progress",
  "in_progress-inline",
  "completed",
];

/**
 * Soft parser-contract validation for saved library variants: warn (never
 * block) when runtime markers that SessionStart / per-turn hooks and
 * `get_context.py --mode phase` rely on are missing. Warnings go to stderr —
 * stdout stays reserved for command output.
 */
function warnAboutMissingMarkers(content: string, relPath: string): void {
  const problems: string[] = [];
  if (!content.includes("## Phase Index")) {
    problems.push('missing "## Phase Index" section');
  }
  if (!/^#### \d+\.\d+/m.test(content)) {
    problems.push('no "#### X.Y" step heading');
  }
  const missingStates = REQUIRED_WORKFLOW_STATE_IDS.filter(
    (id) => !content.includes(`[workflow-state:${id}]`),
  );
  if (missingStates.length > 0) {
    problems.push(
      `missing [workflow-state:*] blocks: ${missingStates.join(", ")}`,
    );
  }
  if (problems.length === 0) return;
  process.stderr.write(
    chalk.yellow(
      `\n⚠ ${relPath} is missing runtime parser markers:\n` +
        problems.map((p) => `  - ${p}\n`).join("") +
        "  Consumers degrade to generic breadcrumbs / partial phase detail where markers are absent.\n",
    ),
  );
}

/**
 * `--save <id>`: resolve through the same template pipeline as `--template`
 * and write to the per-task variant library. Never touches
 * `.trellis/workflow.md` or `.template-hashes.json` — library files are
 * user-managed by definition.
 */
async function saveWorkflowToLibrary(
  cwd: string,
  id: string,
  options: WorkflowCommandOptions,
): Promise<void> {
  if (!WORKFLOW_ID_RE.test(id)) {
    throw new WorkflowCommandError(
      `Invalid workflow id "${id}". Library ids must match [A-Za-z0-9_-]+ so per-task resolution can find the saved file.`,
    );
  }

  let template: ResolvedWorkflowTemplate;
  try {
    template = await resolveWorkflowTemplate(id, {
      source: options.marketplace,
    });
  } catch (err) {
    if (err instanceof WorkflowResolveError) {
      throw new WorkflowCommandError(err.message);
    }
    throw err;
  }

  const libDir = workflowsLibraryDir(cwd);
  const destPath = path.join(libDir, `${id}.md`);
  const destRel = `${WORKFLOWS_LIB_REL}/${id}.md`;
  if (fs.existsSync(destPath) && !options.force) {
    throw new WorkflowCommandError(
      `${destRel} already exists. Re-run with --force to overwrite.`,
    );
  }
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }
  const finalContent = replacePythonCommandLiterals(template.content);
  fs.writeFileSync(destPath, finalContent, "utf-8");
  console.log(chalk.green(`  ✓ Saved "${template.id}" to ${destRel}`));

  warnAboutMissingMarkers(finalContent, destRel);
}

/**
 * Distinct error class so `cli/index.ts` can format these as user errors
 * without dumping stack traces.
 */
export class WorkflowCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowCommandError";
  }
}

export async function runWorkflowCommand(
  options: WorkflowCommandOptions,
): Promise<void> {
  const cwd = process.cwd();
  if (!fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW))) {
    throw new WorkflowCommandError(
      "No .trellis/ directory found. Run `trellis init` first.",
    );
  }

  // List mode — print and exit.
  if (options.list) {
    const { templates, errorMessage } = await listWorkflowTemplates({
      source: options.marketplace,
    });
    printListing(templates);
    printLibraryListing(cwd);
    if (errorMessage) {
      console.log(chalk.yellow(`⚠ ${errorMessage}`));
    }
    return;
  }

  // `--save <id>` populates the per-task variant library; it never composes
  // with the active-workflow write modes.
  if (options.save !== undefined) {
    if (options.template || options.createNew) {
      throw new WorkflowCommandError(
        "--save cannot be combined with --template or --create-new.",
      );
    }
    await saveWorkflowToLibrary(cwd, options.save, options);
    return;
  }

  // Resolve template id (non-interactive flag or interactive picker).
  let templateId = options.template;
  if (!templateId) {
    if (!isInteractive()) {
      throw new WorkflowCommandError(
        "No --template specified and stdin is not a TTY. Pass --template <id> or run interactively.",
      );
    }
    const { templates, errorMessage } = await listWorkflowTemplates({
      source: options.marketplace,
    });
    if (errorMessage) {
      console.log(chalk.yellow(`⚠ ${errorMessage}`));
    }
    const picked = await chooseTemplateInteractively(templates);
    if (!picked) {
      throw new WorkflowCommandError("No workflow template available.");
    }
    templateId = picked;
  }

  // Resolve content.
  let template: ResolvedWorkflowTemplate;
  try {
    template = await resolveWorkflowTemplate(templateId, {
      source: options.marketplace,
    });
  } catch (err) {
    if (err instanceof WorkflowResolveError) {
      throw new WorkflowCommandError(err.message);
    }
    throw err;
  }

  await writeWorkflow(cwd, template, options);

  // Best-effort warning: if the resolved workflow references
  // `.trellis/agents/<name>.md` files that don't exist on disk, point the user
  // at `trellis update` so `trellis channel spawn --agent <name>` doesn't fail
  // mid-session. Non-blocking; never errors a successful write.
  warnAboutMissingAgents(cwd, template.content);
}

function warnAboutMissingAgents(cwd: string, workflowContent: string): void {
  const missing = collectMissingAgents(cwd, workflowContent);
  if (missing.length === 0) return;
  process.stderr.write(
    chalk.yellow(
      `\n⚠ The selected workflow references .trellis/agents/{${missing.join(",")}}.md, but those files are not on disk.\n`,
    ) +
      chalk.yellow(
        `  Run \`trellis update\` to backfill the bundled agent definitions, or create them under ${PATHS.AGENTS}/.\n`,
      ),
  );
}
