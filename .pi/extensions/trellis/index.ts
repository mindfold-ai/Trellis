import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

type JsonObject = Record<string, unknown>;
type TextContent = { type: "text"; text: string };

interface PiToolResult {
  content: TextContent[];
  details?: JsonObject;
}

interface PiExtensionContext {
  hasUI?: boolean;
  sessionManager?: {
    getSessionId?: () => string;
    getSessionFile?: () => string | undefined;
  };
  ui?: {
    notify?: (message: string, type?: "info" | "warning" | "error") => void;
  };
}

interface PiBeforeAgentStartEvent {
  systemPrompt?: string;
}

interface PiContextEvent {
  messages?: unknown[];
}

interface PiToolCallEvent {
  toolName?: string;
  input?: JsonObject;
}

interface SubagentInput {
  agent?: string;
  prompt?: string;
  mode?: "single" | "parallel" | "chain";
  prompts?: string[];
  model?: string;
  thinking?: ThinkingLevel;
}

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface AgentConfig {
  model?: string;
  thinking?: ThinkingLevel;
  // Parsed for pi-subagents-compatible agent files; Pi CLI has no documented fallback-model flag to pass through here.
  fallbackModels: string[];
}

interface AgentDefinition {
  content: string;
  config: AgentConfig;
}

interface PiRunConfig {
  model?: string;
  thinking?: ThinkingLevel;
}

const TRELLIS_AGENT_JSONL: Record<string, string> = {
  "trellis-implement": "implement.jsonl",
  implement: "implement.jsonl",
  "trellis-check": "check.jsonl",
  check: "check.jsonl",
};

function findProjectRoot(startDir: string): string {
  let current = resolve(startDir);
  while (true) {
    if (
      existsSync(join(current, ".trellis")) ||
      existsSync(join(current, ".pi"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return resolve(startDir);
    current = parent;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function splitMarkdownFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  const normalized = content.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return match
    ? { frontmatter: match[1] ?? "", body: normalized.slice(match[0].length) }
    : { frontmatter: "", body: normalized };
}

function stripMarkdownFrontmatter(content: string): string {
  return splitMarkdownFrontmatter(content).body.trimStart();
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ThinkingLevel[];
const THINKING_SUFFIX_RE = /:(?:off|minimal|low|medium|high|xhigh)$/i;

function normalizeThinking(value: unknown): ThinkingLevel | undefined {
  const raw = stringValue(value)?.toLowerCase();
  if (!raw) return undefined;
  return THINKING_LEVELS.includes(raw as ThinkingLevel)
    ? (raw as ThinkingLevel)
    : undefined;
}

function parseFrontmatterScalar(value: string): string | null {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed === "|" ||
    trimmed === ">" ||
    trimmed === "[]" ||
    trimmed === "null" ||
    trimmed === "~"
  ) {
    return null;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || null;
  }
  return trimmed;
}

function parseInlineList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[]") return [];
  const body =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  return body
    .split(",")
    .map((item) => parseFrontmatterScalar(item))
    .filter((item): item is string => !!item);
}

function readIndentedList(
  lines: string[],
  startIndex: number,
): { values: string[]; nextIndex: number } {
  const values: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (/^[A-Za-z][A-Za-z0-9_-]*\s*:/.test(line)) break;
    const item = line.match(/^\s*-\s*(.*)$/);
    if (item) {
      const scalar = parseFrontmatterScalar(item[1] ?? "");
      if (scalar) values.push(scalar);
    }
    index += 1;
  }
  return { values, nextIndex: index - 1 };
}

function parseAgentConfig(content: string): AgentConfig {
  const config: AgentConfig = { fallbackModels: [] };
  const { frontmatter } = splitMarkdownFrontmatter(content);
  const lines = frontmatter.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const match = (lines[index] ?? "").match(
      /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/,
    );
    if (!match) continue;

    const key = match[1] ?? "";
    const value = match[2] ?? "";
    if (key === "model") {
      config.model = parseFrontmatterScalar(value) ?? undefined;
    } else if (key === "thinking") {
      config.thinking = normalizeThinking(parseFrontmatterScalar(value));
    } else if (key === "fallbackModels" || key === "fallback_models") {
      if (value.trim()) {
        config.fallbackModels = parseInlineList(value);
      } else {
        const result = readIndentedList(lines, index);
        config.fallbackModels = result.values;
        index = result.nextIndex;
      }
    }
  }

  return config;
}

function modelHasThinkingSuffix(model: string): boolean {
  return THINKING_SUFFIX_RE.test(model.trim());
}

function buildPiModelArgs(config: PiRunConfig): string[] {
  const model = stringValue(config.model);
  const thinking = normalizeThinking(config.thinking);
  if (model) {
    return [
      "--model",
      thinking && !modelHasThinkingSuffix(model)
        ? `${model}:${thinking}`
        : model,
    ];
  }
  return thinking ? ["--thinking", thinking] : [];
}

function resolveSubagentRunConfig(
  input: SubagentInput,
  agentConfig: AgentConfig,
): PiRunConfig {
  return {
    model: stringValue(input.model) ?? agentConfig.model,
    thinking: normalizeThinking(input.thinking) ?? agentConfig.thinking,
  };
}

function sanitizeKey(raw: string): string {
  return raw
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 160);
}

