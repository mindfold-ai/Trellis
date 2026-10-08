import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  emptyTaskRecord,
  loadTaskRecord,
  writeTaskRecord,
} from "@mindfoldhq/trellis-core/task";
import { migrate } from "../../src/commands/migrate.js";
import { update } from "../../src/commands/update.js";
import { VERSION } from "../../src/constants/version.js";
import {
  computeHash,
  loadHashes,
  saveHashes,
} from "../../src/utils/template-hash.js";

const retiredPlatformPaths = [
  ".agents/skills/trellis-meta/references/local-architecture/workspace-memory.md",
  ".claude/skills/trellis-meta/references/local-architecture/workspace-memory.md",
  ".cursor/skills/trellis-meta/references/local-architecture/workspace-memory.md",
];
const legacyReference = fs.readFileSync(
  new URL(
    "../fixtures/migrate-0.6.16/trellis-meta-workspace-memory.md",
    import.meta.url,
  ),
  "utf8",
);

const sha = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

describe("explicit migration integration", () => {
  let root: string;
  let planPath: string;
  const ref = ".trellis/tasks/09-08-media-model-tiers";
  const file = (name: string): string => path.join(root, name);
  const write = (name: string, content: string): void => {
    fs.mkdirSync(path.dirname(file(name)), { recursive: true });
    fs.writeFileSync(file(name), content);
  };
  const record = {
    ...emptyTaskRecord({
      id: "media-model-tiers",
      name: "media-model-tiers",
      title: "Media tiers",
      description: "TAPD business fact",
      createdAt: "2026-09-08",
      meta: { tapd: "42" },
    }),
    branch: "feature/media-tiers",
  };
  let plan: {
    schema_version: string;
    target_version: string;
    tasks: {
      task_ref: string;
      expected_sha256: string;
      record: typeof record;
    }[];
    deferred_tasks?: { task_ref: string; expected_sha256: string }[];
    current_tasks?: { task_ref: string; expected_sha256: string }[];
    file_decisions: {
      path: string;
      action: string;
      expected_sha256: string | null;
    }[];
  };
  const savePlan = (): void => {
    fs.writeFileSync(planPath, JSON.stringify(plan));
  };
  const snapshot = (): Map<string, string> => {
    const files = new Map<string, string>();
    const visit = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const name = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(name);
        else
          files.set(
            path.relative(root, name),
            sha(fs.readFileSync(name, "utf8")),
          );
      }
    };
    visit(root);
    return files;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-migrate-"));
    planPath = path.join(os.tmpdir(), `${path.basename(root)}-plan.json`);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    write(".trellis/.version", "0.6.16");
    write(
      ".trellis/config.yaml",
      "task_auto_commit: false\n# business config\n",
    );
    write(".trellis/workflow.md", "# Business workflow\n");
    write(".trellis/.developer", "historical-person\n");
    write(".trellis/workspace/person/journal.md", "Historical journal\n");
    write(".trellis/tasks/archive/old/task.json", '{"creator":"historical"}\n');
    write(".trellis/spec/business.md", "Business specification\n");
    write("business.txt", "uncommitted work\n");
    write(".trellis/scripts/task.py", "# old installed task entry\n");
    write(".trellis/scripts/retired.py", "# old retired core entry\n");
    saveHashes(root, {
      ".trellis/scripts/task.py": computeHash("# old installed task entry\n"),
      ".trellis/scripts/retired.py": computeHash("# old retired core entry\n"),
    });
    const old = Object.fromEntries(
      Object.entries(record).filter(
        ([key]) => key !== "lifecycle_generation" && key !== "source",
      ),
    );
    const legacyBytes =
      JSON.stringify(
        { ...old, creator: "old", assignee: "old", subtasks: [] },
        null,
        2,
      ) + "\n";
    write(`${ref}/task.json`, legacyBytes);
    plan = {
      schema_version: "1.0",
      target_version: VERSION,
      tasks: [{ task_ref: ref, expected_sha256: sha(legacyBytes), record }],
      file_decisions: [
        {
          path: ".trellis/scripts/retired.py",
          action: "remove",
          expected_sha256: sha("# old retired core entry\n"),
        },
      ],
    };
    savePlan();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(planPath, { force: true });
  });

  it("#1 previews without writes, migrates core and task, preserves history/business/config, and resumes the same plan", async () => {
    const before = snapshot();
    const preview = await migrate({
      from: "0.6.16",
      plan: planPath,
      dryRun: true,
    });
    expect(snapshot()).toEqual(before);
    expect(preview.conflicts).toEqual([]);
    expect(
      preview.actions.find((item) => item.path === `${ref}/task.json`)
        ?.before_sha256,
    ).toBe(plan.tasks[0]?.expected_sha256);
    await expect(update({ force: true })).rejects.toThrow(
      "Unsupported installed Trellis version",
    );
    expect(() => writeTaskRecord({ cwd: root, taskDir: ref, record })).toThrow(
      "Refusing to overwrite invalid",
    );
    await migrate({ from: "0.6.16", plan: planPath });
    expect(fs.readFileSync(file(".trellis/.version"), "utf8")).toBe(VERSION);
    expect(loadTaskRecord({ cwd: root, taskDir: ref })).toEqual(record);
    expect(
      fs.readFileSync(file(".trellis/scripts/task.py"), "utf8"),
    ).not.toContain("old installed task entry");
    expect(fs.existsSync(file(".trellis/scripts/retired.py"))).toBe(false);
    for (const name of [
      ".trellis/.developer",
      ".trellis/workspace/person/journal.md",
      ".trellis/tasks/archive/old/task.json",
      ".trellis/spec/business.md",
      "business.txt",
      ".trellis/config.yaml",
      ".trellis/workflow.md",
    ]) {
      expect(sha(fs.readFileSync(file(name), "utf8"))).toBe(before.get(name));
    }
    const migrated = snapshot();
    await migrate({ from: "0.6.16", plan: planPath });
    expect(snapshot()).toEqual(migrated);
  });

  it.each(["0.6.5", "0.6.15", "0.6.17", "0.7.0-castbox.1", "0.7.0-castbox.2"])(
    "migrates actual core %s and preserves reviewed current tasks and lifecycle state without serialization",
    async (source) => {
      write(".trellis/.version", source);
      const currentRef = ".trellis/tasks/10-01-current";
      const current = {
        ...record,
        id: "current",
        name: "current",
        lifecycle_generation: 3,
        status: "in_progress",
        meta: { business: "unpublished work" },
      };
      const bytes = JSON.stringify(current, null, 4) + "\n\n";
      write(`${currentRef}/task.json`, bytes);
      fs.chmodSync(file(`${currentRef}/task.json`), 0o640);
      write(
        ".trellis/.runtime/session.json",
        '{"focus":"current","generation":3}\n',
      );
      plan.current_tasks = [
        { task_ref: currentRef, expected_sha256: sha(bytes) },
      ];
      savePlan();
      const before = snapshot();
      const preview = await migrate({
        from: source,
        plan: planPath,
        dryRun: true,
      });
      expect(snapshot()).toEqual(before);
      expect(preview.source_version).toBe(source);
      expect(
        preview.actions.find((item) => item.path === `${currentRef}/task.json`),
      ).toMatchObject({
        action: "preserve",
        before_sha256: sha(bytes),
        after_sha256: sha(bytes),
        before_mode: 0o640,
        after_mode: 0o640,
      });
      await migrate({ from: source, plan: planPath });
      expect(fs.readFileSync(file(`${currentRef}/task.json`), "utf8")).toBe(
        bytes,
      );
      expect(fs.statSync(file(`${currentRef}/task.json`)).mode & 0o777).toBe(
        0o640,
      );
      expect(
        sha(fs.readFileSync(file(".trellis/.runtime/session.json"), "utf8")),
      ).toBe(before.get(".trellis/.runtime/session.json"));
      const migrated = snapshot();
      await migrate({ from: source, plan: planPath });
      expect(snapshot()).toEqual(migrated);
    },
  );

  it("rejects a normally edited current preserve projection before writing and rejects duplicate disposition", async () => {
    const bytes = JSON.stringify(record);
    write(`${ref}/task.json`, bytes);
    plan.tasks = [];
    plan.current_tasks = [{ task_ref: ref, expected_sha256: sha(bytes) }];
    savePlan();
    write(`${ref}/task.json`, bytes + "\n");
    const before = snapshot();
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "Stale current task",
    );
    expect(snapshot()).toEqual(before);
    plan.current_tasks = [
      { task_ref: ref, expected_sha256: sha(bytes + "\n") },
      { task_ref: ref, expected_sha256: sha(bytes + "\n") },
    ];
    savePlan();
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "Duplicate task disposition",
    );
    expect(snapshot()).toEqual(before);
  });

  it("#2 reports a normal local edit and requires an explicit preserve decision before any write", async () => {
    write(".trellis/scripts/task.py", "# local customization\n");
    const before = snapshot();
    const preview = await migrate({
      from: "0.6.16",
      plan: planPath,
      dryRun: true,
    });
    expect(preview.conflicts).toContain(".trellis/scripts/task.py");
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "explicit file decisions",
    );
    expect(snapshot()).toEqual(before);
    plan.file_decisions.push({
      path: ".trellis/scripts/task.py",
      action: "preserve",
      expected_sha256: sha("# local customization\n"),
    });
    savePlan();
    await migrate({ from: "0.6.16", plan: planPath });
    expect(fs.readFileSync(file(".trellis/scripts/task.py"), "utf8")).toBe(
      "# local customization\n",
    );
  });

  it("#3 a normally edited task makes its old projection stale before managed changes", async () => {
    write(
      `${ref}/task.json`,
      fs.readFileSync(file(`${ref}/task.json`), "utf8") + "\n",
    );
    const before = snapshot();
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "Stale task projection",
    );
    expect(snapshot()).toEqual(before);
  });

  it("#4 refuses omitted legacy active tasks and unsupported source versions", async () => {
    write(
      ".trellis/tasks/09-01-minimal/task.json",
      '{"id":"minimal","status":"in_progress"}\n',
    );
    const before = snapshot();
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "required",
    );
    await expect(migrate({ from: "0.5.16", plan: planPath })).rejects.toThrow(
      "Unsupported migration source",
    );
    expect(snapshot()).toEqual(before);
  });

  it("preserves reviewed deferred legacy bytes alongside converted and current tasks on execute/resume", async () => {
    const deferredRef = ".trellis/tasks/09-01-other-work";
    const bytes =
      JSON.stringify({
        id: "other-work",
        name: "other-work",
        title: "Other",
        status: "in_progress",
        creator: "old",
        assignee: "old",
      }) + "\n";
    write(`${deferredRef}/task.json`, bytes);
    write(
      ".trellis/tasks/09-02-current-work/task.json",
      JSON.stringify(
        emptyTaskRecord({
          id: "current-work",
          name: "current-work",
          title: "Current",
        }),
      ),
    );
    plan.deferred_tasks = [
      { task_ref: deferredRef, expected_sha256: sha(bytes) },
    ];
    savePlan();
    const before = snapshot();
    const preview = await migrate({
      from: "0.6.16",
      plan: planPath,
      dryRun: true,
    });
    expect(snapshot()).toEqual(before);
    expect(
      preview.actions.find((item) => item.path === `${deferredRef}/task.json`),
    ).toMatchObject({
      action: "preserve",
      before_sha256: sha(bytes),
      after_sha256: sha(bytes),
    });
    await migrate({ from: "0.6.16", plan: planPath });
    expect(fs.readFileSync(file(`${deferredRef}/task.json`), "utf8")).toBe(
      bytes,
    );
    expect(() =>
      writeTaskRecord({
        cwd: root,
        taskDir: deferredRef,
        record: emptyTaskRecord({
          id: "other-work",
          name: "other-work",
          title: "Other",
        }),
      }),
    ).toThrow("Refusing to overwrite invalid");
    const migrated = snapshot();
    await migrate({ from: "0.6.16", plan: planPath });
    expect(snapshot()).toEqual(migrated);
    write(`${deferredRef}/task.json`, bytes + "\n");
    const edited = snapshot();
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "Stale deferred task",
    );
    expect(snapshot()).toEqual(edited);
  });

  it("rejects duplicate converted/deferred dispositions and malformed current deferred records without writes", async () => {
    plan.deferred_tasks = [
      {
        task_ref: ref,
        expected_sha256: sha(fs.readFileSync(file(`${ref}/task.json`), "utf8")),
      },
    ];
    savePlan();
    let before = snapshot();
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "Duplicate task disposition",
    );
    expect(snapshot()).toEqual(before);
    const badRef = ".trellis/tasks/09-02-incomplete-current";
    const bytes = JSON.stringify({ ...record, lifecycle_generation: -1 });
    write(`${badRef}/task.json`, bytes);
    plan.deferred_tasks = [{ task_ref: badRef, expected_sha256: sha(bytes) }];
    savePlan();
    before = snapshot();
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "not a known legacy record",
    );
    expect(snapshot()).toEqual(before);
    const old = JSON.stringify({
      id: "old",
      name: "old",
      title: "Old",
      status: "planning",
      creator: "old",
      assignee: "old",
    });
    write(`${badRef}/task.json`, old);
    plan.deferred_tasks = [
      { task_ref: badRef, expected_sha256: sha(old) },
      { task_ref: badRef, expected_sha256: sha(old) },
    ];
    savePlan();
    before = snapshot();
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "Duplicate task disposition",
    );
    expect(snapshot()).toEqual(before);
  });

  it("surfaces all receipt-owned retired references without decisions and requires reviewed preserve/remove", async () => {
    const hashes = loadHashes(root);
    for (const name of retiredPlatformPaths) {
      write(name, legacyReference);
      hashes[name] = computeHash(legacyReference);
    }
    saveHashes(root, hashes);
    const before = snapshot();
    const preview = await migrate({
      from: "0.6.16",
      plan: planPath,
      dryRun: true,
    });
    expect(snapshot()).toEqual(before);
    for (const name of retiredPlatformPaths) {
      expect(preview.conflicts).toContain(name);
      expect(preview.actions.find((item) => item.path === name)?.action).toBe(
        "preserve",
      );
    }
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "explicit file decisions",
    );
    expect(snapshot()).toEqual(before);
    for (const name of retiredPlatformPaths)
      plan.file_decisions.push({
        path: name,
        action: "preserve",
        expected_sha256: sha(legacyReference),
      });
    savePlan();
    await migrate({ from: "0.6.16", plan: planPath });
    for (const name of retiredPlatformPaths)
      expect(fs.readFileSync(file(name), "utf8")).toBe(legacyReference);
    const migrated = snapshot();
    await migrate({ from: "0.6.16", plan: planPath });
    expect(snapshot()).toEqual(migrated);
  });

  it("#5 retires the three real 0.6.16 platform references through preview, execution and resume", async () => {
    const hashes = loadHashes(root);
    for (const name of retiredPlatformPaths) {
      write(name, legacyReference);
      hashes[name] = computeHash(legacyReference);
      plan.file_decisions.push({
        path: name,
        action: "remove",
        expected_sha256: sha(legacyReference),
      });
    }
    saveHashes(root, hashes);
    savePlan();
    const before = snapshot();
    const preview = await migrate({
      from: "0.6.16",
      plan: planPath,
      dryRun: true,
    });
    expect(snapshot()).toEqual(before);
    for (const name of retiredPlatformPaths) {
      expect(preview.actions.find((item) => item.path === name)).toMatchObject({
        action: "remove",
        before_sha256: sha(legacyReference),
        after_sha256: null,
      });
    }
    await migrate({ from: "0.6.16", plan: planPath });
    for (const name of retiredPlatformPaths) {
      expect(fs.existsSync(file(name))).toBe(false);
      expect(loadHashes(root)[name]).toBeUndefined();
    }
    const applied = snapshot();
    await migrate({ from: "0.6.16", plan: planPath });
    expect(snapshot()).toEqual(applied);
    expect(
      fs.readFileSync(file(".trellis/workspace/person/journal.md"), "utf8"),
    ).toBe("Historical journal\n");
  });

  it("#6 blocks removal when a real old reference was locally customized", async () => {
    const name = retiredPlatformPaths[0];
    if (!name) throw new Error("Missing retirement fixture path");
    write(name, legacyReference);
    saveHashes(root, {
      ...loadHashes(root),
      [name]: computeHash(legacyReference),
    });
    write(name, legacyReference + "\nLocal project convention\n");
    plan.file_decisions.push({
      path: name,
      action: "remove",
      expected_sha256: sha(legacyReference),
    });
    savePlan();
    const before = snapshot();
    await expect(migrate({ from: "0.6.16", plan: planPath })).rejects.toThrow(
      "locally modified",
    );
    expect(snapshot()).toEqual(before);
  });
});
