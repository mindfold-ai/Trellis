import fs from "node:fs";

import { appendEvent } from "./store/events.js";
import { withLock } from "./store/lock.js";
import {
  resolveExistingChannelRef,
  workerFile,
  workerLockPath,
} from "./store/paths.js";
import { parseChannelScope } from "./store/schema.js";

export interface KillOptions {
  as: string;
  force?: boolean;
  scope?: string;
}

const POLL_INTERVAL_MS = 100;
const KILL_GRACE_MS = 8000; // generous: supervisor's own grace is ~6s

export async function channelKill(
  channelName: string,
  opts: KillOptions,
): Promise<void> {
  const ref = resolveExistingChannelRef(channelName, {
    scope: parseChannelScope(opts.scope),
  });
  // Take the worker lock so kill ↔ spawn can't race: spawn won't claim a
  // stale pid file while we're tearing it down; we won't try to kill a
  // worker whose pid file is mid-creation.
  return withLock(
    workerLockPath(channelName, opts.as, ref.project),
    () => killLocked(channelName, opts, ref.project),
    { maxWaitMs: KILL_GRACE_MS + 2000 },
  );
}

async function killLocked(
  channelName: string,
  opts: KillOptions,
  project: string,
): Promise<void> {
  const pidPath = workerFile(channelName, opts.as, "pid", project);
  if (!fs.existsSync(pidPath)) {
    throw new Error(
      `Worker '${opts.as}' not running in channel '${channelName}'`,
    );
  }
  const supervisorPid = Number(fs.readFileSync(pidPath, "utf-8").trim());
  if (!supervisorPid || !alive(supervisorPid)) {
    await appendEvent(
      channelName,
      {
        kind: "error",
        by: `cli:kill`,
        message: `supervisor lost (pid ${supervisorPid})`,
        worker: opts.as,
      },
      project,
    );
    cleanupFiles(channelName, opts.as, project);
    return;
  }

  if (opts.force) {
    // Also kill the inner worker so it doesn't become an orphan.
    const workerPidPath = workerFile(
      channelName,
      opts.as,
      "worker-pid",
      project,
    );
    if (fs.existsSync(workerPidPath)) {
      const wpid = Number(fs.readFileSync(workerPidPath, "utf-8").trim());
      if (wpid && alive(wpid)) {
        try {
          process.kill(wpid, "SIGKILL");
        } catch {
          // already dead
        }
      }
    }
    try {
      process.kill(supervisorPid, "SIGKILL");
    } catch {
      // already dead
    }
    // SIGKILL skips supervisor's onShutdown handler, so the `killed`
    // event would never make it into events.jsonl. Write it from here
    // so forensic readers see the kill happened.
    await appendEvent(
      channelName,
      {
        kind: "killed",
        by: "cli:kill",
        worker: opts.as,
        reason: "explicit-kill",
        signal: "SIGKILL",
      },
      project,
    );
  } else {
    try {
      process.kill(supervisorPid, "SIGTERM");
    } catch {
      // already dead
    }
  }

  // Wait for supervisor to actually exit
  const deadline = Date.now() + KILL_GRACE_MS;
  while (alive(supervisorPid) && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
  }

  if (alive(supervisorPid)) {
    // Grace expired — force kill. Supervisor's onShutdown handler never
    // got to fire (or it deadlocked), so we write the `killed` event from
    // the CLI side to keep the channel log truthful.
    try {
      process.kill(supervisorPid, "SIGKILL");
    } catch {
      // already dead
    }
    await appendEvent(
      channelName,
      {
        kind: "killed",
        by: "cli:kill",
        worker: opts.as,
        reason: "explicit-kill",
        signal: "SIGKILL",
        detail: "grace expired, supervisor SIGKILL'd by CLI",
      },
      project,
    );
  }

  cleanupFiles(channelName, opts.as, project);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanupFiles(
  channelName: string,
  worker: string,
  project: string,
): void {
  // Keep `log` (forensic), `session-id` / `thread-id` (resume).
  // `system-prompt.md` may carry a large injected context; on Windows the
  // SIGKILL'd supervisor cannot run its own cleanup, so the CLI removes it
  // here too (unconditionally, so a prior oversized run leaves nothing).
  for (const suffix of [
    "pid",
    "worker-pid",
    "config",
    "system-prompt.md",
    "spawnlock",
  ]) {
    try {
      fs.unlinkSync(workerFile(channelName, worker, suffix, project));
    } catch {
      // already gone
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
