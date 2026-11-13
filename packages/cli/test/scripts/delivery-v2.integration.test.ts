import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { computeCandidateContentRef, verifyCandidate, verifyHistoricalCommit, type AuthorityRef, type CandidateRef, type GateResult, type TaskRecordV2, type WorkflowContract } from "@mindfoldhq/trellis-core/task/v2";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
const fixtures = path.resolve(__dirname, "../../../core/test/fixtures/task-v2");
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
const available = spawnSync(python, ["--version"]).status === 0;
const native = JSON.parse(fs.readFileSync(path.join(fixtures, "native-multi.json"), "utf8")) as { workflow: WorkflowContract; initial: TaskRecordV2 };
const d1 = "11111111-1111-4111-8111-111111111111";
const d2 = "22222222-2222-4222-8222-222222222222";
const digest = (value: string | Buffer): string => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function install(root: string): void {
  fs.mkdirSync(path.join(root, ".trellis"), { recursive: true });
  fs.cpSync(scripts, path.join(root, ".trellis/scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, ".trellis/workflow.md"), `[trellis-runtime-contract]\n${JSON.stringify(native.workflow)}\n[/trellis-runtime-contract]\n`);
}
function run(root: string, entry: string, args: string[], key = "delivery-v2-test") {
  return spawnSync(python, [`.trellis/scripts/${entry}.py`, ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, TRELLIS_CONTEXT_ID: key },
  });
}
function ok(root: string, entry: string, args: string[], key?: string): string {
  const result = run(root, entry, args, key);
  expect(result.status, `${entry} ${args[0]}: ${result.stderr}\n${result.stdout}`).toBe(0);
  return result.stdout;
}
function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const parityProgram = `
import json,sys,tempfile
from pathlib import Path
from common.delivery_operations import apply_operation
from common.delivery_schema import DeliveryError,parse_task_v2
from common.delivery_store import candidate_content_ref
fixture=json.load(open(sys.argv[1],encoding='utf-8'))
record=fixture['initial']; observations=[]
for case in fixture.get('hash_cases',[]):
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory)
        for name,contents in case['files'].items():
            file=root/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text(contents,encoding='utf-8');file.chmod(case.get('modes',{}).get(name,0o644))
        observations.append({'name':case['name'],'content_ref':candidate_content_ref(root,case['paths'],case.get('kind'))})
for case in fixture.get('schema_cases',[]):
    try: parse_task_v2(case['input']); observations.append({'name':case['name'],'error':None})
    except DeliveryError as exc: observations.append({'name':case['name'],'error':exc.code})
for step in fixture['steps']:
    try:
        result=apply_operation(record,step['operation'],fixture['workflow'])
        record=result['record']; observations.append({'phase':result['phase'],'changed':result['changed']})
    except DeliveryError as exc: observations.append({'error':exc.code})
print(json.dumps({'observations':observations,'record':record}))
`;

interface Step { expect_error?: string; expected_phase?: string; expected_changed?: boolean }
interface Fixture { steps: Step[]; schema_cases?: { name: string; expect_error: string }[]; hash_cases?: { name: string; content_ref: string }[] }

describe.skipIf(!available)("Delivery v2 shipped Python (minimum interpreter)", () => {
  let root: string;
  let task: string;
  const extra: string[] = [];
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-delivery-v2-"));
    install(root);
    ok(root, "task", ["create", "Delivery fixture", "--description", "Independent slices", "--slug", "fixture", "--task-id", "fixture-task", "--schema-version", "2.0", "--no-start"]);
    task = `.trellis/tasks/${fs.readdirSync(path.join(root, ".trellis/tasks")).find((name) => name.endsWith("-fixture"))}`;
    fs.writeFileSync(path.join(root, "requirements.md"), "R1: retained artifact\nR2: second slice\n");
    fs.writeFileSync(path.join(root, "plan.md"), "Reviewed plan\n");
    fs.writeFileSync(path.join(root, "artifact.txt"), "Accepted artifact\n");
    fs.chmodSync(path.join(root, "artifact.txt"), 0o644);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const directory of [root, ...extra.splice(0)]) fs.rmSync(directory, { recursive: true, force: true });
  });
  function ref(file: string): AuthorityRef { return { locator: file, revision: digest(fs.readFileSync(path.join(root, file))) }; }
  function record(): TaskRecordV2 { return JSON.parse(fs.readFileSync(path.join(root, task, "task.json"), "utf8")) as TaskRecordV2; }
  function operation(name: string, role: keyof WorkflowContract["owners"], fields: Record<string, unknown>, deliveryId?: string, generation = 0) {
    return { api_version: "1.0", operation: name, key: { task_id: "fixture-task", lifecycle_generation: generation, ...(deliveryId ? { delivery_id: deliveryId } : {}) }, owner_role: role, owner_id: native.workflow.owners[role], ...fields };
  }
  function apply(value: object): Record<string, unknown> { return JSON.parse(ok(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(value)])) as Record<string, unknown>; }
  function prepare(deliveryId = d1, profile = "manual"): void {
    if (record().accepted_scope === null) apply(operation("accept_scope", "task_scope", { authority: ref("requirements.md") }));
    apply(operation("create_delivery", "creation", { scope_ref: { authority: ref("requirements.md"), anchors: ["R1"] }, profile }, deliveryId));
  }
  function gate(role: GateResult["owner_role"], phase: string, candidate: CandidateRef | null, previous: string | null, deliveryId = d1): string {
    const resultId = `${deliveryId}-${role}`;
    apply(operation("record_gate", role, {
      expected_phase: phase,
      result: { result_id: resultId, owner_role: role, owner_id: native.workflow.owners[role], outcome: role === "planning" ? "accepted" : role === "readiness" ? "ready" : "passed", scope_ref: { authority: ref("requirements.md"), anchors: ["R1"] }, plan_ref: ref("plan.md"), candidate, predecessor_result_id: previous, obligations: [], evidence: [ref("plan.md")] },
    }, deliveryId));
    return resultId;
  }
  function candidate(gitProject = false, paths = ["artifact.txt"]): CandidateRef {
    const hash = JSON.parse(ok(root, "delivery", ["candidate", "--paths", ...paths, "--kind", gitProject ? "git" : "git_free"])) as { content_ref: string };
    return { kind: gitProject ? "git" : "git_free", ...hash, paths, head_ref: gitProject ? git(root, "rev-parse", "HEAD") : null, base_ref: null };
  }
  function ready(gitProject = false, paths = ["artifact.txt"]): CandidateRef {
    const planning = gate("planning", "planning", null, null);
    const current = candidate(gitProject, paths);
    apply(operation("begin_check", "implementation", { expected_phase: "implementing", candidate: current }, d1));
    const check = gate("check", "checking", current, planning);
    const review = gate("full_review", "reviewing", current, check);
    gate("readiness", "reviewing", current, review);
    return current;
  }

  for (const file of fs.readdirSync(fixtures).filter((name) => name.endsWith(".json"))) {
    it(`matches Core-owned schema/transition fixture ${file}`, () => {
      const fixture = JSON.parse(fs.readFileSync(path.join(fixtures, file), "utf8")) as Fixture;
      const process = spawnSync(python, ["-c", parityProgram, path.join(fixtures, file)], { encoding: "utf8", env: { ...globalThis.process.env, PYTHONPATH: scripts } });
      expect(process.status, process.stderr).toBe(0);
      const output = JSON.parse(process.stdout) as { observations: Record<string, unknown>[] };
      const schemas = fixture.schema_cases ?? [];
      const hashes = fixture.hash_cases ?? [];
      hashes.forEach((item, index) => expect(output.observations[index]).toEqual({ name: item.name, content_ref: item.content_ref }));
      schemas.forEach((item, index) => expect(output.observations[index + hashes.length]).toEqual({ name: item.name, error: item.expect_error }));
      fixture.steps.forEach((step, index) => {
        const observation = output.observations[index + schemas.length + hashes.length];
        if (step.expect_error) expect(observation).toEqual({ error: step.expect_error });
        else {
          expect(observation).not.toHaveProperty("error");
          if (step.expected_phase !== undefined) expect(observation?.phase).toBe(step.expected_phase);
          if (step.expected_changed !== undefined) expect(observation?.changed).toBe(step.expected_changed);
        }
      });
    });
  }

  it.each(["manual", "local_commit"])("stops a retained unsupported %s slice through installed apply/store and releases only its selection", (profile) => {
    ok(root, "task", ["start", task]);
    prepare(d1, profile); prepare(d2, "pull_request");
    ok(root, "delivery", ["select", "--task", task, "--delivery", d1]);
    ok(root, "task", ["start", task], "peer-selection");
    ok(root, "delivery", ["select", "--task", task, "--delivery", d2], "peer-selection");
    const before = record();
    const workflow = { ...native.workflow, profiles: ["pull_request"] };
    // Retained data under a restricted declaration; workflow-switch preflight is unchanged.
    fs.writeFileSync(path.join(root, ".trellis/workflow.md"), `[trellis-runtime-contract]\n${JSON.stringify(workflow)}\n[/trellis-runtime-contract]\n`);
    const result = { result_id: "retained-withdrawal", owner_id: native.workflow.owners.planning, evidence: [ref("requirements.md")], reason: ref("requirements.md"), scope_decision: ref("requirements.md") };
    const request = operation("stop", "planning", { expected_phase: "planning", result }, d1);
    const bytesBefore = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    const rejected = run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify({ ...request, result: { ...result, evidence: [] } })]);
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("result evidence required");
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(bytesBefore);
    expect(apply(request).changed).toBe(true);
    const expected = structuredClone(before);
    const withdrawn = expected.deliveries[0]; if (!withdrawn) throw new Error("missing Delivery");
    withdrawn.phase = "stopped"; withdrawn.stop_result = result;
    expect(record()).toEqual(expected);
    expect(JSON.parse(ok(root, "delivery", ["current", "--json"])).kind).toBe("no_current_delivery");
    const peer = JSON.parse(ok(root, "delivery", ["current", "--json"], "peer-selection")) as { kind: string; key: { delivery_id: string } };
    expect(peer.kind).toBe("current"); expect(peer.key.delivery_id).toBe(d2);
    const bytesAfter = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    expect(apply(request).changed).toBe(false);
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(bytesAfter);
    expect(record().completion_results).toEqual([]); expect(record().closure_results).toEqual([]);
  });

  it("manual two-slice execution retains plans, separates binding/activation/Completion/Closure/archive", () => {
    ok(root, "task", ["start", task]);
    prepare();
    expect(JSON.parse(ok(root, "delivery", ["current", "--json"])).kind).toBe("no_current_delivery");
    ok(root, "delivery", ["select", "--task", task, "--delivery", d1]);
    expect(record().deliveries[0]?.phase).toBe("planning");
    const current = ready();
    const result = operation("record_delivery", "delivery", { expected_phase: "publishing", result: { result_id: "manual-delivered", owner_id: native.workflow.owners.delivery, evidence: [ref("artifact.txt")], candidate: current, profile: "manual", artifact: ref("artifact.txt") } }, d1);
    apply(result);
    expect(JSON.parse(ok(root, "delivery", ["current", "--json"])).kind).toBe("no_current_delivery");
    expect(record().completion_results).toEqual([]);
    const before = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    expect(apply(result).changed).toBe(false);
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
    prepare(d2);
    ok(root, "delivery", ["select", "--task", task, "--delivery", d2]);
    apply(operation("stop", "planning", { expected_phase: "planning", result: { result_id: "stopped-d2", owner_id: native.workflow.owners.planning, evidence: [ref("requirements.md")], reason: ref("requirements.md"), scope_decision: ref("requirements.md") } }, d2));
    expect(record().deliveries.map((d) => d.phase)).toEqual(["delivered", "stopped"]);
    expect(fs.existsSync(path.join(root, task, `deliveries/${d1}/design.md`))).toBe(true);
    expect(fs.existsSync(path.join(root, task, `deliveries/${d2}/design.md`))).toBe(true);
    expect(run(root, "task", ["archive", task]).stderr).toContain("completion_and_closure_required");
    apply(operation("complete_task", "completion", { result: { result_id: "completed-g0", owner_id: native.workflow.owners.completion, evidence: [ref("requirements.md")], lifecycle_generation: 0, accepted_scope: ref("requirements.md"), delivery_result_ids: ["manual-delivered"], outcome: "completed" } }));
    expect(run(root, "task", ["archive", task]).stderr).toContain("completion_and_closure_required");
    apply(operation("close_task", "closure", { result: { result_id: "closed-g0", owner_id: native.workflow.owners.closure, evidence: [ref("requirements.md")], lifecycle_generation: 0, completion_result_id: "completed-g0", disposition: "no_mutation", source_result: null } }));
    fs.writeFileSync(path.join(root, ".trellis/config.yaml"), "task_auto_commit: false\n");
    ok(root, "task", ["archive", task]);
    const archived = path.join(root, ".trellis/tasks/archive", fs.readdirSync(path.join(root, ".trellis/tasks/archive"))[0] as string, path.basename(task), "task.json");
    expect(JSON.parse(fs.readFileSync(archived, "utf8"))).not.toHaveProperty("status");
    expect(JSON.parse(ok(root, "delivery", ["current", "--json"])).kind).toBe("no_current_task");
  });

  it("retains a clean local commit through formal gates and recovers historical actual success after edits", () => {
    git(root, "init", "-q"); git(root, "add", "artifact.txt", "requirements.md", "plan.md");
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "actual content");
    ok(root, "task", ["start", task]);
    prepare(d1, "local_commit"); const beforeHead = git(root, "rev-parse", "HEAD");
    const current = ready(true);
    apply(operation("record_delivery", "delivery", { expected_phase: "publishing", result: { result_id: "local-delivered", owner_id: native.workflow.owners.delivery, evidence: [ref("artifact.txt")], candidate: current, profile: "local_commit", commit: beforeHead } }, d1));
    expect(git(root, "rev-parse", "HEAD")).toBe(beforeHead);
    prepare(d2, "local_commit"); gate("planning", "planning", null, null, d2);
    fs.writeFileSync(path.join(root, "artifact.txt"), "new pending content");
    apply(operation("record_delivery", "delivery", { expected_phase: "implementing", historical_success: true, result: { result_id: "historical-local", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], candidate: current, profile: "local_commit", commit: beforeHead } }, d2));
    expect(record().deliveries[1]?.results.check).toBeNull();
    expect(record().deliveries[1]?.phase).toBe("delivered");
  });

  it("rejects mutable local commit refs and tag objects, then normally delivers exact SHA with Git-normalized permissions", () => {
    git(root, "init", "-q"); git(root, "add", "artifact.txt", "requirements.md", "plan.md");
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "actual immutable commit");
    prepare(d1, "local_commit"); const original = candidate(true); const head = original.head_ref; if (!head) throw new Error("missing own commit");
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "tag", "-am", "actual tag object", "candidate-tag");
    const request = (commit: string) => operation("record_delivery", "delivery", { expected_phase: "planning", historical_success: true, result: { result_id: "exact-sha-delivery", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], profile: "local_commit", candidate: { ...original, head_ref: commit }, commit } }, d1);
    const before = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    for (const commit of ["HEAD", git(root, "branch", "--show-current"), "candidate-tag", head.slice(0, 12)]) {
      expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(request(commit))]).stderr).toContain("invalid_record");
      expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
    }
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(request(git(root, "rev-parse", "candidate-tag")))]).stderr).toContain("invalid_git_fact");
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(request("0".repeat(40)))]).stderr).toContain("invalid_git_fact");
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
    const hexNamedBranch = "1".repeat(40); git(root, "branch", hexNamedBranch);
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(request(hexNamedBranch))]).stderr).toContain("invalid_git_fact");
    expect(ready(true)).toEqual(original);
    fs.chmodSync(path.join(root, "artifact.txt"), 0o600);
    expect(candidate(true)).toEqual(original);
    const gitFree = candidate(false);
    expect(gitFree.content_ref).not.toBe(original.content_ref);
    expect(apply({ ...request(head), expected_phase: "publishing", historical_success: false }).phase).toBe("delivered");
    expect(record().deliveries[0]?.delivery_result?.candidate).toEqual(original);
  });

  for (const format of ["sha1", "sha256"]) {
    it(`preserves literal paths, binary bytes, repeated blob modes and deletions in ${format} public apply`, () => {
      git(root, "init", "-q", `--object-format=${format}`);
      const names = ["plain", "空格文件", "with space", "with\ttab", "with\nnewline", "with:colon", "[abc]", " leading", "trailing ", "executable"];
      const contents = Buffer.from("hello\0world\n");
      for (const name of names) {
        fs.writeFileSync(path.join(root, name), contents);
        fs.chmodSync(path.join(root, name), name === "executable" ? 0o755 : 0o644);
      }
      fs.writeFileSync(path.join(root, "a"), "pathspec decoy");
      git(root, "add", "--", ...names, "a");
      git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "literal paths");
      const paths = [...names, "deleted"];
      const expected = digest(JSON.stringify([...paths].sort().map((name) => name === "deleted" ? [name, null, null] : [name, name === "executable" ? 0o755 : 0o644, createHash("sha256").update(contents).digest("hex")])));
      const actual = JSON.parse(ok(root, "delivery", ["candidate", "--kind", "git", "--paths", ...paths])) as { content_ref: string };
      expect(actual.content_ref).toBe(expected);
      prepare(d1, "local_commit");
      const head = git(root, "rev-parse", "HEAD");
      const current: CandidateRef = { kind: "git", paths, content_ref: expected, head_ref: head, base_ref: null };
      const request = operation("record_delivery", "delivery", { expected_phase: "planning", historical_success: true, result: { result_id: "literal-paths", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], candidate: current, profile: "local_commit", commit: head } }, d1);
      const bad = operation("record_delivery", "delivery", { expected_phase: "planning", historical_success: true, result: { result_id: "wrong-digest", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], candidate: { ...current, content_ref: digest("incorrect") }, profile: "local_commit", commit: head } }, d1);
      const preimage = fs.readFileSync(path.join(root, task, "task.json"));
      expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(bad)]).stderr).toContain("candidate_mismatch");
      expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(preimage);
      expect(apply(request).phase).toBe("delivered");
      const before = fs.readFileSync(path.join(root, task, "task.json"));
      fs.writeFileSync(path.join(root, "plain"), "changed later");
      const changed = JSON.parse(ok(root, "delivery", ["candidate", "--kind", "git", "--paths", ...paths])) as { content_ref: string };
      expect(changed.content_ref).not.toBe(expected);
      expect(apply(request).changed).toBe(false);
      expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(before);
    });
  }

  it("retains explicit Git-mode hashing without a Git repo and observes mutable bytes, mode, index and HEAD on later calls", () => {
    const noRepo = JSON.parse(ok(root, "delivery", ["candidate", "--kind", "git", "--paths", "artifact.txt"])) as { content_ref: string };
    expect(noRepo.content_ref).toBe(digest(JSON.stringify([["artifact.txt", 0o644, createHash("sha256").update(fs.readFileSync(path.join(root, "artifact.txt"))).digest("hex")]])));
    git(root, "init", "-q");
    git(root, "add", "artifact.txt");
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "mutable baseline");
    const current = candidate(true);
    const observed = spawnSync(python, ["-c", `
import json,subprocess,sys
from pathlib import Path
from common.delivery_store import verify_candidate
from common.delivery_schema import DeliveryError
root=Path.cwd();value=json.loads(sys.argv[1]);file=root/'artifact.txt';original=file.read_bytes();results=[]
def verify():
    try: verify_candidate(root,value);results.append('ok')
    except DeliveryError as exc: results.append(exc.code)
verify()
file.write_bytes(b'changed bytes');verify()
subprocess.run(['git','add','artifact.txt'],check=True)
file.write_bytes(original);verify()
file.chmod(0o755);verify();file.chmod(0o644)
subprocess.run(['git','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','changed index and HEAD'],check=True)
verify()
print(json.dumps(results))
`, JSON.stringify(current)], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONPATH: path.join(root, ".trellis/scripts") } });
    expect(observed.status, observed.stderr).toBe(0);
    expect(JSON.parse(observed.stdout)).toEqual(["ok", "candidate_mismatch", "ok", "candidate_mismatch", "candidate_mismatch"]);
  });

  it("hashes repeated observed content and identical aggregates once during normal public store delivery", () => {
    git(root, "init", "-q");
    // Larger than the bounded in-memory spool; repeated bytes still need each
    // mutable file observed before its immutable commit identity can be reused.
    const contents = Buffer.alloc(2 * 1024 * 1024, 0x61);
    const paths = ["artifact.txt", "duplicate.txt", "executable.txt"];
    for (const name of paths) {
      fs.writeFileSync(path.join(root, name), contents);
      fs.chmodSync(path.join(root, name), name === "executable.txt" ? 0o755 : 0o644);
    }
    git(root, "add", "--", ...paths);
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "shared large bytes");
    prepare(d1, "local_commit");
    const hash = JSON.parse(ok(root, "delivery", ["candidate", "--kind", "git", "--paths", ...paths])) as { content_ref: string };
    const head = git(root, "rev-parse", "HEAD");
    const current: CandidateRef = { kind: "git", paths, ...hash, head_ref: head, base_ref: null };
    const planning = gate("planning", "planning", null, null);
    apply(operation("begin_check", "implementation", { expected_phase: "implementing", candidate: current }, d1));
    const check = gate("check", "checking", current, planning);
    const review = gate("full_review", "reviewing", current, check);
    gate("readiness", "reviewing", current, review);
    const request = operation("record_delivery", "delivery", { expected_phase: "publishing", result: { result_id: "hash-once", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], candidate: current, profile: "local_commit", commit: head } }, d1);
    const observed = spawnSync(python, ["-c", `
import hashlib,json,sys
from pathlib import Path
from common.delivery_store import apply_to_store
original=hashlib.sha256
targets={sys.argv[3]:0,sys.argv[4]:0}
class CountingHash:
    def __init__(self,*args,**kwargs): self.inner=original(*args,**kwargs)
    def update(self,value): self.inner.update(value)
    def hexdigest(self):
        result=self.inner.hexdigest()
        if result in targets: targets[result]+=1
        return result
hashlib.sha256=CountingHash
result=apply_to_store(Path.cwd()/sys.argv[1],Path.cwd(),json.loads(sys.argv[2]))
print(json.dumps({'changed':result['changed'],'counts':list(targets.values())}))
`, task, JSON.stringify(request), createHash("sha256").update(contents).digest("hex"), hash.content_ref.slice(7)], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONPATH: path.join(root, ".trellis/scripts") } });
    expect(observed.status, observed.stderr).toBe(0);
    expect(JSON.parse(observed.stdout)).toEqual({ changed: true, counts: [1, 1] });
  });

  it("retains actual blob availability checks for a normal local delivery in an offline partial clone", () => {
    const source = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-promisor-source-"));
    const cloneParent = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-promisor-clone-"));
    extra.push(source, cloneParent);
    const clone = path.join(cloneParent, "clone");
    git(source, "init", "-q");
    git(source, "config", "uploadpack.allowFilter", "true");
    const contents = fs.readFileSync(path.join(root, "artifact.txt"));
    fs.writeFileSync(path.join(source, "artifact.txt"), contents);
    git(source, "add", "artifact.txt");
    git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "promised candidate");
    execFileSync("git", ["clone", "-q", "--filter=blob:none", "--no-checkout", `file://${source}`, clone]);
    expect(git(clone, "rev-list", "--objects", "--missing=print", "HEAD")).toMatch(/\n\?[a-f0-9]+/);
    git(clone, "remote", "set-url", "origin", path.join(cloneParent, "offline-origin"));
    // Copy only local workflow/worktree inputs; no checkout or object deletion.
    fs.cpSync(path.join(root, ".trellis"), path.join(clone, ".trellis"), { recursive: true });
    for (const name of ["artifact.txt", "requirements.md", "plan.md"]) fs.copyFileSync(path.join(root, name), path.join(clone, name));
    const originalRoot = root;
    root = clone;
    try {
      prepare(d1, "local_commit");
      const current = ready(true);
      const before = fs.readFileSync(path.join(root, task, "task.json"));
      const request = operation("record_delivery", "delivery", { expected_phase: "publishing", result: { result_id: "offline-promised-blob", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], candidate: current, profile: "local_commit", commit: current.head_ref } }, d1);
      const outcome = run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(request)]);
      expect(outcome.status).toBe(1);
      expect(outcome.stderr).toContain("invalid_git_fact");
      expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(before);
    } finally {
      root = originalRoot;
    }
  });

  for (const format of ["sha1", "sha256"]) {
    it(`uses atomic parent-index gitlinks across Python/SDK/CLI and exact Delivery trees (${format})`, () => {
      git(root, "init", "-q", `--object-format=${format}`);
      git(root, "config", "maintenance.auto", "false"); git(root, "config", "gc.auto", "0");
      const locator = "模块 [*]\tlink";
      const oid = "1".repeat(format === "sha256" ? 64 : 40); const changedOid = "2".repeat(oid.length);
      const expected = (value: string | null) => digest(JSON.stringify([[locator, value === null ? null : 0o160000, value]]));
      const pointer = (value: string) => git(root, "update-index", "--add", "--cacheinfo", `160000,${value},${locator}`);
      const commit = () => {
        git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "parent state");
        return git(root, "rev-parse", "HEAD");
      };
      const observe = () => {
        const actual = JSON.parse(ok(root, "delivery", ["candidate", "--kind", "git", "--paths", locator])) as { content_ref: string };
        expect(actual.content_ref).toBe(computeCandidateContentRef(root, [locator], "git"));
        return actual.content_ref;
      };
      // An unborn parent can stage a gitlink whose target object is unavailable.
      pointer(oid); expect(observe()).toBe(expected(oid));
      fs.mkdirSync(path.join(root, locator)); fs.writeFileSync(path.join(root, locator, "internal"), "original");
      expect(observe()).toBe(expected(oid));
      fs.writeFileSync(path.join(root, locator, "internal"), "dirty child content");
      expect(observe()).toBe(expected(oid));
      fs.rmSync(path.join(root, locator), { recursive: true });
      expect(observe()).toBe(expected(oid));
      git(root, "add", "artifact.txt", "requirements.md", "plan.md"); const head = commit();
      expect(git(root, "ls-tree", "HEAD", "--", locator)).toContain(`160000 commit ${oid}`);
      expect(spawnSync("git", ["cat-file", "-e", oid], { cwd: root }).status).not.toBe(0);
      prepare(d1, "local_commit"); const current = ready(true, [locator]);
      const fact = { result_id: "atomic-pointer", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], candidate: current, profile: "local_commit" as const, commit: head };
      expect(() => verifyHistoricalCommit(root, fact)).not.toThrow();
      expect(apply(operation("record_delivery", "delivery", { expected_phase: "publishing", result: fact }, d1)).phase).toBe("delivered");
      const historical = spawnSync(python, ["-c", `
import json,sys
from pathlib import Path
from common.delivery_store import GitCandidateContent
with GitCandidateContent(Path.cwd(),no_lazy_fetch=True) as content:
    print(json.dumps(content.content_ref(sys.argv[1],[sys.argv[2]])))
`, head, locator], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONPATH: scripts } });
      expect(historical.status, historical.stderr).toBe(0); expect(JSON.parse(historical.stdout)).toBe(current.content_ref);
      pointer(changedOid); expect(observe()).toBe(expected(changedOid));
      expect(() => verifyCandidate(root, current)).toThrow("candidate_mismatch");
      const stale = spawnSync(python, ["-c", `
import json,sys
from pathlib import Path
from common.delivery_store import verify_candidate
verify_candidate(Path.cwd(),json.loads(sys.argv[1]))
`, JSON.stringify(current)], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONPATH: scripts } });
      expect(stale.status).not.toBe(0); expect(stale.stderr).toContain("candidate_mismatch");
      const wrong = commit(); const wrongFact = { ...fact, result_id: "wrong-pointer", candidate: { ...current, head_ref: wrong }, commit: wrong };
      expect(() => verifyHistoricalCommit(root, wrongFact)).toThrow("candidate_mismatch");
      prepare(d2, "local_commit");
      const wrongRequest = operation("record_delivery", "delivery", { expected_phase: "planning", historical_success: true, result: wrongFact }, d2);
      expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(wrongRequest)]).stderr).toContain("candidate_mismatch");
      fs.mkdirSync(path.join(root, locator)); fs.writeFileSync(path.join(root, locator, "residual"), "kept");
      git(root, "update-index", "--force-remove", "--", locator);
      expect(observe()).toBe(expected(null));
      // Replacing a gitlink with an ordinary file retains mutable workspace bytes.
      fs.rmSync(path.join(root, locator), { recursive: true }); fs.writeFileSync(path.join(root, locator), "replacement");
      git(root, "--literal-pathspecs", "add", "--", locator);
      const fileRef = observe(); expect(fileRef).not.toBe(expected(oid));
      fs.writeFileSync(path.join(root, locator), "unstaged replacement"); expect(observe()).not.toBe(fileRef);
      pointer(oid); expect(observe()).toBe(expected(oid));
      // Selected unresolved index entries must never look like deletion.
      git(root, "update-index", "--force-remove", "--", locator);
      const conflict = `160000 ${oid} 1\t${locator}\0` + `160000 ${changedOid} 2\t${locator}\0`;
      execFileSync("git", ["update-index", "-z", "--index-info"], { cwd: root, input: conflict });
      expect(() => computeCandidateContentRef(root, [locator], "git")).toThrow("invalid_candidate");
      expect(run(root, "delivery", ["candidate", "--kind", "git", "--paths", locator]).stderr).toContain("invalid_candidate");
      expect(computeCandidateContentRef(root, ["artifact.txt"], "git")).toBe(candidate(true).content_ref);
    });
  }

  it("reads selected candidate metadata without depending on unrelated large parent index/tree output", () => {
    git(root, "init", "-q");
    git(root, "config", "maintenance.auto", "false"); git(root, "config", "gc.auto", "0");
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, input: "unrelated" }).toString().trim();
    const oid = "1".repeat(40);
    const rows = Array.from({ length: 12000 }, (_, index) => `100644 ${blob} 0\tother-${"x".repeat(80)}${index}\n`).join("");
    execFileSync("git", ["update-index", "--index-info"], { cwd: root, input: rows + `160000 ${oid} 0\tpointer\n` });
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "large parent metadata");
    // Both the parent index and tree exceed execFileSync's default pipe limit.
    for (const args of [["ls-files", "--stage", "-z"], ["ls-tree", "-r", "-z", "HEAD"]]) {
      expect(execFileSync("git", args, { cwd: root, maxBuffer: 4 * 1024 * 1024 }).length).toBeGreaterThan(1024 * 1024);
    }
    for (const locator of ["pointer", "artifact.txt"]) {
      const expected = digest(JSON.stringify([[locator, locator === "pointer" ? 0o160000 : 0o644,
        locator === "pointer" ? oid : createHash("sha256").update(fs.readFileSync(path.join(root, locator))).digest("hex")]]));
      expect(computeCandidateContentRef(root, [locator], "git")).toBe(expected);
      const actual = JSON.parse(ok(root, "delivery", ["candidate", "--kind", "git", "--paths", locator])) as { content_ref: string };
      expect(actual.content_ref).toBe(expected);
    }
  });

  it("rejects committed directories and symlinks without writing the Task", () => {
    git(root, "init", "-q");
    fs.mkdirSync(path.join(root, "directory"));
    fs.writeFileSync(path.join(root, "directory/child"), "child");
    fs.symlinkSync("artifact.txt", path.join(root, "link"));
    git(root, "add", "artifact.txt", "directory", "link");
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "entry types");
    git(root, "update-index", "--add", "--cacheinfo", `160000,${git(root, "rev-parse", "HEAD")},gitlink`);
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "gitlink");
    prepare(d1, "local_commit");
    const before = fs.readFileSync(path.join(root, task, "task.json"));
    for (const locator of ["directory", "link"]) {
      const head = git(root, "rev-parse", "HEAD");
      const request = operation("record_delivery", "delivery", { expected_phase: "planning", historical_success: true, result: { result_id: "unsupported", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], candidate: { kind: "git", paths: [locator], content_ref: digest("placeholder"), head_ref: head, base_ref: null }, profile: "local_commit", commit: head } }, d1);
      const result = run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(request)]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("invalid_git_fact");
      expect(fs.readFileSync(path.join(root, task, "task.json"))).toEqual(before);
    }
    for (const [locator, code] of [["directory", "invalid_candidate"], ["link", "invalid_locator"]]) {
      const result = run(root, "delivery", ["candidate", "--kind", "git", "--paths", locator]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(code);
    }
  });

  it("isolates Python candidate and historical blob reads from a different real repository", () => {
    git(root, "init", "-q"); git(root, "add", "artifact.txt", "requirements.md", "plan.md");
    git(root, "-c", "user.name=Own", "-c", "user.email=own@example.invalid", "commit", "-qm", "own immutable candidate");
    prepare(d1, "local_commit"); const current = candidate(true);
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-foreign-git-")); extra.push(foreign);
    fs.writeFileSync(path.join(foreign, "artifact.txt"), "Unrelated foreign content\n");
    git(foreign, "init", "-q"); git(foreign, "add", "artifact.txt");
    git(foreign, "-c", "user.name=Foreign", "-c", "user.email=foreign@example.invalid", "commit", "-qm", "foreign candidate");
    const request = operation("record_delivery", "delivery", { expected_phase: "planning", historical_success: true, result: { result_id: "own-isolated-delivery", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], profile: "local_commit", candidate: current, commit: current.head_ref } }, d1);
    const program = `
import json,sys
from pathlib import Path
from common.delivery_store import verify_candidate,apply_to_store
root=Path(sys.argv[1]);task=root/sys.argv[2];operation=json.loads(sys.argv[3])
verify_candidate(root,operation['result']['candidate'])
print(json.dumps(apply_to_store(task,root,operation)))
`;
    const process = spawnSync(python, ["-c", program, root, task, JSON.stringify(request)], { encoding: "utf8", env: { ...globalThis.process.env, PYTHONPATH: scripts, GIT_DIR: path.join(foreign, ".git"), GIT_WORK_TREE: foreign, GIT_COMMON_DIR: path.join(foreign, ".git"), GIT_INDEX_FILE: path.join(foreign, ".git/index"), GIT_OBJECT_DIRECTORY: path.join(foreign, ".git/objects"), GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(foreign, ".git/objects"), GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.worktree", GIT_CONFIG_VALUE_0: foreign } });
    expect(process.status, process.stderr).toBe(0);
    expect(JSON.parse(process.stdout).phase).toBe("delivered");
    expect(fs.readFileSync(path.join(foreign, "artifact.txt"), "utf8")).toBe("Unrelated foreign content\n");
    expect(git(root, "rev-parse", "HEAD")).toBe(current.head_ref);
  });

  it("verifies an actual SHA-256 commit through normal local delivery", () => {
    git(root, "init", "-q", "--object-format=sha256"); git(root, "add", "artifact.txt", "requirements.md", "plan.md");
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "actual SHA256 commit");
    prepare(d1, "local_commit"); const current = ready(true);
    expect(current.head_ref).toMatch(/^[a-f0-9]{64}$/);
    const head = current.head_ref; if (!head) throw new Error("missing commit");
    const before = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    const prefix = head.slice(0, 40);
    const truncated = operation("record_delivery", "delivery", { expected_phase: "publishing", historical_success: true, result: { result_id: "truncated-sha256-delivery", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], profile: "local_commit", candidate: { ...current, head_ref: prefix }, commit: prefix } }, d1);
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(truncated)]).stderr).toContain("invalid_git_fact");
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
    expect(apply(operation("record_delivery", "delivery", { expected_phase: "publishing", result: { result_id: "actual-sha256-delivery", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], profile: "local_commit", candidate: current, commit: current.head_ref } }, d1)).phase).toBe("delivered");
  });

  it("Git-free/manual candidates retain permission changes inside a Git repository", () => {
    git(root, "init", "-q");
    prepare(d1, "manual"); fs.chmodSync(path.join(root, "artifact.txt"), 0o640); const current = ready();
    fs.chmodSync(path.join(root, "artifact.txt"), 0o600);
    const deliver = operation("record_delivery", "delivery", { expected_phase: "publishing", result: { result_id: "manual-permission-outcome", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], candidate: current, profile: "manual", artifact: ref("artifact.txt") } }, d1);
    const before = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(deliver)]).stderr).toContain("candidate_mismatch");
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
    fs.chmodSync(path.join(root, "artifact.txt"), 0o640);
    expect(apply(deliver).phase).toBe("delivered");
  });

  it("refreshes same-PR publication after real candidate rework and recovers lost projection with missing gates", () => {
    git(root, "init", "-q"); git(root, "add", "artifact.txt", "requirements.md", "plan.md");
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial candidate");
    prepare(d1, "pull_request"); const original = ready(true);
    const bin = path.join(root, "fixture-bin"); fs.mkdirSync(bin);
    const actualFile = path.join(bin, "actual-pr.json"); const callsFile = path.join(bin, "gh-calls.jsonl");
    fs.writeFileSync(path.join(bin, "gh"), `#!${python.startsWith("/") ? python : "/usr/bin/env python3"}
import json,sys
from pathlib import Path
assert sys.argv[1:3] == ['pr','view'], 'only read-only PR verification is allowed'
base=Path(__file__).parent
with (base/'gh-calls.jsonl').open('a') as log: log.write(json.dumps(sys.argv[1:])+'\\n')
print((base/'actual-pr.json').read_text())
`); fs.chmodSync(path.join(bin, "gh"), 0o755);
    vi.stubEnv("PATH", `${bin}${path.delimiter}${process.env.PATH ?? ""}`);
    let actual = { number: 123, headRefOid: original.head_ref, baseRefName: "main", state: "OPEN", mergeCommit: null as { oid: string } | null, url: "https://example.test/pr/123", body: "Original accepted payload" };
    const saveActual = (): void => fs.writeFileSync(actualFile, JSON.stringify(actual)); saveActual();
    const publication = { result_id: "pr-original", owner_id: native.workflow.owners.publication, evidence: [ref("plan.md")], profile: "pull_request", candidate: original, repo_ref: "castbox/Trellis", pr_number: 123, reviewed_head: original.head_ref, target_ref: "main", publication_ref: { locator: actual.url, revision: digest(actual.body) } };
    const publish = (result: typeof publication, historical = false) => operation("record_publication", "publication", { expected_phase: "publishing", ...(historical ? { historical_success: true } : {}), result }, d1);
    apply(publish(publication));
    apply(operation("rework", "publication", { expected_phase: "publishing", target_role: "implementation", reason: ref("plan.md"), affected_results: ["check", "full_review", "readiness"] }, d1));
    expect(record().deliveries[0]?.publication_result).toEqual(publication);
    fs.writeFileSync(path.join(root, "artifact.txt"), "Revised actual artifact\n");
    git(root, "add", "artifact.txt"); git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "revised candidate");
    const revisedCandidate = candidate(true);
    apply(operation("begin_check", "implementation", { expected_phase: "implementing", candidate: revisedCandidate }, d1));
    let previous = `${d1}-planning`;
    for (const role of ["check", "full_review", "readiness"] as const) {
      const resultId = `revised-${role}`;
      apply(operation("record_gate", role, { expected_phase: role === "check" ? "checking" : "reviewing", result: { result_id: resultId, owner_role: role, owner_id: native.workflow.owners[role], outcome: role === "readiness" ? "ready" : "passed", scope_ref: { authority: ref("requirements.md"), anchors: ["R1"] }, plan_ref: ref("plan.md"), candidate: revisedCandidate, predecessor_result_id: previous, obligations: [], evidence: [ref("plan.md")] } }, d1)); previous = resultId;
    }
    const revised = { ...publication, result_id: "pr-revised", candidate: revisedCandidate, reviewed_head: revisedCandidate.head_ref, target_ref: "release", publication_ref: { locator: actual.url, revision: digest("Revised accepted payload") } };
    const before = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(publish(revised))]).stderr).toContain("candidate_mismatch");
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
    actual = { ...actual, headRefOid: revisedCandidate.head_ref, baseRefName: "release", body: "Revised accepted payload" }; saveActual();
    apply(publish(revised));
    const readiness = record().deliveries[0]?.results.readiness; if (!readiness) throw new Error("missing readiness");
    apply(operation("rework", "publication", { expected_phase: "publishing", target_role: "readiness", reason: ref("plan.md"), affected_results: ["readiness"] }, d1));
    actual.body = "Actual successful update with lost projection"; saveActual();
    const recovered = { ...revised, result_id: "pr-recovered", publication_ref: { locator: actual.url, revision: digest(actual.body) } };
    expect(apply(publish(recovered, true)).phase).toBe("reviewing");
    expect(record().deliveries[0]?.results.readiness).toBeNull();
    const recoveredBytes = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    for (const stale of [publication, revised]) {
      expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(publish(stale, true))]).stderr).toContain("candidate_mismatch");
      expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(recoveredBytes);
    }
    const calls = fs.readFileSync(callsFile, "utf8");
    expect(apply(publish(recovered, true)).changed).toBe(false);
    expect(fs.readFileSync(callsFile, "utf8")).toBe(calls);
    const conflict = { ...recovered, publication_ref: { ...recovered.publication_ref, revision: digest("wrong") } };
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(publish(conflict, true))]).stderr).toContain("result_identity_conflict");
    apply(operation("record_gate", "readiness", { expected_phase: "reviewing", result: { ...readiness, result_id: "recovered-readiness", obligations: [recovered.publication_ref] } }, d1));
    actual.state = "MERGED"; actual.mergeCommit = { oid: "f".repeat(40) }; saveActual();
    const delivered = { result_id: "pr-delivered", owner_id: native.workflow.owners.delivery, evidence: [ref("plan.md")], profile: "pull_request", candidate: revisedCandidate, repo_ref: recovered.repo_ref, pr_number: recovered.pr_number, reviewed_head: revisedCandidate.head_ref, target_ref: recovered.target_ref, merge_commit: actual.mergeCommit.oid };
    expect(apply(operation("record_delivery", "delivery", { expected_phase: "publishing", result: delivered }, d1)).phase).toBe("delivered");
    expect(record().deliveries[0]?.publication_result).toEqual(recovered);
    expect(git(root, "rev-parse", "HEAD")).toBe(revisedCandidate.head_ref);
  });

  it("fails stale bytes, changed candidate, unsupported workflow and direct lifecycle overwrite without mutation", () => {
    ok(root, "task", ["start", task]);
    prepare(); gate("planning", "planning", null, null);
    const current = candidate(); const before = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    const begin = operation("begin_check", "implementation", { expected_phase: "implementing", candidate: current }, d1);
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(begin), "--expected-sha256", `sha256:${"0".repeat(64)}`]).stderr).toContain("stale_preimage");
    fs.writeFileSync(path.join(root, "artifact.txt"), "changed");
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(begin)]).stderr).toContain("candidate_mismatch");
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
    const bypass = spawnSync(python, ["-c", "import sys,json;from pathlib import Path;from common.io import write_json;p=Path(sys.argv[1]);d=json.loads(p.read_text());d['deliveries']=[];print(write_json(p,d))", path.join(root, task, "task.json")], { encoding: "utf8", env: { ...process.env, PYTHONPATH: scripts } });
    expect(bypass.stdout.trim()).toBe("False");
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
    fs.writeFileSync(path.join(root, ".trellis/workflow.md"), "legacy workflow\n");
    const invalid = run(root, "delivery", ["current", "--json"]);
    expect(invalid.status).toBe(1); expect(invalid.stdout).toContain("missing_runtime_contract");
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-no-contract-")); extra.push(isolated); install(isolated); fs.writeFileSync(path.join(isolated, ".trellis/workflow.md"), "legacy\n");
    expect(run(isolated, "task", ["create", "bad", "--description", "bad", "--schema-version", "2.0"]).status).toBe(1);
    expect(fs.existsSync(path.join(isolated, ".trellis/tasks"))).toBe(false);
  });

  it("resolves sibling-worktree selection and preserves Task binding through formal reopen", () => {
    git(root, "init", "-q"); git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "init");
    const sibling = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-sibling-")); extra.push(sibling);
    git(root, "worktree", "add", "--detach", sibling); install(sibling);
    ok(root, "task", ["start", task]);
    prepare(); ok(root, "delivery", ["select", "--task", task, "--delivery", d1]);
    const queried = JSON.parse(ok(sibling, "delivery", ["current", "--json"])) as { kind: string; key: { delivery_id: string } };
    expect(queried.kind).toBe("current"); expect(queried.key.delivery_id).toBe(d1);
    apply(operation("stop", "planning", { expected_phase: "planning", result: { result_id: "stop-for-scope", owner_id: native.workflow.owners.planning, evidence: [ref("requirements.md")], reason: ref("requirements.md"), scope_decision: ref("requirements.md") } }, d1));
    apply(operation("complete_task", "completion", { result: { result_id: "scope-complete", owner_id: native.workflow.owners.completion, evidence: [ref("requirements.md")], lifecycle_generation: 0, accepted_scope: ref("requirements.md"), delivery_result_ids: [], outcome: "completed" } }));
    apply(operation("reopen_task", "task_scope", { authority: ref("requirements.md") }));
    const current = JSON.parse(ok(sibling, "delivery", ["current", "--json"])) as { kind: string; key: { lifecycle_generation: number } };
    expect(current.kind).toBe("no_current_delivery"); expect(current.key.lifecycle_generation).toBe(1);
    expect(record().deliveries[0]?.lifecycle_generation).toBe(0);
    expect(record().completion_results[0]?.result_id).toBe("scope-complete");
  });

  it("per-Delivery manifests require explicit selection and never write root manifest", () => {
    prepare();
    const missing = run(root, "task", ["add-context", task, "implement", "requirements.md", "whole scope"]);
    expect(missing.status).toBe(1); expect(missing.stdout).toContain("delivery_selection_required");
    ok(root, "task", ["add-context", task, "implement", "requirements.md", "whole scope", "--delivery", d1]);
    expect(fs.readFileSync(path.join(root, task, `deliveries/${d1}/implement.jsonl`), "utf8")).toContain("whole scope");
    expect(fs.existsSync(path.join(root, task, "implement.jsonl"))).toBe(false);
    expect(run(root, "delivery", ["candidate", "--paths", `${task}/task.json`]).stderr).toContain("invalid_candidate");
  });

  it("normal forward operations reject changed local scope/plan before recording facts", () => {
    prepare(); const planning = gate("planning", "planning", null, null);
    const current = candidate();
    const begin = operation("begin_check", "implementation", { expected_phase: "implementing", candidate: current }, d1);
    for (const file of ["requirements.md", "plan.md"]) {
      const saved = fs.readFileSync(path.join(root, file));
      const before = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
      fs.writeFileSync(path.join(root, file), "unaccepted draft\n");
      expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(begin)]).stderr).toContain("authority_mismatch");
      expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
      fs.writeFileSync(path.join(root, file), saved);
    }
    apply(begin);
    const check = gate("check", "checking", current, planning);
    const review = gate("full_review", "reviewing", current, check);
    gate("readiness", "reviewing", current, review);
    const before = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    fs.writeFileSync(path.join(root, "plan.md"), "changed after readiness\n");
    const delivered = operation("record_delivery", "delivery", { expected_phase: "publishing", result: { result_id: "stale-forward", owner_id: native.workflow.owners.delivery, evidence: [ref("artifact.txt")], candidate: current, profile: "manual", artifact: ref("artifact.txt") } }, d1);
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(delivered)]).stderr).toContain("authority_mismatch");
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
  });

  it("preflights nested planning symlinks before changing the aggregate and does not infer missing-child completion", () => {
    apply(operation("accept_scope", "task_scope", { authority: ref("requirements.md") }));
    const before = fs.readFileSync(path.join(root, task, "task.json"), "utf8");
    const directory = path.join(root, task, `deliveries/${d1}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.symlinkSync(path.join(root, "plan.md"), path.join(directory, "design.md"));
    const request = operation("create_delivery", "creation", { scope_ref: { authority: ref("requirements.md"), anchors: ["R1"] }, profile: "manual" }, d1);
    expect(run(root, "delivery", ["apply", "--task", task, "--input", JSON.stringify(request)]).stderr).toContain("invalid_locator");
    expect(fs.readFileSync(path.join(root, task, "task.json"), "utf8")).toBe(before);
    const inventory = record(); inventory.children = ["missing-child"];
    fs.writeFileSync(path.join(root, task, "task.json"), JSON.stringify(inventory));
    expect(ok(root, "task", ["list"])).toContain("[0/1 done]");
    expect(run(root, "delivery", ["candidate", "--paths", `${task}/deliveries/${d1}/design.md`]).stderr).toContain("invalid_locator");
  });
});
