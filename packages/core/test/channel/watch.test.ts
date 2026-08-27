import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChannel, watchChannelEvents } from "../../src/channel/index.js";
import { eventsPath } from "../../src/channel/internal/store/paths.js";
import { setupChannelTmp, type TmpEnv } from "./setup.js";

describe("watchChannelEvents", () => {
  let env: TmpEnv;

  beforeEach(() => {
    env = setupChannelTmp();
    vi.spyOn(process, "cwd").mockReturnValue(env.projectDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    env.cleanup();
  });

  it("preserves UTF-8 characters split across incremental reads", async () => {
    const channel = "utf8-boundary";
    await createChannel({ channel, by: "main" });

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
    const events = watchChannelEvents({
      channel,
      fromStart: true,
      signal: abortController.signal,
    });

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
