import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

type JsonObject = Record<string, unknown>;
type TextContent = { type: "text"; text: string };

interface RenderThemeLike {
  fg?: (name: string, text: string) => string;
  bold?: (text: string) => string;
}

const TRELLIS_WIDGET_KEY = "trellis-subagent-live";
const TRELLIS_WIDGET_LINES = 20;

interface LiveWidgetState {
  agent: string;
  mode: "single" | "parallel" | "chain";
  startedAt: number;
  runs: SubagentRunState[];
}

const trellisLiveState = {
  current: null as LiveWidgetState | null,
  uiContext: null as PiExtensionContext | null,
  widgetComponent: null as { invalidate(): void } | null,
  timer: null as ReturnType<typeof setInterval> | null,
};

interface PiToolResult {
  content: TextContent[];
  details?: unknown;
  isError?: boolean;
}

interface PiExtensionContext {
  hasUI?: boolean;
  sessionManager?: {
    getSessionId?: () => string;
    getSessionFile?: () => string | undefined;
  };
  ui?: {
    notify?: (message: string, type?: "info" | "warning" | "error") => void;
    setToolsExpanded?: (expanded: boolean) => void;
    setWidget?: (
      key: string,
      content: string[] | ((tui: unknown, theme: RenderThemeLike) => { render(width: number): string[]; invalidate(): void }) | undefined,
      options?: { placement?: "belowEditor" },
    ) => void;
    custom?: <T = unknown>(
      factory: (
        tui: { requestRender?: () => void },
        theme: RenderThemeLike,
        keybindings: unknown,
        done: (value: T) => void,
      ) => {
        render(width: number): string[];
        handleInput?: (data: string) => void;
        invalidate(): void;
      },
      options?: {
        overlay?: boolean;
        overlayOptions?: Record<string, unknown>;
      },
    ) => Promise<T>;
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

const PI_CLI_JS_SEGMENTS_LIST = [
  [
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "dist",
    "cli.js",
  ],
  // Backward-compatible probe for older Pi package names.
  [
    "node_modules",
    "@mariozechner",
    "pi-coding-agent",
    "dist",
    "cli.js",
  ],
];
const MAX_SUBAGENT_STDOUT_BYTES = 8 * 1024 * 1024;
const MAX_SUBAGENT_STDERR_BYTES = 1024 * 1024;
const MAX_SUBAGENT_TEXT_TAIL_CHARS = 1024 * 1024;
const MAX_SUBAGENT_THINKING_TAIL_CHARS = 1024 * 1024;
const MAX_SUBAGENT_STDERR_TAIL_CHARS = 1024 * 1024;
const MAX_SUBAGENT_RECENT_TOOLS = 10000;
const SUBAGENT_UPDATE_THROTTLE_MS = 80;

type SubagentRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type SubagentToolStatus = "running" | "succeeded" | "failed";

interface SubagentUsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface SubagentToolTrace {
  id: string;
  name: string;
  argsPreview: string;
  fullArgs: string;
  status: SubagentToolStatus;
  startedAt: number;
  finishedAt?: number;
}

interface SubagentRunState {
  id: string;
  agent: string;
  promptPreview: string;
  step?: number;
  status: SubagentRunStatus;
  startedAt?: number;
  finishedAt?: number;
  finalText: string;
  textTail: string;
  thinkingTail: string;
  stderrTail: string;
  recentTools: SubagentToolTrace[];
  usage: SubagentUsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
}

interface SubagentProgressDetails {
  kind: "trellis-subagent-progress";
  agent: string;
  mode: "single" | "parallel" | "chain";
  startedAt: number;
  updatedAt: number;
  final: boolean;
  runs: SubagentRunState[];
}

type SubagentProgressCallback = (force?: boolean) => void;

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
  const addSegments = (base: string, includeLib = false): void => {
    for (const segments of PI_CLI_JS_SEGMENTS_LIST) {
      candidates.push(join(base, ...segments));
      if (includeLib) candidates.push(join(base, "lib", ...segments));
    }
  };

  for (const arg of process.argv) {
    if (/pi-coding-agent[\\/]dist[\\/]cli\.js$/i.test(arg)) {
      candidates.push(resolve(arg));
    }
  }

  const npmPrefix =
    stringValue(process.env.npm_config_prefix) ??
    stringValue(process.env.NPM_CONFIG_PREFIX);
  if (npmPrefix) addSegments(npmPrefix, true);

  const appData = stringValue(process.env.APPDATA);
  if (appData) addSegments(join(appData, "npm"));

  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  for (const pathEntry of pathValue.split(delimiter)) {
    const entry = pathEntry.trim();
    if (!entry) continue;
    addSegments(entry);
    addSegments(dirname(entry), true);
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

function extractThinkingContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!isJsonObject(block)) return "";
      return block.type === "thinking" && typeof block.thinking === "string"
        ? block.thinking
        : "";
    })
    .join("\n");
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function appendTail(current: string, next: string, maxChars: number): string {
  if (!next) return current;
  const combined = current + next;
  return combined.length <= maxChars
    ? combined
    : combined.slice(combined.length - maxChars);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const ANSI_ESCAPE_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\)|_[^\x07]*(?:\x07|\x1B\\))/g;
