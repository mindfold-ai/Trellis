import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

// ── Types ──────────────────────────────────────────────────────────────
type JsonObject = Record<string, unknown>;
type TextContent = { type: "text"; text: string };
interface PiToolResult {
  content: TextContent[];
  details?: unknown;
}
interface PiExtensionContext {
  hasUI?: boolean;
  sessionManager?: {
    getSessionId?: () => string;
    getSessionFile?: () => string | undefined;
  };
  ui?: {
    notify?: (msg: string, type?: "info" | "warning" | "error") => void;
  };
}
interface SubagentInput {
  agent?: string;
  prompt?: string;
  mode?: "single" | "parallel" | "chain";
  prompts?: string[];
  model?: string;
  thinking?: string;
}
interface AgentConfig {
  model?: string;
  thinking?: string;
  tools?: string[];
  fallbackModels: string[];
}
interface PiRunConfig {
  model?: string;
  thinking?: string;
  tools?: string[];
}

// ── Lazy-load pi-tui (avoid failing top-level imports) ─────────────────
let _piTui: {
  visibleWidth?: (s: string) => number;
  truncateToWidth?: (s: string, w: number, ellipsis?: string) => string;
} | null = null;
function piTui() {
  if (!_piTui) {
    try {
      _piTui = require("@earendil-works/pi-tui");
    } catch {
      _piTui = {};
    }
  }
  return _piTui;
}
function trunc(s: string, w: number) {
  const t = piTui();
  return t.truncateToWidth
    ? t.truncateToWidth(s, w, "…")
    : s.length <= w
      ? s
      : w > 1
        ? s.slice(0, w - 1) + "…"
        : s.slice(0, w);
}

// ── Constants ─────────────────────────────────────────────────────────
const TRELLIS_AGENT_JSONL: Record<string, string> = {
  "trellis-implement": "implement.jsonl",
  implement: "implement.jsonl",
  "trellis-check": "check.jsonl",
  check: "check.jsonl",
};
const MAX_STDOUT = 8 * 1024 * 1024;
const MAX_STDERR = 1024 * 1024;
const MAX_TAIL = 256 * 1024;
const MAX_LINE_BUFFER = 1024 * 1024;
const MAX_TOOL_ARG_CHARS = 2048;
const MAX_TOOLS = 256;
const MAX_PARALLEL_PROMPTS = 6;
const ABORT_KILL_GRACE_MS = 1500;
const SESSION_OVERVIEW_TIMEOUT_MS = 1500;
const THROTTLE_MS = 500;

// ── State types ───────────────────────────────────────────────────────
type RunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
type ToolStatus = "running" | "succeeded" | "failed";

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  ctxTokens: number;
  turns: number;
}
interface ToolTrace {
  id: string;
  name: string;
  args: string;
  status: ToolStatus;
  startedAt: number;
  finishedAt?: number;
}
interface RunState {
  id: string;
  agent: string;
  prompt: string;
  step?: number;
  status: RunStatus;
  startedAt?: number;
  finishedAt?: number;
  finalText: string;
  textTail: string;
  thinkingTail: string;
  stderrTail: string;
  tools: ToolTrace[];
  usage: Usage;
  model?: string;
  thinking?: string;
  errorMessage?: string;
}
interface ProgressDetails {
  kind: "trellis-subagent-progress";
  agent: string;
  mode: "single" | "parallel" | "chain";
  startedAt: number;
  updatedAt: number;
  final: boolean;
  runs: RunState[];
}

