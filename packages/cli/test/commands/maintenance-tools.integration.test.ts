import * as pythonRuntime from "../../src/utils/python.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task";
import {
  prepareToolsInstallation,
  inspectToolsTarget,
  type ToolsInstallationInput,
  parseToolsInstallationInput,
  validateToolsInstallation,
} from "../../src/commands/maintenance/tools.js";
import {
  applyPlan,
  readSnapshot,
  rollbackPlan,
  recoverPlan,
  recoverOperation,
  resumeOperation,
} from "../../src/commands/maintenance/shared.js";
import { deliveryWorkflowMdTemplate } from "../../src/templates/trellis/index.js";
import { computeHash, loadHashes } from "../../src/utils/template-hash.js";
import { collectPlatformTemplates } from "../../src/configurators/index.js";
import { applyCodexAgentModelKeys } from "../../src/configurators/codex.js";
import { VERSION } from "../../src/constants/version.js";

const temporary: string[] = [];
function temp() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "trellis-maintain-tools-"),
  );
  temporary.push(root);
  return root;
}
function write(root: string, ref: string, bytes: string, mode = 0o640) {
  const file = path.join(root, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  fs.chmodSync(file, mode);
}
function scan(root: string): Map<string, string> {
  const result = new Map<string, string>();
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else
        result.set(
          path.relative(root, file),
          `${fs.statSync(file).mode & 0o777}:${fs.readFileSync(file).toString("base64")}`,
        );
    }
  }
  walk(root);
  return result;
}
function seed(root: string) {
  write(root, ".trellis/.version", "0.6.15\n");
  write(root, ".trellis/workflow.md", "# Retained original workflow\n");
  write(
    root,
    ".trellis/scripts/task.py",
    "# old runnable installation\n",
    0o755,
  );
  write(
    root,
    ".trellis/.template-hashes.json",
    JSON.stringify({
      __version: 2,
      hashes: {
        ".trellis/scripts/task.py": computeHash(
          "# old runnable installation\n",
        ),
      },
    }),
  );
  write(
    root,
    ".trellis/tasks/old/task.json",
    JSON.stringify(
      emptyTaskRecord({
        id: "old",
        name: "old",
        title: "Old Task",
        status: "in_progress",
      }),
    ),
  );
  write(root, ".trellis/tasks/old/prd.md", "Exact accepted scope\r\n", 0o600);
  write(
    root,
    ".trellis/tasks/archive/2025-01/old/task.json",
    JSON.stringify(
      emptyTaskRecord({
        id: "archived",
        name: "archived",
        title: "Archived",
        status: "completed",
      }),
    ),
  );
  write(
    root,
    ".trellis/spec/project-owned.md",
    "Do not update project specs\n",
    0o600,
  );
}
function input(root: string): ToolsInstallationInput {
  return {
    root,
    workflow: {
      action: "install",
      template_id: "native-delivery-v1",
      provider: "bundled",
      content: deliveryWorkflowMdTemplate,
      ownership: "bundled",
    },
    file_decisions: [],
  };
}
const python = process.platform === "win32" ? "python" : "python3";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const root of temporary.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("independent single-checkout tools installation", () => {
  it("reports the failed native probe stage and exit without echoing Git diagnostics", async () => {
    const root = temp();
    seed(root);
    vi.stubEnv("TRELLIS_PYTHON_CMD", python);
    const plan = await prepareToolsInstallation(input(root));
    await applyPlan(plan, path.join(temp(), "state"));
    // A normal broken Git entry makes native context fail after contract succeeds.
    write(root, ".git", `gitdir: ${path.join(root, "private-git-diagnostic")}\n`);
    const before = scan(root);
    expect(() => validateToolsInstallation(plan, python)).toThrow(
      /^incomplete_operation: target native context failed: exit 1 \(10000 ms budget\)$/,
    );
    expect(scan(root)).toEqual(before);
  });

  it("freezes custom AGENTS before preparation and preserves Core receipts through replay and rollback", async () => {
    const root = temp();
    seed(root);
    const original = "# Project heading\r\nProject tail\r\n";
    const content = `${original}<!-- team -->\nNew team instructions\n`;
    write(root, "AGENTS.md", original, 0o600);
    const before = scan(root);
    const baseline = await prepareToolsInstallation({
      ...input(root),
      file_decisions: [
        {
          path: "AGENTS.md",
          source: readSnapshot(root, "AGENTS.md"),
          action: "replace",
        },
      ],
    });
    const request: ToolsInstallationInput = {
      ...input(root),
      file_decisions: [
        {
          path: "AGENTS.md",
          source: readSnapshot(root, "AGENTS.md"),
          action: "custom",
          content,
        },
      ],
    };
    const plan = await prepareToolsInstallation(request);
    expect(scan(root)).toEqual(before);
    expect(
      plan.actions.find(
        (action) => action.path === ".trellis/.template-hashes.json",
      ),
    ).toEqual(
      baseline.actions.find(
        (action) => action.path === ".trellis/.template-hashes.json",
      ),
    );
    const state = temp();
    const applied = await applyPlan(plan, state);
    if (!applied.recovery_ref) throw new Error("missing recovery reference");
    expect(applied.status).toBe("applied");
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toBe(content);
    expect(readSnapshot(root, "AGENTS.md")?.mode).toBe(
      plan.actions.find((action) => action.path === "AGENTS.md")?.source?.mode,
    );
    expect((await recoverOperation(applied.recovery_ref)).status).toBe(
      "applied",
    );
    expect((await resumeOperation(applied.recovery_ref)).status).toBe(
      "applied",
    );
    const reapply = await prepareToolsInstallation({
      root,
      workflow: { action: "preserve" },
      file_decisions: [
        {
          path: "AGENTS.md",
          source: readSnapshot(root, "AGENTS.md"),
          action: "custom",
          content,
        },
      ],
    });
    expect((await applyPlan(reapply, state)).status).toBe("applied");
    expect((await rollbackPlan(reapply, state)).status).toBe("rolled_back");
    expect((await rollbackPlan(plan, state)).status).toBe("rolled_back");
    expect(scan(root)).toEqual(before);
  });

  it("protects a normal project edit after custom AGENTS installation", async () => {
    const root = temp();
    seed(root);
    write(root, "AGENTS.md", "# Project\n");
    const plan = await prepareToolsInstallation({
      ...input(root),
      file_decisions: [
        {
          path: "AGENTS.md",
          source: readSnapshot(root, "AGENTS.md"),
          action: "custom",
          content: "# Project\nTeam instructions\n",
        },
      ],
    });
    const state = temp();
    const applied = await applyPlan(plan, state);
    if (!applied.recovery_ref) throw new Error("missing recovery reference");
    fs.appendFileSync(path.join(root, "AGENTS.md"), "Later project rule\n");
    const edited = scan(root);
    await expect(recoverOperation(applied.recovery_ref)).rejects.toThrow(
      /later_work_conflict/,
    );
    await expect(resumeOperation(applied.recovery_ref)).rejects.toThrow(
      /later_work_conflict/,
    );
    await expect(rollbackPlan(plan, state)).rejects.toThrow(
      /later_work_conflict/,
    );
    expect(scan(root)).toEqual(edited);
  });

  it("limits custom input to AGENTS without changing existing disposition parsing", () => {
    const request = input(temp());
    expect(() =>
      parseToolsInstallationInput({
        ...request,
        file_decisions: [
          {
            path: ".trellis/config.yaml",
            source: null,
            action: "custom",
            content: "new",
          },
        ],
      }),
    ).toThrow(/invalid_input/);
    for (const action of ["preserve", "replace", "create-new", "remove"]) {
      expect(
        parseToolsInstallationInput({
          ...request,
          file_decisions: [{ path: "AGENTS.md", source: null, action }],
        }).file_decisions[0],
      ).toEqual({ path: "AGENTS.md", source: null, action });
    }
  });

  it("freezes Windows-observable tools modes without changing exact raw source snapshots", async () => {
    const root = temp();
    seed(root);
    const script = ".trellis/scripts/task.py";
    fs.chmodSync(path.join(root, script), 0o666);
    write(root, ".trellis/config.yaml", "# local configuration\n", 0o444);
    const source = readSnapshot(root, script);
    const receipt = readSnapshot(root, ".trellis/.template-hashes.json");
    const before = scan(root);
    vi.stubEnv("TRELLIS_PYTHON_CMD", python);
    vi.stubGlobal("process", new Proxy(process, {
      get(target, property) {
        return property === "platform" ? "win32" : Reflect.get(target, property);
      },
    }));
    const request = input(root);
    request.file_decisions.push({
      path: ".trellis/config.yaml",
      source: readSnapshot(root, ".trellis/config.yaml"),
      action: "create-new",
    });
    const plan = await prepareToolsInstallation(request);
    expect(plan.actions.find((action) => action.path === ".trellis/config.yaml.new")).toMatchObject({
      source: null,
      target: { mode: 0o666 },
    });
    expect(plan.actions.find((action) => action.path === script)).toMatchObject({
      source,
      target: { mode: 0o666 },
    });
    expect(plan.actions.find((action) => action.path === ".trellis/scripts/delivery.py")).toMatchObject({
      source: null,
      target: { mode: 0o666 },
    });
    expect(plan.actions.find((action) => action.path === ".trellis/agents/implement.md")).toMatchObject({
      source: null,
      target: { mode: 0o666 },
    });
    expect(plan.actions.find((action) => action.path === ".trellis/.template-hashes.json")).toMatchObject({
      source: receipt,
      target: { mode: receipt?.mode },
    });
    expect(scan(root)).toEqual(before);
    const untracked = temp();
    write(untracked, ".trellis/.version", "0.6.15");
    write(untracked, ".trellis/workflow.md", "# existing workflow");
    const fresh = await prepareToolsInstallation(input(untracked));
    expect(fresh.actions.find((action) => action.path === ".trellis/.template-hashes.json")).toMatchObject({
      source: null,
      target: { mode: 0o666 },
    });
  });

  it("keeps Unix script targets executable while preserving ordinary existing file modes", async () => {
    const root = temp();
    seed(root);
    vi.stubEnv("TRELLIS_PYTHON_CMD", python);
    vi.stubGlobal("process", new Proxy(process, {
      get(target, property) {
        return property === "platform" ? "linux" : Reflect.get(target, property);
      },
    }));
    const plan = await prepareToolsInstallation(input(root));
    for (const name of [".trellis/scripts/task.py", ".trellis/scripts/delivery.py"])
      expect(plan.actions.find((action) => action.path === name)).toMatchObject({ target: { mode: 0o755 } });
    expect(plan.actions.find((action) => action.path === ".trellis/agents/implement.md")).toMatchObject({ target: { mode: 0o644 } });
    expect(plan.actions.find((action) => action.path === ".trellis/.version")).toMatchObject({ target: { mode: 0o640 } });
  });

  it("fails Python selection before tools apply writes or creates recovery state", async () => {
    const root = temp();
    seed(root);
    const plan = await prepareToolsInstallation(input(root));
    const before = scan(root);
    const state = path.join(temp(), "state");
    vi.spyOn(pythonRuntime, "resolveSupportedPython").mockImplementation(() => {
      throw new Error("No supported Python command found");
    });
    await expect(applyPlan(plan, state)).rejects.toThrow(
      "No supported Python command found",
    );
    expect(scan(root)).toEqual(before);
    expect(fs.existsSync(state)).toBe(false);
  });

  it("requires reprepare when the current interpreter changes rendered replacement bytes", async () => {
    const root = temp();
    seed(root);
    vi.stubEnv("TRELLIS_PYTHON_CMD", "python3");
    const plan = await prepareToolsInstallation(input(root));
    const before = scan(root);
    const state = path.join(temp(), "state");
    vi.stubEnv("TRELLIS_PYTHON_CMD", "py -3");
    await expect(applyPlan(plan, state)).rejects.toThrow(
      "rendered candidate changed",
    );
    expect(scan(root)).toEqual(before);
    expect(fs.existsSync(state)).toBe(false);
  });

  it("rejects interpreter drift when rereading or resuming the original successful recovery reference", async () => {
    const root = temp();
    seed(root);
    vi.stubEnv("TRELLIS_PYTHON_CMD", python);
    const plan = await prepareToolsInstallation(input(root));
    const applied = await applyPlan(plan, path.join(temp(), "state"));
    expect(applied.status).toBe("applied");
    const recovery = applied.recovery_ref;
    if (!recovery) throw new Error("missing recovery reference");
    const before = scan(root);
    vi.stubEnv("TRELLIS_PYTHON_CMD", "py -3.12");
    await expect(recoverOperation(recovery)).rejects.toThrow("rendered candidate changed");
    await expect(resumeOperation(recovery)).rejects.toThrow("rendered candidate changed");
    expect(scan(root)).toEqual(before);
  });

  it("cuts over only the selected real worktree, retains old data and controls, replays the same operation and creates new native Tasks", async () => {
    const base = temp();
    const target = path.join(base, "target"),
      peer = path.join(base, "peer");
    fs.mkdirSync(target);
    execFileSync("git", ["init", "-b", "main", target], { stdio: "pipe" });
    seed(target);
    execFileSync("git", ["-C", target, "add", "."]);
    execFileSync(
      "git",
      [
        "-C",
        target,
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-m",
        "predecessor",
      ],
      { stdio: "pipe" },
    );
    execFileSync("git", ["-C", target, "worktree", "add", "-b", "peer", peer], {
      stdio: "pipe",
    });
    write(
      target,
      ".git/trellis/sessions/retained.json",
      '{"schema_version":2,"task_id":"old","lifecycle_generation":0}\n',
    );
    const peers = scan(peer),
      data = scan(path.join(target, ".trellis/tasks")),
      controls = scan(path.join(target, ".git/trellis"));
    const before = scan(path.join(target, ".trellis"));
    const plan = await prepareToolsInstallation(input(target));
    expect(scan(path.join(target, ".trellis"))).toEqual(before);
    const state = path.join(base, "private-state");
    expect((await applyPlan(plan, state)).status).toBe("applied");
    expect((await applyPlan(plan, state)).operation_id).toBe(plan.operation_id);
    expect((await recoverPlan(plan, state)).status).toBe("applied");
    expect(scan(peer)).toEqual(peers);
    expect(scan(path.join(target, ".trellis/tasks"))).toEqual(data);
    expect(scan(path.join(target, ".git/trellis"))).toEqual(controls);
    expect(
      fs.readFileSync(path.join(target, ".trellis/.version"), "utf8").trim(),
    ).toBe(VERSION);
    expect(
      fs.readFileSync(
        path.join(target, ".trellis/spec/project-owned.md"),
        "utf8",
      ),
    ).toBe("Do not update project specs\n");
    const reapplied = await prepareToolsInstallation({
      root: target,
      workflow: { action: "preserve" },
      file_decisions: [],
    });
    expect((await applyPlan(reapplied, state)).status).toBe("applied");
    await expect(
      prepareToolsInstallation({
        root: target,
        workflow: { action: "preserve" },
        file_decisions: [
          {
            path: ".trellis/scripts/task.py",
            source: readSnapshot(target, ".trellis/scripts/task.py"),
            action: "remove",
          },
        ],
      }),
    ).rejects.toThrow(/removal requires complete managed ownership/);
    execFileSync(
      python,
      [
        path.join(target, ".trellis/scripts/task.py"),
        "create",
        "New native task",
        "--slug",
        "new-native",
        "--task-id",
        "new-native",
        "--description",
        "Current runtime task",
      ],
      {
        cwd: target,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
        stdio: "pipe",
      },
    );
    const created = fs
      .readdirSync(path.join(target, ".trellis/tasks"))
      .find((n) => n.endsWith("new-native"));
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            target,
            ".trellis/tasks",
            created ?? "missing-native-task",
            "task.json",
          ),
          "utf8",
        ),
      ).schema_version,
    ).toBe("2.0");
    await expect(rollbackPlan(plan, state)).rejects.toThrow(
      /incompatible_restore/,
    );
    expect(scan(peer)).toEqual(peers);
  }, 30000);

  it("rejects required-runtime sidecars and skip conflicts without advancing installation receipts", async () => {
    const root = temp();
    seed(root);
    write(root, ".trellis/scripts/task.py", "# legitimate local edit\n", 0o755);
    const before = scan(root),
      args = input(root);
    args.file_decisions = [
      {
        path: ".trellis/scripts/task.py",
        source: readSnapshot(root, ".trellis/scripts/task.py"),
        action: "create-new",
      },
    ];
    await expect(prepareToolsInstallation(args)).rejects.toThrow(
      /required runtime unresolved/,
    );
    expect(scan(root)).toEqual(before);
    write(
      root,
      ".trellis/config.yaml",
      "update:\n  skip:\n    - .trellis/scripts/task.py\n",
    );
    await expect(prepareToolsInstallation(input(root))).rejects.toThrow(
      /update.skip excludes required runtime/,
    );
    expect(
      fs.readFileSync(path.join(root, ".trellis/.version"), "utf8").trim(),
    ).toBe("0.6.15");
  });

  it("keeps explicit custom ownership even for bundled-equal content and restores only tools", async () => {
    const root = temp();
    seed(root);
    const args = input(root);
    args.workflow = {
      action: "install",
      template_id: "team-custom",
      provider: "reviewed-local-package",
      content: deliveryWorkflowMdTemplate,
      ownership: "custom",
    };
    const plan = await prepareToolsInstallation(args),
      state = temp();
    await applyPlan(plan, state);
    expect(loadHashes(root)[".trellis/workflow.md"]).toBeUndefined();
    write(root, "business/new.txt", "later business work\n");
    await rollbackPlan(plan, state);
    expect(fs.readFileSync(path.join(root, "business/new.txt"), "utf8")).toBe(
      "later business work\n",
    );
    expect(
      fs.readFileSync(path.join(root, ".trellis/.version"), "utf8").trim(),
    ).toBe("0.6.15");
  });

  it("preserves platform customizations, managed blocks and config sidecars on reapply", async () => {
    const root = temp();
    seed(root);
    const codexPath = ".codex/agents/trellis-implement.toml";
    const codex = collectPlatformTemplates("codex")?.get(codexPath) ?? "";
    const claudePath = ".claude/settings.json";
    const claude =
      collectPlatformTemplates("claude-code")?.get(claudePath) ?? "";
    write(
      root,
      codexPath,
      applyCodexAgentModelKeys(codex, {
        model: "custom-model",
        model_reasoning_effort: "low",
      }),
    );
    write(
      root,
      claudePath,
      JSON.stringify(
        {
          ...JSON.parse(claude),
          statusLine: { type: "command", command: "my-status-line" },
        },
        null,
        2,
      ) + "\n",
    );
    const hashes = loadHashes(root);
    hashes[codexPath] = computeHash(codex);
    hashes[claudePath] = computeHash(claude);
    write(
      root,
      ".trellis/.template-hashes.json",
      JSON.stringify({ __version: 2, hashes }),
    );
    write(
      root,
      "AGENTS.md",
      "User heading\n\n<!-- TRELLIS:START -->\nOld managed block\n<!-- TRELLIS:END -->\nUser tail\n",
    );
    write(
      root,
      ".trellis/config.yaml",
      "custom: retained\nupdate:\n  skip:\n    - .trellis/agents/nonexistent.md\n",
    );
    const args = input(root);
    args.file_decisions = [
      {
        path: "AGENTS.md",
        source: readSnapshot(root, "AGENTS.md"),
        action: "replace",
      },
      {
        path: ".trellis/config.yaml",
        source: readSnapshot(root, ".trellis/config.yaml"),
        action: "create-new",
      },
    ];
    const state = temp();
    await applyPlan(await prepareToolsInstallation(args), state);
    expect(fs.readFileSync(path.join(root, codexPath), "utf8")).toContain(
      'model = "custom-model"',
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(root, claudePath), "utf8"))
        .statusLine.command,
    ).toBe("my-status-line");
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("User heading");
    expect(agents).toContain("User tail");
    expect(agents).not.toContain("Old managed block");
    expect(
      fs.readFileSync(path.join(root, ".trellis/config.yaml"), "utf8"),
    ).toContain("custom: retained");
    expect(fs.existsSync(path.join(root, ".trellis/config.yaml.new"))).toBe(
      true,
    );
    expect(loadHashes(root)[".trellis/config.yaml"]).toBeUndefined();
    const reapplied = {
      root,
      workflow: { action: "preserve" as const },
      file_decisions: [
        {
          path: ".trellis/config.yaml",
          source: readSnapshot(root, ".trellis/config.yaml"),
          action: "preserve" as const,
        },
      ],
    };
    await applyPlan(await prepareToolsInstallation(reapplied), state);
    expect(fs.readFileSync(path.join(root, codexPath), "utf8")).toContain(
      'model_reasoning_effort = "low"',
    );
  });

  it("can preserve an undeclared legacy custom workflow while updating its tools", async () => {
    const root = temp();
    seed(root);
    const before = readSnapshot(root, ".trellis/workflow.md");
    const plan = await prepareToolsInstallation({
      root,
      workflow: { action: "preserve" },
      file_decisions: [],
    });
    await applyPlan(plan, temp());
    expect(readSnapshot(root, ".trellis/workflow.md")).toEqual(before);
    expect(loadHashes(root)[".trellis/workflow.md"]).toBeUndefined();
  });

  it.each(["identity2", "unversioned_local"])("reports a pending %s native selection without converting its Task or binding", async (family) => {
    const root = temp();
    seed(root);
    const session = ".trellis/.runtime/sessions/codex_pending.json";
    write(
      root,
      session,
      JSON.stringify(family === "identity2" ? {
        schema_version: 2, task_id: "old", lifecycle_generation: 0,
      } : {
        platform: "codex", last_seen_at: "2026-10-15T09:58:29Z",
        current_task: ".trellis/tasks/old", current_run: null,
        sessionId: "original-session",
      }),
      0o600,
    );
    const taskBefore = readSnapshot(root, ".trellis/tasks/old/task.json"),
      bindingBefore = readSnapshot(root, session);
    vi.stubEnv("TRELLIS_CONTEXT_ID", "codex_pending");
    const plan = await prepareToolsInstallation(input(root));
    await applyPlan(plan, temp());
    const selected = execFileSync(
      python,
      [
        "-c",
        "from pathlib import Path; from common.active_task import resolve_active_task; print(resolve_active_task(Path.cwd()).error)",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PYTHONPATH: path.join(root, ".trellis/scripts"),
          PYTHONDONTWRITEBYTECODE: "1",
        },
      },
    );
    expect(selected).toContain("maintenance_required");
    expect(selected).toContain("maintain");
    expect(readSnapshot(root, ".trellis/tasks/old/task.json")).toEqual(
      taskBefore,
    );
    expect(readSnapshot(root, session)).toEqual(bindingBefore);
  });

  it("blocks a stale preserved workflow before apply and rollback without touching tools or later edits", async () => {
    const root = temp();
    seed(root);
    const state = temp();
    const plan = await prepareToolsInstallation({
      root,
      workflow: { action: "preserve" },
      file_decisions: [],
    });
    write(
      root,
      ".trellis/workflow.md",
      "# Normal newer workflow edit\n",
      0o600,
    );
    const beforeApply = scan(root);
    await expect(applyPlan(plan, state)).rejects.toThrow(/later_work_conflict/);
    expect(scan(root)).toEqual(beforeApply);
    // Reprepare from the ordinary new source, then edit only after successful install.
    const currentPlan = await prepareToolsInstallation({
      root,
      workflow: { action: "preserve" },
      file_decisions: [],
    });
    await applyPlan(currentPlan, state);
    write(
      root,
      ".trellis/workflow.md",
      "# Later business workflow edit\n",
      0o600,
    );
    const beforeRollback = scan(root);
    await expect(rollbackPlan(currentPlan, state)).rejects.toThrow(
      /later_work_conflict/,
    );
    expect(scan(root)).toEqual(beforeRollback);
  });

  it("classifies unsupported source versions without running old dispatchers", async () => {
    const root = temp();
    seed(root);
    for (const version of ["0.7.0-rc.1", "unknown", "0.7.0-castbox.999"]) {
      write(root, ".trellis/.version", version);
      await expect(inspectToolsTarget({ root })).rejects.toThrow(
        /unsupported_source_version/,
      );
    }
  });
});
