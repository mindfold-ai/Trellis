import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChannel } from "../../src/channel/index.js";
import {
  assertSafeName,
  channelDir,
  isSafeName,
  listChannelNamesInProject,
  projectDir,
} from "../../src/channel/internal/store/paths.js";
import { setupChannelTmp, type TmpEnv } from "./setup.js";

describe("channel name path-traversal guard", () => {
  let env: TmpEnv;
  beforeEach(() => {
    env = setupChannelTmp();
    vi.spyOn(process, "cwd").mockReturnValue(env.projectDir);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    env.cleanup();
  });

  const traversal = ["..", ".", "../x", "../../x", "a/b", "a\\b", "x/../y"];

  it("assertSafeName rejects traversal and separators", () => {
    for (const bad of traversal) {
      expect(() => assertSafeName(bad)).toThrow(/Invalid channel name/);
    }
  });

  it("assertSafeName accepts the names real channels use", () => {
    for (const ok of ["a", "chat-only", "ch1", "legacy_thread", "a.b", "R"]) {
      expect(() => assertSafeName(ok)).not.toThrow();
    }
  });

  it("channelDir throws instead of resolving outside the store", () => {
    expect(() => channelDir("../../escape")).toThrow(/Invalid channel name/);
  });

  it("listChannelNamesInProject skips legacy dirs with pre-validation names", async () => {
    await createChannel({ channel: "good-one", by: "main" });

    // A dir created before name validation existed. Returning it would make
    // the watcher's channelDir/eventsPath calls throw mid-discovery.
    const bucket = projectDir();
    const legacyDir = path.join(bucket, "坏 名字");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "events.jsonl"), "");

    const names = listChannelNamesInProject(path.basename(bucket));
    expect(names).toContain("good-one");
    expect(names).not.toContain("坏 名字");
    for (const name of names) expect(isSafeName(name)).toBe(true);
  });

  it("createChannel --force cannot delete a directory outside the store", async () => {
    // A user directory that lives outside the channel store, reachable via `..`.
    const victim = path.join(env.tmpDir, "victim");
    fs.mkdirSync(victim, { recursive: true });
    const marker = path.join(victim, "keep.txt");
    fs.writeFileSync(marker, "important");

    // Without the guard, `../../victim` would let path.join resolve out of
    // the store and force-wipe delete it. The guard throws before any path
    // resolution, so the external directory is never reached.
    await expect(
      createChannel({ channel: "../../victim", by: "main", force: true }),
    ).rejects.toThrow(/Invalid channel name/);

    expect(fs.existsSync(marker)).toBe(true);
    expect(fs.readFileSync(marker, "utf-8")).toBe("important");
  });
});
