import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./store.js";
import {
  foldProjectPath,
  normalizeProjectPath,
  sameProjectPath,
} from "./paths.js";

/**
 * `plugins/registry.json` is the host's own file: an array of plugin rows.
 * Trellis owns exactly one row (`local.trellis`) and rewrites nothing else, so
 * the shape below only names the fields it needs plus the ones it preserves.
 */
export interface ActivationScope {
  mode: "global" | "projects";
  projects: string[];
}

export interface PluginRegistryRow {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  scope: ActivationScope;
  source: string;
  bundled: boolean;
  status: string;
  permissions: string[];
  path: string;
  capabilities: string[];
  description?: string;
  installedAt: string;
  updatedAt: string;
  autoUpdate: boolean;
}

export function readPluginRegistry(file: string): PluginRegistryRow[] {
  const read = readJsonFile<unknown>(file);
  if (read.missing) return [];
  if (read.parseError) {
    throw new Error(`${file} is not valid JSON: ${read.parseError}`);
  }
  if (!Array.isArray(read.value)) {
    throw new Error(
      `${file} is not a plugin registry (expected a JSON array). ` +
        "Refusing to rewrite a file Trellis does not understand.",
    );
  }
  return read.value as PluginRegistryRow[];
}

function mergeScope(
  existing: ActivationScope | undefined,
  next: ActivationScope,
): ActivationScope {
  // The user enabled Trellis globally: installing in one repository must not
  // narrow that back to a project list and drop it everywhere else.
  if (existing?.mode === "global") return existing;
  if (existing?.mode !== "projects" || next.mode !== "projects") {
    return next;
  }
  const projects = Array.isArray(existing.projects)
    ? [...existing.projects]
    : [];
  for (const project of next.projects) {
    if (!projects.some((known) => sameProjectPath(known, project))) {
      projects.push(project);
    }
  }
  return { mode: "projects", projects };
}

function withoutTimestamp(row: { updatedAt?: string }): string {
  return JSON.stringify({ ...row, updatedAt: undefined });
}

/**
 * Insert or refresh the Trellis row.
 *
 * Installing into a second repository extends the project scope instead of
 * replacing it — the host keeps one row per plugin, scoped to a project list.
 */
export function upsertPluginRow(
  rows: PluginRegistryRow[],
  row: PluginRegistryRow,
): { rows: PluginRegistryRow[]; action: "created" | "updated" | "unchanged" } {
  const index = rows.findIndex((candidate) => candidate?.id === row.id);
  if (index === -1) return { rows: [...rows, row], action: "created" };

  const existing = rows[index];
  // Merge over the existing row, not over the new one: fields the host owns
  // (or the user edited) must survive, and an unchanged row must stay
  // byte-identical so the action is reported as "unchanged".
  const merged: PluginRegistryRow = {
    ...existing,
    ...row,
    installedAt:
      typeof existing.installedAt === "string"
        ? existing.installedAt
        : row.installedAt,
    scope: mergeScope(existing.scope, row.scope),
  };

  if (withoutTimestamp(existing) === withoutTimestamp(merged)) {
    return {
      rows: rows.map((candidate, at) =>
        at === index ? { ...merged, updatedAt: existing.updatedAt } : candidate,
      ),
      action: "unchanged",
    };
  }

  return {
    rows: rows.map((candidate, at) => (at === index ? merged : candidate)),
    action: "updated",
  };
}

export function removePluginRow(
  rows: PluginRegistryRow[],
  pluginId: string,
): { rows: PluginRegistryRow[]; removed: boolean } {
  const next = rows.filter((row) => !(row?.id === pluginId));
  return { rows: next, removed: next.length !== rows.length };
}

// ── User skills ────────────────────────────────────────────────────────

/**
 * One Markdown document per skill, registered under
 * `agent-capabilities/skills.json` (ADR 0056 §5). Ids stay bare — the host
 * rejects ids containing `/`, which is how plugin skills are namespaced.
 */
export interface UserSkillRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: ActivationScope;
  source: "imported";
  path: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface RepoSkill {
  id: string;
  file: string;
  sizeBytes: number;
  name: string;
  description: string;
}

export function skillsRoot(repoRoot: string): string {
  return path.join(repoRoot, ".agents", "skills");
}

function frontmatterValue(content: string, key: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return "";
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair?.[1] !== key) continue;
    return pair[2].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

/**
 * Skills Trellis wrote into `.agents/skills/<id>/SKILL.md`.
 *
 * The host indexes a skill only when its registry row exists, so presence on
 * disk is not enough — `planUserSkills` turns this listing into rows scoped to
 * the repository.
 */
