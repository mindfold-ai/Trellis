import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChannel } from "../../src/commands/channel/create.js";
import { eventsPath } from "../../src/commands/channel/store/paths.js";
import { watchEvents } from "../../src/commands/channel/store/watch.js";

describe("watchEvents", () => {
  let tmpDir: string;
  let projectDir: string;
  let oldRoot: string | undefined;
  let oldProject: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-watch-test-"));
    projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(projectDir);
    oldRoot = process.env.TRELLIS_CHANNEL_ROOT;
    oldProject = process.env.TRELLIS_CHANNEL_PROJECT;
    process.env.TRELLIS_CHANNEL_ROOT = path.join(tmpDir, "channels");
    delete process.env.TRELLIS_CHANNEL_PROJECT;
    vi.spyOn(process, "cwd").mockReturnValue(projectDir);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (oldRoot === undefined) delete process.env.TRELLIS_CHANNEL_ROOT;
    else process.env.TRELLIS_CHANNEL_ROOT = oldRoot;
    if (oldProject === undefined) delete process.env.TRELLIS_CHANNEL_PROJECT;
    else process.env.TRELLIS_CHANNEL_PROJECT = oldProject;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("preserves UTF-8 characters split across incremental reads", async () => {
    const channel = "utf8-boundary";
    await createChannel(channel, { by: "main" });

    const messageLine = Buffer.from(
      `${JSON.stringify({
        seq: 2,
        ts: "2026-08-18T00:00:00.000Z",
        kind: "message",
        by: "worker",
        text: "中",
      })}\n`,
      "utf8",
    );
    const characterStart = messageLine.indexOf(Buffer.from("中", "utf8"));
    expect(characterStart).toBeGreaterThanOrEqual(0);

    const file = eventsPath(channel);
    fs.appendFileSync(file, messageLine.subarray(0, characterStart + 1));

    const abortController = new AbortController();
    const events = watchEvents(
      channel,
      {},
      { fromStart: true, signal: abortController.signal },
    );

    try {
      const first = await events.next();
      expect(first.value).toMatchObject({ kind: "create" });

      const secondEvent = events.next();
      fs.appendFileSync(file, messageLine.subarray(characterStart + 1));

      await expect(secondEvent).resolves.toMatchObject({
        done: false,
        value: { kind: "message", text: "中" },
      });
    } finally {
      abortController.abort();
      await events.return(undefined);
    }
  });
});