// ── Native partial-update card state ──────────────────────────────────
interface NativeCardHandle {
  state: JsonObject;
  invalidate: () => void;
  updatedAt: number;
}
const MAX_NATIVE_CARDS = 20;
const nativeCards = new Map<string, NativeCardHandle>();
let activeSubagentToolCallId: string | null = null;
function rememberNativeCard(id: string, card: NativeCardHandle) {
  nativeCards.set(id, card);
  const active = activeSubagentToolCallId
    ? nativeCards.get(activeSubagentToolCallId)
    : undefined;
  if (!active || card.updatedAt >= active.updatedAt)
    activeSubagentToolCallId = id;
  for (const key of nativeCards.keys()) {
    if (nativeCards.size <= MAX_NATIVE_CARDS) break;
    if (key !== activeSubagentToolCallId) nativeCards.delete(key);
  }
}
function totalUsage(d: ProgressDetails): Usage {
  const u: Usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    ctxTokens: 0,
    turns: 0,
  };
  for (const r of d.runs) {
    u.input += r.usage.input;
    u.output += r.usage.output;
    u.cacheRead += r.usage.cacheRead;
    u.cacheWrite += r.usage.cacheWrite;
    u.cost += r.usage.cost;
    u.ctxTokens = Math.max(u.ctxTokens, r.usage.ctxTokens);
    u.turns += r.usage.turns;
  }
  return u;
}
function activeRun(d: ProgressDetails) {
  return d.runs.find((r) => r.status === "running") ?? d.runs.at(-1);
}
function toolArgs(t: ToolTrace) {
  try {
    return JSON.parse(t.args) as Record<string, unknown>;
  } catch {
    return {};
  }
}
function bashCommand(t: ToolTrace) {
  const a = toolArgs(t);
  return String(a.command || "").toLowerCase();
}
function isSearchTool(t: ToolTrace) {
  return t.name === "read" || t.name === "grep" || t.name === "find";
}
function isMutationTool(t: ToolTrace) {
  return t.name === "edit" || t.name === "write";
}
function isValidationCommand(t: ToolTrace) {
  const c = bashCommand(t);
  return /\b(test|typecheck|lint|build|gofmt|go test|npm run|pnpm|vitest|tsc)\b/.test(
    c,
  );
}
function isInspectionCommand(t: ToolTrace) {
  const c = bashCommand(t);
  return /\b(rg|grep|find|git diff|git status|ls|tree)\b/.test(c);
}
function thinkingIntent(text: string) {
  const s = text.toLowerCase();
  if (/error|failed|failure|panic|exception|报错|失败|错误|异常/.test(s))
    return "Analyzing failure cause";
  if (/test|verify|check|typecheck|lint|验证|测试|检查/.test(s))
    return "Planning verification steps";
  if (/plan|approach|design|strategy|方案|计划|思路|设计/.test(s))
    return "Structuring the implementation approach";
  if (/implement|change|edit|modify|refactor|实现|修改|重构/.test(s))
    return "Reasoning through code changes";
  if (/inspect|search|locate|read|context|定位|搜索|阅读|上下文/.test(s))
    return "Locating relevant context";
  return "";
}
function behaviorSummary(r: RunState) {
  if (r.status === "succeeded") return "Task completed and result returned";
  if (r.status === "failed")
    return "Task failed and error details were retained";

  const runningTool = r.tools.findLast((t) => t.status === "running");
  if (runningTool) {
    if (isMutationTool(runningTool)) return "Applying the plan to code";
    if (runningTool.name === "bash" && isValidationCommand(runningTool))
      return "Verifying whether the implementation passes";
    if (runningTool.name === "bash" && isInspectionCommand(runningTool))
      return "Inspecting current code state";
    if (isSearchTool(runningTool)) return "Locating relevant code and context";
    if (runningTool.name === "bash")
      return "Validating assumptions with commands";
    return "Using tools to advance the task";
  }

  const recent = r.tools.slice(-5);
  if (recent.some((t) => t.status === "failed"))
    return "Investigating tool or command failure";
  if (recent.some(isMutationTool)) return "Reviewing recent changes";
  if (recent.some((t) => t.name === "bash" && isValidationCommand(t)))
    return "Analyzing verification results";
  if (
    recent.length >= 2 &&
    recent.every(
      (t) => isSearchTool(t) || (t.name === "bash" && isInspectionCommand(t)),
    )
  )
    return "Mapping code structure and impact";

  const intent = thinkingIntent(`${r.thinkingTail}\n${r.textTail}`);
  if (intent) return intent;
  if (!r.tools.length) return "Understanding the task and planning execution";
  return "Advancing the task and preparing next steps";
}
function progressState(d: ProgressDetails) {
  const running = d.runs.filter((r) => r.status === "running").length;
  const failed = d.runs.some((r) => r.status === "failed");
  return failed
    ? "failed"
    : d.final
      ? "completed"
      : running
        ? `${running} running`
        : "pending";
}
function progressDone(d: ProgressDetails) {
  return d.runs.filter((r) => r.status !== "pending" && r.status !== "running")
    .length;
}
function summaryText(text: string) {
  return `${text.trim().replace(/[。.!?…]+$/u, "")}...`;
}
function splitModelThinking(model?: string, fallbackThinking?: string) {
  const m = model?.match(/^(.*):(off|minimal|low|medium|high|xhigh)$/i);
  return {
    model: m ? m[1] : model,
    thinking: (m?.[2] ?? fallbackThinking)?.toLowerCase(),
  };
}
function modelLabel(r: RunState) {
  const { model, thinking } = splitModelThinking(r.model, r.thinking);
  if (!model) return undefined;
  return thinking && thinking !== "off" ? `${model}(${thinking})` : model;
}
function applyRunConfig(r: RunState, cfg: PiRunConfig) {
  const parsed = splitModelThinking(cfg.model, cfg.thinking);
  r.model = parsed.model;
  r.thinking = parsed.thinking;
}
function runElapsed(d: ProgressDetails, r: RunState) {
  const start = r.startedAt ?? d.startedAt;
  const end =
    r.finishedAt ?? (r.status === "running" ? Date.now() : d.updatedAt);
  return fmtDur(Math.max(0, end - start));
}
function runHeader(d: ProgressDetails, r: RunState) {
  const usage = fmtUsage(r.usage, modelLabel(r)) || fmtUsage(totalUsage(d));
  return `${r.agent} · ${progressDone(d)}/${d.runs.length} done · ${progressState(d)} · ${runElapsed(d, r)}${usage ? ` · ${usage}` : ""}`;
}
function renderRunBlock(
  lines: string[],
  d: ProgressDetails,
  run: RunState,
  expanded: boolean,
) {
  const step = run.step ? `step ${run.step} · ` : "";
  lines.push(`  - ${step}${runHeader(d, run)}`);
  const summary = behaviorSummary(run);
  if (summary) lines.push(`    › ${summaryText(summary)}`);
  const visibleTools = expanded ? run.tools.slice(-8) : run.tools.slice(-1);
  for (const t of visibleTools)
    lines.push(`    ${toolIcon(t.status)} ${toolBrief(t)}`);
  if (expanded && run.errorMessage) {
    lines.push(`    ✗ ${oneLine(run.errorMessage, 120)}`);
  }
}
function renderProgressCard(
  d: ProgressDetails,
  expanded: boolean,
  w: number,
): string[] {
  const r = activeRun(d);
  if (!r) return [];
  const spinner = ["◐", "◓", "◑", "◒"][Math.floor(Date.now() / 250) % 4]!;
  const icon = d.final
    ? d.runs.some((x) => x.status === "failed")
      ? "✗"
      : "✓"
    : spinner;
  const totalElapsed = fmtDur(
    (d.final ? d.updatedAt : Date.now()) - d.startedAt,
  );
  const lines: string[] = [
    `${icon} subagent ${d.mode} · total ${totalElapsed}`,
  ];

  if (!expanded) {
    renderRunBlock(lines, d, r, false);
    lines.push("  Alt+O expand latest subagent card");
    return lines.map((l) => trunc(l, w));
  }

  for (const run of d.runs) renderRunBlock(lines, d, run, true);
  lines.push("  Alt+O collapse latest subagent card");
  const max = 48;
  const shown =
    lines.length > max
      ? [
          ...lines.slice(0, max - 1),
          `  … ${lines.length - max + 1} lines hidden`,
        ]
      : lines;
  return shown.map((l) => trunc(l, w));
}
function progressKey(d: ProgressDetails) {
  return d.runs
    .map((r) => {
      const t = r.tools.at(-1);
      return [
        r.id,
        r.status,
        r.tools.length,
        t?.id ?? "",
        t?.status ?? "",
        r.usage.turns,
        r.usage.input,
        r.usage.output,
        r.usage.cacheRead,
        r.usage.cacheWrite,
        r.usage.ctxTokens,
        r.model ?? "",
        r.thinking ?? "",
        r.errorMessage ?? "",
      ].join("~");
    })
    .join("|");
}