function hashValue(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

interface PiInvocation {
  command: string;
  argsPrefix: string[];
}

const PI_CLI_JS_SEGMENTS = [
  "node_modules",
  "@mariozechner",
  "pi-coding-agent",
  "dist",
  "cli.js",
];
const MAX_SUBAGENT_STDOUT_BYTES = 8 * 1024 * 1024;
const MAX_SUBAGENT_STDERR_BYTES = 1024 * 1024;

// Nested agents can emit unbounded output; keep the tail so diagnostics survive without growing memory indefinitely.
class BoundedBufferCollector {
  private chunks: Buffer[] = [];
  private length = 0;
  private truncatedBytes = 0;

  constructor(private readonly maxBytes: number) {}

  append(chunk: Buffer): void {
    const data = chunk;
    if (data.length >= this.maxBytes) {
      this.truncatedBytes += this.length + data.length - this.maxBytes;
      this.chunks = [data.subarray(data.length - this.maxBytes)];
      this.length = this.maxBytes;
      return;
    }

    this.chunks.push(data);
    this.length += data.length;

    while (this.length > this.maxBytes) {
      const first = this.chunks[0];
      if (!first) break;
      const overflow = this.length - this.maxBytes;
      if (first.length <= overflow) {
        this.chunks.shift();
        this.length -= first.length;
        this.truncatedBytes += first.length;
      } else {
        this.chunks[0] = first.subarray(overflow);
        this.length -= overflow;
        this.truncatedBytes += overflow;
        break;
      }
    }
  }

  toString(): string {
    const body = Buffer.concat(this.chunks, this.length).toString("utf-8");
    return this.truncatedBytes
      ? `[${this.truncatedBytes} bytes truncated]\n${body}`
      : body;
  }
}

function isExistingFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function candidatePiCliJsPaths(): string[] {
  const candidates: string[] = [];

  for (const arg of process.argv) {
    if (/pi-coding-agent[\\/]dist[\\/]cli\.js$/i.test(arg)) {
      candidates.push(resolve(arg));
    }
  }

  const npmPrefix =
    stringValue(process.env.npm_config_prefix) ??
    stringValue(process.env.NPM_CONFIG_PREFIX);
  if (npmPrefix) {
    candidates.push(join(npmPrefix, ...PI_CLI_JS_SEGMENTS));
    candidates.push(join(npmPrefix, "lib", ...PI_CLI_JS_SEGMENTS));
  }

  const appData = stringValue(process.env.APPDATA);
  if (appData) {
    candidates.push(join(appData, "npm", ...PI_CLI_JS_SEGMENTS));
  }

  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  for (const pathEntry of pathValue.split(delimiter)) {
    const entry = pathEntry.trim();
    if (!entry) continue;
    candidates.push(join(entry, ...PI_CLI_JS_SEGMENTS));
    candidates.push(join(dirname(entry), ...PI_CLI_JS_SEGMENTS));
    candidates.push(join(dirname(entry), "lib", ...PI_CLI_JS_SEGMENTS));
  }

  return uniqueStrings(candidates);
}

function resolvePiInvocation(): PiInvocation {
  const envCli = stringValue(process.env.TRELLIS_PI_CLI_JS);
  if (envCli) {
    const cliJs = resolve(envCli);
    if (!isExistingFile(cliJs)) {
      throw new Error(`TRELLIS_PI_CLI_JS points to a missing file: ${cliJs}`);
    }
    return { command: process.execPath, argsPrefix: [cliJs] };
  }

  for (const cliJs of candidatePiCliJsPaths()) {
    if (isExistingFile(cliJs)) {
      return { command: process.execPath, argsPrefix: [cliJs] };
    }
  }

  return { command: "pi", argsPrefix: [] };
}

function createProcessContextKey(projectRoot: string): string {
  return `pi_process_${hashValue(
    [projectRoot, process.pid, Date.now(), randomBytes(8).toString("hex")].join(
      ":",
    ),
  )}`;
}

function callString(
  callback: (() => string | undefined) | undefined,
): string | null {
  if (!callback) return null;
  try {
    return stringValue(callback());
  } catch {
    return null;
  }
}

function lookupString(data: unknown, keys: string[]): string | null {
  if (!isJsonObject(data)) return null;
  for (const key of keys) {
    const value = stringValue(data[key]);
    if (value) return value;
  }
  for (const nestedKey of [
    "input",
    "properties",
    "event",
    "hook_input",
    "hookInput",
  ]) {
    const nested = data[nestedKey];
    const value = lookupString(nested, keys);
    if (value) return value;
  }
  return null;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (!isJsonObject(block)) return "";
      return block.type === "text" && typeof block.text === "string"
        ? block.text
        : "";
    })
    .join("");
}

