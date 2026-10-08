import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMPLATE_SCRIPTS = path.resolve(__dirname, "../../src/templates/trellis/scripts");

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function git(repo: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf-8" });
  if (result.status !== 0) throw new Error(result.stderr);
}

function task(repo: string, ...args: string[]) {
  return spawnSync("python3", [".trellis/scripts/task.py", ...args], {
    cwd: repo,
    encoding: "utf-8",
    env: { ...process.env, TRELLIS_CONTEXT_ID: "source-lifecycle-test" },
  });
}

function taskDir(repo: string, suffix: string): string {
  const name = fs.readdirSync(path.join(repo, ".trellis/tasks"))
    .find((entry) => entry.endsWith(`-${suffix}`));
  if (!name) throw new Error(`task not found: ${suffix}`);
  return name;
}

function metadata(repo: string, name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(repo, ".trellis/tasks", name, "task.json"), "utf8"));
}

describe.skipIf(!hasPython())("task.py stable identity and source", () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-identity-"));
    git(repo, "init", "-q", "-b", "main");
    git(repo, "remote", "add", "origin", "https://example.invalid/castbox/Trellis.git");
    const scripts = path.join(repo, ".trellis/scripts");
    fs.mkdirSync(scripts, { recursive: true });
    fs.cpSync(TEMPLATE_SCRIPTS, scripts, { recursive: true });
  });

  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("creates and resolves current tasks beside unrelated old records while retaining old identity reservations", () => {
    const legacyDir = path.join(repo, ".trellis/tasks/08-03-historical-directory");
    fs.mkdirSync(legacyDir, { recursive: true });
    const old = { id: "Old_Reserved", name: "old-reserved", title: "Old work", status: "in_progress", creator: "old", assignee: "old" };
    const bytes = JSON.stringify(old) + "\n";
    const oldFile = path.join(legacyDir, "task.json");
    fs.writeFileSync(oldFile, bytes);
    const created = task(repo, "create", "Current", "--description", "Current work", "--slug", "current", "--no-start");
    expect(created.status, created.stderr).toBe(0);
    const name = taskDir(repo, "current");
    const started = task(repo, "start", name, "--allow-empty-context");
    expect(started.status, started.stderr).toBe(0);
    const resolved = spawnSync("python3", ["-c", `
from pathlib import Path
import sys
sys.path.insert(0, '.trellis/scripts')
from common.session_storage import repository_facts, resolve_task_identity
result = resolve_task_identity(repository_facts(Path.cwd()), 'current', 0)
print(result.task_ref)
`], { cwd: repo, encoding: "utf8" });
    expect(resolved.status, resolved.stderr).toBe(0);
    expect(resolved.stdout).toContain(name);
    for (const id of ["Old_Reserved", "old_reserved"]) {
      const occupied = task(repo, "create", "Other", "--description", "Other work", "--slug", "other", "--task-id", id, "--no-start");
      expect(occupied.status).toBe(1);
      expect(occupied.stderr).toContain("task_id_collision");
    }
    const direct = task(repo, "start", path.basename(legacyDir), "--allow-empty-context");
    expect(direct.status).toBe(1);
    expect(fs.readFileSync(oldFile, "utf8")).toBe(bytes);
  });

  it("reserves identity independently of non-identity schema while rejecting invalid selected tasks", () => {
    expect(task(repo, "create", "Current", "--description", "Current work", "--slug", "current", "--no-start").status).toBe(0);
    const name = taskDir(repo, "current");
    const file = path.join(repo, ".trellis/tasks", name, "task.json");
    const data = metadata(repo, name);
    const variants = [{ ...data, lifecycle_generation: -1 }, { ...data, source: { kind: "issue" } },
      { ...data, old_label: "unknown" }, { ...data, status: null },
      { id: "current", creator: "old", assignee: "old", subtasks: [], lifecycle_generation: 1 }];
    for (const [index, changed] of variants.entries()) {
      const bytes = JSON.stringify(changed);
      fs.writeFileSync(file, bytes);
      fs.chmodSync(file, 0o640);
      const mode = fs.statSync(file).mode;
      const created = task(repo, "create", "Other", "--description", "Other work", "--slug", `other-${index}`, "--no-start");
      expect(created.status, created.stderr).toBe(0);
      const selected = task(repo, "start", name, "--allow-empty-context");
      expect(selected.status).toBe(1);
      expect(selected.stderr).toContain("task_metadata_");
      const lookup = spawnSync("python3", ["-c", `
from pathlib import Path
import sys
sys.path.insert(0, '.trellis/scripts')
from common.session_storage import repository_facts, resolve_task_identity
result = resolve_task_identity(repository_facts(Path.cwd()), 'other-${index}', 0)
print(result.task_ref)
`], { cwd: repo, encoding: "utf8" });
      expect(lookup.status, lookup.stderr).toBe(0);
      const invalidLookup = spawnSync("python3", ["-c", `
from pathlib import Path
import sys
sys.path.insert(0, '.trellis/scripts')
from common.session_storage import repository_facts, resolve_task_identity
resolve_task_identity(repository_facts(Path.cwd()), 'current', 0)
`], { cwd: repo, encoding: "utf8" });
      expect(invalidLookup.status).toBe(1);
      expect(invalidLookup.stderr).toContain("task_metadata_");
      expect(fs.readFileSync(file, "utf8")).toBe(bytes);
      expect(fs.statSync(file).mode).toBe(mode);
      expect(fs.existsSync(path.join(repo, ".git/trellis/sessions/source-lifecycle-test.json"))).toBe(false);
    }
  });

  it("fails closed on unreadable active identities without partial resources", () => {
    const directory = path.join(repo, ".trellis/tasks/old");
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "task.json");
    for (const bytes of ["{", "[]", "{}", JSON.stringify({ title: "no id" }),
      JSON.stringify({ id: "" }), JSON.stringify({ id: "../bad" }), JSON.stringify({ id: 5 }), Buffer.from([0xff])]) {
      fs.writeFileSync(file, bytes);
      const before = fs.readdirSync(path.join(repo, ".trellis/tasks"));
      const result = task(repo, "create", "Other", "--description", "Other work", "--slug", "other", "--no-start");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("task_metadata_");
      expect(result.stderr).toContain(file);
      expect(fs.readdirSync(path.join(repo, ".trellis/tasks"))).toEqual(before);
      expect(fs.existsSync(path.join(repo, ".git/trellis/sessions"))).toBe(false);
      expect(fs.readFileSync(file)).toEqual(Buffer.from(bytes));
    }
    fs.rmSync(file);
    expect(task(repo, "create", "Other", "--description", "Other work", "--slug", "other", "--no-start").status).toBe(0);
  });

  it("retains archive visible-name fallback and Git-ref identity reservations", () => {
    const archive = path.join(repo, ".trellis/tasks/archive/2026-01/01-01-reserved");
    fs.mkdirSync(archive, { recursive: true });
    fs.writeFileSync(path.join(archive, "task.json"), "{");
    expect(task(repo, "create", "Current", "--description", "Current", "--slug", "current", "--no-start").status).toBe(0);
    const before = fs.readdirSync(path.join(repo, ".trellis/tasks"));
    const occupied = task(repo, "create", "Other", "--description", "Other", "--slug", "other", "--task-id", "reserved", "--no-start");
    expect(occupied.status).toBe(1);
    expect(occupied.stderr).toContain("task_id_collision");
    const historical = path.join(repo, ".trellis/tasks/historical");
    fs.mkdirSync(historical);
    fs.writeFileSync(path.join(historical, "task.json"), JSON.stringify({ id: "Git_Reserved", source: null }));
    git(repo, "add", ".trellis/tasks/historical");
    git(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Historical identity");
    fs.rmSync(historical, { recursive: true });
    const byRef = task(repo, "create", "Other", "--description", "Other", "--slug", "other", "--task-id", "git_reserved", "--no-start");
    expect(byRef.status).toBe(1);
    expect(byRef.stderr).toContain("task_id_collision");
    expect(fs.readdirSync(path.join(repo, ".trellis/tasks"))).toEqual(before);
  });

  it("creates a no-Issue task without branch metadata and archives it in a remote-backed repo", () => {
    const created = task(repo, "create", "Standalone", "--description", "Local work", "--slug", "standalone", "--no-start");
    expect(created.status, created.stderr).toBe(0);
    const name = taskDir(repo, "standalone");
    const before = metadata(repo, name);
    expect(before.id).toBe("standalone");
    expect(before.lifecycle_generation).toBe(0);
    expect(before.source).toEqual({ kind: "no_issue" });
    expect(before).not.toHaveProperty("branch");

    const started = task(repo, "start", name, "--allow-empty-context");
    expect(started.status, started.stderr).toBe(0);
    expect(metadata(repo, name)).not.toHaveProperty("branch");

    const archived = task(repo, "archive", name, "--no-commit", "--skip-branch-validation");
    expect(archived.status, archived.stderr).toBe(0);
    const archive = path.join(repo, ".trellis/tasks/archive");
    const month = fs.readdirSync(archive)[0];
    const after = JSON.parse(fs.readFileSync(path.join(archive, month, name, "task.json"), "utf8"));
    expect(after.id).toBe(before.id);
    expect(after.source).toEqual(before.source);
    expect(after.lifecycle_generation).toBe(0);
    expect(after).not.toHaveProperty("branch");
  });

  it("writes reviewed issue source on create and preserves it through rename and archive", () => {
    const source = { kind: "issue", repo_ref: "castbox/Trellis", number: 8, disposition: "exact_source" };
    const created = task(repo, "create", "Issue work", "--description", "Issue delivery", "--slug", "issue-work", "--task-id", "Issue_8", "--source-json", JSON.stringify(source), "--no-start");
    expect(created.status, created.stderr).toBe(0);
    const oldName = taskDir(repo, "issue-work");
    const file = path.join(repo, ".trellis/tasks", oldName, "task.json");
    const projected = metadata(repo, oldName);
    expect(projected).toMatchObject({ id: "Issue_8", source, lifecycle_generation: 0 });
    projected.lifecycle_generation = 2;
    fs.writeFileSync(file, `${JSON.stringify(projected)}\n`);

    const renamed = task(repo, "rename", oldName, "renamed-work");
    expect(renamed.status, renamed.stderr).toBe(0);
    const newName = taskDir(repo, "renamed-work");
    expect(newName).not.toBe(oldName);
    expect(metadata(repo, newName)).toMatchObject({ id: "Issue_8", source: projected.source, lifecycle_generation: 2 });

    const archived = task(repo, "archive", newName, "--no-commit");
    expect(archived.status, archived.stderr).toBe(0);
    const archive = path.join(repo, ".trellis/tasks/archive");
    const month = fs.readdirSync(archive)[0];
    const after = JSON.parse(fs.readFileSync(path.join(archive, month, newName, "task.json"), "utf8"));
    expect(after).toMatchObject({ id: "Issue_8", source: projected.source, lifecycle_generation: 2 });
  });

  it("rejects malformed or incomplete issue source before creating a task", () => {
    for (const source of [
      "{",
      JSON.stringify({ kind: "issue", repo_ref: "castbox/Trellis", number: 8 }),
      JSON.stringify({ kind: "issue", repo_ref: "castbox/Trellis", number: true, disposition: "exact_source" }),
      JSON.stringify({ kind: "issue", repo_ref: "castbox/Trellis", number: 8, disposition: "follow_up" }),
      JSON.stringify({ kind: "issue", repo_ref: "castbox/Trellis", number: 8, disposition: "parent" }),
      JSON.stringify({ kind: "issue", repo_ref: "castbox/Trellis", number: 0, disposition: "reference_only" }),
      JSON.stringify({ kind: "issue", repo_ref: "castbox/Trellis", number: true, disposition: "reference_only" }),
      JSON.stringify({ kind: "issue", repo_ref: "castbox/Trellis.git", number: 8, disposition: "reference_only" }),
      JSON.stringify({ kind: "issue", repo_ref: "castbox/Trellis", number: 8, disposition: null }),
      JSON.stringify({ kind: "issue", repo_ref: "castbox/Trellis.git", number: 8, disposition: "exact_source" }),
      JSON.stringify({ kind: "issue", repo_ref: ".castbox/Trellis", number: 8, disposition: "exact_source" }),
      JSON.stringify({ kind: "issue", repo_ref: "castbox/_Trellis", number: 8, disposition: "exact_source" }),
    ]) {
      const result = task(repo, "create", "Issue work", "--description", "Issue delivery", "--slug", "issue-work", "--source-json", source, "--no-start");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--source-json");
      expect(fs.existsSync(path.join(repo, ".trellis/tasks"))).toBe(false);
    }
  });

  it("accepts portable issue repository names retained by the Guru reader", () => {
    for (const [index, repoRef] of ["Owner_1/repo.name", "a/b.git-tools"].entries()) {
      const slug = `source-${index}`;
      const source = { kind: "issue", repo_ref: repoRef, number: 8, disposition: "exact_source" };
      const created = task(repo, "create", "Issue work", "--description", "Issue delivery", "--slug", slug,
        "--source-json", JSON.stringify(source), "--no-start");
      expect(created.status, created.stderr).toBe(0);
      expect(metadata(repo, taskDir(repo, slug)).source).toEqual(source);
    }
  });

  it.each(["exact_source", "reference_only"])("does not replace an existing TaskId or %s issue source with --force", (disposition) => {
    const source = { kind: "issue", repo_ref: "castbox/Trellis", number: 8, disposition };
    const args = ["create", "Issue work", "--description", "Issue delivery", "--slug", "issue-work", "--task-id", "Issue_8", "--source-json", JSON.stringify(source), "--no-start"];
    expect(task(repo, ...args).status).toBe(0);
    const name = taskDir(repo, "issue-work");
    const before = metadata(repo, name);

    const replaced = task(repo, "create", "Other work", "--description", "Different task", "--slug", "issue-work", "--task-id", "other-id", "--no-start", "--force");
    expect(replaced.status).toBe(1);
    expect(replaced.stderr).toContain("task_id_collision");
    expect(metadata(repo, name)).toEqual(before);
  });

  it.each([true, false])("creates reference-only preparation with no-start=%s and preserves its source through the session lifecycle", (noStart) => {
    fs.mkdirSync(path.join(repo, ".codex"));
    const source = { kind: "issue", repo_ref: "castbox/guru-trellis", number: 489, disposition: "reference_only" };
    const created = task(repo, "create", "发布准备",
      "--description", "仅交付发布准备，最终发布由来源 Issue 继续承担",
      "--slug", "reference-only-release-preparation", "--task-id", "reference-only-release-preparation",
      "--source-json", JSON.stringify(source), "--base-branch", "main", ...(noStart ? ["--no-start"] : []));
    expect(created.status, created.stderr).toBe(0);
    const name = taskDir(repo, "reference-only-release-preparation");
    const identity = { id: "reference-only-release-preparation", lifecycle_generation: 0, source };
    expect(metadata(repo, name)).toMatchObject({ ...identity, status: "planning", base_branch: "main" });
    expect(fs.readFileSync(path.join(repo, ".trellis/tasks", name, "prd.md"), "utf8"))
      .toContain("仅交付发布准备，最终发布由来源 Issue 继续承担");
    for (const manifest of ["implement.jsonl", "check.jsonl"]) {
      expect(fs.readFileSync(path.join(repo, ".trellis/tasks", name, manifest), "utf8")).toBe("");
    }
    const sessionFile = path.join(repo, ".git/trellis/sessions/source-lifecycle-test.json");
    expect(fs.existsSync(sessionFile)).toBe(!noStart);

    const started = task(repo, "start", name, "--allow-empty-context");
    expect(started.status, started.stderr).toBe(0);
    const sessionBytes = fs.readFileSync(sessionFile);
    expect(JSON.parse(sessionBytes.toString())).toEqual({ schema_version: 2, task_id: identity.id, lifecycle_generation: 0 });
    const current = task(repo, "current", "--json");
    expect(current.status, current.stderr).toBe(0);
    expect(JSON.parse(current.stdout)).toMatchObject({ current_task: { id: identity.id, status: "in_progress" }, stale: false });
    expect(metadata(repo, name)).toMatchObject({ ...identity, status: "in_progress" });

    const renamed = task(repo, "rename", name, "renamed-preparation");
    expect(renamed.status, renamed.stderr).toBe(0);
    const newName = taskDir(repo, "renamed-preparation");
    expect(metadata(repo, newName)).toMatchObject(identity);
    expect(fs.readFileSync(sessionFile)).toEqual(sessionBytes);
    const afterRename = task(repo, "current", "--json");
    expect(afterRename.status, afterRename.stderr).toBe(0);
    expect(JSON.parse(afterRename.stdout)).toMatchObject({ current_task: { id: identity.id, dir: `.trellis/tasks/${newName}` }, stale: false });

    const archived = task(repo, "archive", newName, "--no-commit");
    expect(archived.status, archived.stderr).toBe(0);
    const archive = path.join(repo, ".trellis/tasks/archive");
    const month = fs.readdirSync(archive)[0];
    expect(JSON.parse(fs.readFileSync(path.join(archive, month, newName, "task.json"), "utf8")))
      .toMatchObject({ ...identity, status: "completed" });
    expect(fs.existsSync(sessionFile)).toBe(false);
    const afterArchive = task(repo, "current", "--json");
    expect(afterArchive.status, afterArchive.stderr).toBe(1);
    expect(JSON.parse(afterArchive.stdout)).toMatchObject({ current_task: null, stale: false });
  });

  it("rejects a duplicate TaskId in another registered worktree", () => {
    git(repo, "config", "user.email", "test@example.invalid");
    git(repo, "config", "user.name", "Test");
    git(repo, "add", ".trellis/scripts");
    git(repo, "commit", "-qm", "fixture");
    const linked = `${repo}-linked`;
    git(repo, "worktree", "add", "-q", "-b", "linked", linked, "HEAD");
    try {
      const first = task(repo, "create", "First", "--description", "First task", "--slug", "first", "--task-id", "shared-id", "--no-start");
      expect(first.status, first.stderr).toBe(0);
      const second = task(linked, "create", "Second", "--description", "Second task", "--slug", "second", "--task-id", "shared-id", "--no-start");
      expect(second.status).toBe(1);
      expect(second.stderr).toContain("task_id_collision");
      expect(fs.existsSync(path.join(linked, ".trellis/tasks"))).toBe(false);
    } finally {
      git(repo, "worktree", "remove", "--force", linked);
    }
  });

  it("rejects an invalid TaskId before session binding or archive", () => {
    const created = task(repo, "create", "Invalid ID", "--description", "Invalid task ID", "--slug", "invalid-id", "--no-start");
    expect(created.status, created.stderr).toBe(0);
    const name = taskDir(repo, "invalid-id");
    const file = path.join(repo, ".trellis/tasks", name, "task.json");
    const data = metadata(repo, name);
    data.id = "invalid task";
    fs.writeFileSync(file, `${JSON.stringify(data)}\n`);
    const started = spawnSync("python3", [".trellis/scripts/task.py", "start", name, "--allow-empty-context"], {
      cwd: repo, encoding: "utf-8", env: { ...process.env, TRELLIS_CONTEXT_ID: "identity-test" },
    });
    expect(started.status).toBe(1);
    expect(started.stdout + started.stderr).toContain("invalid-task-schema");
    expect(fs.existsSync(path.join(repo, ".git/trellis/sessions"))).toBe(false);
    const contextless = task(repo, "start", name, "--allow-empty-context");
    expect(contextless.status).toBe(1);
    expect(contextless.stdout + contextless.stderr).toContain("invalid-task-schema");
    expect(metadata(repo, name).status).toBe("planning");
    const archived = task(repo, "archive", name, "--no-commit");
    expect(archived.status).toBe(1);
    expect(archived.stderr).toContain("invalid-task-schema");
    expect(fs.existsSync(file)).toBe(true);
  });

});