// ── Utilities ─────────────────────────────────────────────────────────
function isObj(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function hash(s: string) {
  return createHash("sha256").update(s).digest("hex").slice(0, 24);
}
function readText(p: string) {
  try {
    return readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}
function exists(p: string) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
function shellQuote(v: string) {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}
function callStr(cb: (() => string | undefined) | undefined): string | null {
  if (!cb) return null;
  try {
    return str(cb());
  } catch {
    return null;
  }
}
function lookupStr(data: unknown, keys: string[]): string | null {
  if (!isObj(data)) return null;
  for (const k of keys) {
    const v = str(data[k]);
    if (v) return v;
  }
  for (const nk of [
    "input",
    "properties",
    "event",
    "hook_input",
    "hookInput",
  ]) {
    const nested = data[nk];
    const v = lookupStr(nested, keys);
    if (v) return v;
  }
  return null;
}
function cmdHasTrellisCtx(cmd: string) {
  const t = cmd.trimStart();
  return (
    /^export\s+TRELLIS_CONTEXT_ID=/.test(t) ||
    /^TRELLIS_CONTEXT_ID=/.test(t) ||
    /^env\s+.*TRELLIS_CONTEXT_ID=/.test(t)
  );
}
function fmtDur(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}
function fmtNum(n: number) {
  if (!n) return "0";
  if (Math.abs(n) < 1000) return `${n}`;
  if (Math.abs(n) < 1000000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1000000).toFixed(1)}m`;
}
function fmtUsage(u: Usage, m?: string) {
  const p: string[] = [];
  if (u.turns) p.push(`${u.turns}t`);
  if (u.input) p.push(`↑${fmtNum(u.input)}`);
  if (u.output) p.push(`↓${fmtNum(u.output)}`);
  if (u.cost) p.push(`$${u.cost.toFixed(3)}`);
  if (u.ctxTokens) p.push(`ctx:${fmtNum(u.ctxTokens)}`);
  if (m) p.push(m);
  return p.join(" ");
}
function statusIcon(s: RunStatus) {
  return s === "pending"
    ? "○"
    : s === "running"
      ? "●"
      : s === "succeeded"
        ? "✓"
        : s === "failed"
          ? "✗"
          : "⊘";
}
function toolIcon(s: ToolStatus) {
  return s === "running" ? "•" : s === "succeeded" ? "✓" : "✗";
}
function latest(text: string, n: number) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .slice(-n);
}
function appendTail(cur: string, next: string, max: number) {
  if (!next) return cur;
  const c = cur + next;
  return c.length <= max ? c : c.slice(-max);
}
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) =>
      isObj(b) && b.type === "text" && typeof b.text === "string" ? b.text : "",
    )
    .join("");
}
function extractThinking(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((b) =>
      isObj(b) && b.type === "thinking" && typeof b.thinking === "string"
        ? b.thinking
        : "",
    )
    .join("\n");
}
function newUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    ctxTokens: 0,
    turns: 0,
  };
}
function newRun(
  id: string,
  agent: string,
  prompt: string,
  step?: number,
): RunState {
  return {
    id,
    agent,
    prompt: trunc(prompt.replace(/\s+/g, " ").trim(), 120) || "(empty)",
    step,
    status: "pending",
    finalText: "",
    textTail: "",
    thinkingTail: "",
    stderrTail: "",
    tools: [],
    usage: newUsage(),
  };
}
function cloneProgress(d: ProgressDetails): ProgressDetails {
  return {
    ...d,
    runs: d.runs.map((r) => ({
      ...r,
      tools: r.tools.map((t) => ({ ...t })),
      usage: { ...r.usage },
    })),
  };
}

function oneLine(v: unknown, max = 80) {
  return String(v || "...")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function summarizeToolArgs(name: string, args: unknown): string {
  const a = isObj(args) ? args : {};
  const summary: JsonObject = {};
  if ("path" in a) summary.path = oneLine(a.path, 240);
  if ("file_path" in a) summary.file_path = oneLine(a.file_path, 240);
  if ("command" in a) summary.command = oneLine(a.command, 240);
  if ("pattern" in a) summary.pattern = oneLine(a.pattern, 120);
  if ("limit" in a) summary.limit = a.limit;
  if ("offset" in a) summary.offset = a.offset;
  if (name === "edit" && Array.isArray(a.edits))
    summary.edits = `${a.edits.length} edit(s)`;
  if (name === "write" && "content" in a)
    summary.content = `<${String(a.content ?? "").length} chars>`;
  const json = JSON.stringify(
    Object.keys(summary).length ? summary : { tool: name },
  );
  return json.length <= MAX_TOOL_ARG_CHARS
    ? json
    : json.slice(0, MAX_TOOL_ARG_CHARS);
}
function toolBrief(t: ToolTrace): string {
  const a = toolArgs(t);
  if (t.name === "read") return `read: ${oneLine(a.path || a.file_path, 80)}`;
  if (t.name === "bash") return `bash: ${oneLine(a.command, 60)}`;
  if (t.name === "write") return `write: ${oneLine(a.path || a.file_path, 80)}`;
  if (t.name === "edit") return `edit: ${oneLine(a.path || a.file_path, 80)}`;
  if (t.name === "grep") return `grep: ${oneLine(a.pattern, 50)}`;
  if (t.name === "find") return `find: ${oneLine(a.pattern || "*", 50)}`;
  return oneLine(t.name, 50);
}

// ── Pi CLI path resolution ────────────────────────────────────────────
const PI_CLI_SEGMENTS = [
  ["node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"],
  ["node_modules", "@mariozechner", "pi-coding-agent", "dist", "cli.js"],
];

function resolvePiCli(): { command: string; args: string[] } {
  const envCli = str(process.env.TRELLIS_PI_CLI_JS);
  if (envCli) {
    const p = resolve(envCli);
    if (!exists(p)) throw new Error(`TRELLIS_PI_CLI_JS missing: ${p}`);
    return { command: process.execPath, args: [p] };
  }
  const candidates: string[] = [];
  for (const arg of process.argv)
    if (/pi-coding-agent[\\/]dist[\\/]cli\.js$/i.test(arg))
      candidates.push(resolve(arg));
  const prefix =
    str(process.env.npm_config_prefix) ?? str(process.env.NPM_CONFIG_PREFIX);
  const appData = str(process.env.APPDATA);
  const pathVal = process.env.PATH ?? process.env.Path ?? "";
  const addBase = (base: string) => {
    for (const seg of PI_CLI_SEGMENTS) candidates.push(join(base, ...seg));
  };
  if (prefix) {
    addBase(prefix);
    addBase(join(prefix, "lib"));
  }
  if (appData) addBase(join(appData, "npm"));
  for (const entry of pathVal.split(delimiter)) {
    const e = entry.trim();
    if (!e) continue;
    addBase(e);
    addBase(dirname(e));
    addBase(join(dirname(e), "lib"));
  }
  for (const c of [...new Set(candidates)])
    if (exists(c)) return { command: process.execPath, args: [c] };
  return { command: "pi", args: [] };
}

function resolveRunCfg(
  input: SubagentInput,
  agentCfg: AgentConfig,
  inheritedThinking?: string,
): PiRunConfig {
  const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
  const normalize = (v: unknown): string | undefined => {
    const s = typeof v === "string" && v.trim() ? v.trim().toLowerCase() : "";
    return THINKING_LEVELS.includes(s) ? s : undefined;
  };
  const suffixRe = /:(off|minimal|low|medium|high|xhigh)$/i;
  const inputModel = str(input.model);
  const agentModel = agentCfg.model;
  const rawModel = inputModel ?? agentModel;
  const inputSuffixThinking = normalize(inputModel?.match(suffixRe)?.[1]);
  const agentSuffixThinking = normalize(agentModel?.match(suffixRe)?.[1]);
  const baseModel = rawModel?.replace(suffixRe, "");
  const thinking =
    normalize(input.thinking) ??
    inputSuffixThinking ??
    normalize(agentCfg.thinking) ??
    agentSuffixThinking ??
    normalize(inheritedThinking);
  if (baseModel && thinking && thinking !== "off")
    return { model: `${baseModel}:${thinking}`, thinking, tools: agentCfg.tools };
  return { model: baseModel || rawModel, thinking, tools: agentCfg.tools };
}

function buildPiArgs(cfg: PiRunConfig): string[] {
  const args = ["--mode", "json", "-p", "--no-session"];
  if (cfg.model)
    args.push(
      "--model",
      cfg.thinking && cfg.thinking !== "off" && !cfg.model.includes(":")
        ? `${cfg.model}:${cfg.thinking}`
        : cfg.model,
    );
  else if (cfg.thinking && cfg.thinking !== "off")
    args.push("--thinking", cfg.thinking);
  if (cfg.tools && cfg.tools.length > 0)
    args.push("--tools", cfg.tools.join(","));
  return args;
}

// ── BoundedBufferCollector ─────────────────────────────────────────────
class BBC {
  private c: Buffer[] = [];
  private len = 0;
  private trunc = 0;
  constructor(private max: number) {}
  append(b: Buffer) {
    if (b.length >= this.max) {
      this.trunc += this.len + b.length - this.max;
      this.c = [b.subarray(b.length - this.max)];
      this.len = this.max;
      return;
    }
    this.c.push(b);
    this.len += b.length;
    while (this.len > this.max) {
      const f = this.c[0]!;
      if (f.length <= this.len - this.max) {
        this.c.shift();
        this.len -= f.length;
        this.trunc += f.length;
      } else {
        const ov = this.len - this.max;
        this.c[0] = f.subarray(ov);
        this.len -= ov;
        this.trunc += ov;
        break;
      }
    }
  }
  toString() {
    const body = Buffer.concat(this.c, this.len).toString("utf-8");
    return this.trunc ? `[${this.trunc} bytes truncated]\n${body}` : body;
  }
}

// ── Trellis Context ────────────────────────────────────────────────────
function findRoot(start: string): string {
  let c = resolve(start);
  while (true) {
    if (existsSync(join(c, ".trellis")) || existsSync(join(c, ".pi"))) return c;
    const p = dirname(c);
    if (p === c) return resolve(start);
    c = p;
  }
}
function splitFM(c: string) {
  const m = c.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m
    ? { fm: m[1] ?? "", body: c.slice(m[0].length) }
    : { fm: "", body: c };
}
function stripFM(c: string) {
  return splitFM(c).body.trimStart();
}
function parseAgentFM(c: string): AgentConfig {
  const cfg: AgentConfig = { fallbackModels: [] };
  const { fm } = splitFM(c);
  const lines = fm.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = (lines[i] ?? "").match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1] ?? "",
      v = m[2] ?? "";
    if (k === "model")
      cfg.model = v.trim().replace(/^["']|["']$/g, "") || undefined;
    else if (k === "thinking")
      cfg.thinking = (v.trim().replace(/^["']|["']$/g, "") || undefined) as
        | string
        | undefined;
    else if (k === "fallbackModels" || k === "fallback_models") {
      if (v.trim()) {
        cfg.fallbackModels = v
          .trim()
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else {
        i++;
        while (i < lines.length && /^\s+-\s/.test(lines[i] ?? "")) {
          const item = (lines[i] ?? "")
            .trim()
            .replace(/^-\s+/, "")
            .replace(/^["']|["']$/g, "");
          if (item) cfg.fallbackModels.push(item);
          i++;
        }
        i--;
      }
    } else if (k === "tools") {
      // Pi tool names are lowercase (read, bash, edit, write, grep, find, ls).
      // Normalize to lowercase so mixed-case frontmatter still matches.
      if (v.trim()) {
        cfg.tools = v
          .trim()
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, "").toLowerCase())
          .filter(Boolean);
      }
    }
  }
  return cfg;
}

function contextKey(input?: unknown, ctx?: PiExtensionContext): string | null {
  const ov = str(process.env.TRELLIS_CONTEXT_ID);
  if (ov) return ov.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 160) || hash(ov);
  const sessionId =
    callStr(ctx?.sessionManager?.getSessionId) ??
    str(process.env.PI_SESSION_ID) ??
    str(process.env.PI_SESSIONID) ??
    lookupStr(input, ["session_id", "sessionId", "sessionID"]);
  if (sessionId)
    return `pi_${sessionId.replace(/[^A-Za-z0-9._-]+/g, "_") || hash(sessionId)}`;
  const transcriptPath =
    callStr(ctx?.sessionManager?.getSessionFile) ??
    lookupStr(input, ["transcript_path", "transcriptPath", "transcript"]);
  if (transcriptPath) return `pi_transcript_${hash(transcriptPath)}`;
  return null;
}

function readTaskDir(root: string, key: string | null): string | null {
  if (!key) return null;
  try {
    const ctx = JSON.parse(
      readText(join(root, ".trellis", ".runtime", "sessions", `${key}.json`)),
    ) as JsonObject;
    let ref = str(ctx.current_task);
    if (!ref) return null;
    ref = ref;
    ref = ref.replace(/\\/g, "/").replace(/^\.\//, "");
    if (ref.startsWith("tasks/")) ref = `.trellis/${ref}`;
    return ref.startsWith(".trellis/")
      ? join(root, ref)
      : isAbsolute(ref)
        ? ref
        : join(root, ".trellis", "tasks", ref);
  } catch {
    return null;
  }
}
function sessionHasTask(root: string, key: string): boolean {
  try {
    const ctx = JSON.parse(
      readText(join(root, ".trellis", ".runtime", "sessions", `${key}.json`)),
    ) as JsonObject;
    return !!str(ctx.current_task);
  } catch {
    return false;
  }
}
function adoptKey(root: string, key: string): string {
  if (sessionHasTask(root, key)) return key;
  try {
    const dir = join(root, ".trellis", ".runtime", "sessions");
    const keys = readdirSync(dir)
      .filter(
        (f) => f.endsWith(".json") && sessionHasTask(root, f.slice(0, -5)),
      )
      .map((f) => f.slice(0, -5));
    const proc = keys.filter((k) => k.startsWith("pi_process_"));
    const cands = proc.length ? proc : keys;
    return cands.length === 1 ? cands[0]! : key;
  } catch {
    return key;
  }
}

// ── Workflow State Breadcrumb ─────────────────────────────────────────
const WF_RE =
  /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n([\s\S]*?)\n\s*\[\/workflow-state:\1\]/g;
function workflowBreadcrumb(root: string, key: string | null): string {
  const wf = readText(join(root, ".trellis", "workflow.md"));
  if (!wf) return "";
  const templates: Record<string, string> = {};
  for (const m of wf.matchAll(WF_RE)) {
    const s = m[1] ?? "",
      b = (m[2] ?? "").trim();
    if (s && b) templates[s] = b;
  }
  const dir = readTaskDir(root, key);
  let header = "Status: no_task",
    lookup = "no_task";
  if (dir) {
    try {
      const d = JSON.parse(readText(join(dir, "task.json"))) as JsonObject;
      const status = str(d.status) ?? "";
      const id = str(d.id) ?? dir.split(/[\\/]/).pop() ?? "";
      if (status) {
        header = `Task: ${id} (${status})`;
        lookup = status;
      }
    } catch {}
  }
  const body = templates[lookup] ?? "Refer to workflow.md for current step.";
  return `<workflow-state>\n${header}\n${body}\n</workflow-state>`;
}

// ── Session Overview ───────────────────────────────────────────────────
function sessionOverview(root: string, key: string | null): string {
  const script = join(root, ".trellis", "scripts", "get_context.py");
  if (!exists(script)) return "";
  try {
    const py = process.platform === "win32" ? "python" : "python3";
    const result = spawnSync(py, [script], {
      cwd: root,
      env: key ? { ...process.env, TRELLIS_CONTEXT_ID: key } : process.env,
      encoding: "utf-8",
      timeout: SESSION_OVERVIEW_TIMEOUT_MS,
      windowsHide: true,
    });
    if (result.status !== 0) return "";
    const stdout = (result.stdout ?? "").trim();
    return stdout ? `<session-overview>\n${stdout}\n</session-overview>` : "";
  } catch {
    return "";
  }
}

function buildContext(root: string, agent: string, key: string | null): string {
  const dir = readTaskDir(root, key);
  if (!dir)
    return "No active Trellis task found. Read .trellis/ before proceeding.";
  const prd = readText(join(dir, "prd.md"));
  const design = readText(join(dir, "design.md"));
  const impl = readText(join(dir, "implement.md"));
  const jsonlName = TRELLIS_AGENT_JSONL[agent] ?? "";
  let spec = "";
  if (jsonlName) {
    const chunks: string[] = [];
    for (const line of readText(join(dir, jsonlName)).split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const r = JSON.parse(t) as JsonObject;
        const f = typeof r.file === "string" ? r.file : "";
        if (f) {
          const c = readText(join(root, f));
          if (c) chunks.push(`## ${f}\n\n${c}`);
        }
      } catch {}
    }
    spec = chunks.join("\n\n---\n\n");
  }
  return [
    `## Trellis Task Context`,
    `Task directory: ${dir}`,
    "",
    "### prd.md",
    prd || "(missing)",
    design ? "\n### design.md\n" + design : "",
    impl ? "\n### implement.md\n" + impl : "",
    spec ? "\n### Curated Spec / Research Context\n" + spec : "",
  ].join("\n");
}

