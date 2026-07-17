/**
 * Snow CLI (snocli) configurator.
 *
 * Snow CLI is a class-1 platform (agentCapable + context-injecting hooks) when
 * running snow-cli with #194 support.
 *
 * Output paths:
 * - `.snow/skills/` — workflow + bundled skills (Claude Code Skills layout)
 * - `.snow/commands/trellis-*.json` — custom prompt slash commands (no trellis-start)
 * - `.snow/agents/` — project sub-agents (auto-discovered by Snow)
 * - `.snow/hooks/` — inject hooks (session / user / beforeSubAgentStart)
 * - `.snow/sub-agents.trellis.json` — optional import fragment for older Snow
 * - `.snow/SNOW.md` — operator guide
 *
 * hasHooks=true → filterCommands drops `start`; SessionStart injects context.
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  getAllAgents,
  getAllHooks,
  getSnowGuide,
} from "../templates/snow/index.js";
import {
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveCommands,
  writeSkills,
  writeAgents,
  applyPullBasedPreludeMarkdown,
  replacePythonCommandLiterals,
  type AgentContent,
} from "./shared.js";

/** Match snow-cli SubAgent shape enough for optional merge into sub-agents.json. */
interface SnowSubAgentExport {
  id: string;
  name: string;
  description: string;
  role: string;
  tools: string[];
  systemPrompt?: string;
}

function buildSnowCommandJson(name: string, content: string): string {
  const description =
    name === "continue"
      ? "Resume the current Trellis task at the right workflow phase."
      : name === "finish-work"
        ? "Wrap up the current Trellis session: archive tasks and record journal."
        : `Trellis: ${name}`;

  return (
    JSON.stringify(
      {
        type: "prompt",
        description,
        command: content,
        location: "project",
      },
      null,
      2,
    ) + "\n"
  );
}

function stripMarkdownFrontmatter(content: string): {
  body: string;
  frontmatter: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { body: content, frontmatter: "" };
  }
  return {
    frontmatter: match[1] ?? "",
    body: content.slice(match[0].length),
  };
}

function parseSimpleYamlList(frontmatter: string, key: string): string[] {
  const lines = frontmatter.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (!inList) {
      if (line.trim() === `${key}:`) {
        inList = true;
      }
      continue;
    }
    const item = line.match(/^\s+-\s+(.+?)\s*$/);
    if (item) {
      out.push(item[1].replace(/^['"]|['"]$/g, ""));
      continue;
    }
    if (/^\S/.test(line) && !line.startsWith(" ") && !line.startsWith("\t")) {
      break;
    }
    if (line.trim() === "" && out.length > 0) {
      break;
    }
  }
  return out;
}

function parseSimpleYamlScalar(
  frontmatter: string,
  key: string,
): string | null {
  const re = new RegExp("^" + key + ":\\s*(.+?)\\s*$", "m");
  const m = frontmatter.match(re);
  if (!m) return null;
  let v = m[1].trim();
  if (v === "|" || v === ">") return null;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}

function parseSimpleYamlBlock(frontmatter: string, key: string): string | null {
  const lines = frontmatter.split(/\r?\n/);
  const header = `${key}: |`;
  const idx = lines.findIndex(
    (l) => l.trim() === header || l.trim() === `${key}:`,
  );
  if (idx < 0) return null;
  if (lines[idx].trim() === `${key}:`) {
    return null;
  }
  const body: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[a-zA-Z_][\w-]*:/.test(line)) break;
    body.push(line.replace(/^ {2}/, ""));
  }
  const text = body.join("\n").trim();
  return text || null;
}

function agentToSnowExport(agent: AgentContent): SnowSubAgentExport {
  const { body, frontmatter } = stripMarkdownFrontmatter(agent.content);
  const id =
    parseSimpleYamlScalar(frontmatter, "id") ??
    parseSimpleYamlScalar(frontmatter, "name") ??
    agent.name;
  const name = parseSimpleYamlScalar(frontmatter, "name") ?? agent.name;
  const description =
    parseSimpleYamlBlock(frontmatter, "description") ??
    parseSimpleYamlScalar(frontmatter, "description") ??
    `Trellis ${agent.name}`;
  const tools = parseSimpleYamlList(frontmatter, "tools");
  const role = body.trim();

  return {
    id,
    name,
    description: description.replace(/\s+/g, " ").trim(),
    role,
    tools:
      tools.length > 0
        ? tools
        : [
            "filesystem-read",
            "filesystem-create",
            "filesystem-replaceedit",
            "filesystem-edit",
            "terminal-execute",
            "ace-search",
            "codebase-search",
            "todo-manage",
            "notebook-manage",
            "skill-execute",
          ],
    systemPrompt: role,
  };
}

function buildSubAgentsFragment(agents: readonly AgentContent[]): string {
  const payload = {
    _comment:
      "Optional Trellis export for older Snow builds without project-agent discovery. Modern snow-cli loads .snow/agents/*.md automatically — merge only if needed.",
    _docs: "See .snow/SNOW.md",
    agents: agents.map(agentToSnowExport),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function collectSnowStaticFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const hook of getAllHooks()) {
    files.set(`.snow/hooks/${hook.targetPath}`, hook.content);
  }
  files.set(".snow/SNOW.md", getSnowGuide());
  return files;
}

/**
 * Collect all Snow template files for `trellis update` diff tracking.
 * Must stay in sync with `configureSnow`.
 */
export function collectSnowTemplates(): Map<string, string> {
  const config = AI_TOOLS.snow;
  const ctx = config.templateContext;
  const files = new Map<string, string>();

  // hasHooks=true → resolveAllAsSkills drops trellis-start.
  for (const [filePath, content] of collectSkillTemplates(
    ".snow/skills",
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  for (const cmd of resolveCommands(ctx)) {
    const body = replacePythonCommandLiterals(cmd.content);
    files.set(
      `.snow/commands/trellis-${cmd.name}.json`,
      buildSnowCommandJson(cmd.name, body),
    );
  }

  const agents = applyPullBasedPreludeMarkdown(getAllAgents());
  for (const agent of agents) {
    files.set(`.snow/agents/${agent.name}.md`, agent.content);
  }

  files.set(".snow/sub-agents.trellis.json", buildSubAgentsFragment(agents));

  for (const [filePath, content] of collectSnowStaticFiles()) {
    files.set(filePath, content);
  }

  return files;
}

/**
 * Configure Snow CLI at init time: write skills, prompt commands, agents,
 * inject hooks, optional sub-agent fragment, and operator guide.
 */
export async function configureSnow(cwd: string): Promise<void> {
  const config = AI_TOOLS.snow;
  const ctx = config.templateContext;

  await writeSkills(
    path.join(cwd, ".snow", "skills"),
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  );

  const commandsDir = path.join(cwd, ".snow", "commands");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    const body = replacePythonCommandLiterals(cmd.content);
    await writeFile(
      path.join(commandsDir, `trellis-${cmd.name}.json`),
      buildSnowCommandJson(cmd.name, body),
    );
  }

  const agents = applyPullBasedPreludeMarkdown(getAllAgents());
  await writeAgents(path.join(cwd, ".snow", "agents"), agents);

  await writeFile(
    path.join(cwd, ".snow", "sub-agents.trellis.json"),
    buildSubAgentsFragment(agents),
  );

  const hooksDir = path.join(cwd, ".snow", "hooks");
  ensureDir(hooksDir);
  for (const hook of getAllHooks()) {
    await writeFile(path.join(hooksDir, hook.targetPath), hook.content);
  }

  await writeFile(path.join(cwd, ".snow", "SNOW.md"), getSnowGuide());
}
