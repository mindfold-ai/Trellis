import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { channelRoot, listProjects, migrateLegacyChannels, projectDir, eventsPath, workerFile, lockPath, workerLockPath } from "../../src/commands/channel/store/paths.js";
import { RetiredDataAccessError } from "@mindfoldhq/trellis-core";

describe("CLI channel storage uses the core history boundary", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-cli-storage-boundary-"));
    vi.spyOn(process, "cwd").mockReturnValue(root);
  });
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });
  it.each(["workspace", "agent-traces", ".backup-old"])("refuses %s for all storage entry points", (entry) => {
    const destination = path.join(root, ".trellis", entry);
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", destination);
    expect(() => channelRoot()).toThrow(RetiredDataAccessError);
    expect(() => projectDir("review")).toThrow(RetiredDataAccessError);
    expect(() => listProjects()).toThrow(RetiredDataAccessError);
    expect(() => migrateLegacyChannels()).toThrow(RetiredDataAccessError);
    expect(fs.existsSync(destination)).toBe(false);
  });
  it("keeps an ordinary override unchanged", () => {
    const destination = path.join(root, "channels");
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", destination);
    expect(channelRoot()).toBe(destination);
    expect(projectDir("review")).toBe(path.join(destination, "review"));
    expect(fs.existsSync(destination)).toBe(false);
  });
  it("CLI file helpers reject historical leaves", () => {
    const history = path.join(root, ".trellis", "workspace", "old");
    fs.mkdirSync(path.dirname(history), { recursive: true });
    fs.writeFileSync(history, "history");
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", path.join(root, "channels"));
    const dir = path.join(root, "channels", "review", "audit");
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ["events.jsonl", "audit.lock", "worker.pid", "worker.spawnlock"]) {
      fs.symlinkSync(history, path.join(dir, name));
    }
    expect(() => eventsPath("audit", "review")).toThrow(RetiredDataAccessError);
    expect(() => lockPath("audit", "review")).toThrow(RetiredDataAccessError);
    expect(() => workerFile("audit", "worker", "pid", "review")).toThrow(RetiredDataAccessError);
    expect(() => workerLockPath("audit", "worker", "review")).toThrow(RetiredDataAccessError);
  });
});
