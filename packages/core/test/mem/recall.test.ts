/**
 * Document discovery and unified recall.
 *
 * Fixtures are synthetic files in a temp git repo. No real session store is
 * touched: dialogue coverage lives in the adapter suites.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discoverDocs } from "../../src/mem/docs.js";
import { excerptAround, queryTerms } from "../../src/mem/lexical.js";
import {
  parseDocLineage,
  resolveSupersededBy,
} from "../../src/mem/lineage.js";
import { MEM_PLATFORMS } from "../../src/mem/platforms.js";
import { readMemRefs, recallMem } from "../../src/mem/recall.js";

let root: string;

function write(rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

beforeEach(() => {
  for (const adapter of Object.values(MEM_PLATFORMS))
    vi.spyOn(adapter, "list").mockReturnValue([]);
  root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-recall-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

const RETRY_RULE =
  "OrbitCallback transient failures allow at most 4 total attempts. Permanent failures allow 1 attempt.";

function claudeSessions(
  sessions: { id: string; turns: { role: "user" | "assistant"; text: string }[] }[],
): void {
  const adapter = MEM_PLATFORMS.claude;
  vi.mocked(adapter.list).mockReturnValue(
    sessions.map((session) => ({
      id: session.id,
      platform: "claude" as const,
      cwd: root,
      filePath: session.id,
    })),
  );
  vi.spyOn(adapter, "extract").mockImplementation((session) => {
    return sessions.find((item) => item.id === session.id)?.turns ?? [];
  });
}

describe("0.3.2 recall", () => {
  it("keeps the answer document when repeated user questions match every query term", () => {
    write(
      ".trellis/spec/retry-budget.md",
      `# Retry budget\n\n${RETRY_RULE}\n`,
    );
    claudeSessions([
      { id: "ask-1", turns: [{ role: "user", text: "OrbitCallback retry policy" }] },
      { id: "ask-2", turns: [{ role: "user", text: "What is the OrbitCallback retry policy?" }] },
      { id: "ask-3", turns: [{ role: "user", text: "Please explain our OrbitCallback retry policy" }] },
    ]);
    const result = recallMem({ cwd: root, query: "OrbitCallback retry policy" });
    const docAt = result.hits.findIndex(
      (hit) => hit.path === ".trellis/spec/retry-budget.md",
    );
    expect(docAt).toBeGreaterThanOrEqual(0);
    expect(docAt).toBeLessThan(3);
    expect(result.hits[docAt]?.excerpt).toContain("at most 4 total attempts");
    const read = readMemRefs({
      cwd: root,
      refs: [result.hits[docAt]?.ref ?? ""],
    });
    expect(read.reads[0]?.text).toContain("at most 4 total attempts");
    expect(read.reads[0]?.text).toContain("Permanent failures allow 1 attempt");
    expect(result.hits.some((hit) => hit.sourceKind === "doc")).toBe(true);
    expect(result.hits.every((hit) => hit.section === "user")).toBe(false);
  });

  it("keeps the answer document when user questions add instructions but no answer", () => {
    write(".trellis/spec/retry-budget.md", `# Retry budget\n\n${RETRY_RULE}\n`);
    claudeSessions([
      {
        id: "current",
        turns: [{
          role: "user",
          text: "What is the OrbitCallback retry policy? Include the numeric limits, any excluded case, and the note path.",
        }],
      },
      {
        id: "again",
        turns: [{
          role: "user",
          text: "Please look up the OrbitCallback retry policy and quote the limits.",
        }],
      },
      {
        id: "third",
        turns: [{
          role: "user",
          text: "I need the OrbitCallback retry policy from the notes.",
        }],
      },
    ]);
    const result = recallMem({ cwd: root, query: "OrbitCallback retry policy" });
    const docAt = result.hits.findIndex(
      (hit) => hit.path === ".trellis/spec/retry-budget.md",
    );
    expect(docAt).toBeGreaterThanOrEqual(0);
    expect(docAt).toBeLessThan(3);
    expect(result.hits[docAt]?.excerpt).toContain("at most 4 total attempts");
    expect(result.hits.filter((hit) => hit.section === "user").every(
      (hit) => hit.strength === "weak",
    )).toBe(true);
  });

  it("does not present a user question that only restates the query as a strong answer", () => {
    claudeSessions([
      {
        id: "ask-only",
        turns: [{ role: "user", text: "What is the OrbitCallback retry policy?" }],
      },
    ]);
    const result = recallMem({ cwd: root, query: "OrbitCallback retry policy" });
    expect(result.hits.some((hit) => hit.strength === "strong")).toBe(false);
    expect(result.hits[0]?.section).toBe("user");
    expect(result.hits[0]?.excerpt.toLowerCase()).toContain("orbitcallback retry policy");
    expect(result.hits[0]?.excerpt).not.toContain("at most 4");
  });

  it("keeps an assistant answer next to a question that only restates the query", () => {
    claudeSessions([
      { id: "ask-1", turns: [{ role: "user", text: "OrbitCallback retry policy" }] },
      {
        id: "ask-2",
        turns: [{ role: "user", text: "What is the OrbitCallback retry policy?" }],
      },
      {
        id: "ask-3",
        turns: [{ role: "user", text: "Please explain our OrbitCallback retry policy" }],
      },
      {
        id: "answered",
        turns: [
          { role: "user", text: "OrbitCallback retry policy" },
          { role: "assistant", text: RETRY_RULE },
        ],
      },
    ]);
    const result = recallMem({ cwd: root, query: "OrbitCallback retry policy" });
    const answer = result.hits.find(
      (hit) => hit.section === "assistant" && hit.excerpt.includes("at most 4"),
    );
    expect(answer?.excerpt).toContain("Permanent failures allow 1 attempt");
    const read = readMemRefs({ cwd: root, refs: [answer?.ref ?? ""] });
    expect(read.reads[0]?.text).toContain("assistant:");
    expect(read.reads[0]?.text).toContain("at most 4 total attempts");
    expect(read.reads[0]?.text).toContain("user:");
  });

  it("keeps a user correction of the retry count", () => {
    claudeSessions([
      {
        id: "confirm",
        turns: [
          {
            role: "assistant",
            text: "OrbitCallback retry policy allows 3 total attempts.",
          },
          {
            role: "user",
            text: "No. OrbitCallback retry policy allows 4 total attempts, not 3.",
          },
        ],
      },
    ]);
    const result = recallMem({
      cwd: root,
      query: "OrbitCallback retry policy",
      limit: 5,
    });
    const user = result.hits.find((hit) => hit.section === "user");
    expect(user?.strength).toBe("strong");
    expect(user?.excerpt).toContain("4 total attempts");
    expect(user?.excerpt).toContain("not 3");
    const read = readMemRefs({ cwd: root, refs: [user?.ref ?? ""] });
    expect(read.reads[0]?.text).toContain("user:");
    expect(read.reads[0]?.text).toContain("4 total attempts");
    expect(read.reads[0]?.text).toContain("not 3");
  });

  it.each([
    [
      "retry policy",
      "The retry policy is a fixed interval.",
      "Confirmed: the retry policy now uses exponential backoff.",
      "exponential backoff",
    ],
    [
      "重试规则",
      "重试规则是固定间隔。",
      "确认：重试规则改用指数退避。",
      "指数退避",
    ],
  ])(
    "keeps a confirmation that states a new rule without a number: %s",
    (query, oldRule, confirmation, marker) => {
      claudeSessions([
        {
          id: "old-rule",
          turns: [
            { role: "assistant", text: oldRule },
            { role: "user", text: confirmation },
          ],
        },
      ]);
      const result = recallMem({ cwd: root, query, limit: 5 });
      const user = result.hits.find((hit) => hit.section === "user");
      expect(user?.strength).toBe("strong");
      expect(user?.excerpt).toContain(marker);
      expect(result.hits.some((hit) => hit.excerpt.includes(oldRule.slice(0, 8)))).toBe(
        true,
      );
    },
  );

  it("recalls an explicit rejection and its condition, not only the proposal", () => {
    claudeSessions([
      {
        id: "reject",
        turns: [
          {
            role: "user",
            text: "Proposal: OrbitCallback retry policy should allow 9 attempts for every failure.",
          },
          {
            role: "assistant",
            text: "I will set the OrbitCallback retry policy to 9 attempts for every failure.",
          },
          {
            role: "user",
            text: "No. Rejected. Permanent failures allow 1 attempt. Transient failures allow at most 4. The OrbitCallback retry policy does not apply to manual replays.",
          },
        ],
      },
    ]);
    const result = recallMem({
      cwd: root,
      query: "OrbitCallback retry policy",
      limit: 5,
      maxChars: 8000,
    });
    const rejection = result.hits.find((hit) => hit.excerpt.includes("Rejected"));
    expect(rejection?.section).toBe("user");
    expect(rejection?.excerpt).toContain("at most 4");
    expect(rejection?.excerpt).toContain("manual replays");
    const read = readMemRefs({ cwd: root, refs: [rejection?.ref ?? ""] });
    expect(read.reads[0]?.text).toContain("Permanent failures allow 1 attempt");
    expect(read.reads[0]?.text).toContain("does not apply to manual replays");
    expect(result.hits.some((hit) => hit.excerpt.includes("9 attempts"))).toBe(true);
  });

  it("ranks a current spec ahead of archived tasks whose titles repeat the query", () => {
    const title = "Separate Capacity Impact from Flow Impact";
    for (const name of ["alpha", "beta", "gamma"]) {
      write(
        `.trellis/research/08-15-${name}/legacy/task.md`,
        `# ${title}\n\nMigrated task. Discuss the split and record the decision later.\n`,
      );
    }
    write(
      ".trellis/spec/allocation.md",
      "# Allocation rules\n\nCapacity impact counts nameplate volume.\nFlow impact counts the scheduled path.\nDo not add the two impacts together.\n",
    );
    const result = recallMem({
      cwd: root,
      query: title,
    });
    const specAt = result.hits.findIndex(
      (hit) => hit.path === ".trellis/spec/allocation.md",
    );
    expect(specAt).toBeGreaterThanOrEqual(0);
    expect(specAt).toBeLessThan(3);
    expect(result.hits[specAt]?.status).toBeUndefined();
    expect(result.hits[specAt]?.excerpt).toContain("Capacity impact");
    expect(result.hits[specAt]?.excerpt).toContain("Flow impact");
    const archiveAt = result.hits.findIndex((hit) =>
      hit.path?.includes("/legacy/"),
    );
    expect(archiveAt).toBeGreaterThan(specAt);
    expect(result.hits[archiveAt]?.status).toBe("archived");
  });

  it("returns an archived task when nothing current matches, and skips an unrelated spec", () => {
    write(
      ".trellis/research/08-15-flow/legacy/task.md",
      "# Separate Capacity Impact from Flow Impact\n\nTASK-4419 migrated.\n",
    );
    write(".trellis/spec/billing.md", "# Billing\n\nInvoices are issued monthly.\n");
    const result = recallMem({
      cwd: root,
      query: "Separate Capacity Impact from Flow Impact",
    });
    expect(result.hits.map((hit) => hit.path)).toEqual([
      ".trellis/research/08-15-flow/legacy/task.md",
    ]);
    expect(result.hits[0]?.status).toBe("archived");
  });

  it("finds an archived task by its unique id and by its full path", () => {
    const rel = ".trellis/research/08-15-flow/legacy/task.md";
    write(rel, "# Old split\n\nTASK-4419 recorded the earlier discussion.\n");
    write(
      ".trellis/spec/allocation.md",
      "# Allocation rules\n\nCapacity impact counts nameplate volume.\n",
    );
    const byId = recallMem({ cwd: root, query: "TASK-4419" });
    expect(byId.hits.map((hit) => hit.path)).toEqual([rel]);
    expect(byId.hits[0]?.status).toBe("archived");
    const byPath = recallMem({ cwd: root, query: rel });
    expect(byPath.hits[0]?.path).toBe(rel);
    expect(byPath.hits[0]?.status).toBe("archived");
    const read = readMemRefs({ cwd: root, refs: [byId.hits[0]?.ref ?? ""] });
    expect(read.reads[0]?.text).toContain("TASK-4419");
  });

  it("does not let title-only current notes crowd out an archived rule", () => {
    for (const name of ["billing", "shipping", "audit"]) {
      write(`.trellis/spec/${name}.md`, `# ${name} retry policy\n\nTODO\n`);
    }
    write(
      ".trellis/research/08-15-flow/legacy/policy.md",
      "# Earlier note\n\nThe retry policy allows at most 4 attempts and skips manual replays.\n",
    );
    const result = recallMem({ cwd: root, query: "retry policy" });
    const archivedAt = result.hits.findIndex((hit) => hit.status === "archived");
    expect(archivedAt).toBeGreaterThanOrEqual(0);
    expect(archivedAt).toBeLessThan(3);
    expect(result.hits[archivedAt]?.excerpt).toContain("at most 4 attempts");
    const todoAt = result.hits.findIndex((hit) => hit.excerpt.includes("TODO"));
    if (todoAt >= 0) expect(archivedAt).toBeLessThan(todoAt);
  });

  it("keeps the note that contains the task id ahead of generic retry policies", () => {
    for (const name of ["billing", "shipping", "audit"]) {
      write(
        `.trellis/spec/${name}.md`,
        `# ${name}\n\nThe ${name} retry policy retries transient failures.\n`,
      );
    }
    const legacy = ".trellis/research/08-15-flow/legacy/task.md";
    write(legacy, "# Old task\n\nTASK-4419 retry policy was a fixed interval.\n");
    const result = recallMem({ cwd: root, query: "TASK-4419 retry policy" });
    expect(result.hits[0]?.path).toBe(legacy);
    expect(result.hits[0]?.excerpt).toContain("TASK-4419");
    expect(result.hits[0]?.status).toBe("archived");
  });

  it("keeps a shorter successor at limit 1 ahead of a newer unrelated note", () => {
    write(
      ".trellis/research/old-cap.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/new-cap.md\n---\n\n# callback retry limit\n\ncallback retry limit was three\n",
    );
    write(
      ".trellis/research/new-cap.md",
      "# Cap\n\n" +
        "General introduction. ".repeat(40) +
        "\ncallback limit is two.\n",
    );
    write("docs/deploy.md", "# Deploy\n\nThe callback window is Sunday.\n");
    const newer = new Date("2026-10-20T00:00:00Z");
    fs.utimesSync(path.join(root, "docs/deploy.md"), newer, newer);
    const result = recallMem({
      cwd: root,
      query: "callback retry limit",
      limit: 1,
    });
    expect(result.hits[0]?.path).toBe(".trellis/research/new-cap.md");
    expect(result.hits[0]?.excerpt).toContain("is two");
    expect(result.hits[0]?.status).toBeUndefined();
    expect(result.hits[0]?.supersededBy).toBeUndefined();
  });
});

describe("queryTerms", () => {
  it("keeps a Chinese query term whole and adds bigrams", () => {
    const terms = queryTerms("幂等性");
    expect(terms).toContain("幂等性");
    expect(terms).toContain("幂等");
  });

  it("normalizes case per token", () => {
    const terms = queryTerms("Retry Budget");
    expect(terms).toContain("retry");
    expect(terms).toContain("budget");
  });
});

describe("recall relevance and safe dedupe", () => {
  it.each(["callback retry limit", "callback limit"])("keeps the declared current rule before truncation: %s", (currentWords) => {
    write("docs/old.md", "---\nsuperseded_by: docs/current.md\n---\n# callback retry limit\ncallback retry limit is three.\n");
    write("docs/current.md", "# Policy\n" + "General introduction. ".repeat(40) + `\n${currentWords} is two.\n`);
    const result = recallMem({ cwd: root, query: "callback retry limit", limit: 1 });
    expect(result.hits[0]?.path).toBe("docs/current.md");
    expect(result.hits[0]?.excerpt).toContain("is two");
    const ref = result.hits[0]?.ref;
    expect(readMemRefs({ cwd: root, refs: ref ? [ref] : [] }).reads[0]?.text).toContain("is two");
  });

  it("does not present a status-only superseded successor as current", () => {
    write("docs/old.md", "---\nsuperseded_by: docs/retired.md\n---\n# needle\nold rule\n");
    write("docs/retired.md", "---\nstatus: superseded\n---\n# Retired\nObsolete limit.\n");
    const hit = recallMem({ cwd: root, query: "needle" }).hits[0];
    if (!hit) throw new Error("expected old note");
    expect(hit.lineageFault).toBe("missing-target");
    expect(hit.supersededBy).toBeUndefined();
    expect(hit.successorExcerpt).toBeUndefined();
    expect(readMemRefs({ cwd: root, refs: [hit.ref] }).reads[0]?.lineageFault).toBe("missing-target");
  });

  it("recalls an exact document path even when its body does not repeat the filename", () => {
    write("docs/retry_budget.md", "# Limits\nUse at most two attempts.\n");
    const result = recallMem({ cwd: root, query: "docs/retry_budget.md" });
    expect(result.hits[0]?.path).toBe("docs/retry_budget.md");
    expect(result.hits[0]?.strength).toBe("strong");
    const ref = result.hits[0]?.ref;
    expect(ref).toBeDefined();
    const expanded = readMemRefs({ cwd: root, refs: ref ? [ref] : [] });
    expect(expanded.reads[0]?.text).toContain("at most two attempts");
  });

  it("prefers a relevant heading over a passing body mention", () => {
    write("docs/a.md", "# Miscellaneous\nAn example mentions retry budget.\n");
    write("docs/z.md", "# Retry budget\nUse at most two attempts.\n");
    const result = recallMem({ cwd: root, query: "retry budget" });
    expect(result.hits[0]?.path).toBe("docs/z.md");
    expect(result.hits[0]?.title).toBe("Retry budget");
  });

  it("keeps equal excerpts from different speakers and different surrounding decisions", () => {
    const adapter = MEM_PLATFORMS.claude;
    vi.mocked(adapter.list).mockReturnValue([
      { id: "safe-dedupe", platform: "claude", cwd: root, filePath: "synthetic" },
    ]);
    vi.spyOn(adapter, "extract").mockReturnValue([
      { role: "user", text: "retry budget = 2" },
      { role: "assistant", text: "retry budget = 2" },
      { role: "user", text: "No, not for writes." },
      { role: "assistant", text: "retry budget = 2" },
    ]);
    const result = recallMem({ cwd: root, query: "retry budget", limit: 10, maxChars: 10000 });
    expect(result.hits.map((hit) => hit.turn)).toEqual([0, 1, 3]);
  });
});

describe("discoverDocs", () => {
  it("caps large knowledge collections and reports the scan as incomplete", () => {
    for (let i = 0; i < 1001; i++) write(`.trellis/research/topic-${i}.md`, `# Topic ${i}\nneedle\n`);
    const found = discoverDocs(root);
    expect(found.docs).toHaveLength(1000);
    expect(found.warnings.some(w => w.code === "doc-search-incomplete")).toBe(true);
    const recalled = recallMem({ cwd: root, query: "needle" });
    expect(recalled.incomplete).toBe(true);
    expect(recalled.hits.length).toBeGreaterThan(0);
  });

  it("reports a depth-limited scan instead of claiming deep documents do not exist", () => {
    write(`.trellis/spec/${"nested/".repeat(10)}decision.md`, "# Deep\nneedle\n");
    const found = recallMem({ cwd: root, query: "needle" });
    expect(found.incomplete).toBe(true);
    expect(found.hits).toEqual([]);
  });

  it("does not mark scan incomplete when deep directories beyond depth cap contain only non-Markdown data files", () => {
    write(".trellis/research/topic.md", "# Topic\n\nneedle\n");
    write(
      `.trellis/research/${"nested/".repeat(10)}raw.json`,
      "{\"status\":\"ok\"}\n",
    );
    const found = recallMem({ cwd: root, query: "needle" });
    expect(found.incomplete).toBe(false);
    expect(found.warnings).toEqual([]);
    expect(found.hits[0]?.path).toBe(".trellis/research/topic.md");
  });

  it("reads trellis even when gitignored, plus docs and one link level", () => {
    write(".gitignore", ".trellis/\n");
    write(".trellis/spec/billing.md", "# Billing\n\n支付接口必须幂等。\n");
    write(
      ".trellis/research/archive/old.md",
      "# Old\n\nEarlier cadence was weekly.\n",
    );
    write("README.md", "# Proj\n\nSee [limits](docs/limits.md).\n");
    write("docs/limits.md", "# Limits\n\nUpload limit is 25 MB.\n");
    write("docs/limits.md", "# Limits\n\nSee [extra](extra/detail.md).\n");
    write("docs/extra/detail.md", "# Detail\n\nThe default port is 8443.\n");
    write("node_modules/pkg/README.md", "# Dep\n\nnot a project doc\n");
    write("notes/secret.env", "TOKEN=nope\n");

    const found = discoverDocs(root);
    const rels = found.docs.map((d) => d.relPath).sort();

    expect(rels).toContain(".trellis/spec/billing.md");
    expect(rels).toContain("docs/extra/detail.md");
    expect(rels.some((r) => r.includes("node_modules"))).toBe(false);
    expect(rels.some((r) => r.endsWith(".env"))).toBe(false);

    const archived = found.docs.find((d) => d.relPath.endsWith("old.md"));
    expect(archived?.archived).toBe(true);
  });

  it("does not mark search incomplete when already-discovered trellis notes have >200 internal cross-links", () => {
    for (let i = 0; i < 30; i++) {
      const links = Array.from(
        { length: 10 },
        (_, j) => `[link-${j}](./topic-${(i + j) % 30}.md) [data](./fixture-${j}.json)`,
      ).join(" ");
      write(`.trellis/research/topic-${i}.md`, `# Topic ${i}\n\n${links}\n`);
    }
    const found = discoverDocs(root);
    expect(found.docs).toHaveLength(30);
    expect(found.warnings).toEqual([]);
  });

  it("marks migrated legacy task files as archived and ranks active research notes ahead of them", () => {
    write(
      ".trellis/research/08-15-flow-impact/legacy/prd.md",
      "# Goal\n\nTransco capacity flow impact baseline.\n",
    );
    write(
      ".trellis/research/08-15-flow-impact/research/validation.md",
      "# Goal\n\nTransco capacity flow impact verified.\n",
    );
    const result = recallMem({
      cwd: root,
      query: "Transco capacity flow impact",
      limit: 2,
    });
    expect(result.hits[0]?.path).toBe(
      ".trellis/research/08-15-flow-impact/research/validation.md",
    );
    expect(result.hits[0]?.status).toBeUndefined();
    expect(result.hits[1]?.path).toBe(
      ".trellis/research/08-15-flow-impact/legacy/prd.md",
    );
    expect(result.hits[1]?.status).toBe("archived");
  });

  it("resolves a subdirectory to the same root", () => {
    write("docs/guide.md", "# Guide\n\nhello\n");
    fs.mkdirSync(path.join(root, "src"));
    const fromSub = discoverDocs(path.join(root, "src"));
    // git reports the real path, which on macOS resolves /var to /private/var.
    expect(fs.realpathSync(fromSub.root)).toBe(fs.realpathSync(root));
    expect(fromSub.docs.map((d) => d.relPath)).toContain("docs/guide.md");
  });

  it("does not follow a symlink out of the project", () => {
    write("docs/inside.md", "# Inside\n");
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-outside-"));
    fs.writeFileSync(path.join(outside, "secret.md"), "# Secret\n");
    fs.symlinkSync(outside, path.join(root, "docs", "linked"));
    const rels = discoverDocs(root).docs.map((d) => d.relPath);
    expect(rels.some((r) => r.includes("secret"))).toBe(false);
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("finds documents in a non-git project reached through a symlinked prefix", () => {
    // `consider` compares realpaths; a root kept as the symlinked spelling
    // (macOS /tmp → /private/tmp, /var → /private/var) would make every file
    // look like it escaped the project and drop the whole tree.
    const actual = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-nogit-"));
    const alias = path.join(
      os.tmpdir(),
      `trellis-alias-${process.pid}-${Date.now()}`,
    );
    try {
      fs.mkdirSync(path.join(actual, "docs"));
      fs.writeFileSync(
        path.join(actual, "docs", "guide.md"),
        "# Guide\n\nhello\n",
      );
      fs.symlinkSync(actual, alias);
      const found = discoverDocs(alias);
      expect(found.git).toBe(false);
      expect(found.docs.map((d) => d.relPath)).toContain("docs/guide.md");
      expect(found.root).toBe(fs.realpathSync(actual));
    } finally {
      fs.rmSync(alias, { force: true });
      fs.rmSync(actual, { recursive: true, force: true });
    }
  });
});

describe("recallMem", () => {
  it("returns a bounded doc hit with its location", () => {
    write("docs/limits.md", "# Limits\n\nThe upload size limit is 25 MB.\n");
    const result = recallMem({ query: "upload size limit", cwd: root });
    expect(result.hits.length).toBeGreaterThan(0);
    const hit = result.hits[0];
    expect(hit?.sourceKind).toBe("doc");
    expect(hit?.path).toBe("docs/limits.md");
    expect(hit?.excerpt).toContain("25 MB");
    expect(hit?.strength).toBe("strong");
  });

  it("marks an archived research hit", () => {
    write(
      ".trellis/research/archive/cadence.md",
      "# Cadence\n\nThe release cadence was weekly.\n",
    );
    const result = recallMem({ query: "release cadence", cwd: root });
    expect(result.hits[0]?.status).toBe("archived");
  });

  it("marks a note with superseded_by as superseded and ranks active notes ahead at equal coverage", () => {
    write(
      ".trellis/research/new-cadence.md",
      "# Cadence\n\nThe release cadence is biweekly.\n",
    );
    write(
      ".trellis/research/old-cadence.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/new-cadence.md\n---\n\n# Cadence\n\nThe release cadence is biweekly.\n",
    );
    const newer = new Date("2026-10-16T00:00:00Z");
    const older = new Date("2020-01-01T00:00:00Z");
    fs.utimesSync(
      path.join(root, ".trellis/research/old-cadence.md"),
      newer,
      newer,
    );
    fs.utimesSync(
      path.join(root, ".trellis/research/new-cadence.md"),
      older,
      older,
    );
    const result = recallMem({
      cwd: root,
      query: "release cadence biweekly",
      limit: 2,
    });
    expect(result.hits[0]?.path).toBe(".trellis/research/new-cadence.md");
    expect(result.hits[0]?.status).toBeUndefined();
    expect(result.hits[1]?.path).toBe(".trellis/research/old-cadence.md");
    expect(result.hits[1]?.status).toBe("superseded");
    expect(result.hits[1]?.supersededBy).toBe(
      ".trellis/research/new-cadence.md",
    );
  });

  it("returns the note text plus a successor hint on mem read without expanding the successor body", () => {
    write(
      ".trellis/research/successor.md",
      "# Successor\n\nSUCCESSOR_BODY_ONLY\n",
    );
    write(
      ".trellis/research/old.md",
      "---\nsuperseded_by: .trellis/research/successor.md\n---\n\n# Old\n\nOLD_NOTE_BODY needle\n",
    );
    const ref =
      recallMem({ cwd: root, query: "OLD_NOTE_BODY needle" }).hits[0]?.ref ??
      "";
    const read = readMemRefs({ cwd: root, refs: [ref] });
    expect(read.reads[0]?.text).toContain("OLD_NOTE_BODY");
    expect(read.reads[0]?.status).toBe("superseded");
    expect(read.reads[0]?.supersededBy).toBe(".trellis/research/successor.md");
    expect(read.reads[0]?.text).not.toContain("SUCCESSOR_BODY_ONLY");
  });

  it("includes one successor excerpt when the new note uses different words", () => {
    write(
      ".trellis/research/new-cap.md",
      "# Cap\n\nThe provider cap is two attempts.\n",
    );
    write(
      ".trellis/research/old-cap.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/new-cap.md\n---\n\n# Cap\n\nCallback retries at most three.\n",
    );
    const hit = recallMem({
      cwd: root,
      query: "callback retries three",
    }).hits[0];
    expect(hit?.path).toBe(".trellis/research/old-cap.md");
    expect(hit?.status).toBe("superseded");
    expect(hit?.successorExcerpt).toContain("cap is two attempts");
    expect(hit?.excerpt).not.toContain("cap is two attempts");
  });

  it("does not treat another topic's newer note as the successor", () => {
    write(
      ".trellis/research/new-cap.md",
      "# Cap\n\nThe provider cap is two attempts.\n",
    );
    write(
      ".trellis/research/old-cap.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/new-cap.md\n---\n\n# Cap\n\nCallback retries at most three.\n",
    );
    write(
      ".trellis/research/deploy.md",
      "# Deploy\n\ncallback retries three times in the deploy script\n",
    );
    const newer = new Date("2026-10-16T00:00:00Z");
    fs.utimesSync(path.join(root, ".trellis/research/deploy.md"), newer, newer);
    const result = recallMem({
      cwd: root,
      query: "callback retries three",
      limit: 5,
    });
    const old = result.hits.find(
      (hit) => hit.path === ".trellis/research/old-cap.md",
    );
    expect(old?.supersededBy).toBe(".trellis/research/new-cap.md");
    expect(
      result.hits.find((hit) => hit.path === ".trellis/research/deploy.md")
        ?.status,
    ).toBeUndefined();
    expect(
      result.hits.find((hit) => hit.path === ".trellis/research/deploy.md")
        ?.supersededBy,
    ).toBeUndefined();
  });

  it("ranks a declared successor ahead of the note it replaces without passing an unrelated note", () => {
    write(
      ".trellis/research/new-cap.md",
      "# Cap\n\ncallback retry limit\n\nThe provider cap is two attempts.\n",
    );
    write(
      ".trellis/research/old-cap.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/new-cap.md\n---\n\n# callback retry limit\n\ncallback retry limit was three\n",
    );
    write(
      "docs/deploy.md",
      "# Deploy\n\ncallback retry limit for the deploy script\n",
    );
    const result = recallMem({
      cwd: root,
      query: "callback retry limit",
      limit: 5,
    });
    const paths = result.hits.map((hit) => hit.path);
    const oldAt = paths.indexOf(".trellis/research/old-cap.md");
    const newAt = paths.indexOf(".trellis/research/new-cap.md");
    expect(newAt).toBeGreaterThanOrEqual(0);
    expect(oldAt).toBeGreaterThan(newAt);
    const deploy = result.hits.find((hit) => hit.path === "docs/deploy.md");
    expect(deploy?.status).toBeUndefined();
    expect(deploy?.supersededBy).toBeUndefined();
    expect(
      result.hits.find((hit) => hit.path === ".trellis/research/old-cap.md")
        ?.supersededBy,
    ).toBe(".trellis/research/new-cap.md");
  });

  it("keeps an edited section current when the note is not marked superseded", () => {
    write(
      ".trellis/research/callbacks.md",
      "# Callbacks\n\n## Retry\n\nAt most two retries.\n\n## Layout\n\nSpacing stays 8px.\n",
    );
    const hit = recallMem({ cwd: root, query: "two retries" }).hits[0];
    expect(hit?.status).toBeUndefined();
    expect(hit?.supersededBy).toBeUndefined();
    expect(hit?.lineageFault).toBeUndefined();
  });

  it("recalls unmarked markdown without a lineage migration", () => {
    write("docs/plain.md", "Keep the ledger append-only.\n");
    const result = recallMem({ cwd: root, query: "ledger append-only" });
    expect(result.hits[0]?.path).toBe("docs/plain.md");
    expect(result.hits[0]?.status).toBeUndefined();
    const read = readMemRefs({
      cwd: root,
      refs: [result.hits[0]?.ref ?? ""],
    });
    expect(read.reads[0]?.text).toContain("append-only");
    expect(read.reads[0]?.status).toBeUndefined();
    expect(read.reads[0]?.changed).not.toBe(true);
  });

  it("does not mark a note superseded because a source file changed", () => {
    write(".trellis/research/rule.md", "# Rule\n\nRetries at most two.\n");
    write("src/pay.ts", "export const n = 1\n");
    expect(
      recallMem({ cwd: root, query: "retries at most two" }).hits[0]?.status,
    ).toBeUndefined();
    write("src/pay.ts", "export const n = 2\n");
    expect(
      recallMem({ cwd: root, query: "retries at most two" }).hits[0]?.status,
    ).toBeUndefined();
  });

  it("reports changed and superseded together when a marked note's bytes change", () => {
    write(
      ".trellis/research/successor.md",
      "# Successor\n\nSUCCESSOR_BODY_ONLY\n",
    );
    write(
      ".trellis/research/old.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/successor.md\n---\n\n# Old\n\nOLD_NEEDLE alpha\n",
    );
    const ref = recallMem({ cwd: root, query: "OLD_NEEDLE alpha" }).hits[0]?.ref;
    write(
      ".trellis/research/old.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/successor.md\n---\n\n# Old\n\nOLD_NEEDLE beta\n",
    );
    const read = readMemRefs({ cwd: root, refs: ref ? [ref] : [] });
    expect(read.reads[0]?.changed).toBe(true);
    expect(read.reads[0]?.status).toBe("superseded");
    expect(read.reads[0]?.supersededBy).toBe(".trellis/research/successor.md");
    expect(read.reads[0]?.text).toBe("");
  });

  it("stops on a self target and on a two-note cycle without picking a winner", () => {
    write(
      ".trellis/research/self.md",
      "---\nsuperseded_by: .trellis/research/self.md\n---\n\n# Self\n\nself needle stays current\n",
    );
    const self = recallMem({ cwd: root, query: "self needle" }).hits[0];
    expect(self?.status).toBeUndefined();
    expect(self?.supersededBy).toBeUndefined();
    expect(self?.lineageFault).toBe("self");

    write(
      ".trellis/research/loop-a.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/loop-b.md\n---\n\n# A\n\nloop needle alpha\n",
    );
    write(
      ".trellis/research/loop-b.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/loop-a.md\n---\n\n# B\n\nloop needle beta\n",
    );
    const loop = recallMem({ cwd: root, query: "loop needle alpha" }).hits[0];
    expect(loop?.path).toBe(".trellis/research/loop-a.md");
    expect(loop?.status).toBe("superseded");
    expect(loop?.supersededBy).toBe(".trellis/research/loop-b.md");
    expect(loop?.lineageFault).toBe("cycle");
    expect(loop?.successorExcerpt).toBeUndefined();
  });

  it("does not read a successor outside the document source scope or a gitignored ordinary file", () => {
    write("src/hidden-rule.md", "# Hidden\n\nFINAL_RULE two attempts\n");
    write(".gitignore", "docs/ignored-rule.md\n");
    write("docs/ignored-rule.md", "# Ignored\n\nIGNORED_RULE two attempts\n");
    write(
      ".trellis/research/out-of-scope.md",
      "---\nstatus: superseded\nsuperseded_by: src/hidden-rule.md\n---\n\n# Old\n\nSOURCE_SCOPE_NEEDLE three\n",
    );
    write(
      ".trellis/research/gitignored.md",
      "---\nstatus: superseded\nsuperseded_by: docs/ignored-rule.md\n---\n\n# Old\n\nGITIGNORE_NEEDLE three\n",
    );
    const outside = recallMem({ cwd: root, query: "SOURCE_SCOPE_NEEDLE" });
    const ignored = recallMem({ cwd: root, query: "GITIGNORE_NEEDLE" });
    expect(JSON.stringify(outside.hits[0])).not.toContain("FINAL_RULE");
    expect(outside.hits[0]?.supersededBy).toBeUndefined();
    expect(outside.hits[0]?.lineageFault).toBe("missing-target");
    expect(JSON.stringify(ignored.hits[0])).not.toContain("IGNORED_RULE");
    expect(ignored.hits[0]?.supersededBy).toBeUndefined();
    expect(ignored.hits[0]?.lineageFault).toBe("missing-target");
    const outsideRead = readMemRefs({
      cwd: root,
      refs: outside.hits[0]?.ref ? [outside.hits[0].ref] : [],
    });
    expect(outsideRead.reads[0]?.supersededBy).toBe(
      outside.hits[0]?.supersededBy,
    );
    expect(outsideRead.reads[0]?.lineageFault).toBe(
      outside.hits[0]?.lineageFault,
    );
    expect(outsideRead.reads[0]?.text ?? "").not.toContain("FINAL_RULE");
  });

  it("still follows a gitignored successor inside .trellis spec, research, or workspace", () => {
    write(".gitignore", ".trellis/\n");
    write(
      ".trellis/research/kept.md",
      "# Kept\n\nKEPT_RULE two attempts\n",
    );
    write(
      ".trellis/research/old.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/kept.md\n---\n\n# Old\n\nKEPT_SCOPE_NEEDLE three\n",
    );
    const hit = recallMem({ cwd: root, query: "KEPT_SCOPE_NEEDLE" }).hits[0];
    expect(hit?.supersededBy).toBe(".trellis/research/kept.md");
    expect(hit?.successorExcerpt).toContain("KEPT_RULE");
    expect(hit?.lineageFault).toBeUndefined();
  });

  it("walks a replacement chain to the last current note for recall and read", () => {
    write(
      ".trellis/research/current.md",
      "# Current\n\nFINAL_CURRENT two attempts\n",
    );
    write(
      ".trellis/research/middle.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/current.md\n---\n\n# Middle\n\nMIDDLE_RULE still three\n",
    );
    write(
      ".trellis/research/parent.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/middle.md\n---\n\n# Parent\n\nCHAIN_NEEDLE three\n",
    );
    const hit = recallMem({ cwd: root, query: "CHAIN_NEEDLE" }).hits[0];
    const read = readMemRefs({
      cwd: root,
      refs: hit?.ref ? [hit.ref] : [],
    });
    expect(hit?.supersededBy).toBe(".trellis/research/current.md");
    expect(hit?.successorExcerpt).toContain("FINAL_CURRENT");
    expect(hit?.successorExcerpt).not.toContain("MIDDLE_RULE");
    expect(read.reads[0]?.supersededBy).toBe(hit?.supersededBy);
    expect(read.reads[0]?.lineageFault).toBe(hit?.lineageFault);
    expect(read.reads[0]?.status).toBe("superseded");
    expect(read.reads[0]?.text).not.toContain("FINAL_CURRENT");
    expect(read.reads[0]?.text).toContain("CHAIN_NEEDLE");
  });

  it("ranks a status-only superseded note after the current note with the same words", () => {
    write(
      ".trellis/research/current.md",
      "# Cap\n\ncallback retry limit is two\n",
    );
    write(
      ".trellis/research/old.md",
      "---\nstatus: superseded\n---\n\n# Cap\n\ncallback retry limit is two\n",
    );
    const newer = new Date("2026-10-16T00:00:00Z");
    fs.utimesSync(path.join(root, ".trellis/research/old.md"), newer, newer);
    const result = recallMem({
      cwd: root,
      query: "callback retry limit",
      limit: 2,
    });
    expect(result.hits[0]?.path).toBe(".trellis/research/current.md");
    expect(result.hits[0]?.status).toBeUndefined();
    expect(result.hits[1]?.status).toBe("superseded");
    expect(result.hits[1]?.supersededBy).toBeUndefined();
    expect(result.hits[1]?.lineageFault).toBeUndefined();
  });

  it("follows a successor reached by one in-repo link and ignores a gitignored or excluded one", () => {
    write("notes/visible.md", "# Visible\n\nLINKED_VISIBLE two attempts\n");
    write("docs/index.md", "[rule](../notes/visible.md)\n");
    write(
      ".trellis/research/linked.md",
      "---\nstatus: superseded\nsuperseded_by: notes/visible.md\n---\n\n# Old\n\nLINKED_NEEDLE three\n",
    );
    const linked = recallMem({ cwd: root, query: "LINKED_NEEDLE" }).hits[0];
    const linkedRead = readMemRefs({
      cwd: root,
      refs: linked?.ref ? [linked.ref] : [],
    });
    expect(linked?.supersededBy).toBe("notes/visible.md");
    expect(linked?.successorExcerpt).toContain("LINKED_VISIBLE");
    expect(linkedRead.reads[0]?.supersededBy).toBe(linked?.supersededBy);
    expect(linkedRead.reads[0]?.lineageFault).toBe(linked?.lineageFault);

    write(".gitignore", "notes/hidden.md\n");
    write("notes/hidden.md", "# Hidden\n\nLINKED_HIDDEN\n");
    write("docs/index.md", "[hidden](../notes/hidden.md)\n");
    write(
      ".trellis/research/ignored-link.md",
      "---\nstatus: superseded\nsuperseded_by: notes/hidden.md\n---\n\n# Old\n\nHIDDEN_LINK_NEEDLE three\n",
    );
    write(
      "node_modules/pkg/README.md",
      "# Dep\n\nNODE_MODULES_RULE\n",
    );
    write(
      ".trellis/research/excluded.md",
      "---\nstatus: superseded\nsuperseded_by: node_modules/pkg/README.md\n---\n\n# Old\n\nEXCLUDED_NEEDLE three\n",
    );
    const hidden = recallMem({ cwd: root, query: "HIDDEN_LINK_NEEDLE" });
    const excluded = recallMem({ cwd: root, query: "EXCLUDED_NEEDLE" });
    expect(hidden.hits[0]?.lineageFault).toBe("missing-target");
    expect(hidden.hits[0]?.supersededBy).toBeUndefined();
    expect(JSON.stringify(hidden.hits[0])).not.toContain("LINKED_HIDDEN");
    expect(excluded.hits[0]?.lineageFault).toBe("missing-target");
    expect(JSON.stringify(excluded.hits[0])).not.toContain("NODE_MODULES_RULE");
    for (const hit of [hidden.hits[0], excluded.hits[0]]) {
      const read = readMemRefs({
        cwd: root,
        refs: hit?.ref ? [hit.ref] : [],
      });
      expect(read.reads[0]?.lineageFault).toBe(hit?.lineageFault);
      expect(read.reads[0]?.supersededBy).toBe(hit?.supersededBy);
    }
  });

  it("reports the same fault for an external symlink on recall and read", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "recall-lineage-"));
    try {
      fs.writeFileSync(path.join(outside, "note.md"), "OUTSIDE_SECRET\n");
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.symlinkSync(
        path.join(outside, "note.md"),
        path.join(root, "docs/alias.md"),
      );
      write(
        ".trellis/research/alias.md",
        "---\nstatus: superseded\nsuperseded_by: docs/alias.md\n---\n\n# Old\n\nALIAS_NEEDLE three\n",
      );
      const hit = recallMem({ cwd: root, query: "ALIAS_NEEDLE" }).hits[0];
      const read = readMemRefs({
        cwd: root,
        refs: hit?.ref ? [hit.ref] : [],
      });
      expect(hit?.lineageFault).toBe("missing-target");
      expect(hit?.supersededBy).toBeUndefined();
      expect(JSON.stringify(hit)).not.toContain("OUTSIDE_SECRET");
      expect(read.reads[0]?.lineageFault).toBe(hit?.lineageFault);
      expect(read.reads[0]?.supersededBy).toBeUndefined();
      expect(read.reads[0]?.text ?? "").not.toContain("OUTSIDE_SECRET");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("does not let nested front matter change the whole note", () => {
    write(".trellis/research/other.md", "# Other\n\nNESTED_TARGET\n");
    write(
      ".trellis/research/current.md",
      "---\ntitle: cap\nmeta:\n  status: superseded\n  superseded_by: .trellis/research/other.md\n---\n\n# Cap\n\nNESTED_META_NEEDLE three\n",
    );
    const hit = recallMem({ cwd: root, query: "NESTED_META_NEEDLE" }).hits[0];
    expect(hit?.status).toBeUndefined();
    expect(hit?.supersededBy).toBeUndefined();
    expect(hit?.lineageFault).toBeUndefined();
    expect(JSON.stringify(hit)).not.toContain("NESTED_TARGET");
  });

  it("stops a chain that exceeds the hop cap without naming an intermediate as current", () => {
    let previous = ".trellis/research/end.md";
    write(previous, "# End\n\nFAR_RULE\n");
    for (let i = 8; i >= 0; i--) {
      const rel = `.trellis/research/hop-${i}.md`;
      write(
        rel,
        `---\nstatus: superseded\nsuperseded_by: ${previous}\n---\n\n# Hop ${i}\n\nHOP_${i}_BODY\n`,
      );
      previous = rel;
    }
    const hit = recallMem({ cwd: root, query: "HOP_0_BODY" }).hits[0];
    expect(hit?.status).toBe("superseded");
    expect(hit?.supersededBy).toBeUndefined();
    expect(hit?.successorExcerpt).toBeUndefined();
    expect(hit?.lineageFault).toBe("bounded");
    expect(JSON.stringify(hit)).not.toContain("FAR_RULE");
  });

  it("does not stop on the intermediate note when that note points further", () => {
    write(
      ".trellis/research/grandchild.md",
      "# Grandchild\n\nGRANDCHILD_ONLY\n",
    );
    write(
      ".trellis/research/child.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/grandchild.md\n---\n\n# Child\n\nCAP_TWO_ATTEMPTS\n",
    );
    write(
      ".trellis/research/parent.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/child.md\n---\n\n# Parent\n\nOLD_THREE_RETRIES\n",
    );
    const hit = recallMem({ cwd: root, query: "OLD_THREE_RETRIES" }).hits[0];
    const read = readMemRefs({
      cwd: root,
      refs: hit?.ref ? [hit.ref] : [],
    });
    expect(hit?.supersededBy).toBe(".trellis/research/grandchild.md");
    expect(hit?.successorExcerpt).toContain("GRANDCHILD_ONLY");
    expect(hit?.successorExcerpt).not.toContain("CAP_TWO_ATTEMPTS");
    expect(read.reads[0]?.supersededBy).toBe(hit?.supersededBy);
    expect(read.reads[0]?.lineageFault).toBe(hit?.lineageFault);
  });

  it("leaves dialogue and journal identity unmarked when a note is superseded", () => {
    write(
      ".trellis/research/new-cap.md",
      "# Cap\n\nThe provider cap is two attempts.\n",
    );
    write(
      ".trellis/research/old-cap.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/new-cap.md\n---\n\n# Cap\n\nCallback retries at most three.\n",
    );
    write(
      ".trellis/workspace/tester/journal-1.md",
      "# Journal\n\nCallback retries at most three.\n",
    );
    vi.mocked(MEM_PLATFORMS.claude.list).mockReturnValue([
      {
        id: "old-dialogue",
        platform: "claude",
        cwd: root,
        filePath: "synthetic",
      },
    ]);
    vi.spyOn(MEM_PLATFORMS.claude, "extract").mockReturnValue([
      { role: "assistant", text: "Callback retries at most three." },
    ]);
    const result = recallMem({
      cwd: root,
      query: "callback retries three",
      limit: 6,
    });
    const dialogue = result.hits.find((hit) => hit.sessionId === "old-dialogue");
    const journal = result.hits.find((hit) =>
      hit.path?.endsWith("journal-1.md"),
    );
    expect(dialogue?.status).toBeUndefined();
    expect(dialogue?.supersededBy).toBeUndefined();
    expect(journal?.status).toBeUndefined();
    expect(journal?.supersededBy).toBeUndefined();
    expect(
      result.hits.find((hit) => hit.path === ".trellis/research/old-cap.md")
        ?.status,
    ).toBe("superseded");
  });

  it("accepts a heading/preamble lineage mark without YAML front matter", () => {
    write(".trellis/research/next.md", "# Next\n\nactive needle body\n");
    write(
      ".trellis/research/prior.md",
      "# Superseded\nstatus: superseded\nsuperseded_by: .trellis/research/next.md\n\n# Prior\n\nprior needle body\n",
    );
    const hit = recallMem({ cwd: root, query: "prior needle" }).hits.find(
      (item) => item.path === ".trellis/research/prior.md",
    );
    expect(hit?.status).toBe("superseded");
    expect(hit?.supersededBy).toBe(".trellis/research/next.md");
  });

  it("ignores a missing or escaping superseded_by path without crashing", () => {
    write(
      ".trellis/research/orphan.md",
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/does-not-exist.md\n---\n\n# Orphan\n\norphan needle\n",
    );
    write(
      ".trellis/research/escape.md",
      "---\nsuperseded_by: ../../etc/passwd\n---\n\n# Escape\n\nescape needle\n",
    );
    const orphan = recallMem({ cwd: root, query: "orphan needle" });
    expect(orphan.hits[0]?.status).toBe("superseded");
    expect(orphan.hits[0]?.supersededBy).toBeUndefined();
    expect(orphan.hits[0]?.lineageFault).toBe("missing-target");
    const escape = recallMem({ cwd: root, query: "escape needle" });
    expect(escape.hits[0]?.status).toBeUndefined();
    expect(escape.hits[0]?.supersededBy).toBeUndefined();
    expect(escape.hits[0]?.lineageFault).toBe("escapes-project");
    expect(resolveSupersededBy(root, "../secret.md")).toBeUndefined();
    expect(resolveSupersededBy(root, "/etc/passwd")).toBeUndefined();
    expect(
      parseDocLineage("---\nsuperseded_by: ../outside.md\n---\n", root)
        .superseded,
    ).toBe(false);
  });

  it("marks a partial overlap as weak and prefers full coverage", () => {
    write("docs/full.md", "# Full\n\nThe upload size limit is 25 MB.\n");
    write("docs/partial.md", "# Partial\n\nThe upload failed.\n");
    const result = recallMem({
      query: "upload size limit",
      cwd: root,
      limit: 3,
    });
    const full = result.hits.find((h) => h.path === "docs/full.md");
    const partial = result.hits.find((h) => h.path === "docs/partial.md");
    expect(full?.strength).toBe("strong");
    expect(partial).toBeUndefined();
  });

  it("falls back to one weak match when nothing covers the whole query", () => {
    write("docs/partial.md", "# Partial\n\nThe upload failed.\n");
    const result = recallMem({ query: "upload size limit", cwd: root });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.strength).toBe("weak");
  });

  it("reports no match instead of inventing one", () => {
    write("docs/guide.md", "# Guide\n\nNothing relevant here.\n");
    const result = recallMem({ query: "kubernetes operator", cwd: root });
    expect(result.hits).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it("expands a doc ref back to its source", () => {
    write("docs/limits.md", "# Limits\n\nThe upload size limit is 25 MB.\n");
    const result = recallMem({ query: "upload size", cwd: root });
    const ref = result.hits[0]?.ref;
    expect(ref).toBeDefined();
    const read = readMemRefs({ refs: [ref ?? ""], cwd: root });
    expect(read.reads[0]?.text).toContain("25 MB");
    expect(read.warnings).toEqual([]);
  });

  it("refuses a ref that escapes the project", () => {
    const read = readMemRefs({ refs: ["doc:../secret.md:1"], cwd: root });
    expect(read.reads).toEqual([]);
    expect(read.warnings[0]?.code).toBe("ref-invalid");
  });
});

function docRef(rel: string): string {
  return `doc:v1:${Buffer.from(JSON.stringify({ kind: "doc", path: rel, start: 0, end: 1, hash: "0".repeat(24) })).toString("base64url")}`;
}

describe("review regressions: source boundaries and evidence", () => {
  it("applies ignore and exclusion policy to links, root files and aliases", () => {
    write(".gitignore", "docs/private.md\nCLAUDE.md\n");
    write("docs/private.md", "secret notes");
    write("CLAUDE.md", "ignored root");
    write("node_modules/pkg/README.md", "dependency");
    write(".hidden/note.md", "hidden");
    write(
      "README_CN.md",
      "[private](docs/private.md) [dep](node_modules/pkg/README.md) [hidden](.hidden/note.md)",
    );
    fs.symlinkSync(
      path.join(root, "docs/private.md"),
      path.join(root, "docs/alias.md"),
    );
    expect(discoverDocs(root).docs.map((d) => d.relPath)).toEqual([
      "README_CN.md",
    ]);
  });

  it("rejects external symlinks and arbitrary files through versioned read refs", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "recall-outside-"));
    try {
      fs.writeFileSync(path.join(outside, "note.md"), "outside");
      write(".env", "SYNTHETIC_ENV");
      fs.symlinkSync(
        path.join(outside, "note.md"),
        path.join(root, "README.md"),
      );
      const result = readMemRefs({
        cwd: root,
        refs: [docRef("README.md"), docRef(".env"), docRef("../note.md")],
      });
      expect(result.reads).toEqual([]);
      expect(result.warnings).toHaveLength(3);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a previously discovered file replaced by an external symlink", () => {
    write("docs/rule.md", "approved refund");
    const ref =
      recallMem({ cwd: root, query: "approved refund" }).hits[0]?.ref ?? "";
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "recall-replacement-"),
    );
    try {
      fs.writeFileSync(path.join(outside, "note.md"), "outside");
      fs.unlinkSync(path.join(root, "docs/rule.md"));
      fs.symlinkSync(
        path.join(outside, "note.md"),
        path.join(root, "docs/rule.md"),
      );
      expect(readMemRefs({ cwd: root, refs: [ref] }).reads).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("expands the actual late evidence instead of the first token occurrence", () => {
    write(
      "docs/decision.md",
      "# Intro\nalpha\n" +
        "filler\n".repeat(100) +
        "# Decision\nalpha beta RELEASE_ALLOWED",
    );
    const hit = recallMem({ cwd: root, query: "alpha beta" }).hits[0];
    expect(hit?.section).toBe("Decision");
    expect(hit?.line).toBeGreaterThan(100);
    const read = readMemRefs({ cwd: root, refs: [hit?.ref ?? ""] });
    expect(read.reads[0]?.text).toContain("RELEASE_ALLOWED");
  });

  it("marks same-line-count replacement as changed and does not return unrelated evidence", () => {
    write("docs/decision.md", "# Decision\n\nPayment refund approved.");
    const hit = recallMem({ cwd: root, query: "Payment refund" }).hits[0];
    write("docs/decision.md", "# Decision\n\nUnrelated replacement.");
    const result = readMemRefs({ cwd: root, refs: [hit?.ref ?? ""] });
    expect(result.reads[0]?.changed).toBe(true);
    expect(result.reads[0]?.text).toBe("");
    expect(result.warnings.some((w) => w.code === "ref-changed")).toBe(true);
  });

  it("reports moved or deleted sources without throwing", () => {
    write("docs/decision.md", "refund approved");
    const ref = recallMem({ cwd: root, query: "refund" }).hits[0]?.ref ?? "";
    fs.renameSync(
      path.join(root, "docs/decision.md"),
      path.join(root, "docs/moved.md"),
    );
    const result = readMemRefs({ cwd: root, refs: [ref] });
    expect(result.reads).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("ranks greater query coverage ahead of three first-token-only candidates", () => {
    for (let i = 0; i < 3; i++) write(`docs/a${i}.md`, "alpha");
    write("docs/z.md", "alpha beta");
    const result = recallMem({ cwd: root, query: "alpha beta gamma" });
    expect(result.hits[0]?.path).toBe("docs/z.md");
    expect(result.hits[0]?.strength).toBe("weak");
    expect(result.incomplete).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("keeps no-shared-word lexical misses explicit", () => {
    write("docs/payment.md", "避免重复扣款");
    expect(recallMem({ cwd: root, query: "幂等" }).hits).toEqual([]);
  });

  it("honors the complete evidence record budget including refs", () => {
    write("docs/long.md", "needle " + "padding ".repeat(300));
    for (const maxChars of [0, 10, 400, 800]) {
      const result = recallMem({ cwd: root, query: "needle", maxChars });
      expect(
        result.hits.reduce((n, h) => n + JSON.stringify(h).length, 0),
      ).toBeLessThanOrEqual(maxChars);
      if (maxChars < 800) expect(result.truncated).toBe(true);
    }
  });

  it("applies read budget across a batch, not once per ref", () => {
    write("docs/a.md", "needle " + "abc ".repeat(1000));
    write("docs/b.md", "needle " + "def ".repeat(1000));
    const refs = recallMem({ cwd: root, query: "needle" }).hits.map(
      (h) => h.ref,
    );
    const result = readMemRefs({ cwd: root, refs, maxChars: 1000 });
    expect(result.reads).toHaveLength(2);
    expect(result.reads.every((r) => r.text.includes("needle"))).toBe(true);
    expect(
      result.reads.reduce((n, r) => n + JSON.stringify(r).length, 0),
    ).toBeLessThanOrEqual(1000);
    expect(result.truncated).toBe(true);
  });

  it("maps compatibility ligatures and combining sequences to original offsets", () => {
    for (const prefix of [
      "ﬃ".repeat(300),
      "e\u0301".repeat(300),
      "Ａ".repeat(300),
    ]) {
      const text = prefix + " TARGET_DECISION " + "x".repeat(500);
      const w = excerptAround(text, ["target_decision"], 80);
      expect(w.excerpt).toContain("TARGET_DECISION");
      expect(text.slice(w.anchorStart, w.anchorEnd)).toBe("TARGET_DECISION");
      expect(w.excerpt.length).toBeLessThanOrEqual(80);
    }
  });

  it("reports skipped large files as an incomplete scan, not an empty complete result", () => {
    write("docs/large.md", "needle" + "x".repeat(1_000_001));
    const result = recallMem({ cwd: root, query: "needle" });
    expect(result.hits).toEqual([]);
    expect(result.incomplete).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.warnings[0]?.code).toBe("doc-too-large");
  });

  it("reports invalid refs rather than silently returning nothing", () => {
    const result = readMemRefs({
      cwd: root,
      refs: ["doc:v1:broken", "session:bad", "nonsense"],
    });
    expect(result.reads).toEqual([]);
    expect(result.warnings).toHaveLength(3);
  });

  it("preserves a dialogue hit when a preceding turn exceeds the entire read budget", () => {
    vi.mocked(MEM_PLATFORMS.claude.list).mockReturnValue([
      {
        id: "synthetic",
        platform: "claude",
        cwd: root,
        filePath: "synthetic.jsonl",
      },
    ]);
    const extract = vi.spyOn(MEM_PLATFORMS.claude, "extract").mockReturnValue([
      { role: "user", text: "background ".repeat(1000) },
      { role: "assistant", text: "needle CONFIRMED_DECISION" },
      { role: "user", text: "Only for test accounts." },
    ]);
    const ref = recallMem({ cwd: root, query: "needle" }).hits[0]?.ref ?? "";
    const result = readMemRefs({ cwd: root, refs: [ref] });
    expect(result.reads[0]?.text).toContain(
      "assistant: needle CONFIRMED_DECISION",
    );
    expect(result.reads[0]?.text).toContain("user: Only for test accounts.");
    expect(result.reads[0]?.truncated).toBe(true);
    extract.mockReturnValue([{ role: "user", text: "rewritten conversation" }]);
    expect(readMemRefs({ cwd: root, refs: [ref] }).reads[0]?.changed).toBe(
      true,
    );
  });
  it("refuses a session ref from another project even when its id is known", () => {
    vi.mocked(MEM_PLATFORMS.claude.list).mockReturnValue([
      {
        id: "foreign",
        platform: "claude",
        cwd: root + "-other",
        filePath: "foreign.jsonl",
      },
    ]);
    const extract = vi.spyOn(MEM_PLATFORMS.claude, "extract");
    const ref =
      "session:v1:" +
      Buffer.from(
        JSON.stringify({
          kind: "session",
          platform: "claude",
          id: "foreign",
          turn: 0,
          start: 0,
          end: 1,
          hash: "0".repeat(24),
        }),
      ).toString("base64url");
    const result = readMemRefs({ cwd: root, refs: [ref] });
    expect(result.reads).toEqual([]);
    expect(result.warnings.some((w) => w.code === "ref-missing")).toBe(true);
    expect(extract).not.toHaveBeenCalled();
  });

  it("keeps the lexical fallback and original offsets without Intl.Segmenter", async () => {
    const original = Intl.Segmenter;
    try {
      Object.defineProperty(Intl, "Segmenter", {
        configurable: true,
        writable: true,
        value: undefined,
      });
      vi.resetModules();
      const fallback = await import("../../src/mem/lexical.js");
      expect(fallback.queryTerms("支付接口幂等性")).toContain("幂等");
      expect(
        fallback.excerptAround(
          "e\u0301".repeat(100) + " TARGET " + "end".repeat(100),
          ["target"],
          40,
        ).excerpt,
      ).toContain("TARGET");
    } finally {
      Object.defineProperty(Intl, "Segmenter", {
        configurable: true,
        writable: true,
        value: original,
      });
      vi.resetModules();
    }
  });
});