function extractFinalAssistantText(output: string): string | null {
  let finalText = "";

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed) as JsonObject;
      const message = isJsonObject(event.message) ? event.message : null;
      if (message?.role !== "assistant") continue;

      const text = extractTextContent(message.content);
      if (text) finalText = text;
    } catch {
      // Pi can print non-JSON diagnostics around structured output; keep scanning.
    }
  }

  return finalText || null;
}

function formatPiOutput(stdout: string, stderr: string): string {
  return extractFinalAssistantText(stdout) ?? (stdout || stderr);
}

function normalizeTaskRef(raw: string): string | null {
  let normalized = raw.trim().replace(/\\/g, "/");
  if (!normalized) return null;
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (normalized.startsWith("tasks/")) normalized = `.trellis/${normalized}`;
  return normalized;
}

function taskRefToDir(projectRoot: string, taskRef: string): string {
  if (taskRef.startsWith("/")) return taskRef;
  if (taskRef.startsWith(".trellis/")) return join(projectRoot, taskRef);
  return join(projectRoot, ".trellis", "tasks", taskRef);
}

function sessionFileHasCurrentTask(path: string): boolean {
  try {
    const context = JSON.parse(readText(path)) as JsonObject;
    return !!normalizeTaskRef(stringValue(context.current_task) ?? "");
  } catch {
    return false;
  }
}

function activeRuntimeContextKeys(projectRoot: string): string[] {
  const sessionsDir = join(projectRoot, ".trellis", ".runtime", "sessions");
  try {
    return readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -".json".length))
      .filter((key) =>
        sessionFileHasCurrentTask(join(sessionsDir, `${key}.json`)),
      );
  } catch {
    return [];
  }
}

function adoptExistingContextKey(
  projectRoot: string,
  contextKey: string,
): string {
  const sessionsDir = join(projectRoot, ".trellis", ".runtime", "sessions");
  if (sessionFileHasCurrentTask(join(sessionsDir, `${contextKey}.json`))) {
    return contextKey;
  }

  const keys = activeRuntimeContextKeys(projectRoot);
  const processKeys = keys.filter((key) => key.startsWith("pi_process_"));
  const candidates = processKeys.length ? processKeys : keys;
  return candidates.length === 1 ? candidates[0] : contextKey;
}

