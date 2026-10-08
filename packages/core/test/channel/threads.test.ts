import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addThreadContext,
  createChannel,
  deleteThreadContext,
  listForumThreads,
  listThreadContext,
  postThread,
  readChannelEvents,
  reduceThreads,
  renameThread,
  showThread,
} from "../../src/channel/index.js";
import { setupChannelTmp, type TmpEnv } from "./setup.js";

describe("thread reducer and lifecycle", () => {
  let env: TmpEnv;
  beforeEach(() => {
    env = setupChannelTmp();
    vi.spyOn(process, "cwd").mockReturnValue(env.projectDir);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    env.cleanup();
  });

  it("rejects post on a chat channel", async () => {
    await createChannel({ channel: "chat-only", by: "main" });
    await expect(
      postThread({
        channel: "chat-only",
        by: "main",
        action: "opened",
        thread: "x",
      }),
    ).rejects.toThrow(/requires a forum channel/);
  });

  it("rejects thread reads and thread context mutations on chat channels", async () => {
    await createChannel({ channel: "chat-read", by: "main" });

    await expect(listForumThreads({ channel: "chat-read" })).rejects.toThrow(
      /requires a forum channel/,
    );
    await expect(
      showThread({ channel: "chat-read", thread: "issue" }),
    ).rejects.toThrow(/requires a forum channel/);
    await expect(
      addThreadContext({
        channel: "chat-read",
        by: "main",
        thread: "issue",
        context: [{ type: "raw", text: "note" }],
      }),
    ).rejects.toThrow(/requires a forum channel/);
  });

  it("reduces opened/comment/status/labels/processed/lastSeq", async () => {
    await createChannel({ channel: "b", by: "main", type: "forum" });
    await postThread({
      channel: "b",
      by: "main",
      action: "opened",
      thread: "t1",
      title: "Title",
      labels: ["a"],
    });
    await postThread({
      channel: "b",
      by: "arch",
      action: "comment",
      thread: "t1",
      text: "Reviewed",
    });
    await postThread({
      channel: "b",
      by: "main",
      action: "status",
      thread: "t1",
      status: "closed",
    });
    await postThread({
      channel: "b",
      by: "main",
      action: "labels",
      thread: "t1",
      labels: ["a", "b"],
    });
    await postThread({
      channel: "b",
      by: "main",
      action: "processed",
      thread: "t1",
    });

    const states = await listForumThreads({ channel: "b" });
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      thread: "t1",
      title: "Title",
      status: "processed",
      labels: ["a", "b"],
      comments: 1,
    });
    const events = await readChannelEvents({ channel: "b" });
    expect(states[0].lastSeq).toBe(events.at(-1)?.seq);
  });

  describe("thread rename alias semantics", () => {
    it("resolves a -> b chain into b including pre-rename and late-old-key events", async () => {
      await createChannel({ channel: "r", by: "main", type: "forum" });
      await postThread({
        channel: "r",
        by: "main",
        action: "opened",
        thread: "old",
        title: "Old",
      });
      await postThread({
        channel: "r",
        by: "main",
        action: "comment",
        thread: "old",
        text: "before-rename",
      });
      await renameThread({
        channel: "r",
        by: "main",
        thread: "old",
        newThread: "new",
      });
      // A late comment written to the OLD key after rename should
      // resolve to the new thread.
      await postThread({
        channel: "r",
        by: "main",
        action: "comment",
        thread: "old",
        text: "after-rename-on-old-key",
      });

      const states = await listForumThreads({ channel: "r" });
      expect(states).toHaveLength(1);
      expect(states[0].thread).toBe("new");
      expect(states[0].aliases).toContain("old");
      // showThread by either key returns the merged timeline.
      const fromNew = await showThread({ channel: "r", thread: "new" });
      const fromOld = await showThread({ channel: "r", thread: "old" });
      expect(fromNew.length).toBe(fromOld.length);
      expect(fromOld.length).toBeGreaterThanOrEqual(4); // opened + comment + rename + late comment
    });

    it("rejects rename when target already exists", async () => {
      await createChannel({ channel: "rc", by: "main", type: "forum" });
      await postThread({
        channel: "rc",
        by: "main",
        action: "opened",
        thread: "a",
      });
      await postThread({
        channel: "rc",
        by: "main",
        action: "opened",
        thread: "b",
      });
      await expect(
        renameThread({
          channel: "rc",
          by: "main",
          thread: "a",
          newThread: "b",
        }),
      ).rejects.toThrow(/already exists/);
    });

    it("rejects rename when the source thread does not exist", async () => {
      await createChannel({
        channel: "missing-source",
        by: "main",
        type: "forum",
      });

      await expect(
        renameThread({
          channel: "missing-source",
          by: "main",
          thread: "missing",
          newThread: "new",
        }),
      ).rejects.toThrow(/not found/);
    });

    it("flattens chains a -> b -> c into c", async () => {
      await createChannel({ channel: "ch", by: "main", type: "forum" });
      await postThread({
        channel: "ch",
        by: "main",
        action: "opened",
        thread: "a",
      });
      await renameThread({
        channel: "ch",
        by: "main",
        thread: "a",
        newThread: "b",
      });
      await renameThread({
        channel: "ch",
        by: "main",
        thread: "b",
        newThread: "c",
      });
      const states = await listForumThreads({ channel: "ch" });
      expect(states[0].thread).toBe("c");
      expect(new Set(states[0].aliases)).toEqual(new Set(["a", "b"]));
    });
  });

  describe("thread context", () => {
    it("add/delete thread context and resolves through rename", async () => {
      await createChannel({ channel: "tc", by: "main", type: "forum" });
      await postThread({
        channel: "tc",
        by: "main",
        action: "opened",
        thread: "issue",
      });
      await addThreadContext({
        channel: "tc",
        by: "main",
        thread: "issue",
        context: [
          { type: "file", path: "/abs/a.md" },
          { type: "raw", text: "note" },
        ],
      });
      await deleteThreadContext({
        channel: "tc",
        by: "main",
        thread: "issue",
        context: [{ type: "raw", text: "note" }],
      });
      let listed = await listThreadContext({
        channel: "tc",
        thread: "issue",
      });
      expect(listed).toEqual([{ type: "file", path: "/abs/a.md" }]);

      // Rename and look up by old key.
      await renameThread({
        channel: "tc",
        by: "main",
        thread: "issue",
        newThread: "issue-new",
      });
      listed = await listThreadContext({
        channel: "tc",
        thread: "issue",
      });
      expect(listed).toEqual([{ type: "file", path: "/abs/a.md" }]);
      const states = await listForumThreads({ channel: "tc" });
      expect(states[0].thread).toBe("issue-new");
      expect(states[0].context).toEqual([
        { type: "file", path: "/abs/a.md" },
      ]);
    });
  });

  it("reduceThreads computes from raw events too", async () => {
    const events = [
      {
        seq: 1,
        ts: "2026-05-13T00:00:00.000Z",
        kind: "create",
        by: "main",
        type: "forum",
      },
      {
        seq: 2,
        ts: "2026-05-13T00:00:01.000Z",
        kind: "thread",
        by: "main",
        action: "opened",
        thread: "t",
        title: "T",
      },
      {
        seq: 3,
        ts: "2026-05-13T00:00:02.000Z",
        kind: "thread",
        by: "main",
        action: "comment",
        thread: "t",
        text: "hi",
      },
    ] as const;
    // @ts-expect-error - mixed-literal const widening for ChannelEvent[]
    const states = reduceThreads([...events]);
    expect(states).toHaveLength(1);
    expect(states[0].comments).toBe(1);
  });
});
