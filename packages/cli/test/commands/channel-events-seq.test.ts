import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendEvent,
  readChannelEvents,
  readLastSeq,
} from "../../src/commands/channel/store/events.js";
import { eventsPath } from "../../src/commands/channel/store/paths.js";

interface TmpEnv {
  tmpDir: string;
  projectDir: string;
  oldRoot: string | undefined;
  oldProject: string | undefined;
}

function setup(): TmpEnv {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "trellis-channel-seq-test-"),
  );
  const projectDir = path.join(tmpDir, "project");
  fs.mkdirSync(projectDir);
  const oldRoot = process.env.TRELLIS_CHANNEL_ROOT;
  const oldProject = process.env.TRELLIS_CHANNEL_PROJECT;
  process.env.TRELLIS_CHANNEL_ROOT = path.join(tmpDir, "channels");
  delete process.env.TRELLIS_CHANNEL_PROJECT;
  return { tmpDir, projectDir, oldRoot, oldProject };
}

function teardown(env: TmpEnv): void {
  if (env.oldRoot === undefined) delete process.env.TRELLIS_CHANNEL_ROOT;
  else process.env.TRELLIS_CHANNEL_ROOT = env.oldRoot;
  if (env.oldProject === undefined) delete process.env.TRELLIS_CHANNEL_PROJECT;
  else process.env.TRELLIS_CHANNEL_PROJECT = env.oldProject;
  fs.rmSync(env.tmpDir, { recursive: true, force: true });
}

function seedEvents(channel: string, tail: string | Buffer): string {
  const file = eventsPath(channel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const complete =
    `${JSON.stringify({
      seq: 1,
      ts: "2026-08-06T00:00:00.000Z",
      kind: "create",
      by: "main",
      name: channel,
    })}\n` +
    `${JSON.stringify({
      seq: 2,
      ts: "2026-08-06T00:00:01.000Z",
      kind: "progress",
      by: "worker",
      text: "ok",
    })}\n`;
  fs.writeFileSync(file, complete);
  fs.appendFileSync(file, tail);
  return file;
}

describe("CLI appendEvent seq allocation (#527)", () => {
  let env: TmpEnv;

  beforeEach(() => {
    env = setup();
    vi.spyOn(process, "cwd").mockReturnValue(env.projectDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown(env);
  });

  it("continues seq after a torn JSONL tail without a sidecar", async () => {
    const file = seedEvents(
      "torn",
      '{"seq":99,"kind":"progress","by":"worker","text":"cut',
    );
    expect(await readLastSeq("torn")).toBe(2);

    const appended = await appendEvent("torn", {
      kind: "progress",
      by: "supervisor:worker",
      text: "after-tear",
    });
    expect(appended.seq).toBe(3);

    const events = await readChannelEvents("torn");
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(fs.readFileSync(file, "utf-8")).not.toContain('"seq":99');
  });

  it("continues seq after a tail cut mid-multibyte character", async () => {
    seedEvents("utf8-torn", Buffer.from([0xe4, 0xb8]));
    const appended = await appendEvent("utf8-torn", {
      kind: "error",
      by: "cli:kill",
      message: "supervisor lost",
      worker: "worker",
    });
    expect(appended.seq).toBe(3);
    expect((await readChannelEvents("utf8-torn")).map((e) => e.seq)).toEqual([
      1, 2, 3,
    ]);
  });
});
