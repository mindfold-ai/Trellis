/**
 * Pipeline module
 *
 * Multi-agent pipeline orchestration for Trellis workflow.
 * Provides agent registry, phase management, worktree operations,
 * and high-level pipeline orchestration.
 */

// =============================================================================
// Schemas and Types
// =============================================================================

export {
  // Schemas
  AgentStatusSchema,
  AgentSchema,
  RegistrySchema,
  StartPipelineOptionsSchema,
  StartPipelineResultSchema,
  StopPipelineOptionsSchema,
  CleanupPipelineOptionsSchema,
  PipelineStatusSchema,
  // Types (inferred from schemas)
  type AgentStatus,
  type Agent,
  type Registry,
  type StartPipelineOptions,
  type StartPipelineResult,
  type StopPipelineOptions,
  type CleanupPipelineOptions,
  type PipelineStatus,
  // Constants
  DEFAULT_REGISTRY,
  // Parse functions
  parseAgent,
  safeParseAgent,
  parseRegistry,
  safeParseRegistry,
} from "./schemas.js";

// =============================================================================
// State Management
// =============================================================================

export {
  // Registry file operations
  getAgentsDir,
  getRegistryPath,
  readRegistry,
  writeRegistry,
  // Agent CRUD
  addAgent,
  getAgentById,
  getAgentByWorktree,
  getAgentByTaskDir,
  searchAgent,
  removeAgent,
  removeAgentByWorktree,
  listAgents,
  updateAgentStatus,
  // Phase management
  getCurrentPhase,
  getTotalPhases,
  getPhaseAction,
  getPhaseInfo,
  setPhase,
  advancePhase,
  getPhaseForAction,
  isPhaseCompleted,
  isCurrentAction,
  // Current task (in specific directory)
  setCurrentTaskInDir,
  getCurrentTaskInDir,
  clearCurrentTaskInDir,
  // Current task (main repo - re-exports)
  getCurrentTask,
  setCurrentTask,
  clearCurrentTask,
  // Process status
  isProcessRunning,
  syncAgentStatuses,
} from "./state.js";

// =============================================================================
// Worktree Operations
// =============================================================================

export {
  // Types
  type CreatePipelineWorktreeOptions,
  type CreatePipelineWorktreeResult,
  // Functions
  createPipelineWorktree,
  removePipelineWorktree,
  prepareWorktreeForTask,
  getWorktreePathForTask,
  runCommand,
} from "./worktree.js";

// =============================================================================
// Orchestration
// =============================================================================

export {
  // Pipeline lifecycle
  startPipeline,
  stopPipeline,
  cleanupPipeline,
  // Status
  getPipelineStatus,
  listPipelineStatuses,
  // Utilities
  hasActivePipeline,
  getAgentForTask,
} from "./orchestrator.js";
