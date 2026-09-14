import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChannel, sendMessage, readChannelEvents } from "../../src/channel/index.js";
import {
  appendEvent, DEFAULT_INBOX_POLICY, postThread, setChannelTitle,
  listChannelContext, probeWorkerRuntime, readWorkerInbox,
  watchChannelEvents, watchWorkerInbox,
  spawnWorker,
} from "../../src/channel/index.js";
import { channelRoot, listProjects, migrateLegacyChannels, workerFile, workerLockPath } from "../../src/channel/internal/store/paths.js";
import { assertActiveDataPath, RetiredDataAccessError } from "../../src/retired-data.js";

describe("channel storage never consumes retired data", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-storage-boundary-"));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.stubEnv("TRELLIS_CHANNEL_PROJECT", "review");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(["events.jsonl", ".seq", "audit.lock"])("preflights %s before starting a worker", async (filename) => {
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", path.join(root, "channels"));
    await createChannel({ channel: "audit", by: "fixture" });
    const file = path.join(root, "channels/review/audit", filename);
    const original = fs.existsSync(file) ? fs.readFileSync(file) : null;
    const history = path.join(root, ".trellis/workspace/old");
    fs.mkdirSync(path.dirname(history), { recursive: true });
    fs.writeFileSync(history, "historical bytes");
    fs.rmSync(file, { force: true });
    fs.symlinkSync(history, file);
    const runtime = {
      start: vi.fn(async () => ({ workerId: "worker", startedAt: new Date(0).toISOString() })),
      stop: vi.fn(async () => ({ outcome: "stopped" as const })),
    };
    const input = { channel: "audit", projectKey: "review", cwd: root, by: "review", workerId: "worker", systemPrompt: "fixture" };
    await expect(spawnWorker(input, runtime)).rejects.toThrow(RetiredDataAccessError);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.stop).not.toHaveBeenCalled();
    expect(fs.readFileSync(history, "utf8")).toBe("historical bytes");
    fs.unlinkSync(file);
    if (original !== null) fs.writeFileSync(file, original);
    await spawnWorker(input, runtime);
    expect(runtime.start).toHaveBeenCalledTimes(1);
  });

  it.each(["workspace", "agent-traces", ".backup-old", ".developer"])("rejects %s before discovery or writes", async (name) => {
    const retired = path.join(root, ".trellis", name);
    fs.mkdirSync(retired, { recursive: true });
    const marker = path.join(retired, "history.txt");
    fs.writeFileSync(marker, "historical bytes");
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", retired);
    const reads = vi.spyOn(fs, "readFileSync");
    const lists = vi.spyOn(fs, "readdirSync");
    const writes = vi.spyOn(fs, "writeFileSync");
    const creates = vi.spyOn(fs, "mkdirSync");
    expect(() => channelRoot()).toThrow(RetiredDataAccessError);
    expect(() => migrateLegacyChannels()).toThrow(RetiredDataAccessError);
    expect(() => listProjects()).toThrow(RetiredDataAccessError);
    await expect(createChannel({ channel: "audit", by: "review", cwd: root })).rejects.toThrow(RetiredDataAccessError);
    for (const calls of [reads.mock.calls, lists.mock.calls, writes.mock.calls, creates.mock.calls]) {
      expect(calls).toEqual([]);
    }
    reads.mockRestore(); lists.mockRestore(); writes.mockRestore(); creates.mockRestore();
    expect(fs.readFileSync(marker, "utf8")).toBe("historical bytes");
  });

  it("rejects a missing destination beneath an alias to an external history root", async () => {
    const backing = path.join(root, "backing-store");
    fs.mkdirSync(path.join(backing, "workspace"), { recursive: true });
    fs.symlinkSync(backing, path.join(root, ".trellis"), "dir");
    fs.symlinkSync(path.join(backing, "workspace"), path.join(root, "alias"), "dir");
    const destination = path.join(root, "alias", "new-store");
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", destination);
    await expect(createChannel({ channel: "audit", by: "review", cwd: root })).rejects.toThrow(RetiredDataAccessError);
    expect(fs.readdirSync(path.join(backing, "workspace"))).toEqual([]);
  });

  it("guards the explicit SDK cwd even when the process cwd differs", async () => {
    const project = path.join(root, "project");
    const backing = path.join(root, "external-store");
    fs.mkdirSync(project);
    fs.mkdirSync(path.join(backing, "workspace"), { recursive: true });
    fs.symlinkSync(backing, path.join(project, ".trellis"), "dir");
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", path.join(backing, "workspace"));
    await expect(createChannel({ channel: "audit", by: "review", cwd: project, projectKey: "explicit" })).rejects.toThrow(RetiredDataAccessError);
    expect(fs.readdirSync(path.join(backing, "workspace"))).toEqual([]);
  });

  it("preserves normal storage overrides and channel discovery", async () => {
    const store = path.join(root, "active-store");
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", store);
    expect(channelRoot()).toBe(store);
    expect(fs.existsSync(store)).toBe(false);
    await createChannel({ channel: "audit", by: "review" });
    expect(listProjects()).toContain("review");
    expect(fs.existsSync(path.join(store, "review", "audit", "events.jsonl"))).toBe(true);
  });

  it("rejects a historical migration destination before moving active channels", () => {
    const store = path.join(root, "active-store");
    const history = path.join(root, ".trellis", "workspace");
    fs.mkdirSync(path.join(store, "old"), { recursive: true });
    fs.mkdirSync(history, { recursive: true });
    fs.writeFileSync(path.join(store, "old", "events.jsonl"), "");
    fs.symlinkSync(history, path.join(store, "_legacy"), "dir");
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", store);
    const moves = vi.spyOn(fs, "renameSync");
    const writes = vi.spyOn(fs, "writeFileSync");
    expect(() => migrateLegacyChannels()).toThrow(RetiredDataAccessError);
    expect(moves).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(fs.readdirSync(history)).toEqual([]);
    expect(fs.existsSync(path.join(store, "old", "events.jsonl"))).toBe(true);
  });

  it("shared access guard rejects a leaf alias without reading its target", () => {
    const history = path.join(root, ".trellis", ".backup-old", "config.json");
    fs.mkdirSync(path.dirname(history), { recursive: true });
    fs.writeFileSync(history, "private bytes");
    const alias = path.join(root, "settings.json");
    fs.symlinkSync(history, alias);
    const reads = vi.spyOn(fs, "readFileSync");
    expect(() => assertActiveDataPath(alias, root)).toThrow(RetiredDataAccessError);
    expect(reads).not.toHaveBeenCalled();
  });

  for (const external of [false, true]) {
    it.each(["events.jsonl", ".seq", "audit.lock"])(`refuses channel leaf %s before event IO (external=${external})`, async (filename) => {
      const workflow = path.join(root, external ? "backing-store" : ".trellis");
      fs.mkdirSync(path.join(workflow, "workspace"), { recursive: true });
      if (external) fs.symlinkSync(workflow, path.join(root, ".trellis"), "dir");
      const history = path.join(workflow, "workspace", "old.jsonl");
      fs.writeFileSync(history, "");
      vi.stubEnv("TRELLIS_CHANNEL_ROOT", path.join(root, "channels"));
      await createChannel({ channel: "audit", by: "fixture" });
      const dir = path.join(root, "channels", "review", "audit");
      const leaf = path.join(dir, filename);
      fs.rmSync(leaf, { force: true });
      fs.symlinkSync(history, leaf);
      const before = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8");
      const opens = vi.spyOn(fsp, "open");
      const reads = vi.spyOn(fsp, "readFile");
      const writes = vi.spyOn(fsp, "appendFile");
      await expect(sendMessage({ channel: "audit", projectKey: "review", by: "review", text: "probe" })).rejects.toThrow(RetiredDataAccessError);
      expect(opens).not.toHaveBeenCalled();
      expect(reads).not.toHaveBeenCalled();
      expect(writes).not.toHaveBeenCalled();
      if (filename === "events.jsonl") {
        await expect(readChannelEvents({ channel: "audit", projectKey: "review" })).rejects.toThrow(RetiredDataAccessError);
      }
      expect(fs.readFileSync(history, "utf8")).toBe("");
      expect(fs.readFileSync(path.join(dir, "events.jsonl"), "utf8")).toBe(before);
    });
  }

  it("refuses worker file aliases and force-clean PID reads", async () => {
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", path.join(root, "channels"));
    await createChannel({ channel: "audit", by: "fixture" });
    const history = path.join(root, ".trellis", ".developer");
    fs.mkdirSync(path.dirname(history), { recursive: true });
    fs.writeFileSync(history, "historical bytes");
    const dir = path.join(root, "channels", "review", "audit");
    for (const suffix of ["pid", "worker-pid", "spawnlock"]) {
      fs.symlinkSync(history, path.join(dir, `worker.${suffix}`));
      expect(() => workerFile("audit", "worker", suffix)).toThrow(RetiredDataAccessError);
    }
    expect(() => workerLockPath("audit", "worker")).toThrow(RetiredDataAccessError);
    const reads = vi.spyOn(fs, "readFileSync");
    await expect(createChannel({ channel: "audit", by: "fixture", force: true })).rejects.toThrow(RetiredDataAccessError);
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
    expect(fs.readFileSync(history, "utf8")).toBe("historical bytes");
    expect(fs.existsSync(path.join(dir, "events.jsonl"))).toBe(true);
  });

  it.each(["events.jsonl", ".seq", "audit.lock"])("uses SDK cwd for final %s checks when process cwd differs", async (filename) => {
    const project = path.join(root, "project");
    const backing = path.join(root, "backing");
    fs.mkdirSync(project);
    fs.mkdirSync(path.join(backing, "workspace"), { recursive: true });
    fs.symlinkSync(backing, path.join(project, ".trellis"), "dir");
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", path.join(root, "channels"));
    const address = { channel: "audit", projectKey: "explicit", cwd: project };
    await createChannel({ ...address, by: "fixture", type: "forum" });
    await sendMessage({ ...address, by: "fixture", text: "active" });
    expect((await readChannelEvents(address)).length).toBe(2);
    const dir = path.join(root, "channels/explicit/audit");
    const history = path.join(backing, "workspace/old");
    fs.writeFileSync(history, "");
    fs.rmSync(path.join(dir, filename), { force: true });
    fs.symlinkSync(history, path.join(dir, filename));
    const opens = vi.spyOn(fsp, "open");
    const writes = vi.spyOn(fsp, "appendFile");
    await expect(sendMessage({ ...address, by: "review", text: "probe" })).rejects.toThrow(RetiredDataAccessError);
    expect(opens).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    if (filename === "events.jsonl") {
      await expect(readChannelEvents(address)).rejects.toThrow(RetiredDataAccessError);
      await expect(setChannelTitle({ ...address, by: "review", title: "probe" })).rejects.toThrow(RetiredDataAccessError);
      await expect(postThread({ ...address, by: "review", action: "opened" })).rejects.toThrow(RetiredDataAccessError);
      await expect(listChannelContext(address)).rejects.toThrow(RetiredDataAccessError);
      await expect(readWorkerInbox({ ...address, workerId: "worker" })).rejects.toThrow(RetiredDataAccessError);
      await expect(watchWorkerInbox({ ...address, workerId: "worker" })).rejects.toThrow(RetiredDataAccessError);
      const watcher = watchChannelEvents({ ...address, fromStart: true });
      await expect(watcher.next()).rejects.toThrow(RetiredDataAccessError);
    }
    expect(fs.readFileSync(history, "utf8")).toBe("");
  });

  it("uses SDK cwd when probing worker file aliases", async () => {
    const project = path.join(root, "project");
    const backing = path.join(root, "backing");
    fs.mkdirSync(project);
    fs.mkdirSync(path.join(backing, "workspace"), { recursive: true });
    fs.symlinkSync(backing, path.join(project, ".trellis"), "dir");
    vi.stubEnv("TRELLIS_CHANNEL_ROOT", path.join(root, "channels"));
    const address = { channel: "audit", projectKey: "explicit", cwd: project };
    await createChannel({ ...address, by: "fixture" });
    await appendEvent("audit", { kind: "spawned", by: "fixture", as: "worker", inboxPolicy: DEFAULT_INBOX_POLICY }, "explicit", project);
    const history = path.join(backing, "workspace/old-pid");
    fs.writeFileSync(history, "12345");
    fs.symlinkSync(history, path.join(root, "channels/explicit/audit/worker.pid"));
    const reads = vi.spyOn(fs, "readFileSync");
    await expect(probeWorkerRuntime(address)).rejects.toThrow(RetiredDataAccessError);
    expect(reads.mock.calls.filter(([file]) => String(file) === history || String(file).endsWith("worker.pid"))).toEqual([]);
    reads.mockRestore();
    expect(fs.readFileSync(history, "utf8")).toBe("12345");
  });
});
