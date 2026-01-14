/**
 * Agent templates for Multi-Agent Pipeline
 *
 * These agents work together in a pipeline:
 * - Router: Pure dispatcher, orchestrates other agents
 * - Coder: Code writing expert
 * - Checker: Code self-check expert
 * - Fixer: Issue fixing expert
 * - Searcher: Code and tech search expert
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read an agent template
 */
function readAgent(filename: string): string {
  const filePath = join(__dirname, filename);
  return readFileSync(filePath, "utf-8");
}

// Agent templates
export const coderAgentTemplate: string = readAgent("coder.txt");
export const checkerAgentTemplate: string = readAgent("checker.txt");
export const fixerAgentTemplate: string = readAgent("fixer.txt");
export const searcherAgentTemplate: string = readAgent("searcher.txt");
export const routerAgentTemplate: string = readAgent("router.txt");

/**
 * Agent template definition
 */
export interface AgentTemplate {
  /** Agent name (used for filename) */
  name: string;
  /** Template content */
  content: string;
  /** Human-readable description */
  description: string;
}

/**
 * All available agent templates
 */
const ALL_AGENTS: AgentTemplate[] = [
  {
    name: "coder",
    content: coderAgentTemplate,
    description: "Code writing expert - implements features following specs",
  },
  {
    name: "checker",
    content: checkerAgentTemplate,
    description: "Code self-check expert - validates and fixes code quality",
  },
  {
    name: "fixer",
    content: fixerAgentTemplate,
    description: "Issue fixing expert - fixes code review issues",
  },
  {
    name: "searcher",
    content: searcherAgentTemplate,
    description: "Search expert - finds code patterns and tech solutions",
  },
  {
    name: "router",
    content: routerAgentTemplate,
    description: "Pipeline dispatcher - orchestrates other agents",
  },
];

/**
 * Get all agent templates
 */
export function getAllAgents(): AgentTemplate[] {
  return ALL_AGENTS;
}

/**
 * Get a specific agent template by name
 */
export function getAgentByName(name: string): AgentTemplate | undefined {
  return ALL_AGENTS.find((a) => a.name === name);
}