function normalizeAgent(agent: string | undefined): string {
  const name = agent ?? "trellis-implement";
  return name.startsWith("trellis-") ? name : `trellis-${name}`;
}

function isTrellisAgent(root: string, agent: string): boolean {
  return existsSync(join(root, ".pi", "agents", `${agent}.md`));
}

function buildPrompt(
  root: string,
  input: SubagentInput,
  key: string | null,
): string {
  const agent = normalizeAgent(input.agent);
  const raw = readText(join(root, ".pi", "agents", `${agent}.md`));
  const def = stripFM(raw);
  const ctx = buildContext(root, agent, key);
  return [
    "## Trellis Agent Definition",
    def || "(missing)",
    "",
    ctx,
    "",
    "## Delegated Task",
    input.prompt ?? "",
  ].join("\n");
}

// ── Event parsing ─────────────────────────────────────────────────────
function parseJsonEvent(line: string): JsonObject | null {
  const t = line.trim();
  if (!t) return null;
  const i = t.indexOf("{");
  if (i < 0) return null;
  try {
    const p = JSON.parse(t.slice(i));
    return isObj(p) ? p : null;
  } catch {
    return null;
  }
}

function applyEvent(r: RunState, evt: JsonObject): boolean {
  const type = typeof evt.type === "string" ? evt.type : "";
  if (!type) return false;
  if (type === "agent_start" || type === "turn_start") {
    r.status = "running";
    r.startedAt ??= Date.now();
    return true;
  }
  if (type === "message_update") {
    const ae = isObj(evt.assistantMessageEvent)
      ? evt.assistantMessageEvent
      : null;
    if (!ae || typeof ae.delta !== "string") return false;
    if (ae.type === "thinking_delta") {
      r.thinkingTail = appendTail(r.thinkingTail, ae.delta, MAX_TAIL);
      return true;
    }
    if (ae.type === "text_delta") {
      r.textTail = appendTail(r.textTail, ae.delta, MAX_TAIL);
      return true;
    }
    return false;
  }
  if (type === "message_end" && isObj(evt.message)) {
    const msg = evt.message;
    if (msg.role !== "assistant") return false;
    r.usage.turns += 1;
    const u = isObj(msg.usage) ? msg.usage : null;
    const cost = isObj(u?.cost) ? u.cost : null;
    r.usage.input += num(u?.input);
    r.usage.output += num(u?.output);
    r.usage.cacheRead += num(u?.cacheRead);
    r.usage.cacheWrite += num(u?.cacheWrite);
    r.usage.cost += num(cost?.total);
    r.usage.ctxTokens = num(u?.totalTokens);
    const thinking = extractThinking(msg.content);
    if (thinking) r.thinkingTail = appendTail("", thinking, MAX_TAIL);
    const text = extractText(msg.content);
    if (text) {
      r.finalText = text;
      r.textTail = appendTail("", text, MAX_TAIL);
    }
    if (typeof msg.model === "string") {
      const parsed = splitModelThinking(msg.model, r.thinking);
      r.model = parsed.model;
      r.thinking = parsed.thinking;
    }
    if (typeof msg.errorMessage === "string") r.errorMessage = msg.errorMessage;
    return true;
  }
  if (type === "tool_execution_start") {
    const id =
      typeof evt.toolCallId === "string"
        ? evt.toolCallId
        : hash(`${Date.now()}`);
    const name = typeof evt.toolName === "string" ? evt.toolName : "tool";
    const args = summarizeToolArgs(name, evt.args);
    const existing = r.tools.findIndex((t) => t.id === id);
    if (existing >= 0)
      r.tools[existing] = { ...r.tools[existing]!, args, status: "running" };
    else
      r.tools.push({
        id,
        name,
        args,
        status: "running",
        startedAt: Date.now(),
      });
    if (r.tools.length > MAX_TOOLS)
      r.tools.splice(0, r.tools.length - MAX_TOOLS);
    return true;
  }
  if (type === "tool_execution_end") {
    const id = typeof evt.toolCallId === "string" ? evt.toolCallId : "";
    const idx = r.tools.findIndex((t) => t.id === id);
    if (idx >= 0)
      r.tools[idx] = {
        ...r.tools[idx]!,
        status: evt.isError ? "failed" : "succeeded",
        finishedAt: Date.now(),
      };
    return true;
  }
  if (type === "agent_end") {
    r.finishedAt = Date.now();
    if (r.status === "running" || r.status === "pending")
      r.status = "succeeded";
    return true;
  }
  return false;
}

