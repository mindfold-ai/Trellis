/**
 * Pipeline module schemas
 *
 * Zod schemas for agent registry, phase management, and pipeline orchestration.
 * All types are inferred from schemas - schemas are the single source of truth.
 */

import { z } from "zod";

// =============================================================================
// Agent Status
// =============================================================================

/**
 * Agent runtime status
 */
export const AgentStatusSchema = z.enum(["running", "stopped", "failed"]);

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// =============================================================================
// Agent Registry
// =============================================================================

/**
 * Registered agent information
 *
 * Stored in workspace/{developer}/.agents/registry.json
 */
export const AgentSchema = z.object({
  /** Unique agent identifier (typically task ID or branch-based) */
  id: z.string(),
  /** Absolute path to the worktree */
  worktree_path: z.string(),
  /** Process ID of the running agent */
  pid: z.number(),
  /** Agent start timestamp (ISO format) */
  started_at: z.string(),
  /** Task directory (relative path from repo root) */
  task_dir: z.string(),
  /** Current status */
  status: AgentStatusSchema.default("running"),
  /** Session ID for resume support */
  session_id: z.string().optional(),
});

export type Agent = z.infer<typeof AgentSchema>;

/**
 * Agent registry file structure
 */
export const RegistrySchema = z.object({
  /** Registered agents */
  agents: z.array(AgentSchema),
  /** Schema version for future migrations */
  version: z.number().default(1),
});

export type Registry = z.infer<typeof RegistrySchema>;

/**
 * Default empty registry
 */
export const DEFAULT_REGISTRY: Registry = {
  agents: [],
  version: 1,
};

// =============================================================================
// Pipeline Operations
// =============================================================================

/**
 * Options for starting a pipeline
 */
export const StartPipelineOptionsSchema = z.object({
  /** Task directory (relative path from repo root) */
  taskDir: z.string(),
  /** Repository root path (defaults to detected repo root) */
  repoRoot: z.string().optional(),
  /** Enable verbose logging */
  verbose: z.boolean().optional(),
});

export type StartPipelineOptions = z.infer<typeof StartPipelineOptionsSchema>;

/**
 * Result from starting a pipeline
 */
export const StartPipelineResultSchema = z.object({
  /** Registered agent information */
  agent: AgentSchema,
  /** Path to the created worktree */
  worktreePath: z.string(),
  /** Log file path */
  logFile: z.string(),
});

export type StartPipelineResult = z.infer<typeof StartPipelineResultSchema>;

/**
 * Options for stopping a pipeline
 */
export const StopPipelineOptionsSchema = z.object({
  /** Agent ID to stop */
  agentId: z.string(),
  /** Repository root path */
  repoRoot: z.string().optional(),
  /** Force stop (SIGKILL instead of SIGTERM) */
  force: z.boolean().optional(),
});

export type StopPipelineOptions = z.infer<typeof StopPipelineOptionsSchema>;

/**
 * Options for cleaning up a pipeline
 */
export const CleanupPipelineOptionsSchema = z.object({
  /** Agent ID to cleanup */
  agentId: z.string(),
  /** Repository root path */
  repoRoot: z.string().optional(),
  /** Archive the task after cleanup */
  archive: z.boolean().optional(),
  /** Force removal even with uncommitted changes */
  force: z.boolean().optional(),
});

export type CleanupPipelineOptions = z.infer<typeof CleanupPipelineOptionsSchema>;

// =============================================================================
// Pipeline Status
// =============================================================================

/**
 * Detailed pipeline status for monitoring
 */
export const PipelineStatusSchema = z.object({
  /** Agent information */
  agent: AgentSchema,
  /** Task information (partial, key fields only) */
  task: z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    branch: z.string().nullable(),
    current_phase: z.number(),
  }),
  /** Process running status */
  processRunning: z.boolean(),
  /** Last log lines (if available) */
  lastLogLines: z.array(z.string()).optional(),
});

export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;

// =============================================================================
// Parse Utilities
// =============================================================================

/**
 * Parse and validate agent data
 */
export function parseAgent(data: unknown): Agent {
  return AgentSchema.parse(data);
}

/**
 * Safely parse agent data
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function safeParseAgent(data: unknown) {
  return AgentSchema.safeParse(data);
}

/**
 * Parse and validate registry data
 */
export function parseRegistry(data: unknown): Registry {
  return RegistrySchema.parse(data);
}

/**
 * Safely parse registry data
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function safeParseRegistry(data: unknown) {
  return RegistrySchema.safeParse(data);
}