const ZERO_WIDTH_RE = /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7-\u06e8\u06ea-\u06ed\u0711\u0730-\u074a\u07a6-\u07b0\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u08d3-\u08e1\u08e3-\u0903\u093a\u093c\u0941-\u0948\u094d\u0951-\u0957\u0962-\u0963\u0981\u09bc\u09c1-\u09c4\u09cd\u09e2-\u09e3\u0a01-\u0a02\u0a3c\u0a41-\u0a42\u0a47-\u0a48\u0a4b-\u0a4d\u0a51\u0a70-\u0a71\u0a75\u0a81-\u0a82\u0abc\u0ac1-\u0ac5\u0ac7-\u0ac8\u0acd\u0ae2-\u0ae3\u0b01\u0b3c\u0b3f\u0b41-\u0b44\u0b4d\u0b56\u0b62-\u0b63\u0b82\u0bc0\u0bcd\u0c00\u0c04\u0c3e-\u0c40\u0c46-\u0c48\u0c4a-\u0c4d\u0c55-\u0c56\u0c62-\u0c63\u0c81\u0cbc\u0cbf\u0cc6\u0ccc-\u0ccd\u0ce2-\u0ce3\u0d00-\u0d01\u0d3b-\u0d3c\u0d41-\u0d44\u0d4d\u0d62-\u0d63\u0dca\u0dd2-\u0dd4\u0dd6\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1\u0eb4-\u0ebc\u0ec8-\u0ece\u0f18-\u0f19\u0f35\u0f37\u0f39\u0f71-\u0f7e\u0f80-\u0f84\u0f86-\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u102d-\u1030\u1032-\u1037\u1039-\u103a\u103d-\u103e\u1058-\u1059\u105e-\u1060\u1071-\u1074\u1082\u1085-\u1086\u108d\u109d\u135d-\u135f\u1712-\u1714\u1732-\u1734\u1752-\u1753\u1772-\u1773\u17b4-\u17b5\u17b7-\u17bd\u17c6\u17c9-\u17d3\u17dd\u180b-\u180f\u1885-\u1886\u18a9\u1920-\u1922\u1927-\u1928\u1932\u1939-\u193b\u1a17-\u1a18\u1a1b\u1a56\u1a58-\u1a5e\u1a60\u1a62\u1a65-\u1a6c\u1a73-\u1a7c\u1a7f\u1ab0-\u1ace\u1b00-\u1b03\u1b34\u1b36-\u1b3a\u1b3c\u1b42\u1b6b-\u1b73\u1b80-\u1b81\u1ba2-\u1ba5\u1ba8-\u1ba9\u1bab-\u1bad\u1be6\u1be8-\u1be9\u1bed\u1bef-\u1bf1\u1c2c-\u1c33\u1c36-\u1c37\u1cd0-\u1cd2\u1cd4-\u1ce0\u1ce2-\u1ce8\u1ced\u1cf4\u1cf8-\u1cf9\u1dc0-\u1dff\u20d0-\u20ff\u2cef-\u2cf1\u2d7f\u2de0-\u2dff\u302a-\u302f\u3099-\u309a\ua66f-\ua672\ua674-\ua67d\ua69e-\ua69f\ua6f0-\ua6f1\ua802\ua806\ua80b\ua825-\ua826\ua82c\ua8c4-\ua8c5\ua8e0-\ua8f1\ua8ff\ua926-\ua92d\ua947-\ua951\ua980-\ua982\ua9b3\ua9b6-\ua9b9\ua9bc\ua9e5\uaa29-\uaa2e\uaa31-\uaa32\uaa35-\uaa36\uaa43\uaa4c\uaa7c\uaab0\uaab2-\uaab4\uaab7-\uaab8\uaabe-\uaabf\uaac1\uaaec-\uaaed\uaaf6\uabe5\uabe8\uabed\ufb1e\ufe00-\ufe0f\ufe20-\ufe2f]/;

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_RE, "");
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f000 && codePoint <= 0x1f64f) ||
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function graphemeSegments(value: string): string[] {
  const segmenter = Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
  return segmenter
    ? Array.from(segmenter.segment(value), (item) => item.segment)
    : Array.from(value);
}

function segmentWidth(segment: string): number {
  if (!segment) return 0;
  if (ZERO_WIDTH_RE.test(segment)) return 0;
  if (segment.includes("\u200d") || segment.includes("\ufe0f")) return 2;
  const codePoint = segment.codePointAt(0);
  if (codePoint === undefined) return 0;
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
  if (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) return 2;
  return isWideCodePoint(codePoint) ? 2 : 1;
}

function visibleTextWidth(value: string): number {
  return graphemeSegments(stripAnsi(value).replace(/\t/g, "   ")).reduce(
    (width, segment) => width + segmentWidth(segment),
    0,
  );
}

function truncateText(value: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (visibleTextWidth(value) <= maxWidth) return value;
  const ellipsis = maxWidth > 1 ? "…" : "";
  const target = Math.max(0, maxWidth - visibleTextWidth(ellipsis));
  let width = 0;
  let result = "";
  for (const segment of graphemeSegments(stripAnsi(value))) {
    const segmentWidthValue = segmentWidth(segment);
    if (width + segmentWidthValue > target) break;
    result += segment;
    width += segmentWidthValue;
  }
  return result + ellipsis;
}

function promptPreview(prompt: string): string {
  return truncateText(normalizeWhitespace(prompt), 120) || "(empty prompt)";
}

function emptyUsageStats(): SubagentUsageStats {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    contextTokens: 0,
    turns: 0,
  };
}

function createSubagentRunState(
  id: string,
  agent: string,
  prompt: string,
  status: SubagentRunStatus = "pending",
  step?: number,
): SubagentRunState {
  return {
    id,
    agent,
    promptPreview: promptPreview(prompt),
    step,
    status,
    finalText: "",
    textTail: "",
    thinkingTail: "",
    stderrTail: "",
    recentTools: [],
    usage: emptyUsageStats(),
  };
}

function cloneUsageStats(usage: SubagentUsageStats): SubagentUsageStats {
  return { ...usage };
}

function cloneRunState(state: SubagentRunState): SubagentRunState {
  return {
    ...state,
    recentTools: state.recentTools.map((tool) => ({ ...tool })),
    usage: cloneUsageStats(state.usage),
  };
}

function cloneProgressDetails(
  details: SubagentProgressDetails,
): SubagentProgressDetails {
  return {
    ...details,
    runs: details.runs.map(cloneRunState),
  };
}

function extractUsage(message: JsonObject): Partial<SubagentUsageStats> {
  const usage = isJsonObject(message.usage) ? message.usage : null;
  if (!usage) return {};
  const cost = isJsonObject(usage.cost) ? usage.cost : null;
  return {
    input: numberValue(usage.input),
    output: numberValue(usage.output),
    cacheRead: numberValue(usage.cacheRead),
    cacheWrite: numberValue(usage.cacheWrite),
    cost: numberValue(cost?.total),
    contextTokens: numberValue(usage.totalTokens),
  };
}

function addUsage(target: SubagentUsageStats, source: Partial<SubagentUsageStats>): void {
  target.input += source.input ?? 0;
  target.output += source.output ?? 0;
  target.cacheRead += source.cacheRead ?? 0;
  target.cacheWrite += source.cacheWrite ?? 0;
  target.cost += source.cost ?? 0;
  target.contextTokens = source.contextTokens ?? target.contextTokens;
}

