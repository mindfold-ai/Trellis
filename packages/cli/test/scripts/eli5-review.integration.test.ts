import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectPlatformTemplates,
  PLATFORM_IDS,
} from "../../src/configurators/index.js";

const python = process.platform === "win32" ? "python" : "python3";
const templates = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/templates",
);
const renderer = path.join(
  templates,
  "common/bundled-skills/trellis-eli5-review/scripts/render_review.py",
);
const plan = {
  title: "Clear review <script>alert(1)</script>",
  summary: "Review @@MODE@@ & evidence",
  locale: "zh-Hans",
  why: ["Understand changes"],
  approach: ["Read", "Review"],
  in_scope: ["Views"],
  out_of_scope: ["Approval UI"],
  acceptance: ["Links survive archive"],
  decisions: ["None"],
  evidence: [{ label: "Requirements", href: "prd.md" }],
};
const finish = {
  title: "Result",
  summary: "One check still pending",
  locale: "en-US",
  plan_basis: "reviewed",
  before: "Long prose",
  after: "Compact review",
  delivered: ["HTML views"],
  deviations: ["Live check deferred"],
  remaining: ["Run live check"],
  checks: [{ name: "Live", status: "not_run", detail: "No live run" }],
  evidence: plan.evidence,
};

describe("human review rendering", () => {
  let root: string;
  let task: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-review-"));
    task = path.join(root, ".trellis/tasks/sample");
    fs.mkdirSync(task, { recursive: true });
    fs.writeFileSync(path.join(task, "prd.md"), "Authoritative requirements");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function run(mode: string, input: object, script = renderer) {
    fs.writeFileSync(
      path.join(task, `${mode}-review.json`),
      JSON.stringify(input),
    );
    return spawnSync(python, [script, "--task-dir", task, "--mode", mode], {
      encoding: "utf8",
    });
  }

  it("renders escaped content and preserves plan and evidence during finish", () => {
    expect(run("plan", plan).status).toBe(0);
    const original = fs.readFileSync(
      path.join(task, "plan-review.html"),
      "utf8",
    );
    expect(original).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(original).toContain("Review @@MODE@@ &amp; evidence");
    expect(original).toContain('<html lang="zh-Hans">');
    expect(run("finish", finish).status).toBe(0);
    const report = fs.readFileSync(
      path.join(task, "finish-review.html"),
      "utf8",
    );
    expect(report).toContain("not run");
    expect(report).toContain("Live check deferred");
    expect(report).not.toContain("Reviewed plan unavailable");
    expect(fs.readFileSync(path.join(task, "plan-review.html"), "utf8")).toBe(
      original,
    );
    expect(fs.readFileSync(path.join(task, "prd.md"), "utf8")).toBe(
      "Authoritative requirements",
    );
  });

  it.each([
    "",
    "en_US",
    "en US",
    "en--US",
    'en"><script>alert(1)</script>',
    "en-123456789",
  ])(
    "rejects malformed or unsafe locale %s without replacing output",
    (locale) => {
      expect(run("plan", plan).status).toBe(0);
      const original = fs.readFileSync(
        path.join(task, "plan-review.html"),
        "utf8",
      );
      expect(run("plan", { ...plan, locale }).status).toBe(1);
      expect(fs.readFileSync(path.join(task, "plan-review.html"), "utf8")).toBe(
        original,
      );
    },
  );

  it.each([
    "javascript:alert(1)",
    "//example.com/x",
    "../outside",
    "%2e%2e/outside",
    "https://user:pass@example.com",
    "missing.md",
  ])(
    "refuses unsafe or missing evidence %s without replacing output",
    (href) => {
      expect(run("plan", plan).status).toBe(0);
      const original = fs.readFileSync(
        path.join(task, "plan-review.html"),
        "utf8",
      );
      expect(
        run("plan", { ...plan, evidence: [{ label: "Bad", href }] }).status,
      ).toBe(1);
      expect(fs.readFileSync(path.join(task, "plan-review.html"), "utf8")).toBe(
        original,
      );
      expect(
        fs.readdirSync(task).filter((name) => name.endsWith(".tmp")),
      ).toEqual([]);
    },
  );

  it("discloses absent reviewed plan and rejects missing required sections", () => {
    expect(run("finish", finish).status).toBe(0);
    expect(
      fs.readFileSync(path.join(task, "finish-review.html"), "utf8"),
    ).toContain("Reviewed plan unavailable");
    expect(run("finish", { ...finish, deviations: [] }).status).toBe(1);
  });

  it.skipIf(process.platform === "win32")(
    "refuses symlink output and external evidence",
    () => {
      const outside = path.join(root, "outside.txt");
      fs.writeFileSync(outside, "Preserve me");
      fs.symlinkSync(outside, path.join(task, "plan-review.html"));
      expect(run("plan", plan).status).toBe(1);
      fs.unlinkSync(path.join(task, "plan-review.html"));
      fs.symlinkSync(outside, path.join(task, "evidence.md"));
      expect(
        run("plan", {
          ...plan,
          evidence: [{ label: "Outside", href: "evidence.md" }],
        }).status,
      ).toBe(1);
      expect(fs.readFileSync(outside, "utf8")).toBe("Preserve me");
    },
  );

  it("carries reports and relative evidence through the real archive command", () => {
    fs.cpSync(
      path.join(templates, "trellis/scripts"),
      path.join(root, ".trellis/scripts"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(root, ".trellis/config.yaml"),
      "session_auto_commit: false\n",
    );
    fs.writeFileSync(
      path.join(task, "task.json"),
      JSON.stringify({
        id: "sample",
        name: "sample",
        title: "Sample",
        description: "Archive review",
        status: "in_progress",
        assignee: "test",
        children: [],
      }),
    );
    execFileSync("git", ["init", "-q"], { cwd: root });
    expect(run("plan", plan).status).toBe(0);
    expect(run("finish", finish).status).toBe(0);
    const result = spawnSync(
      python,
      [".trellis/scripts/task.py", "archive", "sample"],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const archive = path.join(root, ".trellis/tasks/archive");
    const month = fs.readdirSync(archive)[0];
    const archived = path.join(archive, month, "sample");
    expect(fs.existsSync(path.join(archived, "plan-review.html"))).toBe(true);
    expect(
      fs.readFileSync(path.join(archived, "finish-review.html"), "utf8"),
    ).toContain('href="prd.md"');
    expect(fs.existsSync(path.join(archived, "prd.md"))).toBe(true);
  });

  it.each(PLATFORM_IDS)(
    "installs a runnable bundled renderer for %s through the update template map",
    (platform) => {
      const files = collectPlatformTemplates(platform);
      const entry = [...files.keys()].find((name) =>
        name.endsWith("trellis-eli5-review/scripts/render_review.py"),
      );
      expect(entry).toBeDefined();
      if (!entry) throw new Error("Missing renderer");
      for (const [name, content] of files) {
        if (!name.includes("trellis-eli5-review/")) continue;
        const dest = path.join(root, name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content);
        expect(content).not.toMatch(/\{\{(?:PYTHON_CMD|CMD_REF:)/);
      }
      expect(run("plan", plan, path.join(root, entry)).status).toBe(0);
    },
  );
});
