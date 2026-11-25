import fs from "node:fs";
import path from "node:path";
import {
  PI_DESKTOP_PLUGIN_ID,
  PI_DESKTOP_SUBAGENT_MARKER,
} from "../../constants/pi-desktop.js";
import { writeFileAtomic } from "../../utils/atomic-write.js";
import {
  foldProjectPath,
  installedPluginDir,
  isHostRunning,
  normalizeProjectPath,
  registryFile,
  resolvePiDesktopDataDir,
  sameProjectPath,
  skillsRegistryFile,
  resolveAgentsDir,
  subagentsDir,
} from "./paths.js";
import {
  hashPluginFiles,
  listPluginFiles,
  pluginDir,
  validatePlugin,
  type PluginManifest,
} from "./plugin.js";
import {
  planUserSkills,
  readPluginRegistry,
  readUserSkills,
  removeRepoSkillRows,
  skillsForRepo,
  upsertPluginRow,
  type ActivationScope,
  type PluginRegistryRow,
  type UserSkillRow,
} from "./registries.js";
import { writeJsonFile } from "./store.js";
import { loadHashes } from "../../utils/template-hash.js";
import {
  getGlobalSubagentFiles,
  type GlobalSubagentFile,
} from "../../templates/pi-desktop/subagents.js";

export interface CommonOptions {
  cwd: string;
  dataDir?: string;
  /** `--agents-dir` override for `~/.agents` (the sub-agent home). */
  agentsDir?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  dryRun?: boolean;
  force?: boolean;
  /** Skip the `agent-capabilities/skills.json` bridge. */
  skipSkills?: boolean;
  /** Skip writing `~/.agents/subagents/trellis-*.md`. */
  skipSubagents?: boolean;
  now?: Date;
  /** Test seam for the "quit the host first" guard. */
  hostRunning?: () => boolean;
}

export interface SkillReport {
  skipped: boolean;
  created: string[];
  updated: string[];
  unchanged: string[];
  path: string;
  backup: string | null;
}

export interface SubagentReport {
  skipped: boolean;
  written: string[];
  unchanged: string[];
  dir: string;
}

export interface InstallReport {
  dataDir: string;
  pluginDir: string;
  installedDir: string;
  registryPath: string;
  registryAction: "created" | "updated" | "unchanged";
  registryBackup: string | null;
  files: string[];
  skills: SkillReport;
  subagents: SubagentReport;
  dryRun: boolean;
}

function resolveDataDir(options: CommonOptions): string {
  return resolvePiDesktopDataDir({
    dataDir: options.dataDir,
    env: options.env,
    home: options.home,
  });
}

/**
 * Whether the Trellis row activates the plugin in a repository: a global row
 * covers every project, a project-scoped row only its listed projects
 * (ADR 0056 `isActiveInProject`).
 */
function coversProject(row: PluginRegistryRow | null, cwd: string): boolean {
  if (row === null) return false;
  if (row.scope?.mode === "global") return true;
  const projects = Array.isArray(row.scope?.projects) ? row.scope.projects : [];
  const project = normalizeProjectPath(cwd);
  return projects.some(
    (entry) => typeof entry === "string" && sameProjectPath(entry, project),
  );
}

/** The row shows a description if the manifest carries one; the schema does not require it. */
function descriptionOf(manifest: PluginManifest): string | undefined {
  const value = (manifest as { description?: unknown }).description;
  return typeof value === "string" ? value : undefined;
}

function buildRow(
  cwd: string,
  installedDir: string,
  manifest: PluginManifest,
  now: Date,
): PluginRegistryRow {
  return {
    id: manifest.id,
    name: "Trellis",
    version: manifest.version ?? "0.0.0",
    enabled: true,
    scope: { mode: "projects", projects: [normalizeProjectPath(cwd)] },
    source: "dev",
    bundled: false,
    status: "ready",
    permissions: manifest.permissions ?? [],
    path: installedDir,
    capabilities: ["agentExtension"],
    description: descriptionOf(manifest),
    installedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    autoUpdate: false,
  };
}

/**
 * Skill files Trellis owns in this repository: the `.agents/skills/<id>/SKILL.md`
 * entries in `.trellis/.template-hashes.json`. Every other skill under
 * `.agents/skills/` belongs to the user, and registering it would claim a file
 * Trellis never wrote.
 *
 * Keys use the comparison form (`foldProjectPath`) so they match the rows the
 * host stores, whatever case the repository was installed from.
 */