function stringifyJson(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function previewJson(value: unknown): string {
  return normalizeWhitespace(stringifyJson(value));
}

function recordToolTrace(
  state: SubagentRunState,
  tool: SubagentToolTrace,
): void {
  const existingIndex = state.recentTools.findIndex((item) => item.id === tool.id);
  if (existingIndex >= 0) {
    state.recentTools[existingIndex] = {
      ...state.recentTools[existingIndex],
      ...tool,
    };
  } else {
    state.recentTools.push(tool);
  }
  if (state.recentTools.length > MAX_SUBAGENT_RECENT_TOOLS) {
    state.recentTools.splice(0, state.recentTools.length - MAX_SUBAGENT_RECENT_TOOLS);
  }
}

function updateToolTrace(
  state: SubagentRunState,
  id: string,
  patch: Partial<SubagentToolTrace>,
): void {
  const index = state.recentTools.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.recentTools[index] = { ...state.recentTools[index], ...patch };
  }
}

function extractAssistantDelta(
  event: JsonObject,
): { kind: "text" | "thinking"; delta: string } | null {
  const assistantEvent = isJsonObject(event.assistantMessageEvent)
    ? event.assistantMessageEvent
    : null;
  if (!assistantEvent || typeof assistantEvent.delta !== "string") return null;
  if (assistantEvent.type === "text_delta") {
    return { kind: "text", delta: assistantEvent.delta };
  }
  if (assistantEvent.type === "thinking_delta") {
    return { kind: "thinking", delta: assistantEvent.delta };
  }
  return null;
}

function applySubagentEvent(state: SubagentRunState, event: JsonObject): boolean {
  const type = typeof event.type === "string" ? event.type : "";
  if (!type) return false;

  if (type === "agent_start" || type === "turn_start") {
    state.status = "running";
    state.startedAt ??= Date.now();
    return true;
  }

  if (type === "message_update") {
    const update = extractAssistantDelta(event);
    if (!update) return false;
    if (update.kind === "thinking") {
      state.thinkingTail = appendTail(
        state.thinkingTail,
        update.delta,
        MAX_SUBAGENT_THINKING_TAIL_CHARS,
      );
    } else {
      state.textTail = appendTail(
        state.textTail,
        update.delta,
        MAX_SUBAGENT_TEXT_TAIL_CHARS,
      );
    }
    return true;
  }

  if (type === "message_end" && isJsonObject(event.message)) {
    const message = event.message;
    if (message.role === "assistant") {
      state.usage.turns += 1;
      addUsage(state.usage, extractUsage(message));
      const thinking = extractThinkingContent(message.content);
      if (thinking) {
        state.thinkingTail = appendTail(
          "",
          thinking,
          MAX_SUBAGENT_THINKING_TAIL_CHARS,
        );
      }
      const text = extractTextContent(message.content);
      if (text) {
        state.finalText = text;
        state.textTail = appendTail(
          "",
          text,
          MAX_SUBAGENT_TEXT_TAIL_CHARS,
        );
      }
      if (typeof message.model === "string") state.model = message.model;
      if (typeof message.stopReason === "string") state.stopReason = message.stopReason;
      if (typeof message.errorMessage === "string") {
        state.errorMessage = message.errorMessage;
      }
      return true;
    }
    return false;
  }

  if (type === "tool_execution_start") {
    const id = typeof event.toolCallId === "string" ? event.toolCallId : hashValue(`${Date.now()}`);
    const name = typeof event.toolName === "string" ? event.toolName : "tool";
    recordToolTrace(state, {
      id,
      name,
      argsPreview: previewJson(event.args),
      fullArgs: stringifyJson(event.args),
      status: "running",
      startedAt: Date.now(),
    });
    return true;
  }

  if (type === "tool_execution_update") {
    const id = typeof event.toolCallId === "string" ? event.toolCallId : "";
    if (!id) return false;
    const argsPreview = previewJson(event.args);
    const fullArgs = stringifyJson(event.args);
    updateToolTrace(state, id, argsPreview ? { argsPreview, fullArgs } : {});
    return true;
  }

  if (type === "tool_execution_end") {
    const id = typeof event.toolCallId === "string" ? event.toolCallId : "";
    if (!id) return false;
    updateToolTrace(state, id, {
      status: event.isError ? "failed" : "succeeded",
      finishedAt: Date.now(),
    });
    return true;
  }

  if (type === "agent_end") {
    state.finishedAt = Date.now();
    if (state.status === "running" || state.status === "pending") {
      state.status = "succeeded";
    }
    return true;
  }

  return false;
}

function finalOutputFromState(state: SubagentRunState, fallback: string): string {
  return state.finalText || fallback.trim() || state.stderrTail.trim();
}

function parseJsonEventLine(line: string): JsonObject | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart));
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m${rest}s`;
}

function formatCompactNumber(count: number): string {
  if (!count) return "0";
  if (Math.abs(count) < 1000) return `${count}`;
  if (Math.abs(count) < 1000000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1000000).toFixed(1)}m`;
}

function formatSubagentUsage(usage: SubagentUsageStats, model?: string): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${formatCompactNumber(usage.input)}`);
  if (usage.output) parts.push(`↓${formatCompactNumber(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatCompactNumber(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatCompactNumber(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens) parts.push(`ctx:${formatCompactNumber(usage.contextTokens)}`);
  if (model) parts.push(model);
  return parts.join(" ");
}

function subagentStatusIcon(status: SubagentRunStatus): string {
  switch (status) {
    case "pending":
      return "○";
    case "running":
      return "●";
    case "succeeded":
      return "✓";
    case "failed":
      return "✗";
    case "cancelled":
      return "⊘";
  }
}

function toolStatusIcon(status: SubagentToolStatus): string {
  switch (status) {
    case "running":
      return "•";
    case "succeeded":
      return "✓";
    case "failed":
      return "✗";
  }
}

function formatToolBrief(tool: SubagentToolTrace): string {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(tool.argsPreview); } catch {}

  if (tool.name === "read") {
    const p = (args.path || args.file_path || "...") as string;
    const offset = args.offset as number | undefined;
    const suffix = offset ? `:${offset}` : "";
    return `read: ${p}${suffix}`;
  }
  if (tool.name === "bash") {
    const cmd = (args.command || "...") as string;
    return `bash: ${cmd.slice(0, 60)}`;
  }
  if (tool.name === "write") {
    const p = (args.path || args.file_path || "...") as string;
    return `write: ${p}`;
  }
  if (tool.name === "edit") {
    const p = (args.path || args.file_path || "...") as string;
    return `edit: ${p}`;
  }
  if (tool.name === "grep") {
    const pattern = (args.pattern || "...") as string;
    return `grep: ${pattern.slice(0, 50)}`;
  }
  if (tool.name === "find") {
    const pattern = (args.pattern || "*") as string;
    return `find: ${pattern}`;
  }
  return tool.name;
}

function formatToolTrace(tool: SubagentToolTrace, full = false): string {
  const elapsed = tool.finishedAt
    ? formatDuration(tool.finishedAt - tool.startedAt)
    : formatDuration(Date.now() - tool.startedAt);
  const args = full ? tool.fullArgs : tool.argsPreview;
  return `${toolStatusIcon(tool.status)} ${tool.name}${args ? ` ${args}` : ""} · ${elapsed}`;
}

function summarizeProgress(details: SubagentProgressDetails): string {
  const done = details.runs.filter((run) => run.status !== "pending" && run.status !== "running").length;
  const running = details.runs.filter((run) => run.status === "running").length;
  const failed = details.runs.filter((run) => run.status === "failed" || run.status === "cancelled").length;
  const elapsed = formatDuration(Date.now() - details.startedAt);
  const status = details.final
    ? failed
      ? `${done}/${details.runs.length} done · ${failed} failed`
      : `${done}/${details.runs.length} done`
    : `${done}/${details.runs.length} done · ${running} running`;
  return `subagent ${details.mode} · ${details.agent} · ${status} · ${elapsed}`;
}

function latestNonEmptyLines(text: string, count: number): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .slice(-count);
}

