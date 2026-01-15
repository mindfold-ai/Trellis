/**
 * Agent metadata definitions
 *
 * Shared metadata for all agents, used to generate format-specific frontmatter.
 */

/**
 * Tool permissions for agents
 */
export interface AgentTools {
  read: boolean;
  write: boolean;
  edit: boolean;
  bash: boolean;
  glob: boolean;
  grep: boolean;
}

/**
 * Agent metadata
 */
export interface AgentMetadata {
  /** Agent name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Tool permissions */
  tools: AgentTools;
  /** Preferred model (Claude format only) */
  model?: "opus" | "sonnet" | "haiku";
  /** Whether this agent is available for OpenCode */
  supportsOpenCode: boolean;
}

/**
 * All agent metadata definitions
 */
export const AGENT_METADATA: Record<string, AgentMetadata> = {
  implement: {
    name: "implement",
    description:
      "Code implementation expert. Understands specs and requirements, then implements features. No git commit allowed.",
    tools: {
      read: true,
      write: true,
      edit: true,
      bash: true,
      glob: true,
      grep: true,
    },
    model: "opus",
    supportsOpenCode: true,
  },
  check: {
    name: "check",
    description:
      "Code quality check expert. Reviews code changes against specs and self-fixes issues.",
    tools: {
      read: true,
      write: true,
      edit: true,
      bash: true,
      glob: true,
      grep: true,
    },
    model: "opus",
    supportsOpenCode: true,
  },
  debug: {
    name: "debug",
    description:
      "Issue fixing expert. Understands issues, fixes against specs, and verifies fixes. Precise fixes only.",
    tools: {
      read: true,
      write: true,
      edit: true,
      bash: true,
      glob: true,
      grep: true,
    },
    model: "sonnet",
    supportsOpenCode: true,
  },
  research: {
    name: "research",
    description:
      "Code and tech search expert. Pure research, no code modifications. Finds files, patterns, and tech solutions.",
    tools: {
      read: true,
      write: false,
      edit: false,
      bash: false,
      glob: true,
      grep: true,
    },
    model: "haiku",
    supportsOpenCode: true,
  },
  dispatch: {
    name: "dispatch",
    description:
      "Multi-Agent Pipeline main dispatcher. Pure dispatcher. Only responsible for calling subagents and scripts in phase order.",
    tools: {
      read: true,
      write: false,
      edit: false,
      bash: true,
      glob: false,
      grep: false,
    },
    model: "sonnet",
    supportsOpenCode: false, // OpenCode doesn't use dispatch pattern
  },
};

/**
 * Get metadata for a specific agent
 */
export function getAgentMetadata(name: string): AgentMetadata | undefined {
  return AGENT_METADATA[name];
}

/**
 * Get all agent names
 */
export function getAllAgentNames(): string[] {
  return Object.keys(AGENT_METADATA);
}

/**
 * Get agent names that support a specific format
 */
export function getAgentNamesForFormat(
  format: "claude" | "opencode",
): string[] {
  return Object.entries(AGENT_METADATA)
    .filter(([_, meta]) => (format === "opencode" ? meta.supportsOpenCode : true))
    .map(([name]) => name);
}