function finalize(r: RunState, fallback: string): string {
  return r.finalText || fallback.trim() || r.stderrTail.trim();
}
function formatPiOutput(stdout: string, stderr: string): string {
  let ft = "";
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const evt = JSON.parse(t) as JsonObject;
      const msg = isObj(evt.message) ? evt.message : null;
      if (msg?.role === "assistant") {
        const txt = extractText(msg.content);
        if (txt) ft = txt;
      }
    } catch {}
  }
  return ft || stdout || stderr;
}

// ── runPi: subprocess execution + event processing ───────────────────
function runPi(
  root: string,
  prompt: string,
  cfg: PiRunConfig,
  state: RunState,
  emit: () => void,
  key?: string | null,
  signal?: AbortSignal,
): Promise<{ output: string; failed: boolean }> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      state.status = "cancelled";
      state.errorMessage = "cancelled";
      state.finishedAt = Date.now();
      emit();
      resolve({ output: "cancelled", failed: true });
      return;
    }
    const inv = resolvePiCli();
    const childEnv = {
      ...process.env,
      TRELLIS_SUBAGENT_CHILD: "1",
      ...(key ? { TRELLIS_CONTEXT_ID: key } : {}),
    };
    const cli = spawn(inv.command, [...inv.args, ...buildPiArgs(cfg)], {
      cwd: root,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = new BBC(MAX_STDOUT);
    const stderr = new BBC(MAX_STDERR);
    let buf = "";
    let settled = false;
    let aborted = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    const abort = () => {
      aborted = true;
      cli.kill();
      killTimer = setTimeout(() => {
        if (!settled && cli.exitCode === null) cli.kill("SIGKILL");
      }, ABORT_KILL_GRACE_MS);
      killTimer?.unref?.();
    };
    const done = (v: { output: string; failed: boolean }) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      emit();
      resolve(v);
    };
    signal?.addEventListener("abort", abort, { once: true });
    state.status = "running";
    state.startedAt = Date.now();
    emit();
    const processLine = (line: string) => {
      const evt = parseJsonEvent(line);
      if (evt && applyEvent(state, evt)) emit();
    };
    cli.stdout?.on("data", (d: Buffer) => {
      stdout.append(d);
      buf += d.toString("utf-8");
      if (buf.length > MAX_LINE_BUFFER) buf = buf.slice(-MAX_LINE_BUFFER);
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const l of lines) processLine(l);
    });
    cli.stderr?.on("data", (d: Buffer) => {
      stderr.append(d);
      state.stderrTail = appendTail(
        state.stderrTail,
        d.toString("utf-8"),
        MAX_TAIL,
      );
    });
    cli.stdin?.on("error", (e: Error & { code?: string }) => {
      if (!aborted && e.code !== "EPIPE")
        done({ output: e.message, failed: true });
    });
    cli.on("error", (e) => {
      state.status = aborted ? "cancelled" : "failed";
      state.errorMessage = e instanceof Error ? e.message : String(e);
      state.finishedAt = Date.now();
      done({ output: finalize(state, state.errorMessage), failed: true });
    });
    cli.on("close", (code) => {
      if (buf.trim()) processLine(buf);
      const out = stdout.toString();
      const err = stderr.toString();
      state.stderrTail = appendTail("", err, MAX_TAIL);
      state.finishedAt = Date.now();
      if (aborted) {
        state.status = "cancelled";
        state.errorMessage = "cancelled";
        done({ output: finalize(state, "cancelled"), failed: true });
        return;
      }
      if (code === 0) {
        if (state.status === "pending" || state.status === "running")
          state.status = "succeeded";
        done({
          output: finalize(state, formatPiOutput(out, err)),
          failed: false,
        });
        return;
      }
      state.status = "failed";
      state.errorMessage = err || out || `exit ${code ?? "?"}`;
      done({ output: finalize(state, state.errorMessage), failed: true });
    });
    cli.stdin?.end(prompt);
  });
}

