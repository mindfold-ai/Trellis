import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { maintenance, VERSION, init } from "../../src/index.js";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task/legacy-migration";

const temporary: string[] = [];
function temp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-maint-api-"));
  temporary.push(root);
  return root;
}
function write(root: string, ref: string, value: string): void {
  fs.mkdirSync(path.dirname(path.join(root, ref)), { recursive: true });
  fs.writeFileSync(path.join(root, ref), value);
}
const bin = path.resolve(__dirname, "../../bin/trellis.js");
function cli(cwd: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [bin, "maintain", ...args, "--json"],
    { cwd, encoding: "utf8" },
  );
  return {
    ...result,
    json: JSON.parse(result.stdout) as Record<string, unknown>,
  };
}
afterEach(() => {
  for (const root of temporary.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
describe("public maintenance CLI and SDK", () => {
  it("keeps existing exports and prints one capability document from an unrelated outdated checkout", () => {
    expect(typeof init).toBe("function");
    expect(maintenance.getMaintenanceContract().cli_version).toBe(VERSION);
    const cwd = temp();
    write(cwd, ".trellis/.version", "0.6.1");
    const result = cli(cwd, "contract");
    expect(result.status, result.stderr).toBe(0);
    expect(result.json).toMatchObject({
      maintenance_api: "1.0",
      cli_version: VERSION,
      core_version: VERSION,
    });
    expect(result.stderr).toBe("");
  });
  it("prepares and previews read-only, then applies, recovers lost output and rolls back through the real bin", () => {
    const cwd = temp(),
      root = temp(),
      state = temp();
    const ref = ".trellis/tasks/selected",
      key = { task_id: "selected", lifecycle_generation: 0 };
    const source = JSON.stringify(
      emptyTaskRecord({ id: "selected", name: "Selected", title: "Selected" }),
    );
    write(root, `${ref}/task.json`, source);
    write(root, `${ref}/prd.md`, "Original accepted scope\n");
    const input = path.join(cwd, "input.json"),
      planFile = path.join(cwd, "plan.json");
    fs.writeFileSync(
      input,
      JSON.stringify({
        kind: "legacy_closeout",
        input: {
          root,
          key,
          task_ref: ref,
          source_kind: "schema1",
          archive_ref: ".trellis/tasks/archive/2026-10/selected",
          history_note: "Original owner: external acceptance remains pending.",
          retirements: [],
        },
      }),
    );
    const prepared = cli(cwd, "prepare", "--input", input);
    expect(prepared.status, prepared.stdout).toBe(0);
    expect(fs.readFileSync(path.join(root, ref, "task.json"), "utf8")).toBe(
      source,
    );
    fs.writeFileSync(planFile, JSON.stringify(prepared.json));
    const preview = cli(cwd, "preview", "--plan", planFile);
    expect(preview.status, preview.stdout).toBe(0);
    expect(fs.existsSync(path.join(root, ref))).toBe(true);
    const applied = cli(cwd, "apply", "--plan", planFile, "--state-dir", state);
    expect(applied.status, applied.stdout).toBe(0);
    expect(applied.json.status).toBe("applied");
    const recovery = String(applied.json.recovery_ref);
    const recovered = cli(cwd, "recover", "--recovery", recovery);
    expect(recovered.json.operation_id).toBe(prepared.json.operation_id);
    expect(recovered.json.status).toBe("applied");
    expect(cli(cwd, "resume", "--recovery", recovery).json.operation_id).toBe(
      prepared.json.operation_id,
    );
    expect(cli(cwd, "rollback", "--recovery", recovery).json.status).toBe(
      "rolled_back",
    );
    expect(fs.readFileSync(path.join(root, ref, "task.json"), "utf8")).toBe(
      source,
    );
  });
  it("returns a structured diagnostic for normal malformed input", () => {
    const root = temp(),
      input = path.join(root, "input.json");
    fs.writeFileSync(
      input,
      JSON.stringify({ kind: "tools_install", input: { root } }),
    );
    const result = cli(root, "prepare", "--input", input);
    expect(result.status).toBe(1);
    expect(result.json.error).toMatchObject({ code: "invalid_input" });
  });
  it("keeps a cold public candidate valid after real Python cache writes while detecting changed build bytes and modes", () => {
    const fixture = temp(),
      modules = path.join(fixture, "node_modules");
    const sourceCli = path.resolve(__dirname, "../..");
    const copiedCli = path.join(modules, "@mindfoldhq/trellis");
    const copiedCore = path.join(modules, "@mindfoldhq/trellis-core");
    for (const [source, destination] of [
      [sourceCli, copiedCli],
      [path.resolve(sourceCli, "../core"), copiedCore],
    ]) {
      fs.mkdirSync(destination, { recursive: true });
      for (const ref of ["package.json", "bin", "src", "dist"]) {
        if (!fs.existsSync(path.join(source, ref))) continue;
        fs.cpSync(path.join(source, ref), path.join(destination, ref), {
          recursive: true,
          filter: (file) =>
            path.basename(file) !== "__pycache__" && !/\.py[co]$/.test(file),
        });
      }
    }
    const { dependencies } = JSON.parse(
      fs.readFileSync(path.join(sourceCli, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    for (const name of Object.keys(dependencies)) {
      if (name === "@mindfoldhq/trellis-core") continue;
      const destination = path.join(modules, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(
        fs.realpathSync(path.join(sourceCli, "node_modules", name)),
        destination,
        "junction",
      );
    }
    function invoke(...args: string[]): ReturnType<typeof cli> {
      const result = spawnSync(
        process.execPath,
        [path.join(copiedCli, "bin/trellis.js"), "maintain", ...args, "--json"],
        { cwd: fixture, encoding: "utf8" },
      );
      return {
        ...result,
        json: JSON.parse(result.stdout) as Record<string, unknown>,
      };
    }
    const root = path.join(fixture, "target"),
      ref = ".trellis/tasks/selected";
    const source = JSON.stringify(
      emptyTaskRecord({ id: "selected", name: "Selected", title: "Selected" }),
    );
    write(root, `${ref}/task.json`, source);
    write(root, `${ref}/prd.md`, "Original accepted scope\n");
    const input = path.join(fixture, "input.json"),
      planFile = path.join(fixture, "plan.json"),
      state = path.join(fixture, "state");
    fs.writeFileSync(
      input,
      JSON.stringify({
        kind: "legacy_closeout",
        input: {
          root,
          key: { task_id: "selected", lifecycle_generation: 0 },
          task_ref: ref,
          source_kind: "schema1",
          archive_ref: ".trellis/tasks/archive/2026-10/selected",
          history_note: "Original owner retained history.",
          retirements: [],
        },
      }),
    );
    const prepared = invoke("prepare", "--input", input);
    expect(prepared.status, prepared.stdout + prepared.stderr).toBe(0);
    fs.writeFileSync(planFile, JSON.stringify(prepared.json));
    const scripts = path.join(copiedCli, "dist/templates/trellis/scripts");
    const script = path.join(scripts, "common/workflow_phase.py");
    const cache = path.join(scripts, "common/__pycache__");
    expect(fs.existsSync(cache)).toBe(false);
    // macOS system Python redirects caches externally; explicitly select its
    // normal in-place cache policy so the same real writer runs on every OS.
    const imported = spawnSync(
      process.platform === "win32" ? "python" : "python3",
      [
        "-c",
        "import sys,compileall;sys.pycache_prefix=None;sys.dont_write_bytecode=False;sys.path.insert(0,sys.argv[1]);from common import workflow_phase;compileall.compile_file(workflow_phase.__file__,legacy=True,quiet=2)",
        scripts,
      ],
      { encoding: "utf8" },
    );
    expect(imported.status, imported.stderr).toBe(0);
    expect(fs.readdirSync(cache).some((name) => name.endsWith(".pyc"))).toBe(
      true,
    );
    expect(fs.existsSync(`${script}c`)).toBe(true);
    const applied = invoke("apply", "--plan", planFile, "--state-dir", state);
    expect(applied.status, applied.stdout + applied.stderr).toBe(0);
    expect(applied.json.status).toBe("applied");
    const recovery = String(applied.json.recovery_ref);
    expect(invoke("recover", "--recovery", recovery).json.status).toBe(
      "applied",
    );
    expect(invoke("rollback", "--recovery", recovery).json.status).toBe(
      "rolled_back",
    );
    const changes =
      process.platform === "win32" ? ["bytes"] : ["bytes", "mode"];
    for (const change of changes) {
      const current = invoke("prepare", "--input", input);
      expect(current.status, current.stdout + current.stderr).toBe(0);
      fs.writeFileSync(planFile, JSON.stringify(current.json));
      if (change === "bytes")
        fs.appendFileSync(script, "\n# A later candidate source update.\n");
      else fs.chmodSync(script, (fs.statSync(script).mode & 0o777) ^ 0o100);
      const blockedState = path.join(fixture, `${change}-state`);
      const blocked = invoke(
        "apply",
        "--plan",
        planFile,
        "--state-dir",
        blockedState,
      );
      expect(blocked.status).toBe(1);
      expect(blocked.json.error).toMatchObject({ code: "candidate_mismatch" });
      expect(fs.existsSync(blockedState)).toBe(false);
      expect(fs.readFileSync(path.join(root, ref, "task.json"), "utf8")).toBe(
        source,
      );
      expect(fs.readFileSync(path.join(root, ref, "prd.md"), "utf8")).toBe(
        "Original accepted scope\n",
      );
      expect(fs.existsSync(path.join(root, ".trellis/tasks/archive"))).toBe(
        false,
      );
    }
  }, 30_000);
});