function resolveContextKey(
  input: unknown,
  ctx?: PiExtensionContext,
  fallback?: string | null,
): string | null {
  const override = stringValue(process.env.TRELLIS_CONTEXT_ID);
  if (override) return sanitizeKey(override) || hashValue(override);

  const sessionId =
    callString(ctx?.sessionManager?.getSessionId) ??
    stringValue(process.env.PI_SESSION_ID) ??
    stringValue(process.env.PI_SESSIONID) ??
    lookupString(input, ["session_id", "sessionId", "sessionID"]);
  if (sessionId) return `pi_${sanitizeKey(sessionId) || hashValue(sessionId)}`;

  const transcriptPath =
    callString(ctx?.sessionManager?.getSessionFile) ??
    lookupString(input, ["transcript_path", "transcriptPath", "transcript"]);
  if (transcriptPath) return `pi_transcript_${hashValue(transcriptPath)}`;

  return fallback ?? null;
}

function readCurrentTask(
  projectRoot: string,
  platformInput?: unknown,
  ctx?: PiExtensionContext,
  contextKeyOverride?: string | null,
): string | null {
  const contextKey =
    contextKeyOverride ?? resolveContextKey(platformInput, ctx);
  if (contextKey) {
    try {
      const rawContext = readText(
        join(
          projectRoot,
          ".trellis",
          ".runtime",
          "sessions",
          `${contextKey}.json`,
        ),
      );
      const context = JSON.parse(rawContext) as JsonObject;
      const taskRef = normalizeTaskRef(stringValue(context.current_task) ?? "");
      if (taskRef) return taskRefToDir(projectRoot, taskRef);
    } catch {
      // Missing or malformed session context means no active task.
    }
  }

  return null;
}

function readJsonlFiles(
  projectRoot: string,
  taskDir: string,
  jsonlName: string,
): string {
  const jsonlPath = join(taskDir, jsonlName);
  const lines = readText(jsonlPath).split(/\r?\n/);
  const chunks: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as JsonObject;
      const file = typeof row.file === "string" ? row.file : "";
      if (!file) continue;
      const content = readText(join(projectRoot, file));
      if (content) {
        chunks.push(`## ${file}\n\n${content}`);
      }
    } catch {
      // Seed rows and malformed lines must not block sub-agent startup.
    }
  }

  return chunks.join("\n\n---\n\n");
}

function buildTrellisContext(
  projectRoot: string,
  agent: string,
  platformInput?: unknown,
  ctx?: PiExtensionContext,
  contextKey?: string | null,
): string {
  const taskDir = readCurrentTask(projectRoot, platformInput, ctx, contextKey);
  if (!taskDir) {
    return "No active Trellis task found. Read .trellis/ before proceeding.";
  }

  const prd = readText(join(taskDir, "prd.md"));
  const info = readText(join(taskDir, "info.md"));
  const jsonlName = TRELLIS_AGENT_JSONL[agent] ?? "";
  const specContext = jsonlName
    ? readJsonlFiles(projectRoot, taskDir, jsonlName)
    : "";

  return [
    "## Trellis Task Context",
    `Task directory: ${taskDir}`,
    "",
    "### prd.md",
    prd || "(missing)",
    info ? "\n### info.md\n" + info : "",
    specContext ? "\n### Curated Spec / Research Context\n" + specContext : "",
  ].join("\n");
}

function normalizeAgentName(agent: string): string {
  return agent.startsWith("trellis-") ? agent : `trellis-${agent}`;
}

function readAgentDefinition(
  projectRoot: string,
  agent: string,
): AgentDefinition {
  const normalized = agent.startsWith("trellis-") ? agent : `trellis-${agent}`;
  const raw = readText(join(projectRoot, ".pi", "agents", `${normalized}.md`));
  return {
    content: stripMarkdownFrontmatter(raw),
    config: parseAgentConfig(raw),
  };
}

