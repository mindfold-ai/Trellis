/**
 * trellis pipeline - Multi-agent pipeline commands
 *
 * Commands for managing the multi-agent pipeline:
 * - plan: Start Plan Agent to analyze requirements
 * - start: Create worktree and start Dispatch Agent
 * - status: View pipeline/agent status
 * - cleanup: Remove worktree and archive task
 * - create-pr: Create PR from completed task
 */

export { pipelinePlan } from "./plan.js";
export { pipelineStart } from "./start.js";
export { pipelineStatus } from "./status.js";
export { pipelineCleanup } from "./cleanup.js";
export { pipelineCreatePr } from "./create-pr.js";
