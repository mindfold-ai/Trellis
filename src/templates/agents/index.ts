/**
 * Agent templates for Multi-Agent Pipeline
 *
 * These agents work together in a pipeline:
 * - dispatch: Pure dispatcher, orchestrates other agents
 * - implement: Code implementation expert
 * - check: Code and cross-layer check expert
 * - debug: Issue fixing expert
 * - research: Code and tech search expert
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
export const implementAgentTemplate: string = readAgent("implement.txt");
export const checkAgentTemplate: string = readAgent("check.txt");
export const debugAgentTemplate: string = readAgent("debug.txt");
export const researchAgentTemplate: string = readAgent("research.txt");
export const dispatchAgentTemplate: string = readAgent("dispatch.txt");

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
    name: "implement",
    content: implementAgentTemplate,
    description:
      "Code implementation expert - implements features following specs",
  },
  {
    name: "check",
    content: checkAgentTemplate,
    description:
      "Check expert - validates code quality and cross-layer consistency",
  },
  {
    name: "debug",
    content: debugAgentTemplate,
    description: "Debug expert - fixes code review issues",
  },
  {
    name: "research",
    content: researchAgentTemplate,
    description: "Research expert - finds code patterns and tech solutions",
  },
  {
    name: "dispatch",
    content: dispatchAgentTemplate,
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
