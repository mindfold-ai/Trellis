#!/usr/bin/env node
// Deliberately independent of implementation imports: usable against older builds.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("=");
  if (at < 0 || !arg.startsWith("--")) throw new Error(`Expected --key=value: ${arg}`);
  return [arg.slice(2, at), arg.slice(at + 1)];
}));
const target = path.resolve(options.target ?? ".");
const scenario = options.scenario ?? "python3";
const expectation = options.expect ?? "pass";
if (!["python3", "py"].includes(scenario) || !["pass", "baseline-defect"].includes(expectation))
  throw new Error("Use --scenario=python3|py --expect=pass|baseline-defect");
const output = path.resolve(options.output ?? `native-python-evidence/${scenario}`);
fs.mkdirSync(output, { recursive: true });
// Hosted Windows TEMP may use an 8.3 alias (RUNNER~1), whereas Git reports the
// long checkout path. Prefer the runner's dedicated temp root and retain its
// canonical spelling for exact-root maintenance contracts.
const tempRoot = process.env.RUNNER_TEMP && fs.existsSync(process.env.RUNNER_TEMP)
  ? process.env.RUNNER_TEMP : os.tmpdir();
const work = fs.realpathSync(fs.mkdtempSync(path.join(tempRoot, "trellis-native-python-")));
const cli = path.join(target, "packages/cli/bin/trellis.js");
const windows = process.platform === "win32";
const selected = scenario === "py" ? "py -3" : "python3";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const summary = {
  schema: 1, scenario, expectation, target, work,
  status: "infrastructure_failure", assertions: [], commands: [],
  identity: {
    platform: process.platform, release: os.release(), arch: os.arch(), node: process.version,
    image: process.env.ImageOS, imageVersion: process.env.ImageVersion,
    githubRun: process.env.GITHUB_RUN_ID, githubSha: process.env.GITHUB_SHA,
    driverSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  },
};
let phase = "infrastructure";
class AssertionFailure extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function assert(condition, code, message) {
  summary.assertions.push({ code, passed: Boolean(condition), message });
  if (!condition) throw new AssertionFailure(code, message);
}
function run(executable, args, cwd = work, env = process.env, input) {
  const result = spawnSync(executable, args, {
    cwd, env, encoding: "utf8", input, timeout: 120000, windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  const entry = {
    executable, args, cwd, exit: result.status, signal: result.signal,
    error: result.error?.message, stdout: result.stdout ?? "", stderr: result.stderr ?? "",
  };
  summary.commands.push(entry);
  fs.writeFileSync(path.join(output, `${String(summary.commands.length).padStart(3, "0")}.json`), JSON.stringify(entry, null, 2));
  return entry;
}
function success(result, label) {
  assert(result.exit === 0 && !result.error, "command_success", `${label}: exit=${result.exit} ${result.error ?? result.stderr}`);
  return result;
}
function json(result, label) {
  success(result, label);
  try { return JSON.parse(result.stdout.trim().split("\n").at(-1)); }
  catch { throw new Error(`${label}: invalid CLI JSON: ${result.stdout}`); }
}
function command(args, cwd, env) { return run(process.execPath, [cli, ...args], cwd, env); }
function python(args, env, cwd = work) {
  return run(scenario === "py" ? "py" : "python3", [...(scenario === "py" ? ["-3"] : []), ...args], cwd, env);
}
function resolveExecutable(name) {
  const result = windows ? run("where.exe", [name]) : run("/bin/sh", ["-c", `command -v ${name}`]);
  return result.exit === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null;
}
function isolatedEnvironment() {
  const realPython = options.python ?? resolveExecutable(windows ? "python" : "python3");
  assert(realPython && fs.existsSync(realPython), "real_python_available", "A real Python executable is required");
  success(run(realPython, ["-c", "import sys; assert sys.version_info >= (3,9); print(sys.executable); print(sys.version)"]), "real Python identity");
  const bin = path.join(work, "bin");
  fs.mkdirSync(bin);
  let interpreterDirectory = bin;
  if (windows && scenario === "python3") {
    // A renamed genuine CPython executable needs its original DLLs/stdlib.
    const runtime = path.join(work, "python-runtime");
    fs.cpSync(path.dirname(realPython), runtime, { recursive: true });
    fs.copyFileSync(path.join(runtime, path.basename(realPython)), path.join(runtime, "python3.exe"));
    fs.rmSync(path.join(runtime, "python.exe"), { force: true });
    fs.rmSync(path.join(runtime, "pythonw.exe"), { force: true });
    // Expose the intact runtime directly. A ._pth file would enable isolated
    // mode and incorrectly remove the executed script's directory from sys.path.
    // The runtime's Scripts subdirectory is deliberately not added to PATH.
    interpreterDirectory = runtime;
  } else if (windows) {
    const launcher = options.launcher ?? resolveExecutable("py");
    assert(launcher && fs.existsSync(launcher), "real_launcher_available", "A genuine registered Windows Python launcher is required");
    fs.copyFileSync(launcher, path.join(bin, "py.exe"));
    summary.identity.launcherSha256 = hash(fs.readFileSync(launcher));
  } else {
    assert(scenario === "python3", "native_scenario", "py scenario requires native Windows");
    fs.symlinkSync(realPython, path.join(bin, "python3"));
  }
  const originalPath = process.env.PATH ?? process.env.Path ?? "";
  const retained = originalPath.split(path.delimiter).filter((dir) => {
    if (!dir || !fs.existsSync(dir)) return false;
    return !["python", "python3", "py"].some((name) =>
      [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`].some((file) => fs.existsSync(path.join(dir, file))));
  });
  if (!windows) {
    // /usr/bin contains both python3 and essential shell tools. Project its
    // real executables into a private directory, excluding interpreter names.
    for (const dir of originalPath.split(path.delimiter)) {
      if (!dir || !fs.existsSync(dir) || retained.includes(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (/^(?:python|py)(?:[\d.]|$)/i.test(name) || fs.existsSync(path.join(bin, name))) continue;
        const source = path.join(dir, name);
        try { if (fs.statSync(source).isFile()) fs.symlinkSync(source, path.join(bin, name)); } catch { /* Dangling host entries are not tools. */ }
      }
    }
  }
  // Windows System32 can contain py.exe: retain OS tools using absolute paths,
  // but never retain a directory that exposes an alternate interpreter.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "path" || key.startsWith("TRELLIS_") || key.endsWith("_PROJECT_DIR") || key === "CLAUDE_ENV_FILE") delete env[key];
  }
  Object.assign(env, { PATH: [...new Set([bin, interpreterDirectory, ...retained])].join(path.delimiter), PYTHONDONTWRITEBYTECODE: "1", PYTHONUTF8: "1", NO_COLOR: "1", CI: "1" });
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  summary.identity.path = env.PATH;
  summary.identity.sourcePythonSha256 = hash(fs.readFileSync(realPython));
  const probe = "import sys,json; print(json.dumps({'executable':sys.executable,'version':sys.version})); assert sys.version_info >= (3,9)";
  const identity = success(python(["-c", probe], env), "isolated actual interpreter");
  summary.identity.python = JSON.parse(identity.stdout);
  summary.identity.pythonSha256 = hash(fs.readFileSync(summary.identity.python.executable));
  const importProbe = path.join(work, "script-import-probe");
  fs.mkdirSync(importProbe);
  fs.writeFileSync(path.join(importProbe, "sibling_module.py"), "VALUE = 'normal-script-import'\n");
  fs.writeFileSync(path.join(importProbe, "probe.py"), "import sibling_module\nassert sibling_module.VALUE == 'normal-script-import'\nprint(sibling_module.VALUE)\n");
  success(python([path.join(importProbe, "probe.py")], env), "real interpreter preserves script-directory imports");
  for (const name of ["python", "python3", "py"]) {
    const visibility = run(name, [...(name === "py" ? ["-3"] : []), "-c", "print('real-python-probe')"], work, env);
    assert(name === scenario ? visibility.exit === 0 : visibility.exit !== 0,
      "isolated_visibility", `${name} ${name === scenario ? "must" : "must not"} execute in isolated PATH`);
  }
  for (const [name, args] of [["git", ["--version"]], ["bash", ["--version"]]])
    summary.identity[name] = success(run(name, args, work, env), `${name} retained`).stdout;
  success(run(process.execPath, ["--version"], work, env), "Node retained");
  return env;
}
function read(root, name) { return fs.readFileSync(path.join(root, name), "utf8"); }
function managedSnapshot(root) {
  const hashes = JSON.parse(read(root, ".trellis/.template-hashes.json")).hashes;
  return Object.fromEntries(Object.keys(hashes).sort().map((name) => [name, hash(fs.readFileSync(path.join(root, name)))]));
}
const hookPath = ".codex/hooks.json";
function selectedHook(root) {
  const content = read(root, hookPath);
  const commands = [...content.matchAll(/"command"\s*:\s*"([^"\n]+)"/g)].map((m) => m[1]);
  assert(commands.some((value) => value.startsWith(`${selected} `)), "selection_lost",
    `${hookPath} must use ${selected}; actual=${JSON.stringify(commands)}`);
  assert(!commands.some((value) => /^(?:python|python3|py -3) /.test(value) && !value.startsWith(`${selected} `)),
    "selection_lost", "No generated hook silently uses another Python alias");
  return content;
}
function hashesMatch(root) {
  const hashes = JSON.parse(read(root, ".trellis/.template-hashes.json")).hashes;
  assert(hashes[hookPath] === hash(read(root, hookPath).replace(/\r\n/g, "\n")), "hash_matches", "hook hash matches rendered bytes");
}
function initialize(name, env, workflow = "native") {
  let root = path.join(work, name);
  fs.mkdirSync(root);
  success(run("git", ["init", "-q"], root, env), "git init");
  const gitRoot = success(run("git", ["rev-parse", "--show-toplevel"], root, env), "canonical checkout root").stdout.trim();
  root = fs.realpathSync(gitRoot);
  success(command(["init", "--codex", "--yes", "--no-monorepo", "--workflow", workflow], root, env), "public init");
  selectedHook(root);
  return root;
}
function maintenance(root, env) {
  const inspected = json(command(["maintain", "inspect-tools", "--target", root, "--json"], root, env), "inspect-tools");
  assert(inspected.files.find((f) => f.path === hookPath)?.status === "unchanged", "selection_lost", "prospective hook matches init output");
  const input = path.join(work, `input-${path.basename(root)}.json`);
  fs.writeFileSync(input, JSON.stringify({ kind: "tools_install", input: {
    root, workflow: { action: "preserve" }, file_decisions: [],
  } }));
  const prepared = json(command(["maintain", "prepare", "--input", input, "--json"], root, env), "prepare");
  const plan = path.join(work, `plan-${path.basename(root)}.json`);
  fs.writeFileSync(plan, JSON.stringify(prepared));
  json(command(["maintain", "preview", "--plan", plan], root, env), "preview");
  const applied = json(command(["maintain", "apply", "--plan", plan, "--state-dir", path.join(work, `state-${path.basename(root)}`)], root, env), "apply/native contract and context");
  assert(applied.status === "applied" && applied.recovery_ref, "applied", "tools_install returns applied and recovery_ref");
  for (const op of ["recover", "resume"]) {
    const result = json(command(["maintain", op, "--recovery", applied.recovery_ref], root, env), op);
    assert(result.operation_id === applied.operation_id && result.status === "applied" && result.recovery_ref === applied.recovery_ref,
      "recovery_identity", `${op} preserves original applied operation identity`);
  }
  selectedHook(root);
  hashesMatch(root);
}
function normalChain(name, env) {
  const root = initialize(name, env);
  const initial = selectedHook(root);
  success(command(["update", "--force"], root, env), "same-version update new process");
  selectedHook(root);
  hashesMatch(root);
  assert(read(root, hookPath) === initial, "selection_lost", "same-version update keeps selected hook bytes");
  const stable = JSON.stringify(managedSnapshot(root));
  success(command(["update", "--force"], root, env), "idempotent update");
  assert(JSON.stringify(managedSnapshot(root)) === stable, "idempotent_update", "repeat update has no managed drift");
  // Execute the generated entry's actual interpreter and hook script. This is
  // command execution evidence, deliberately not evidence of Agent autoload.
  success(python(["-X", "utf8", ".codex/hooks/inject-workflow-state.py"], env, root), "generated hook execution");
  const edited = `${initial}\n `;
  fs.writeFileSync(path.join(root, hookPath), edited);
  success(command(["update", "--create-new"], root, env), "update create-new conflict");
  assert(read(root, hookPath) === edited && read(root, `${hookPath}.new`) === initial, "conflict_preserved", "create-new preserves user content and writes selected candidate");
  success(command(["update", "--force"], root, env), "update force conflict");
  selectedHook(root);
  maintenance(root, env);
  // Workflow application must not silently migrate the legacy bootstrap Task.
  // Use a second real fresh-install project with native Delivery from init.
  const workflowRoot = initialize(`${name}-workflow`, env, "native-delivery-v1");
  success(command(["update", "--force"], workflowRoot, env), "Delivery update/native preflight");
  selectedHook(workflowRoot);
  workflowChain(workflowRoot, env);
}
function workflowChain(root, env) {
  const workflow = ".trellis/workflow.md";
  const userWorkflow = `${read(root, workflow)}\n<!-- user native regression -->\n`;
  fs.writeFileSync(path.join(root, workflow), userWorkflow);
  const beforeHash = read(root, ".trellis/.template-hashes.json");
  const marketplace = startMarketplace(root);
  env = { ...env, ...marketplace.environment };
  const args = ["workflow", "--marketplace", marketplace.source, "--template", "fixture-delivery"];
  success(command([...args, "--create-new"], root, env), "workflow preview");
  const preview = read(root, `${workflow}.new`);
  assert(read(root, workflow) === userWorkflow && read(root, ".trellis/.template-hashes.json") === beforeHash,
    "workflow_preview_preserved", "workflow preview preserves user file and hashes");
  assert(preview.includes(`${selected} `), "selection_lost", "workflow preview uses selected Python");
  success(command([...args, "--force"], root, env), "workflow force/native preflight");
  assert(read(root, workflow) === preview && read(root, `${workflow}.new`) === preview,
    "workflow_applied", "force applies preview bytes and preserves .new");
  const hashes = JSON.parse(read(root, ".trellis/.template-hashes.json")).hashes;
  assert(!Object.hasOwn(hashes, workflow), "workflow_hash", "custom provider workflow is removed from bundled hash ownership");
  assert(marketplace.sourceSha.length === 40, "actual_provider", "real fixture repository has a recorded source commit");
}
function startMarketplace(root) {
  const directory = path.join(work, `${path.basename(root)}-marketplace`);
  fs.mkdirSync(directory);
  const repository = path.join(directory, "repository");
  fs.mkdirSync(repository);
  fs.writeFileSync(path.join(repository, "index.json"), JSON.stringify({ version: 1, templates: [{ id: "fixture-delivery", type: "workflow", name: "Native regression Delivery", path: "workflow.md" }] }));
  fs.copyFileSync(path.join(target, "packages/cli/dist/templates/trellis/workflow-delivery-v1.md"), path.join(repository, "workflow.md"));
  for (const args of [["init", "-q", "-b", "main"], ["add", "."], ["-c", "user.name=Native regression", "-c", "user.email=native-regression@example.invalid", "commit", "-qm", "Native regression fixture"]])
    success(run("git", args, repository), "create real provider repository");
  const sourceSha = success(run("git", ["rev-parse", "HEAD"], repository), "fixture source identity").stdout.trim();
  const source = "https://native-regression.invalid/native/provider";
  const local = pathToFileURL(repository).href;
  const environment = {
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: `url.${local}.insteadOf`,
    GIT_CONFIG_VALUE_0: `${source}.git`,
    GIT_CONFIG_KEY_1: "protocol.file.allow",
    GIT_CONFIG_VALUE_1: "always",
  };
  summary.providers ??= [];
  summary.providers.push({ source, sourceSha, local, template: "fixture-delivery", transport: "real Git file transport via child-only url.insteadOf" });
  return { source, sourceSha, environment };
}

function treeDigest(directory) {
  const entries = [];
  function walk(current, relative = "") {
    for (const name of fs.readdirSync(current).sort()) {
      const full = path.join(current, name);
      const rel = relative ? `${relative}/${name}` : name;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else entries.push(`${rel}\0${hash(fs.readFileSync(full))}`);
    }
  }
  walk(directory);
  return hash(entries.join("\n"));
}
try {
  assert(fs.existsSync(cli) && fs.existsSync(path.join(target, "packages/cli/dist/cli/index.js")), "build_available", "Target must be built before running this driver");
  summary.identity.source = success(run("git", ["rev-parse", "HEAD"], target), "build source identity").stdout.trim();
  summary.identity.cliVersion = JSON.parse(fs.readFileSync(path.join(target, "packages/cli/package.json"))).version;
  summary.identity.buildSha256 = hash(fs.readFileSync(path.join(target, "packages/cli/dist/cli/index.js")));
  summary.identity.cliDistSha256 = treeDigest(path.join(target, "packages/cli/dist"));
  summary.identity.coreDistSha256 = treeDigest(path.join(target, "packages/core/dist"));
  const env = isolatedEnvironment();
  phase = "candidate";
  normalChain("automatic", env);
  normalChain("explicit", { ...env, TRELLIS_PYTHON_CMD: selected });
  // Skip-probe trusts the platform default even when it is unavailable. Native
  // postvalidation is not waived; cover only the legitimately probe-free paths.
  const empty = path.join(work, "empty-path");
  fs.mkdirSync(empty);
  const absent = { ...env, PATH: empty };
  const failureRoot = path.join(work, "failure");
  fs.mkdirSync(failureRoot);
  const failed = command(["init", "--codex", "--yes"], failureRoot, absent);
  assert(failed.exit !== 0 && /Python|python/i.test(failed.stdout + failed.stderr), "automatic_failure", "missing Python reports clear failure");
  assert(!fs.existsSync(path.join(failureRoot, ".trellis")), "failure_before_writes", "automatic detection fails before managed writes");
  const existing = path.join(work, "automatic");
  const beforeFailure = JSON.stringify(managedSnapshot(existing));
  const updateFailed = command(["update", "--force"], existing, absent);
  assert(updateFailed.exit !== 0 && /Python|python/i.test(updateFailed.stdout + updateFailed.stderr), "automatic_failure", "existing-project update fails clearly without Python");
  assert(JSON.stringify(managedSnapshot(existing)) === beforeFailure, "failure_before_writes", "update interpreter failure preserves managed bytes");
  const skippedRoot = path.join(work, "skipped");
  fs.mkdirSync(skippedRoot);
  success(command(["init", "--codex", "--yes", "--no-monorepo", "--workflow", "native"], skippedRoot, { ...absent, TRELLIS_SKIP_PYTHON_CHECK: "1" }), "skip check init without Python");
  const skipped = read(skippedRoot, hookPath);
  assert(skipped.includes(`${windows ? "python" : "python3"} `), "skip_semantics", "skip check preserves platform default");
  success(command(["update", "--create-new"], skippedRoot, { ...absent, TRELLIS_SKIP_PYTHON_CHECK: "1" }), "skip check update without probe");
  const explicitRoot = path.join(work, "unprobed-explicit");
  fs.mkdirSync(explicitRoot);
  success(command(["init", "--codex", "--yes", "--no-monorepo"], explicitRoot, { ...absent, TRELLIS_PYTHON_CMD: "user-selected-python" }), "explicit override is not probed");
  assert(read(explicitRoot, hookPath).includes("user-selected-python "), "explicit_semantics", "explicit unprobed selection is honored");
  summary.status = expectation === "pass" ? "passed" : "baseline_unexpected_pass";
} catch (error) {
  summary.failure = { code: error.code, message: error.message, stack: error.stack };
  const specificDefect = error instanceof AssertionFailure && error.code === "selection_lost";
  summary.status = specificDefect && expectation === "baseline-defect"
    ? "expected_baseline_defect"
    : phase !== "infrastructure" && error instanceof AssertionFailure && !["build_available", "real_python_available", "real_launcher_available", "isolated_visibility", "native_scenario", "provider_available"].includes(error.code)
      ? "candidate_failure" : "infrastructure_failure";
} finally {
  fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ status: summary.status, scenario, output, failure: summary.failure }));
  process.exitCode = ["passed", "expected_baseline_defect"].includes(summary.status) ? 0 : 1;
}