function commandStartsWithTrellisContext(command: string): boolean {
  const trimmed = command.trimStart();
  return (
    /^export\s+TRELLIS_CONTEXT_ID=/.test(trimmed) ||
    /^TRELLIS_CONTEXT_ID=/.test(trimmed) ||
    /^env\s+.*\bTRELLIS_CONTEXT_ID=/.test(trimmed)
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function injectTrellisContextIntoBash(
  event: unknown,
  contextKey: string,
): boolean {
  const toolCall = event as PiToolCallEvent;
  if (toolCall.toolName !== "bash" || !isJsonObject(toolCall.input)) {
    return false;
  }

  const rawCommand = toolCall.input.command;
  if (typeof rawCommand !== "string" || !rawCommand.trim()) {
    return false;
  }
  if (commandStartsWithTrellisContext(rawCommand)) {
    return false;
  }

  toolCall.input.command = `export TRELLIS_CONTEXT_ID=${shellQuote(contextKey)}; ${rawCommand}`;
  return true;
}

function runPi(
  projectRoot: string,
  prompt: string,
  runConfig: PiRunConfig,
  contextKey?: string | null,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(new Error("pi subagent cancelled"));
      return;
    }

    const invocation = resolvePiInvocation();
    const modelArgs = buildPiModelArgs(runConfig);
    const child = spawn(
      invocation.command,
      [
        ...invocation.argsPrefix,
        "--mode",
        "text",
        ...modelArgs,
        "-p",
        "--no-session",
      ],
      {
        cwd: projectRoot,
        env: contextKey
          ? { ...process.env, TRELLIS_CONTEXT_ID: contextKey }
          : process.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    const stdout = new BoundedBufferCollector(MAX_SUBAGENT_STDOUT_BYTES);
    const stderr = new BoundedBufferCollector(MAX_SUBAGENT_STDERR_BYTES);
    let settled = false;
    let aborted = false;

    const abortChild = (): void => {
      aborted = true;
      child.kill();
    };

    const cleanup = (): void => {
      signal?.removeEventListener("abort", abortChild);
    };

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const succeed = (value: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise(value);
    };

    signal?.addEventListener("abort", abortChild, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => stdout.append(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.append(chunk));
    child.stdin?.on("error", (error: Error & { code?: string }) => {
      if (!aborted && error.code !== "EPIPE") fail(error);
    });
    child.on("error", fail);
    child.on("close", (code) => {
      const out = stdout.toString();
      const err = stderr.toString();
      if (aborted) {
        fail(new Error("pi subagent cancelled"));
      } else if (code === 0) {
        succeed(formatPiOutput(out, err));
      } else {
        fail(
          new Error(err || out || `pi exited with code ${code ?? "unknown"}`),
        );
      }
    });

    child.stdin?.end(prompt);
  });
}

function buildSubagentPrompt(
  projectRoot: string,
  input: SubagentInput,
  contextKey?: string | null,
  agentName?: string,
  agentDefinition?: AgentDefinition,
): string {
  const normalized =
    agentName ?? normalizeAgentName(input.agent ?? "trellis-implement");
  const definition =
    agentDefinition ?? readAgentDefinition(projectRoot, normalized);
  const context = buildTrellisContext(
    projectRoot,
    normalized,
    input,
    undefined,
    contextKey,
  );
  const prompt = input.prompt ?? "";

  return [
    "## Trellis Agent Definition",
    definition.content || "(missing agent definition)",
    "",
    context,
    "",
    "## Delegated Task",
    prompt,
  ].join("\n");
}

async function runSubagent(
  projectRoot: string,
  input: SubagentInput,
  contextKey?: string | null,
  signal?: AbortSignal,
): Promise<string> {
  const agentName = normalizeAgentName(input.agent ?? "trellis-implement");
  const agentDefinition = readAgentDefinition(projectRoot, agentName);
  const runConfig = resolveSubagentRunConfig(input, agentDefinition.config);
  const mode = input.mode ?? "single";
  if (mode === "parallel") {
    const prompts = input.prompts ?? (input.prompt ? [input.prompt] : []);
    const outputs = await Promise.all(
      prompts.map((prompt) =>
        runPi(
          projectRoot,
          buildSubagentPrompt(
            projectRoot,
            { ...input, prompt },
            contextKey,
            agentName,
            agentDefinition,
          ),
          runConfig,
          contextKey,
          signal,
        ),
      ),
    );
    return outputs.join("\n\n---\n\n");
  }

  if (mode === "chain") {
    let previous = "";
    const prompts = input.prompts ?? (input.prompt ? [input.prompt] : []);
    for (const prompt of prompts) {
      previous = await runPi(
        projectRoot,
        buildSubagentPrompt(
          projectRoot,
          {
            ...input,
            prompt: previous
              ? `${prompt}\n\nPrevious output:\n${previous}`
              : prompt,
          },
          contextKey,
          agentName,
          agentDefinition,
        ),
        runConfig,
        contextKey,
        signal,
      );
    }
    return previous;
  }

  return runPi(
    projectRoot,
    buildSubagentPrompt(
      projectRoot,
      input,
      contextKey,
      agentName,
      agentDefinition,
    ),
    runConfig,
    contextKey,
    signal,
  );
}

export default function trellisExtension(pi: {
  registerTool?: (tool: JsonObject) => void;
  on?: (
    event: string,
    handler: (event: unknown, ctx?: PiExtensionContext) => unknown,
  ) => void;
  cwd?: string;
}): void {
  const projectRoot = findProjectRoot(pi.cwd ?? process.cwd());
  const processContextKey = createProcessContextKey(projectRoot);
  let currentContextKey: string | null = null;

  const getContextKey = (input?: unknown, ctx?: PiExtensionContext): string => {
    const resolvedContextKey = resolveContextKey(
      input,
      ctx,
      currentContextKey ?? processContextKey,
    );
    currentContextKey = adoptExistingContextKey(
      projectRoot,
      resolvedContextKey ?? processContextKey,
    );
    return currentContextKey;
  };

  pi.registerTool?.({
    name: "subagent",
    label: "Subagent",
    description: "Run a Trellis project sub-agent with active task context.",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            "Agent name, such as trellis-implement or trellis-check.",
        },
        prompt: {
          type: "string",
          description: "Task prompt for the sub-agent.",
        },
        mode: {
          type: "string",
          enum: ["single", "parallel", "chain"],
          description: "Delegation mode.",
        },
        prompts: {
          type: "array",
          items: { type: "string" },
          description: "Prompts for parallel or chain mode.",
        },
        model: {
          type: "string",
          description:
            "Optional Pi model override for the child sub-agent process.",
        },
        thinking: {
          type: "string",
          enum: ["off", "minimal", "low", "medium", "high", "xhigh"],
          description:
            "Optional Pi thinking level override for the child sub-agent process.",
        },
      },
      required: ["prompt"],
    },
    execute: async (
      _toolCallId: string,
      input: SubagentInput,
      _signal?: AbortSignal,
      _onUpdate?: (partialResult: PiToolResult) => void,
      ctx?: PiExtensionContext,
    ): Promise<PiToolResult> => {
      const contextKey = getContextKey(input, ctx);
      const output = await runSubagent(projectRoot, input, contextKey, _signal);
      return {
        content: [{ type: "text", text: output }],
        details: {
          agent: input.agent ?? "trellis-implement",
          mode: input.mode ?? "single",
        },
      };
    },
  });

  pi.on?.("session_start", (event, ctx) => {
    getContextKey(event, ctx);
    ctx?.ui?.notify?.(
      "Trellis project context is available. Use /trellis-continue to resume the current task.",
      "info",
    );
  });
  pi.on?.("before_agent_start", (event, ctx) => {
    const contextKey = getContextKey(event, ctx);
    const current = (event as PiBeforeAgentStartEvent).systemPrompt ?? "";
    const context = buildTrellisContext(
      projectRoot,
      "trellis-implement",
      event,
      ctx,
      contextKey,
    );
    return {
      systemPrompt: [current, context].filter(Boolean).join("\n\n"),
    };
  });
  pi.on?.("context", (event, ctx) => {
    getContextKey(event, ctx);
    const messages = (event as PiContextEvent).messages;
    return Array.isArray(messages) ? { messages } : undefined;
  });
  pi.on?.("input", (event, ctx) => {
    getContextKey(event, ctx);
    return { action: "continue" };
  });
  pi.on?.("tool_call", (event, ctx) => {
    const contextKey = getContextKey(event, ctx);
    injectTrellisContextIntoBash(event, contextKey);
    return undefined;
  });
}