// ── runSubagent: orchestrate single/parallel/chain via native partial updates ──
async function runSubagent(
  root: string,
  input: SubagentInput,
  key: string | null,
  signal?: AbortSignal,
  onUpdate?: (r: PiToolResult) => void,
  inheritedThinking?: string,
): Promise<{ output: string; details: ProgressDetails; failed: boolean }> {
  const agentName = normalizeAgent(input.agent);
  const agentRaw = readText(join(root, ".pi", "agents", `${agentName}.md`));
  const agentCfg = parseAgentFM(agentRaw);
  const runCfg = resolveRunCfg(input, agentCfg, inheritedThinking);
  const mode = input.mode ?? "single";
  const startedAt = Date.now();
  const details: ProgressDetails = {
    kind: "trellis-subagent-progress",
    agent: agentName,
    mode,
    startedAt,
    updatedAt: startedAt,
    final: false,
    runs: [],
  };
  let lastEmit = 0;
  let lastPartialKey = "";
  let closed = false;
  const pushPartial = (force = false) => {
    if (closed || !onUpdate) return;
    const key = progressKey(details);
    if (!force && key === lastPartialKey) return;
    lastPartialKey = key;
    onUpdate({
      // Keep native partial content stable; renderResult owns the visible progress UI.
      content: [{ type: "text", text: "subagent running" }],
      details: cloneProgress(details),
    });
  };
  const emit = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < THROTTLE_MS) return;
    lastEmit = now;
    details.updatedAt = now;
    pushPartial(force);
  };
  const finish = (output: string, failed: boolean) => {
    closed = true;
    details.final = true;
    details.updatedAt = Date.now();
    return { output, details: cloneProgress(details), failed };
  };

  try {
    if (mode === "parallel") {
      const prompts = input.prompts ?? (input.prompt ? [input.prompt] : []);
      details.runs = prompts.map((p, i) => {
        const r = newRun(`${agentName}-${i + 1}`, agentName, p);
        applyRunConfig(r, runCfg);
        return r;
      });
      emit(true);
      const results = await Promise.all(
        prompts.map((p, i) =>
          runPi(
            root,
            buildPrompt(root, { ...input, prompt: p }, key),
            runCfg,
            details.runs[i]!,
            emit,
            key,
            signal,
          ),
        ),
      );
      return finish(
        results.map((r) => r.output).join("\n\n---\n\n"),
        results.some((r) => r.failed),
      );
    }
    if (mode === "chain") {
      let prev = "";
      let failed = false;
      for (let i = 0; i < (input.prompts?.length ?? 1); i++) {
        const p = input.prompts?.[i] ?? input.prompt ?? "";
        const rs = newRun(`${agentName}-${i + 1}`, agentName, p, i + 1);
        applyRunConfig(rs, runCfg);
        details.runs.push(rs);
        emit(true);
        const result = await runPi(
          root,
          buildPrompt(
            root,
            {
              ...input,
              prompt: prev ? `${p}\n\nPrevious output:\n${prev}` : p,
            },
            key,
          ),
          runCfg,
          rs,
          emit,
          key,
          signal,
        );
        prev = result.output;
        failed = failed || result.failed;
        if (result.failed) break;
      }
      return finish(prev, failed);
    }
    const rs = newRun(`${agentName}-1`, agentName, input.prompt ?? "");
    applyRunConfig(rs, runCfg);
    details.runs = [rs];
    emit(true);
    const result = await runPi(
      root,
      buildPrompt(root, input, key),
      runCfg,
      rs,
      emit,
      key,
      signal,
    );
    return finish(result.output, result.failed);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const r = activeRun(details);
    if (r) {
      r.status = "failed";
      r.errorMessage = message;
      r.finishedAt = Date.now();
    }
    return finish(message, true);
  }
}

