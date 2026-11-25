import { PI_DESKTOP_SUBAGENT_MARKER } from "../../constants/pi-desktop.js";
import { getAllAgents } from "../pi/index.js";

/**
 * Global sub-agent files for PI-Desktop.
 *
 * The host discovers sub-agents only in `~/.agents/subagents` (there is no
 * project-level scan), and it validates `tools` against a case-sensitive
 * whitelist: `read` is ignored, `Read` is accepted. The pi CLI agent
 * definitions under `.pi/agents/` use the lowercase form, so they cannot be
 * copied verbatim — this module re-emits them in the host's shape while
 * keeping `.pi/agents/*.md` as the single source of the instructions.
 */

/** pi tool name → host tool name (host whitelist is case-sensitive). */
const HOST_TOOL_NAMES: Record<string, string> = {
  read: "Read",
  write: "Write",
  edit: "Edit",
  bash: "Bash",
  find: "Glob",
  glob: "Glob",
  grep: "Grep",
  browserpreview: "BrowserPreview",
};

const SCOPE_GUARD = `## Scope Guard (must run first)

This sub-agent is installed globally by Trellis, but it only applies to Trellis
projects. Before doing anything else, confirm the current working directory has
a \`.trellis/\` directory:

- \`.trellis/workflow.md\` exists → continue with the instructions below.
- It does not exist → stop immediately and reply: "This sub-agent belongs to
  Trellis and this project is not Trellis-initialized, so I am not running it
  here." Do not read, edit, or run anything else.
`;

export interface GlobalSubagentFile {
  /** File name inside `~/.agents/subagents`. */
  fileName: string;
  name: string;
  content: string;
}

function splitFrontmatter(source: string): {
  frontmatter: string[];
  body: string;
} {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: [], body: source };
  return {
    frontmatter: match[1].split(/\r?\n/),
    body: source.slice(match[0].length),
  };
}

/** Read a scalar, folding a `key: |` block into one line. */
function readScalar(lines: string[], key: string): string {
  const index = lines.findIndex((line) => new RegExp(`^${key}:`).test(line));
  if (index === -1) return "";
  const raw = lines[index].slice(key.length + 1).trim();
  if (raw !== "|" && raw !== ">") return raw.replace(/^["']|["']$/g, "");

  const parts: string[] = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (line.trim() === "") {
      if (parts.length > 0) break;
      continue;
    }
    if (!/^\s+/.test(line)) break;
    parts.push(line.trim());
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function hostTools(lines: string[]): string[] {
  const value = readScalar(lines, "tools");
  if (!value) return [];
  const tools: string[] = [];
  for (const raw of value.replace(/^\[|\]$/g, "").split(",")) {
    const mapped =
      HOST_TOOL_NAMES[
        raw
          .trim()
          .replace(/^["']|["']$/g, "")
          .toLowerCase()
      ];
    if (mapped && !tools.includes(mapped)) tools.push(mapped);
  }
  return tools;
}

/** Quote a value the host's frontmatter parser reads as a plain string. */
function yamlScalar(value: string): string {
  return /[:#]/.test(value) ? JSON.stringify(value) : value;
}

/**
 * The three Trellis roles, in the shape `parseSubagentDefinition` accepts.
 *
 * Throws when a source definition cannot be translated (missing description or
 * no usable tool) rather than writing a file the host would reject with a
 * diagnostic the user cannot act on.
 */
export function getGlobalSubagentFiles(): GlobalSubagentFile[] {
  return getAllAgents()
    .filter((agent) => agent.name.startsWith("trellis-"))
    .map((agent) => {
      const { frontmatter, body } = splitFrontmatter(agent.content);
      const name = readScalar(frontmatter, "name") || agent.name;
      const description = readScalar(frontmatter, "description");
      const tools = hostTools(frontmatter);

      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) {
        throw new Error(
          `pi-desktop sub-agent "${name}" has a name the host rejects ` +
            "(lowercase letters, digits and dashes, max 40).",
        );
      }
      if (!description) {
        throw new Error(
          `pi-desktop sub-agent "${name}" has no description; the host refuses ` +
            "definitions without one.",
        );
      }
      if (tools.length === 0) {
        throw new Error(
          `pi-desktop sub-agent "${name}" lists no tool the host accepts ` +
            "(Read, Glob, Grep, BrowserPreview, Bash, Edit, Write).",
        );
      }

      const content = [
        "---",
        `name: ${name}`,
        `description: ${yamlScalar(description)}`,
        `tools: [${tools.join(", ")}]`,
        "---",
        "",
        `<!-- ${PI_DESKTOP_SUBAGENT_MARKER} -->`,
        "",
        SCOPE_GUARD,
        body.trim(),
        "",
      ].join("\n");

      return { fileName: `${name}.md`, name, content };
    });
}
