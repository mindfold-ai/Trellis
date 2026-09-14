import { describe, expect, it } from "vitest";
import {
  hasRetiredInstructions,
  isRetiredDataPath,
  migrationTouchesRetiredData,
  retirementGuide,
} from "../../src/migrations/retirement.js";

describe("target-owned retirement contract", () => {
  it.each([
    "0.1.0",
    "0.2.15",
    "0.3.0-beta.0",
    "0.3.0-beta.7",
    "0.4.0",
    "0.5.0-beta.5",
    "0.6.16",
    "0.7.0-castbox.1",
  ])("supplies cumulative current guidance from %s", (from) => {
    const guide = retirementGuide(from, "0.7.0-castbox.1");
    expect(hasRetiredInstructions(guide)).toBe(false);
    expect(guide).toContain("task.py");
    expect(guide).toContain("trellis- prefix");
    expect(guide).toContain("hookSpecificOutput");
    expect(guide).toContain("native worktree primitives");
    expect(guide).not.toMatch(/init_developer\.py|add_session\.py|grep -r/);
  });
  it("fails closed for an unsupported source", () => {
    expect(() => retirementGuide("unknown", "0.7.0-castbox.1")).toThrow(
      "Unsupported migration source",
    );
    expect(() => retirementGuide("0.7.0", "0.8.0")).toThrow(
      "Unsupported migration source",
    );
  });
  it("supports successive fixed fork releases", () => {
    expect(retirementGuide("0.7.0-castbox.1", "0.7.0-castbox.2")).toContain(
      "Python 3.9",
    );
    expect(() => retirementGuide("0.7.0-castbox.2", "0.7.0-castbox.1")).toThrow(
      "--allow-downgrade",
    );
    expect(retirementGuide("0.7.0-castbox.2", "0.7.0-castbox.1", true)).toContain(
      "without reversing migrations",
    );
  });
  it.each([
    ".trellis/workspace",
    ".trellis/workspace/index.md",
    ".trellis/.developer",
    ".trellis/agent-traces/arbitrary/data",
    ".trellis\\workspace\\link",
  ])("protects %s before traversal", (name) => {
    expect(isRetiredDataPath(name)).toBe(true);
    expect(
      migrationTouchesRetiredData({
        type: "rename-dir",
        from: name,
        to: ".trellis/new",
      }),
    ).toBe(true);
  });
  it("also blocks ancestor moves and historical migration destinations", () => {
    expect(
      migrationTouchesRetiredData({
        type: "rename-dir",
        from: ".trellis",
        to: ".old",
      }),
    ).toBe(true);
    expect(
      migrationTouchesRetiredData({
        type: "rename-dir",
        from: ".old",
        to: ".trellis/workspace",
      }),
    ).toBe(true);
    expect(isRetiredDataPath(".trellis/workspace-other")).toBe(false);
  });
  it.each([
    "Run init_developer.py",
    "python3 .trellis/scripts/init_developer.py alice # deprecated",
    "```sh\npython3 .trellis/scripts/init_developer.py alice # deprecated\n```",
    "~~~sh\n./.trellis/scripts/init-developer.sh alice # removed\n~~~",
    "```js\nconst workspace = getWorkspaceDir(root); // deprecated\n```",
    "TRELLIS_DEVELOPER=alice # deprecated",
    "Never forget to run init_developer.py",
    "Do not forget to export TRELLIS_DEVELOPER=alice",
    "Never skip init_developer.py",
    "Do not stop using init_developer.py",
    "Do not read history and run init_developer.py",
    "export TRELLIS_DEVELOPER=alice",
    "const workspace = getWorkspaceDir(root);",
    "Load .trellis/workspace/index.md",
    "Read .trellis\\workspace\\alice\\index.md",
    "Read the Trellis workspace index",
    "Update journal-1.md",
    "Run get_context.py --mode record",
    "Append to journal",
    "Append to your journal",
    "Record in the journal",
    "grep -r task .trellis/",
    "Run /trellis:record-session",
    "Invoke trellis-record-session after finishing",
    "Call /record-session",
    "Run the retired add_session.py command",
    "cat .trellis/.developer",
    "cat .trellis/workspace/alice/index.md",
    "printf done >> .trellis/workspace/alice/journal-1.md",
    "cp .trellis/workspace/alice/index.md /tmp/index.md",
    "find .trellis/agent-traces -type f",
    "python3 -c 'open(\".trellis/.developer\").read()'",
    "sudo cat .trellis/.developer",
    "env FOO=1 cat .trellis/workspace/alice/index.md",
    "command cat .trellis/workspace/alice/index.md",
    "tee .trellis/workspace/alice/journal-1.md",
    "install /tmp/history .trellis/.developer",
    "Do not read history; run /trellis:record-session",
    "add_session.py is retired. Invoke trellis-record-session after finishing",
  ])("rejects obsolete instruction: %s", (text) => {
    expect(hasRetiredInstructions(text)).toBe(true);
  });
  it.each([
    "Do not run add_session.py; it is retired.",
    "```sh\n# init_developer.py is retired.\npython3 .trellis/scripts/task.py list\n```",
    '```json\n{"dependencies":{"core":"workspace:*"}}\n```',
    "Never invoke /trellis:record-session.",
    "Do not call get_workspace_dir; this API is removed.",
    "get_developer.py is retired.",
    "TRELLIS_DEVELOPER is retired.",
    "getWorkspaceDir is removed.",
    "trellis-record-session is deprecated.",
    "Do not run get_context.py --mode record.",
    "Do not run grep -r task .trellis/.",
  ])("accepts retirement explanation: %s", (text) => {
    expect(hasRetiredInstructions(text)).toBe(false);
  });
  it.each([
    "Run pnpm test from the workspace root.",
    "Use pnpm --filter @acme/api build in this workspace.",
    "Read the SQLite write-ahead journal when diagnosing storage failures.",
    "Append to the SQLite journal during a transaction.",
    "Run cargo build --workspace.",
  ])("accepts unrelated workspace and journal instructions: %s", (text) => {
    expect(hasRetiredInstructions(text)).toBe(false);
    expect(hasRetiredInstructions(`${text}\nAppend to journal`)).toBe(true);
  });
  it("accepts task-only workflow and archive compatibility", () => {
    expect(
      hasRetiredInstructions(
        "# TDD Workflow\nTest, implement, archive task.\nsession_auto_commit: false\nPreserve .trellis/workspace untouched.",
      ),
    ).toBe(false);
  });
});