function ownedSkillFiles(cwd: string): Set<string> {
  const hashes = loadHashes(cwd);
  const root = normalizeProjectPath(cwd);
  const owned = new Set<string>();
  for (const relativePath of Object.keys(hashes)) {
    if (!/^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(relativePath)) continue;
    owned.add(foldProjectPath(`${root}/${relativePath}`));
  }
  return owned;
}
function mergeSkills(
  options: CommonOptions,
  skillRegistryPath: string,
  existing: UserSkillRow[],
  owned: ReadonlySet<string>,
): SkillReport {
  if (options.skipSkills) {
    return {
      skipped: true,
      created: [],
      updated: [],
      unchanged: [],
      path: skillRegistryPath,
      backup: null,
    };
  }

  const now = (options.now ?? new Date()).toISOString();
  const plan = planUserSkills(options.cwd, existing, now, owned);
  const changed = plan.created.length + plan.updated.length > 0;
  const write = changed
    ? writeJsonFile(skillRegistryPath, plan.rows, {
        dryRun: options.dryRun,
      })
    : { backup: null };

  return {
    skipped: false,
    created: plan.created,
    updated: plan.updated,
    unchanged: plan.unchanged,
    path: skillRegistryPath,
    backup: write.backup ?? null,
  };
}

/**
 * Write the three Trellis roles into `~/.agents/subagents`.
 *
 * The host scans only that directory for sub-agents, and it validates `tools`
 * case-sensitively, so these files are a translation of `.pi/agents/*.md`
 * rather than a copy. Bytes are compared first so a repeat install does not
 * touch files the host is watching.
 *
 * `files` arrives already validated: the caller reads them before writing
 * anything, so a payload the host would refuse cannot leave a half-install.
 */
function syncSubagents(
  options: CommonOptions,
  files: GlobalSubagentFile[],
): SubagentReport {
  const dir = subagentsDir(resolveAgentsDir(options));
  if (options.skipSubagents) {
    return { skipped: true, written: [], unchanged: [], dir };
  }

  const written: string[] = [];
  const unchanged: string[] = [];
  if (!options.dryRun) fs.mkdirSync(dir, { recursive: true });

  for (const file of files) {
    const target = path.join(dir, file.fileName);
    const existing = fs.existsSync(target)
      ? fs.readFileSync(target, "utf-8")
      : null;
    if (existing === file.content) {
      unchanged.push(file.fileName);
      continue;
    }
    if (!options.dryRun) writeFileAtomic(target, file.content);
    written.push(file.fileName);
  }

  return { skipped: false, written, unchanged, dir };
}
/**
 * Install the generated plugin into the host: copy its files, register one row
 * in `plugins/registry.json`, write the global sub-agents the host actually
 * scans, and register the repository's skills as project-scoped user skills.
 *
 * Writes stay inside the PI-Desktop data directory and `~/.agents/`, and
 * `--dry-run` writes nothing at all.
 */
export function installPiDesktopPlugin(options: CommonOptions): InstallReport {
  const now = options.now ?? new Date();
  const manifest = validatePlugin(options.cwd);
  // Validate the sub-agent payload with the manifest, before any write: a bad
  // name/description/tools value must not leave a copied plugin, a registry row
  // and registered skills behind.
  const subagentFiles = options.skipSubagents ? [] : getGlobalSubagentFiles();

  // A dry run writes nothing, so a live host only blocks real writes.
  if (
    !options.dryRun &&
    !options.force &&
    (options.hostRunning ?? isHostRunning)()
  ) {
    throw new Error(
      "PI-Desktop is running. Quit it, then re-run `trellis pi-desktop install`. " +
        "The host rewrites plugins/registry.json while it runs, so an install made " +
        "behind a live window can be lost. Pass --force to write anyway.",
    );
  }

  const dataDir = resolveDataDir(options);
  const src = pluginDir(options.cwd);
  const installedDir = installedPluginDir(dataDir);
  const files = listPluginFiles(src);

  // Read (and therefore validate) both host registries before touching the
  // filesystem: a schema Trellis does not understand must abort the whole
  // install, not leave a copied plugin with no registry row behind.
  const registryPath = registryFile(dataDir);
  const rows = readPluginRegistry(registryPath);
  const skillRegistryPath = skillsRegistryFile(dataDir);
  const existingSkills = options.skipSkills
    ? []
    : readUserSkills(skillRegistryPath);

  if (!options.dryRun) {
    // Whole-directory replace: a stale `agent/` from an older Trellis must not
    // survive next to the new one, or the host loads a mix of both.
    fs.rmSync(installedDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(installedDir), { recursive: true });
    fs.cpSync(src, installedDir, { recursive: true });
  }

  const upsert = upsertPluginRow(
    rows,
    buildRow(options.cwd, installedDir, manifest, now),
  );
  const registryWrite =
    upsert.action === "unchanged"
      ? { backup: null }
      : writeJsonFile(registryPath, upsert.rows, {
          dryRun: options.dryRun,
        });
  return {
    dataDir,
    pluginDir: src,
    installedDir,
    registryPath,
    registryAction: upsert.action,
    registryBackup: registryWrite.backup ?? null,
    files,
    skills: mergeSkills(
      options,
      skillRegistryPath,
      existingSkills,
      ownedSkillFiles(options.cwd),
    ),
    subagents: syncSubagents(options, subagentFiles),
    dryRun: options.dryRun === true,
  };
}