// ── Extension ──────────────────────────────────────────────────────────
export default function trellisExtension(pi: {
  registerTool?: (tool: JsonObject) => void;
  registerShortcut?: (
    key: string,
    opts: {
      description?: string;
      handler: (ctx: PiExtensionContext) => unknown;
    },
  ) => void;
  on?: (
    event: string,
    handler: (event: unknown, ctx?: PiExtensionContext) => unknown,
  ) => void;
  getThinkingLevel?: () => string;
}): void {
  if (process.env.TRELLIS_SUBAGENT_CHILD === "1") return;
  const root = findRoot(process.cwd());
  const procKey = `pi_process_${hash([root, process.pid, Date.now(), randomBytes(8).toString("hex")].join(":"))}`;
  let curKey: string | null = null;

  const getKey = (input?: unknown, ctx?: PiExtensionContext) => {
    const k = adoptKey(root, contextKey(input, ctx) ?? curKey ?? procKey);
    curKey = k;
    return k;
  };

  // Per-turn cache to avoid double-spawning python
  let turnCache: {
    key: string | null;
    ts: number;
    wf: string;
    ov: string;
  } | null = null;
  const getTurnCtx = (k: string | null) => {
    const now = Date.now();
    if (turnCache && turnCache.key === k && now - turnCache.ts < 1500)
      return turnCache;
    turnCache = {
      key: k,
      ts: now,
      wf: workflowBreadcrumb(root, k),
      ov: sessionOverview(root, k),
    };
    return turnCache;
  };

  // Toggle only the latest subagent native card; do not use Pi global tool expansion.
  const toggleDetail = (ctx: PiExtensionContext) => {
    const id = activeSubagentToolCallId;
    const card = id ? nativeCards.get(id) : undefined;
    if (!card) {
      ctx.ui?.notify?.("No subagent card to toggle yet.", "warning");
      return;
    }
    card.state.localExpanded = card.state.localExpanded !== true;
    card.invalidate();
  };

  pi.registerShortcut?.("alt+o", {
    description: "Toggle latest subagent card details",
    handler: async (ctx: PiExtensionContext) => toggleDetail(ctx),
  });

  // Tool registration
  pi.registerTool?.({
    name: "trellis_subagent",
    label: "Trellis Subagent",
    description: "Run a Trellis project sub-agent with active task context.",
    promptSnippet:
      'Sub-agent dispatch protocol (Trellis): your dispatch prompt MUST start with one line "Active task: <task path from `task.py current`>" before any other instructions.',
    promptGuidelines: [
      'Use subagent for task delegation. Your dispatch prompt MUST start with "Active task: <task path from `task.py current`>".',
    ],
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
        mode: { type: "string", enum: ["single", "parallel", "chain"] },
        prompts: {
          type: "array",
          items: { type: "string" },
          maxItems: MAX_PARALLEL_PROMPTS,
        },
        model: {
          type: "string",
          description:
            "Optional Pi model override for the child sub-agent process.",
        },
        thinking: {
          type: "string",
          description:
            "Optional Pi thinking level override for the child sub-agent process.",
          enum: ["off", "minimal", "low", "medium", "high", "xhigh"],
        },
      },
    },
    execute: async (
      id: string,
      input: SubagentInput,
      signal?: AbortSignal,
      onUpdate?: (r: PiToolResult) => void,
      ctx?: PiExtensionContext,
    ) => {
      activeSubagentToolCallId = id;
      const agentName = normalizeAgent(input.agent);
      if (!isTrellisAgent(root, agentName)) {
        return {
          content: [
            {
              type: "text",
              text:
                "`trellis_subagent` is only for Trellis workflow agents with a definition file in .pi/agents/.\n\n" +
                `No definition found for: ${agentName}\n\n` +
                "For general-purpose sub-agents, use one of these community tools:\n" +
                "- `subagent` tool from npm:pi-subagents (nicobailon/pi-subagents)\n" +
                "- `Agent` tool from npm:@tintinweb/pi-subagents\n\n" +
                "If neither is installed, ask the user to either:\n" +
                `- Create .pi/agents/${agentName}.md for your custom Trellis agent\n` +
                "- Install a community subagent package: pi install -l npm:@tintinweb/pi-subagents",
            },
          ],
          details: { agent: agentName, error: "not a trellis workflow agent" },
        };
      }
      const mode = input.mode ?? "single";
      const prompt = input.prompt?.trim();
      const prompts = input.prompts?.map((p) => p.trim()).filter(Boolean);
      if (mode === "single" && !prompt)
        throw new Error("subagent prompt is required for single mode");
      if (
        (mode === "parallel" || mode === "chain") &&
        !prompt &&
        !prompts?.length
      )
        throw new Error(
          "subagent prompt or prompts are required for parallel/chain mode",
        );
      if (
        mode === "parallel" &&
        prompts &&
        prompts.length > MAX_PARALLEL_PROMPTS
      )
        throw new Error(
          `subagent parallel mode supports at most ${MAX_PARALLEL_PROMPTS} prompts`,
        );
      const cleanInput: SubagentInput = {
        ...input,
        prompt,
        prompts: prompts?.length ? prompts : undefined,
      };
      const key = getKey(cleanInput, ctx);
      const inheritedThinking = pi.getThinkingLevel?.();
      const result = await runSubagent(
        root,
        cleanInput,
        key,
        signal,
        onUpdate,
        inheritedThinking,
      );
      return {
        content: [{ type: "text", text: result.output }],
        details: result.details,
      };
    },
    // Hide the call renderer so the native card only shows result/progress once.
    renderCall: () => ({
      render() {
        return [];
      },
      invalidate() {},
    }),
    renderResult: (
      result: PiToolResult,
      _opts?: { expanded?: boolean; isPartial?: boolean },
      _theme?: unknown,
      context?: unknown,
    ) => {
      const ctxObj = isObj(context) ? context : null;
      const toolCallId = str(ctxObj?.toolCallId);
      const state = isObj(ctxObj?.state) ? (ctxObj.state as JsonObject) : null;
      const invalidate =
        typeof ctxObj?.invalidate === "function"
          ? (ctxObj.invalidate as () => void)
          : null;
      const isProgress =
        isObj(result.details) &&
        result.details.kind === "trellis-subagent-progress";
      if (toolCallId && state && invalidate) {
        const updatedAt = isProgress
          ? (result.details as ProgressDetails).updatedAt
          : Date.now();
        rememberNativeCard(toolCallId, { state, invalidate, updatedAt });
      }
      return {
        render(w: number) {
          if (isProgress) {
            const expanded = state?.localExpanded === true;
            return renderProgressCard(
              result.details as ProgressDetails,
              expanded,
              w,
            );
          }
          return [trunc(result.content?.[0]?.text ?? "(no output)", w)];
        },
        invalidate() {},
      };
    },
  });

  // Events
  pi.on?.("session_start", (event, ctx) => {
    getKey(event, ctx);
    ctx?.ui?.notify?.(
      "Trellis project context is available. Use /trellis-continue to resume the current task.",
      "info",
    );
  });
  pi.on?.("session_shutdown", () => {
    nativeCards.clear();
    activeSubagentToolCallId = null;
  });
  pi.on?.("tool_call", (event, ctx) => {
    const k = getKey(event, ctx);
    const ev = event as { toolName?: string; input?: JsonObject };
    if (
      ev.toolName === "bash" &&
      isObj(ev.input) &&
      typeof ev.input.command === "string" &&
      !cmdHasTrellisCtx(ev.input.command)
    )
      ev.input.command = `export TRELLIS_CONTEXT_ID=${shellQuote(k)}; ${ev.input.command}`;
  });
  // Preserve progress details from execute(); mark failed subagent results through
  // the official tool_result patch hook instead of throwing away renderer details.
  pi.on?.("tool_result", (event) => {
    const ev = event as { toolName?: string; details?: unknown };
    if (
      ev.toolName === "trellis_subagent" &&
      isObj(ev.details) &&
      ev.details.kind === "trellis-subagent-progress" &&
      Array.isArray(ev.details.runs) &&
      ev.details.runs.some(
        (r) => isObj(r) && (r.status === "failed" || r.status === "cancelled"),
      )
    )
      return { isError: true };
    return undefined;
  });
  pi.on?.("before_agent_start", (event, ctx) => {
    const k = getKey(event, ctx);
    const cur = (event as { systemPrompt?: string }).systemPrompt ?? "";
    const ctxText = buildContext(root, "trellis-implement", k);
    const { wf, ov } = getTurnCtx(k);
    return {
      systemPrompt: [cur, ctxText, wf, ov].filter(Boolean).join("\n\n"),
    };
  });
  pi.on?.("context", (event, ctx) => {
    getKey(event, ctx);
  });
}