function compactRunHeadline(run: SubagentRunState): string {
  const elapsed = run.startedAt
    ? formatDuration((run.finishedAt ?? Date.now()) - run.startedAt)
    : "0ms";
  const usage = formatSubagentUsage(run.usage, run.model);
  const status = run.status === "running"
    ? ["◐", "◓", "◑", "◒"][Math.floor(Date.now() / 250) % 4]!
    : subagentStatusIcon(run.status);
  return `${status} ${run.agent} · ${elapsed}${usage ? ` · ${usage}` : ""}`;
}

function pushTextBlock(
  lines: string[],
  title: string,
  text: string,
  indent = "  ",
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  lines.push(`${indent}${title}:`);
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.trim()) lines.push(`${indent}  ${line}`);
  }
}

function formatProgressDetails(details: SubagentProgressDetails): string {
  const lines: string[] = [summarizeProgress(details)];
  for (const run of details.runs) {
    const elapsed = run.startedAt
      ? formatDuration((run.finishedAt ?? Date.now()) - run.startedAt)
      : "0ms";
    const step = run.step ? ` step ${run.step}` : "";
    const usage = formatSubagentUsage(run.usage, run.model);
    lines.push(
      `${subagentStatusIcon(run.status)} ${run.agent}${step} · ${run.status} · ${elapsed}${usage ? ` · ${usage}` : ""}`,
    );

    for (const tool of run.recentTools) {
      lines.push(`  → ${formatToolTrace(tool, true)}`);
    }

    if (run.thinkingTail.trim()) {
      pushTextBlock(lines, "thinking", run.thinkingTail, "  ");
    }

    const text = (run.finalText || run.textTail).trim();
    if (text) {
      pushTextBlock(lines, "output", text, "  ");
    } else if (run.status === "pending") {
      lines.push(`  ${run.promptPreview}`);
    }

    if (run.errorMessage) lines.push(`  error: ${run.errorMessage}`);
    if (run.stderrTail.trim()) {
      pushTextBlock(lines, "stderr", run.stderrTail, "  ");
    }
  }
  return lines.join("\n");
}

interface TextLikeComponent {
  render(width: number): string[];
  invalidate(): void;
}

class WrappedTextComponent implements TextLikeComponent {
  constructor(private readonly text: string) {}

  render(width: number): string[] {
    return this.text.split(/\r?\n/).flatMap((line) => wrapLineToWidth(line, width));
  }

  invalidate(): void {}
}

class SpacerComponent implements TextLikeComponent {
  constructor(private readonly height = 1) {}

  render(): string[] {
    return Array.from({ length: Math.max(0, this.height) }, () => "");
  }

  invalidate(): void {}
}

function trellisStopLiveTimer(): void {
  if (trellisLiveState.timer) {
    clearInterval(trellisLiveState.timer);
    trellisLiveState.timer = null;
  }
}

function trellisShowLiveWidget(details: SubagentProgressDetails, ctx: PiExtensionContext): void {
  trellisLiveState.current = {
    agent: details.agent,
    mode: details.mode,
    startedAt: details.startedAt,
    runs: details.runs,
  };
  trellisLiveState.uiContext = ctx;
  trellisLiveState.widgetComponent = {
    invalidate(): void {
      trellisLiveState.uiContext?.ui?.setWidget?.(
        TRELLIS_WIDGET_KEY,
        (_tui: unknown, theme: RenderThemeLike) => trellisBuildWidgetComponent(theme),
      );
    },
  };
  ctx.ui?.setWidget?.(
    TRELLIS_WIDGET_KEY,
    (_tui: unknown, theme: RenderThemeLike) => trellisBuildWidgetComponent(theme),
  );
  trellisStopLiveTimer();
  trellisLiveState.timer = setInterval(() => {
    trellisLiveState.widgetComponent?.invalidate();
  }, 1000);
  trellisLiveState.timer?.unref?.();
}

function trellisUpdateLiveWidget(details: SubagentProgressDetails): void {
  trellisLiveState.current = {
    agent: details.agent,
    mode: details.mode,
    startedAt: details.startedAt,
    runs: details.runs,
  };
}

function trellisHideLiveWidget(): void {
  trellisStopLiveTimer();
  trellisLiveState.uiContext?.ui?.setWidget?.(TRELLIS_WIDGET_KEY, undefined);
  trellisLiveState.current = null;
  trellisLiveState.widgetComponent = null;
  trellisLiveState.uiContext = null;
}

function trellisBuildWidgetComponent(theme: RenderThemeLike): { render(width: number): string[]; invalidate(): void } {
  const state = trellisLiveState.current;
  return {
    render(width: number): string[] {
      if (!state) return [];
      const run = state.runs[0];
      const elapsed = formatDuration(Date.now() - state.startedAt);
      const agent = run?.agent ?? state.agent;
      const status = run?.status ?? "running";
      const icon = status === "running" ? ["◐", "◓", "◑", "◒"][Math.floor(Date.now() / 250) % 4]! : subagentStatusIcon(status);
      const usage = run ? formatSubagentUsage(run.usage, run.model) : "";

      const line1 = truncateText(`${icon} ${agent} · ${elapsed}${usage ? ` · ${usage}` : ""}`, width);

      const summary = latestNonEmptyLines(run?.thinkingTail || "", 1)[0]
        || latestNonEmptyLines(run?.finalText || run?.textTail || "", 1)[0]
        || "";
      const line2 = summary ? truncateText(`  › ${summary.trim()}`, width) : "";

      let line3 = "";
      if (run?.recentTools.at(-1)) {
        const tool = run.recentTools.at(-1)!;
        line3 = truncateText(`  ${toolStatusIcon(tool.status)} ${formatToolBrief(tool)}`, width);
      } else if (status === "running") {
        line3 = "  thinking...";
      }

      const line4 = "  Ctrl+Alt+O 完整明细";
      return [line1, ...(line2 ? [line2] : []), ...(line3 ? [line3] : []), line4];
    },
    invalidate(): void {},
  };
}