export function collectRepoSkills(repoRoot: string): RepoSkill[] {
  const root = skillsRoot(repoRoot);
  if (!fs.existsSync(root)) return [];

  const skills: RepoSkill[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf-8");
    const name = frontmatterValue(content, "name") || entry.name;
    const description = frontmatterValue(content, "description");
    if (!description) {
      // The host's editor requires a description; a row without one would show
      // up in Settings but never in the model's skill catalog.
      continue;
    }
    skills.push({
      id: entry.name,
      file: toPosix(file),
      sizeBytes: Buffer.byteLength(content, "utf-8"),
      name,
      description,
    });
  }
  return skills.sort((left, right) => left.id.localeCompare(right.id));
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

export function readUserSkills(file: string): UserSkillRow[] {
  const read = readJsonFile<unknown>(file);
  if (read.missing) return [];
  if (read.parseError) {
    throw new Error(`${file} is not valid JSON: ${read.parseError}`);
  }
  if (!Array.isArray(read.value)) {
    throw new Error(
      `${file} is not a skill registry (expected a JSON array). ` +
        "Refusing to rewrite a file Trellis does not understand.",
    );
  }
  return read.value as UserSkillRow[];
}

export interface SkillPlan {
  rows: UserSkillRow[];
  created: string[];
  updated: string[];
  unchanged: string[];
}

/**
 * Merge the skills Trellis wrote into the host registry: those files are
 * created or refreshed, every other row is left untouched, and `createdAt`
 * survives a refresh.
 *
 * `ownedSkillFiles` is the ownership filter — the `.agents/skills/<id>/SKILL.md`
 * paths tracked in `.trellis/.template-hashes.json`. A repository can hold
 * dozens of skills Trellis never wrote; registering them would claim ownership
 * of files the user manages by hand.
 */
export function planUserSkills(
  repoRoot: string,
  existing: UserSkillRow[],
  now: string,
  ownedSkillFiles: ReadonlySet<string>,
): SkillPlan {
  const project = normalizeProjectPath(repoRoot);
  const skills = collectRepoSkills(repoRoot).filter((skill) =>
    ownedSkillFiles.has(foldProjectPath(skill.file)),
  );
  const rows = [...existing];
  const created: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  for (const skill of skills) {
    // A `skills.json` row is host data: it can be anything, so its path is
    // checked before it reaches the path normalizer.
    const index = rows.findIndex((row) => {
      const known = (row as { path?: unknown } | null)?.path;
      return typeof known === "string" && sameProjectPath(known, skill.file);
    });
    const createdAt =
      index >= 0 && typeof rows[index].createdAt === "string"
        ? rows[index].createdAt
        : now;
    const row: UserSkillRow = {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      enabled: true,
      scope: { mode: "projects", projects: [project] },
      source: "imported",
      path: skill.file,
      sizeBytes: skill.sizeBytes,
      createdAt,
      updatedAt: now,
    };

    if (index === -1) {
      rows.push(row);
      created.push(skill.id);
      continue;
    }

    const previous = rows[index];
    const previousScope = Array.isArray(previous.scope?.projects)
      ? previous.scope.projects
      : [];
    const scoped = previousScope.some((entry) =>
      sameProjectPath(entry, project),
    );
    const next: UserSkillRow = {
      ...row,
      scope: scoped
        ? previous.scope
        : {
            mode: "projects",
            projects: [...previousScope, project],
          },
    };
    if (withoutTimestamp(previous) === withoutTimestamp(next)) {
      rows[index] = { ...next, updatedAt: previous.updatedAt };
      unchanged.push(skill.id);
    } else {
      rows[index] = next;
      updated.push(skill.id);
    }
  }

  return { rows, created, updated, unchanged };
}

/**
 * Drop the rows Trellis owns: the file lives under this repository's skill
 * root *and* is tracked in the template hash manifest. A row the host or the
 * user created for their own skill is theirs, not ours.
 */
export function removeRepoSkillRows(
  rows: UserSkillRow[],
  ownedSkillFiles: ReadonlySet<string>,
): { rows: UserSkillRow[]; removed: string[] } {
  const kept: UserSkillRow[] = [];
  const removed: string[] = [];
  for (const row of rows) {
    const owned =
      row &&
      typeof row.path === "string" &&
      ownedSkillFiles.has(foldProjectPath(row.path));
    if (owned) {
      removed.push(row.id);
    } else {
      kept.push(row);
    }
  }
  return { rows: kept, removed };
}

/**
 * Skills registered for this repository (used by `status`). With
 * `ownedSkillFiles`, only the rows Trellis wrote are counted.
 *
 * The prefix test goes through `foldProjectPath`: the host compares scopes
 * case-insensitively on Windows, so a repo installed from `d:\x` must still
 * match the row written there when `status` runs from `D:\x`.
 */
export function skillsForRepo(
  rows: UserSkillRow[],
  repoRoot: string,
  ownedSkillFiles?: ReadonlySet<string>,
): UserSkillRow[] {
  const root = `${foldProjectPath(skillsRoot(repoRoot))}/`;
  return rows.filter((row) => {
    if (!row || typeof row.path !== "string") return false;
    if (!foldProjectPath(row.path).startsWith(root)) return false;
    return !ownedSkillFiles || ownedSkillFiles.has(foldProjectPath(row.path));
  });
}
