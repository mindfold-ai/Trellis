#!/usr/bin/env node

/** Forward a Codex plugin event to the bundled Trellis hook runtime. */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TARGETS = new Map([
  ["SessionStart", "session-start.py"],
  ["UserPromptSubmit", "inject-workflow-state.py"],
  ["SubagentStart", "inject-subagent-context.py"],
]);

function findTrellisRoot(start) {
  let current;
  try {
    current = path.resolve(start);
  } catch {
    return null;
  }
  while (true) {
    try {
      if (fs.statSync(path.join(current, ".trellis")).isDirectory()) {
        return current;
      }
    } catch {
      // Keep walking when a candidate .trellis entry is unreadable or absent.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readInput() {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    let timeout;

    const finish = () => {
      if (settled) return;
      settled = true;
      process.stdin.off("data", onData);
      process.stdin.off("end", finish);
      process.stdin.pause();
      if (timeout) clearTimeout(timeout);

      const raw = Buffer.concat(chunks);
      try {
        const data = JSON.parse(raw.toString("utf8"));
        resolve({ data: data && typeof data === "object" ? data : {} });
      } catch {
        resolve({ data: {} });
      }
    };

    const onData = (chunk) => chunks.push(Buffer.from(chunk));
    process.stdin.on("data", onData);
    process.stdin.once("end", finish);
    process.stdin.resume();
    timeout = setTimeout(finish, 200);
  });
}

function pythonCommands() {
  return process.platform === "win32"
    ? ["python", "py"]
    : ["python3", "python"];
}

async function main() {
  const { data } = await readInput();
  const targetConfig = TARGETS.get(data.hook_event_name);
  if (!targetConfig) return 0;

  const start = typeof data.cwd === "string" ? data.cwd : process.cwd();
  const root = findTrellisRoot(start);
  if (!root) return 0;
  const target = path.join(__dirname, "runtime", targetConfig);
  if (!isFile(target)) return 0;
  const input = Buffer.from(JSON.stringify({ ...data, cwd: root }), "utf8");

  for (const command of pythonCommands()) {
    const result = spawnSync(command, [target], {
      cwd: root,
      input,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        CODEX_PROJECT_DIR: root,
        TRELLIS_PLUGIN_RUNTIME: "1",
      },
    });
    if (result.error) continue;
    if (result.stdout?.length) process.stdout.write(result.stdout);
    if (result.stderr?.length) process.stderr.write(result.stderr);
    return result.status ?? 0;
  }
  return 0;
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

main().then((status) => {
  process.exitCode = status;
});