class SubagentResultOverlayComponent implements TextLikeComponent {
  private readonly inner: SubagentResultComponent;
  private scrollOffset = 0;
  private cachedWidth?: number;
  private cachedLines: string[] = [];

  constructor(
    details: SubagentProgressDetails,
    private readonly theme: RenderThemeLike | undefined,
    private readonly done: (value: void) => void,
  ) {
    this.inner = new SubagentResultComponent(details, true, theme);
  }

  private fg(name: string, text: string): string {
    return this.theme?.fg?.(name, text) ?? text;
  }

  private bold(text: string): string {
    return this.theme?.bold?.(text) ?? text;
  }

  render(width: number): string[] {
    const maxWidth = Math.max(20, width);
    const header = this.fg("toolTitle", this.bold(truncateText("Subagent detail", maxWidth)));
    const hint = this.fg("dim", truncateText("Ctrl+Alt+O · ↑↓ / PgUp PgDn 滚动 · Esc / Enter 关闭", maxWidth));
    const innerWidth = Math.max(20, maxWidth - 2);
    if (this.cachedWidth !== innerWidth) {
      this.cachedWidth = innerWidth;
      this.cachedLines = this.inner.render(innerWidth).map((line) => ` ${line}`);
      this.scrollOffset = 0;
    }
    const viewportHeight = 20;
    const maxOffset = Math.max(0, this.cachedLines.length - viewportHeight);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset));
    const visible = this.cachedLines.slice(this.scrollOffset, this.scrollOffset + viewportHeight);
    const footer = this.fg(
      "dim",
      truncateText(
        `lines ${this.scrollOffset + 1}-${Math.min(this.scrollOffset + viewportHeight, this.cachedLines.length)} / ${this.cachedLines.length}`,
        maxWidth,
      ),
    );
    return [header, hint, this.fg("dim", "────────────────"), ...visible, this.fg("dim", "────────────────"), footer];
  }

  handleInput(data: string): void {
    if (data === "\u001b" || data === "\r" || data === "\n") {
      this.done();
      return;
    }
    if (data === "\u001b[A") {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      return;
    }
    if (data === "\u001b[B") {
      this.scrollOffset += 1;
      return;
    }
    if (data === "\u001b[5~") {
      this.scrollOffset = Math.max(0, this.scrollOffset - 10);
      return;
    }
    if (data === "\u001b[6~") {
      this.scrollOffset += 10;
    }
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = [];
    this.inner.invalidate();
  }
}

class SubagentResultComponent implements TextLikeComponent {
  private readonly children: TextLikeComponent[] = [];

  constructor(
    private readonly details: SubagentProgressDetails,
    private readonly expanded: boolean,
    private readonly theme?: RenderThemeLike,
  ) {
    this.build();
  }

  private fg(name: string, text: string): string {
    return this.theme?.fg?.(name, text) ?? text;
  }

  private bold(text: string): string {
    return this.theme?.bold?.(text) ?? text;
  }

  private add(text: string): void {
    this.children.push(new WrappedTextComponent(text));
  }

  private space(): void {
    this.children.push(new SpacerComponent(1));
  }

  private divider(label?: string): void {
    this.add(this.fg("dim", label ? `── ${label} ──` : "────────────────"));
  }

  private build(): void {
    this.add(this.fg("toolTitle", this.bold(summarizeProgress(this.details))));
    for (let index = 0; index < this.details.runs.length; index += 1) {
      const run = this.details.runs[index];
      if (!run) continue;
      if (index > 0) {
        this.divider();
      }

      if (!this.expanded) {
        this.add(this.fg("accent", compactRunHeadline(run)));
        const output = (run.finalText || run.textTail).trim();
        if (output) {
          const firstLine = output.split(/\r?\n/).find((line) => line.trim());
          if (firstLine) this.add(this.fg("toolOutput", `  ${truncateText(firstLine.trim(), 88)}`));
        }
        continue;
      }

      const step = run.step ? `step ${run.step} · ` : "";
      const elapsed = run.startedAt
        ? formatDuration((run.finishedAt ?? Date.now()) - run.startedAt)
        : "0ms";
      const usage = formatSubagentUsage(run.usage, run.model);
      this.add(
        this.fg(
          run.status === "running" ? "accent" : run.status === "succeeded" ? "success" : run.status === "failed" ? "error" : "muted",
          `${subagentStatusIcon(run.status)} ${step}${run.agent} · ${run.status} · ${elapsed}${usage ? ` · ${usage}` : ""}`,
        ),
      );

      if (run.thinkingTail.trim()) {
        this.divider("Thinking");
        this.addBlock(run.thinkingTail, "  ", "muted");
      }

      if (run.recentTools.length) {
        this.divider("Tools");
        for (const tool of run.recentTools) {
          this.add(this.fg("muted", `  ${formatToolTrace(tool, true)}`));
        }
      }

      const text = (run.finalText || run.textTail).trim();
      if (text) {
        this.divider("Output");
        this.addBlock(text, "  ", "toolOutput");
      } else if (run.status === "pending") {
        this.divider("Prompt");
        this.add(this.fg("dim", `  ${run.promptPreview}`));
      }

      if (run.errorMessage) {
        this.divider("Error");
        this.add(this.fg("error", `  ${run.errorMessage}`));
      }
      if (run.stderrTail.trim()) {
        this.divider("Stderr");
        this.addBlock(run.stderrTail, "  ", "dim");
      }
    }
  }

  private addBlock(text: string, indent: string, tone?: string): void {
    for (const line of text.trim().split(/\r?\n/)) {
      if (!line.trim()) continue;
      const rendered = `${indent}${line}`;
      this.add(tone ? this.fg(tone, rendered) : rendered);
    }
  }

  render(width: number): string[] {
    return this.children.flatMap((child) => child.render(width));
  }

  invalidate(): void {
    for (const child of this.children) child.invalidate();
  }
}