export interface StatusReport {
  dataDir: string;
  pluginDir: string;
  installedDir: string;
  registryPath: string;
  skillsPath: string;
  /** Whether the row activates Trellis *in this repository*. */
  registered: boolean;
  row: PluginRegistryRow | null;
  repoFiles: number;
  missingInInstall: string[];
  changedInInstall: string[];
  extraInInstall: string[];
  skillsOnDisk: number;
  skillsRegistered: number;
  subagentsDir: string;
  subagentsFound: number;
  hostRunning: boolean;
}

/** Read-only report: what is on disk, what the host knows, and what drifted. */
export function piDesktopStatus(options: CommonOptions): StatusReport {
  const dataDir = resolveDataDir(options);
  const src = pluginDir(options.cwd);
  const installedDir = installedPluginDir(dataDir);
  const registryPath = registryFile(dataDir);
  const skillsPath = skillsRegistryFile(dataDir);

  const rows = readPluginRegistry(registryPath);
  const row =
    rows.find((candidate) => candidate?.id === PI_DESKTOP_PLUGIN_ID) ?? null;

  const repoHashes = hashPluginFiles(src);
  const installedHashes = hashPluginFiles(installedDir);
  const missingInInstall: string[] = [];
  const changedInInstall: string[] = [];
  for (const [file, hash] of repoHashes) {
    const installed = installedHashes.get(file);
    if (installed === undefined) missingInInstall.push(file);
    else if (installed !== hash) changedInInstall.push(file);
  }
  const extraInInstall = [...installedHashes.keys()].filter(
    (file) => !repoHashes.has(file),
  );

  const ownedSkills = ownedSkillFiles(options.cwd);
  const registeredSkills = skillsForRepo(
    readUserSkills(skillsPath),
    options.cwd,
    ownedSkills,
  );
  // Only the skills Trellis wrote belong in this fraction. `.agents/skills` also
  // holds the user's own skills, which install must never register, so counting
  // them as a denominator reports a permanent backlog of "missing" entries.
  const onDisk = [...ownedSkills].filter((file) => fs.existsSync(file)).length;
  const subagentDirPath = subagentsDir(resolveAgentsDir(options));
  const subagentsFound = fs.existsSync(subagentDirPath)
    ? fs.readdirSync(subagentDirPath).filter((name) => {
        if (!name.toLowerCase().endsWith(".md")) return false;
        const content = fs.readFileSync(
          path.join(subagentDirPath, name),
          "utf-8",
        );
        return content.includes(`<!-- ${PI_DESKTOP_SUBAGENT_MARKER} -->`);
      }).length
    : 0;

  return {
    dataDir,
    pluginDir: src,
    installedDir,
    registryPath,
    skillsPath,
    registered: coversProject(row, options.cwd),
    row,
    repoFiles: repoHashes.size,
    missingInInstall,
    changedInInstall,
    extraInInstall,
    skillsOnDisk: onDisk,
    skillsRegistered: registeredSkills.length,
    subagentsDir: subagentDirPath,
    subagentsFound,
    hostRunning: (options.hostRunning ?? isHostRunning)(),
  };
}

