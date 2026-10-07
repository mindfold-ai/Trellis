/**
 * Integration tests for `task.py list` tree rendering (#402).
 *
 * The python script lives under
 * `src/templates/trellis/scripts/task.py` (+ `common/task_store.py` for
 * `set-meta`); this test stamps the real templates into a fresh git repo
 * and exercises the actual `python3 task.py list` / `list --json` /
 * `create --meta` / `set-meta` paths.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function setupRepo(tmp: string): void {
  fs.mkdirSync(tmp, { recursive: true });
  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });
}

function makeTask(
  repo: string,
  name: string,
  overrides: Record<string, unknown> = {},
): void {
  const dir = path.join(repo, ".trellis", "tasks", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prd.md"), `${name} prd\n`);
  const taskJson: Record<string, unknown> = {
    id: name,
    name,
    title: name,
    status: "planning",
    priority: "P2",
    createdAt: "2026-07-22",
    assignee: "tester",
    creator: "tester",
    subtasks: [],
    children: [],
    parent: null,
    relatedFiles: [],
    meta: {},
    ...overrides,
  };
  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify(taskJson) + "\n",
  );
}

function runTask(repo: string, ...args: string[]) {
  return spawnSync("python3", [".trellis/scripts/task.py", ...args], {
    cwd: repo,
    encoding: "utf-8",
  });
}

describe.skipIf(!hasPython())("task.py list tree view (#402)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-list-test-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("indents children under their parent", () => {
    makeTask(tmp, "07-01-parent-task", {
      status: "in_progress",
      children: ["07-02-child-a", "07-03-child-b"],
    });
    makeTask(tmp, "07-02-child-a", {
      status: "planning",
      parent: "07-01-parent-task",
    });
    makeTask(tmp, "07-03-child-b", {
      status: "completed",
      parent: "07-01-parent-task",
    });

    const r = runTask(tmp, "list");
    expect(r.status).toBe(0);
    const lines = r.stdout.split("\n").map((l) => l.trimEnd());
    const parentIdx = lines.findIndex((l) => l.includes("07-01-parent-task/"));
    const childAIdx = lines.findIndex((l) => l.includes("07-02-child-a/"));
    const childBIdx = lines.findIndex((l) => l.includes("07-03-child-b/"));
    expect(parentIdx).toBeGreaterThanOrEqual(0);
    expect(childAIdx).toBeGreaterThan(parentIdx);
    expect(childBIdx).toBeGreaterThan(parentIdx);
    // Children are indented further than the parent.
    const parentIndent = lines[parentIdx].match(/^\s*/)?.[0].length ?? 0;
    const childIndent = lines[childAIdx].match(/^\s*/)?.[0].length ?? 0;
    expect(childIndent).toBeGreaterThan(parentIndent);
  });

  it("renders a flat task with no parent/children unchanged", () => {
    makeTask(tmp, "07-05-flat-task", { status: "planning" });

    const r = runTask(tmp, "list");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("07-05-flat-task/");
  });

  describe("filtered descendants (#631)", () => {
    const filters = [
      {
        label: "--mine",
        args: ["--mine"],
        excluded: [
          { assignee: "other", status: "in_progress" },
          { assignee: "other", status: "in_progress" },
        ],
      },
      {
        label: "--status",
        args: ["--status", "in_progress"],
        excluded: [
          { assignee: "tester", status: "planning" },
          { assignee: "tester", status: "planning" },
        ],
      },
      {
        label: "--mine --status",
        args: ["--mine", "--status", "in_progress"],
        excluded: [
          { assignee: "other", status: "in_progress" },
          { assignee: "tester", status: "planning" },
        ],
      },
    ];

    beforeEach(() => {
      fs.writeFileSync(path.join(tmp, ".trellis", ".developer"), "name=tester\n");
    });

    it.each(filters)(
      "$label preserves matches across hidden ancestors and their indentation",
      ({ args, excluded }) => {
        const names = ["root", "parent", "match", "bridge", "leaf"];
        const overrides = [excluded[0], excluded[1], {}, excluded[0], {}];
        names.forEach((name, index) => {
          makeTask(tmp, name, {
            status: "in_progress",
            parent: names[index - 1] ?? null,
            children: names.slice(index + 1, index + 2),
            ...overrides[index],
          });
        });
        const taskFiles = names.map((name) =>
          path.join(tmp, ".trellis", "tasks", name, "task.json"),
        );
        const before = taskFiles.map((file) => fs.readFileSync(file));

        const text = runTask(tmp, "list", ...args);
        const json = runTask(tmp, "list", ...args, "--json");
        expect(text.status).toBe(0);
        expect(text.stderr).toBe("");
        expect(json.status).toBe(0);
        expect(json.stderr).toBe("");
        const rows = [...text.stdout.matchAll(/^([ \t]*)- ([^/\r\n]+)\//gm)].map(
          ([, indent, name]) => ({ name, indent: indent.length }),
        );
        expect(rows).toEqual([
          { name: "match", indent: 2 },
          { name: "leaf", indent: 4 },
        ]);
        const data = JSON.parse(json.stdout) as {
          tasks: { dir: string; parent: string; children: string[] }[];
        };
        expect(rows.map((row) => row.name).sort()).toEqual(
          data.tasks.map((task) => task.dir.split("/").pop()).sort(),
        );
        expect(text.stdout).toContain(`Total: ${data.tasks.length} task(s)`);
        expect(data.tasks.find((task) => task.dir.endsWith("/match"))).toMatchObject({
          parent: "parent",
          children: ["bridge"],
        });
        expect(taskFiles.map((file) => fs.readFileSync(file))).toEqual(before);

        const unfiltered = runTask(tmp, "list");
        expect(unfiltered.status).toBe(0);
        expect(
          [...unfiltered.stdout.matchAll(/^([ \t]*)- ([^/\r\n]+)\//gm)].map(
            ([, indent, name]) => ({ name, indent: indent.length }),
          ),
        ).toEqual(names.map((name, index) => ({ name, indent: 2 * (index + 1) })));
        expect(unfiltered.stdout).toContain(`Total: ${names.length} task(s)`);
      },
    );

    it.each(filters)("$label reports no matches", ({ args, excluded }) => {
      makeTask(tmp, "parent", { ...excluded[0], children: ["child"] });
      makeTask(tmp, "child", { ...excluded[1], parent: "parent" });

      const text = runTask(tmp, "list", ...args);
      const json = runTask(tmp, "list", ...args, "--json");
      expect(text.status).toBe(0);
      expect(text.stdout).not.toMatch(/^\s*- /m);
      expect(text.stdout).toContain(
        args.includes("--mine") ? "(no tasks assigned to you)" : "(no active tasks)",
      );
      expect(text.stdout).toContain("Total: 0 task(s)");
      expect(json.status).toBe(0);
      expect(JSON.parse(json.stdout)).toEqual({ tasks: [] });
    });
  });

  it("renders a dangling parent ref flat without erroring (orphan safety)", () => {
    makeTask(tmp, "07-06-orphan", {
      status: "planning",
      parent: "does-not-exist",
    });

    const r = runTask(tmp, "list");
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("07-06-orphan/");
  });

  it("--json includes parent and children fields", () => {
    makeTask(tmp, "07-01-parent-task", {
      status: "in_progress",
      children: ["07-02-child-a"],
    });
    makeTask(tmp, "07-02-child-a", {
      status: "planning",
      parent: "07-01-parent-task",
    });

    const r = runTask(tmp, "list", "--json");
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout) as {
      tasks: { dir: string; parent: string | null; children: string[] }[];
    };
    const parent = data.tasks.find((t) => t.dir.endsWith("07-01-parent-task"));
    const child = data.tasks.find((t) => t.dir.endsWith("07-02-child-a"));
    expect(parent?.children).toEqual(["07-02-child-a"]);
    expect(child?.parent).toBe("07-01-parent-task");
  });
});