function wrapLineToWidth(line: string, width: number): string[] {
  const maxWidth = Math.max(1, width);
  if (!line) return [""];
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] === "\u001b") {
      const rest = line.slice(i);
      const match = rest.match(/^\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\u001b\\)|_[^\x07]*(?:\x07|\u001b\\))/);
      if (match) {
        current += match[0];
        i += match[0].length;
        continue;
      }
    }

    const remaining = line.slice(i);
    const [segment] = graphemeSegments(remaining);
    if (!segment) break;
    const widthValue = segmentWidth(segment);
    if (current && currentWidth + widthValue > maxWidth) {
      lines.push(current);
      current = "";
      currentWidth = 0;
    }
    if (!current && widthValue > maxWidth) {
      lines.push(segment);
      i += segment.length;
      continue;
    }
    current += segment;
    currentWidth += widthValue;
    i += segment.length;
  }
  lines.push(current);
  return lines;
}

function makeTextComponent(text: string): { render(width: number): string[]; invalidate(): void } {
  return {
    render(width: number): string[] {
      return text.split(/\r?\n/).flatMap((line) => wrapLineToWidth(line, width));
    },
    invalidate(): void {},
  };
}

function isSubagentProgressDetails(value: unknown): value is SubagentProgressDetails {
  return isJsonObject(value) && value.kind === "trellis-subagent-progress" && Array.isArray(value.runs);
}

interface ResultRenderContext {
  state: { trellisSubagentTimer?: ReturnType<typeof setInterval> };
  invalidate: () => void;
}

interface SubagentExecutionResult {
  output: string;
  details: SubagentProgressDetails;
  failed: boolean;
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
  const design = readText(join(taskDir, "design.md"));
  const implementPlan = readText(join(taskDir, "implement.md"));
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
    design ? "\n### design.md\n" + design : "",
    implementPlan ? "\n### implement.md\n" + implementPlan : "",
    specContext ? "\n### Curated Spec / Research Context\n" + specContext : "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Workflow-state breadcrumb (TypeScript port of the shared workflow-state
// hook used by class-1 platforms).
//
// Pi is extension-backed and MUST NOT receive Python hook scripts under .pi/.
// We therefore parse `.trellis/workflow.md` `[workflow-state:STATUS]...
// [/workflow-state:STATUS]` blocks directly in TypeScript and emit the
// per-turn `<workflow-state>` breadcrumb in `before_agent_start` and `input`.
// Tag regex mirrors the shared parser so the breadcrumb body stays
// byte-identical with hook-driven platforms.
// ---------------------------------------------------------------------------

const WORKFLOW_STATE_TAG_RE =
  /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n([\s\S]*?)\n\s*\[\/workflow-state:\1\]/g;

function loadWorkflowBreadcrumbs(projectRoot: string): Record<string, string> {
  const workflow = readText(join(projectRoot, ".trellis", "workflow.md"));
  if (!workflow) return {};
  const result: Record<string, string> = {};
  for (const match of workflow.matchAll(WORKFLOW_STATE_TAG_RE)) {
    const status = match[1] ?? "";
    const body = (match[2] ?? "").trim();
    if (status && body) result[status] = body;
  }
  return result;
}

function readActiveTaskStatus(
  projectRoot: string,
  taskDir: string,
): { taskId: string; status: string } | null {
  try {
    const data = JSON.parse(
      readText(join(taskDir, "task.json")),
    ) as JsonObject;
    const status = stringValue(data.status);
    if (!status) return null;
    const id = stringValue(data.id) ?? taskDir.split(/[\\/]/).pop() ?? "";
    return { taskId: id, status };
  } catch {
    return null;
  }
}

function buildWorkflowStateBreadcrumb(
  projectRoot: string,
  contextKey: string | null,
): string {
  const templates = loadWorkflowBreadcrumbs(projectRoot);
  const taskDir = readCurrentTask(
    projectRoot,
    undefined,
    undefined,
    contextKey,
  );
  let header: string;
  let lookupKey: string;
  if (!taskDir) {
    header = "Status: no_task";
    lookupKey = "no_task";
  } else {
    const info = readActiveTaskStatus(projectRoot, taskDir);
    if (!info) {
      header = "Status: no_task";
      lookupKey = "no_task";
    } else {
      header = `Task: ${info.taskId} (${info.status})`;
      lookupKey = info.status;
    }
  }
  const body = templates[lookupKey] ?? "Refer to workflow.md for current step.";
  return `<workflow-state>\n${header}\n${body}\n</workflow-state>`;
}

// ---------------------------------------------------------------------------
// Session overview (developer / git branch / active tasks)
//
// Spawns `python .trellis/scripts/get_context.py` (the same script other
// platform session-start hooks invoke) to keep developer/git/active-task
// summary byte-identical with class-1 platforms. Failure is non-fatal — we
// emit an empty overview rather than block the conversation.
// ---------------------------------------------------------------------------

const SESSION_OVERVIEW_TIMEOUT_MS = 5000;

function pythonExecutable(): string {
  const override = stringValue(process.env.TRELLIS_PYTHON);
  if (override) return override;
  return process.platform === "win32" ? "python" : "python";
}

function buildSessionOverview(
  projectRoot: string,
  contextKey: string | null,
): string {
  const script = join(projectRoot, ".trellis", "scripts", "get_context.py");
  if (!isExistingFile(script)) return "";
  try {
    const result = spawnSync(pythonExecutable(), [script], {
      cwd: projectRoot,
      env: contextKey
        ? { ...process.env, TRELLIS_CONTEXT_ID: contextKey }
        : process.env,
      encoding: "utf-8",
      timeout: SESSION_OVERVIEW_TIMEOUT_MS,
      windowsHide: true,
    });
    if (result.status !== 0) return "";
    const stdout = (result.stdout ?? "").trim();
    if (!stdout) return "";
    return `<session-overview>\n${stdout}\n</session-overview>`;
  } catch {
    return "";
  }
}

// Per-turn cache so input + before_agent_start in the same turn don't double-spawn.
class TurnContextCache {
  private key: string | null = null;
  private timestamp = 0;
  private workflowState = "";
  private sessionOverview = "";
  // Refresh window: per-turn injections that fire close together share a
  // single python spawn; anything older than this re-runs the resolver.
  private static readonly TTL_MS = 1500;