export interface UninstallReport {
  dataDir: string;
  registryPath: string;
  installedDir: string;
  /** The row itself was deleted (no repository needs it any more). */
  removedRow: boolean;
  /** Projects the row still covers after this repository left its scope. */
  scopeRetained: string[];
  removedDir: boolean;
  removedSkills: string[];
  removedSubagents: string[];
  skillsPath: string;
  dryRun: boolean;
}

/**
 * Undo `install` in this repository.
 *
 * The row, the installed plugin directory and `~/.agents/subagents/trellis-*.md`
 * are shared by every repository that installed Trellis, so this repository is
 * dropped from `scope.projects` first and the shared files are removed only
 * once no project is left (or the row is global, which covers all of them).
 */
export function uninstallPiDesktopPlugin(
  options: CommonOptions,
): UninstallReport {
  const dryRun = options.dryRun === true;

  // A dry run writes nothing, so a live host only blocks real writes.
  if (!dryRun && !options.force && (options.hostRunning ?? isHostRunning)()) {
    throw new Error(
      "PI-Desktop is running. Quit it, then re-run `trellis pi-desktop uninstall`. " +
        "The host rewrites plugins/registry.json while it runs, so a removal made " +
        "behind a live window can be resurrected. Pass --force to write anyway.",
    );
  }

  const now = options.now ?? new Date();
  const dataDir = resolveDataDir(options);
  const registryPath = registryFile(dataDir);
  const installedDir = installedPluginDir(dataDir);
  const skillsPath = skillsRegistryFile(dataDir);
  const project = normalizeProjectPath(options.cwd);

  const rows = readPluginRegistry(registryPath);
  const index = rows.findIndex(
    (candidate) => candidate?.id === PI_DESKTOP_PLUGIN_ID,
  );
  const row = index === -1 ? null : rows[index];
  const configured = Array.isArray(row?.scope?.projects)
    ? row.scope.projects
    : [];
  const gone = (entry: string): boolean =>
    typeof entry === "string" && sameProjectPath(entry, project);
  const remaining = configured.filter((entry) => !gone(entry));
  const inScope = configured.some(gone);
  // A global row covers every project, so uninstalling anywhere removes it.
  const keepRow =
    row !== null && row.scope?.mode !== "global" && remaining.length > 0;
  const scopeRetained = keepRow ? remaining : [];
  let removedRow = false;
  if (row !== null && keepRow) {
    if (inScope) {
      const scope: ActivationScope = { mode: "projects", projects: remaining };
      writeJsonFile(
        registryPath,
        rows.map((candidate, at) =>
          at === index
            ? { ...row, scope, updatedAt: now.toISOString() }
            : candidate,
        ),
        { dryRun },
      );
    }
  } else if (row !== null) {
    removedRow = true;
    writeJsonFile(
      registryPath,
      rows.filter((_candidate, at) => at !== index),
      { dryRun },
    );
  }

  // Files another repository still needs stay put, or its install breaks.
  const shared = scopeRetained.length > 0;
  let removedDir = false;
  if (!shared && fs.existsSync(installedDir)) {
    if (!dryRun) fs.rmSync(installedDir, { recursive: true, force: true });
    removedDir = true;
  }

  const existingSkills: UserSkillRow[] = readUserSkills(skillsPath);
  const skills = removeRepoSkillRows(
    existingSkills,
    ownedSkillFiles(options.cwd),
  );
  if (skills.removed.length > 0) {
    writeJsonFile(skillsPath, skills.rows, { dryRun });
  }

  const subagentDirPath = subagentsDir(resolveAgentsDir(options));
  const removedSubagents: string[] = [];
  if (!shared && fs.existsSync(subagentDirPath)) {
    for (const name of fs.readdirSync(subagentDirPath)) {
      if (!name.toLowerCase().endsWith(".md")) continue;
      const target = path.join(subagentDirPath, name);
      const content = fs.readFileSync(target, "utf-8");
      if (!content.includes(`<!-- ${PI_DESKTOP_SUBAGENT_MARKER} -->`)) continue;
      if (!dryRun) fs.rmSync(target, { force: true });
      removedSubagents.push(name);
    }
  }

  return {
    dataDir,
    registryPath,
    installedDir,
    removedRow,
    scopeRetained,
    removedDir,
    removedSkills: skills.removed,
    removedSubagents,
    skillsPath,
    dryRun,
  };
}