  get(
    projectRoot: string,
    contextKey: string | null,
  ): { workflowState: string; sessionOverview: string } {
    const now = Date.now();
    if (this.key === contextKey && now - this.timestamp < TurnContextCache.TTL_MS) {
      return {
        workflowState: this.workflowState,
        sessionOverview: this.sessionOverview,
      };
    }
    this.workflowState = buildWorkflowStateBreadcrumb(projectRoot, contextKey);
    this.sessionOverview = buildSessionOverview(projectRoot, contextKey);
    this.key = contextKey;
    this.timestamp = now;
    return {
      workflowState: this.workflowState,
      sessionOverview: this.sessionOverview,
    };
  }
}

// ---------------------------------------------------------------------------
// Sub-agent dispatch protocol snippet (registered with the `subagent` tool).
// Mirrors the [workflow-state:in_progress] dispatch protocol text in
// trellis/workflow.md so the AI sees the same `Active task: <path>` rule
// whether it reads workflow.md, the per-turn breadcrumb, or the tool prompt.
// ---------------------------------------------------------------------------

const SUBAGENT_DISPATCH_PROTOCOL = `Sub-agent dispatch protocol (Trellis): your dispatch prompt MUST start with one line "Active task: <task path from \`task.py current\`>" before any other instructions. No exceptions. On class-2 platforms (codex / copilot / gemini / qoder) the sub-agent depends on this line because there is no hook to inject task context. On class-1 platforms (claude / cursor / opencode / kiro / codebuddy / droid) and on Pi, the line is the canonical fallback when hook/extension injection misses. trellis-research uses the line to know which {task_dir}/research/ to write into.

Wrong: prompt: "implement the new feature"
Correct: prompt: "Active task: .trellis/tasks/05-09-pi-workflow-state-injection\\n\\nImplement the new feature ..."`;

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
  state: SubagentRunState,
  emitProgress: SubagentProgressCallback,
  contextKey?: string | null,
  signal?: AbortSignal,
): Promise<{ output: string; failed: boolean }> {
  return new Promise((resolvePromise, _reject) => {
    if (signal?.aborted) {
      state.status = "cancelled";
      state.errorMessage = "pi subagent cancelled";
      state.finishedAt = Date.now();
      emitProgress(true);
      resolvePromise({ output: state.errorMessage, failed: true });
      return;
    }

    const invocation = resolvePiInvocation();
    const modelArgs = buildPiModelArgs(runConfig);
    const child = spawn(
      invocation.command,
      [
        ...invocation.argsPrefix,
        "--mode",
        "json",
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
    let stdoutBuffer = "";
    let settled = false;
    let aborted = false;

    state.status = "running";
    state.startedAt = Date.now();
    emitProgress(true);

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
      state.status = aborted ? "cancelled" : "failed";
      state.errorMessage = error.message;
      state.finishedAt = Date.now();
      emitProgress(true);
      resolvePromise({
        output: finalOutputFromState(state, error.message),
        failed: true,
      });
    };

    const succeed = (value: { output: string; failed: boolean }): void => {
      if (settled) return;
      settled = true;
      cleanup();
      emitProgress(true);
      resolvePromise(value);
    };

    const processLine = (line: string): void => {
      const event = parseJsonEventLine(line);
      if (!event) return;
      const changed = applySubagentEvent(state, event);
      if (changed) emitProgress();
    };

    const processBufferedStdout = (chunkText: string): void => {
      stdoutBuffer += chunkText;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    };

    signal?.addEventListener("abort", abortChild, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout.append(chunk);
      processBufferedStdout(chunk.toString("utf-8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr.append(chunk);
      state.stderrTail = appendTail(
        state.stderrTail,
        chunk.toString("utf-8"),
        MAX_SUBAGENT_STDERR_TAIL_CHARS,
      );
      emitProgress();
    });
    child.stdin?.on("error", (error: Error & { code?: string }) => {
      if (!aborted && error.code !== "EPIPE") fail(error);
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (stdoutBuffer.trim()) processLine(stdoutBuffer);
      const out = stdout.toString();
      const err = stderr.toString();
      state.stderrTail = appendTail("", err, MAX_SUBAGENT_STDERR_TAIL_CHARS);
      state.finishedAt = Date.now();

      if (aborted) {
        state.status = "cancelled";
        state.errorMessage = "pi subagent cancelled";
        succeed({ output: finalOutputFromState(state, state.errorMessage), failed: true });
        return;
      }

      if (code === 0) {
        if (state.status === "pending" || state.status === "running") {
          state.status = "succeeded";
        }
        succeed({ output: finalOutputFromState(state, formatPiOutput(out, err)), failed: false });
        return;
      }

      state.status = "failed";
      state.errorMessage = err || out || `pi exited with code ${code ?? "unknown"}`;
      succeed({ output: finalOutputFromState(state, state.errorMessage), failed: true });
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
  onUpdate?: (partialResult: PiToolResult) => void,
): Promise<SubagentExecutionResult> {
  const agentName = normalizeAgentName(input.agent ?? "trellis-implement");
  const agentDefinition = readAgentDefinition(projectRoot, agentName);
  const runConfig = resolveSubagentRunConfig(input, agentDefinition.config);
  const mode = input.mode ?? "single";
  const startedAt = Date.now();
  const details: SubagentProgressDetails = {
    kind: "trellis-subagent-progress",
    agent: agentName,
    mode,
    startedAt,
    updatedAt: startedAt,
    final: false,
    runs: [],
  };
  let lastUpdateAt = 0;

  const emitProgress: SubagentProgressCallback = (force = false): void => {
    const now = Date.now();
    if (!force && now - lastUpdateAt < SUBAGENT_UPDATE_THROTTLE_MS) return;
    lastUpdateAt = now;
    details.updatedAt = now;
    if (trellisLiveState.uiContext && !trellisLiveState.current) {
      trellisShowLiveWidget(details, trellisLiveState.uiContext);
    } else {
      trellisUpdateLiveWidget(details);
    }
  };

  const finish = (
    output: string,
    failed: boolean,
  ): SubagentExecutionResult => {
    details.final = true;
    details.updatedAt = Date.now();
    trellisHideLiveWidget();
    return { output, details: cloneProgressDetails(details), failed };
  };

  if (mode === "parallel") {
    const prompts = input.prompts ?? (input.prompt ? [input.prompt] : []);
    details.runs = prompts.map((prompt, index) =>
      createSubagentRunState(`${agentName}-${index + 1}`, agentName, prompt),
    );
    emitProgress(true);
    const results = await Promise.all(
      prompts.map((prompt, index) =>
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
          details.runs[index],
          emitProgress,
          contextKey,
          signal,
        ),
      ),
    );
    const output = results.map((result) => result.output).join("\n\n---\n\n");
    return finish(output, results.some((result) => result.failed));
  }

  if (mode === "chain") {
    let previous = "";
    let failed = false;
    const prompts = input.prompts ?? (input.prompt ? [input.prompt] : []);
    for (let index = 0; index < prompts.length; index += 1) {
      const prompt = prompts[index] ?? "";
      const runState = createSubagentRunState(
        `${agentName}-${index + 1}`,
        agentName,
        prompt,
        "pending",
        index + 1,
      );
      details.runs.push(runState);
      emitProgress(true);
      const result = await runPi(
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
        runState,
        emitProgress,
        contextKey,
        signal,
      );
      previous = result.output;
      failed = failed || result.failed;
      if (result.failed) break;
    }
    return finish(previous, failed);
  }

  const runState = createSubagentRunState(
    `${agentName}-1`,
    agentName,
    input.prompt ?? "",
  );
  details.runs = [runState];
  emitProgress(true);
  const result = await runPi(
    projectRoot,
    buildSubagentPrompt(
      projectRoot,
      input,
      contextKey,
      agentName,
      agentDefinition,
    ),
    runConfig,
    runState,
    emitProgress,
    contextKey,
    signal,
  );
  return finish(result.output, result.failed);
}

export default function trellisExtension(pi: {
  registerTool?: (tool: JsonObject) => void;
  registerShortcut?: (
    shortcut: string,
    options: { description?: string; handler: (ctx: PiExtensionContext) => unknown },
  ) => void;
  on?: (
    event: string,
    handler: (event: unknown, ctx?: PiExtensionContext) => unknown,
  ) => void;
  cwd?: string;
}): void {
  const projectRoot = findProjectRoot(pi.cwd ?? process.cwd());
  const processContextKey = createProcessContextKey(projectRoot);
  let currentContextKey: string | null = null;
  let lastSubagentDetails: SubagentProgressDetails | null = null;
  const turnContextCache = new TurnContextCache();

  const buildPerTurnInjection = (contextKey: string | null): string => {
    const { workflowState, sessionOverview } = turnContextCache.get(
      projectRoot,
      contextKey,
    );
    return [workflowState, sessionOverview].filter(Boolean).join("\n\n");
  };

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
    promptSnippet: SUBAGENT_DISPATCH_PROTOCOL,
    promptGuidelines: SUBAGENT_DISPATCH_PROTOCOL,
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
      const result = await runSubagent(
        projectRoot,
        input,
        contextKey,
        _signal,
        _onUpdate,
      );
      lastSubagentDetails = result.details;
      return {
        content: [{ type: "text", text: result.output }],
        details: result.details,
        isError: result.failed,
      };
    },
    renderCall: (args: unknown) => {
      const input = isJsonObject(args) ? (args as SubagentInput) : {};
      const agent = normalizeAgentName(input.agent ?? "trellis-implement");
      const mode = input.mode ?? "single";
      const promptCount = input.prompts?.length ?? (input.prompt ? 1 : 0);
      const header = `subagent ${mode} ${agent}`;
      const body = promptCount > 1 ? `${promptCount} prompts` : promptPreview(input.prompt ?? "");
      return makeTextComponent(`${header}\n${body}`);
    },
    renderResult: (
      result: PiToolResult,
      _options?: { expanded?: boolean; isPartial?: boolean },
      theme?: RenderThemeLike,
      _context?: ResultRenderContext,
    ) => {
      if (isSubagentProgressDetails(result.details)) {
        return new SubagentResultComponent(
          result.details,
          false,
          theme,
        );
      }
      const text = result.content?.[0]?.text ?? "(no output)";
      return makeTextComponent(text);
    },
  });

  pi.registerShortcut?.("ctrl+alt+o", {
    description: "Show last subagent detail",
    handler: async (ctx) => {
      const overlayDetails = lastSubagentDetails ?? trellisLiveState.current
        ? {
            kind: "trellis-subagent-progress" as const,
            agent: trellisLiveState.current?.agent ?? "",
            mode: trellisLiveState.current?.mode ?? "single" as const,
            startedAt: trellisLiveState.current?.startedAt ?? Date.now(),
            updatedAt: Date.now(),
            final: false,
            runs: trellisLiveState.current?.runs ?? [],
          }
        : null;
      if (!overlayDetails) {
        ctx.ui?.notify?.("No subagent result available yet.", "warning");
        return;
      }
      if (!ctx.ui?.custom) {
        ctx.ui?.notify?.("Overlay UI is unavailable in this mode.", "warning");
        return;
      }
      await ctx.ui.custom<void>(
        (_tui, theme, _keybindings, done) =>
          new SubagentResultOverlayComponent(overlayDetails!, theme, done),
        {
          overlay: true,
          overlayOptions: {
            width: "80%",
            maxHeight: "80%",
            anchor: "center",
            margin: 1,
          },
        },
      );
    },
  });

  pi.on?.("session_start", (event, ctx) => {
    getContextKey(event, ctx);
    ctx?.ui?.setToolsExpanded?.(false);
    ctx?.ui?.notify?.(
      "Trellis project context is available. Use /trellis-continue to resume the current task.",
      "info",
    );
  });
  pi.on?.("tool_result", (event, ctx) => {
    const toolEvent = event as {
      toolName?: string;
      details?: unknown;
    };
    if (toolEvent.toolName !== "subagent") return;
    trellisHideLiveWidget();
    ctx?.ui?.setToolsExpanded?.(false);
    return undefined;
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
    const perTurn = buildPerTurnInjection(contextKey);
    return {
      systemPrompt: [current, context, perTurn].filter(Boolean).join("\n\n"),
    };
  });
  pi.on?.("context", (event, ctx) => {
    getContextKey(event, ctx);
    const messages = (event as PiContextEvent).messages;
    return Array.isArray(messages) ? { messages } : undefined;
  });
  pi.on?.("input", (event, ctx) => {
    const contextKey = getContextKey(event, ctx);
    const additionalContext = buildPerTurnInjection(contextKey);
    return additionalContext
      ? { action: "continue", additionalContext, systemPrompt: additionalContext }
      : { action: "continue" };
  });
  pi.on?.("tool_call", (event, ctx) => {
    const contextKey = getContextKey(event, ctx);
    injectTrellisContextIntoBash(event, contextKey);
    const toolEvent = event as { toolName?: string };
    if (toolEvent.toolName === "subagent" && ctx) {
      trellisLiveState.uiContext = ctx;
    }
    return undefined;
  });
}
