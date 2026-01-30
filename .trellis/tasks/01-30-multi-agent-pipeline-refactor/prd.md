# Multi-Agent Pipeline 重构 - Agent Registry, Phase, Pipeline 脚本

## 背景

本任务是 `01-30-refactor-core-structure` 的后续任务。

在核心模块重构完成后，需要将 Multi-Agent Pipeline 相关的 bash 脚本逻辑迁移到 TypeScript CLI。

## 依赖

- **前置任务**: `01-30-refactor-core-structure` 必须先完成
- **依赖模块**: `core/task/`, `core/git/`, `core/developer/`, `core/session/`, `core/platforms/`

## 核心设计决策 (Brainstorm 2026-01-30)

### 1. 迁移策略：一次性迁移

- **不做 wrapper**：CLI 不调用 shell，直接 TypeScript 实现所有逻辑
- **本项目 shell 脚本**：迁移完成后移到 `.trellis/scripts/_archive/`
- **模板 shell 脚本**：暂不动，用户项目继续用 shell，等 CLI 稳定后再考虑

### 2. 架构：按 Agent 生命周期分模块

```
src/core/pipeline/
├── schemas.ts       # AgentSchema, PhaseSchema, RegistrySchema (Zod)
├── state.ts         # 统一状态管理 (registry + phase + currentTask)
├── orchestrator.ts  # 编排逻辑 (plan → start → monitor → cleanup)
└── worktree.ts      # Git worktree 管理 (create, copy env, hooks)

src/core/platforms/claude/
└── launcher.ts      # Claude 专属启动逻辑 (现有 adapter 扩展)
```

**为什么这样分**：
- `state.ts` 统一管理避免 registry/phase/task 状态分散
- `orchestrator.ts` 封装流程，CLI 命令只是薄薄一层
- launcher 放在 platform adapter 里，天然支持扩展

### 3. Registry 位置：保持 per-developer

```
.trellis/workspace/{developer}/.agents/registry.json
```

- 沿用现有设计，每个开发者管自己的 agents
- TypeScript 重写读写逻辑，位置不变
- 隔离性好，多开发者并行工作不冲突

### 4. Hooks：暂不迁移

- `inject-subagent-context.py` 和 `ralph-loop.py` **保持 Python**
- 这次只迁移 pipeline 脚本，hooks 独立运行
- **后续单独建 task 迁移 hooks 到 TypeScript**

### 5. 平台支持：Claude Code 优先

- 先只支持 Claude Code
- 架构通过 PlatformAdapter 预留扩展
- OpenCode 等平台后续实现 adapter 即可

### 6. start 命令的分层拆分

`start.sh` 是最复杂的脚本，拆分为：

```typescript
// orchestrator.ts
async function startPipeline(taskDir: string) {
  const task = await readTask(taskDir);

  // 1-4: worktree 管理
  const worktreePath = await worktree.create(task.branch, task.base_branch);
  await worktree.copyEnvFiles(worktreePath);
  await worktree.runPostCreateHooks(worktreePath);

  // 5: 设置当前任务
  await state.setCurrentTask(worktreePath, taskDir);

  // 6: 启动 agent (通过 platform adapter)
  const agent = await launcher.launchDispatch(worktreePath, taskDir);

  // 7: 注册
  await state.registerAgent(agent);
}
```

---

## Pipeline 通过 Platform Adapter 启动 Agent

不同平台启动 Agent 的方式不同：

| 平台 | 启动命令 | Agent 配置 | 支持 Multi-Agent |
|------|---------|-----------|-----------------|
| Claude Code | `claude --agent` | `.claude/agents/` | ✅ |
| OpenCode | `opencode agent` | `.opencode/agent/` | ✅ (待验证) |
| Cursor | N/A | N/A | ❌ |
| Codex | `codex` | N/A | ❌ |

**设计**：Pipeline 命令通过 `PlatformAdapter.launchAgent()` 启动 agent，不硬编码特定平台命令。

```typescript
// commands/pipeline/start.ts
import { getPlatformAdapter } from '../../core/platforms/index.js';

export async function startAgent(taskDir: string) {
  const adapter = getPlatformAdapter();

  // 检测平台能力
  if (!adapter.supportsMultiAgent()) {
    console.error(`${adapter.platform} does not support multi-agent pipeline`);
    process.exit(1);
  }

  // 通过 adapter 启动 agent
  return adapter.launchAgent({
    agentType: 'dispatch',
    workDir: worktreePath,
    taskDir,
    background: true,
  });
}
```

**好处**：
- 后续添加 OpenCode 支持时，只需实现 `OpenCodeAdapter.launchAgent()`
- Pipeline 逻辑不需要改动
- 不支持的平台可以优雅提示

## 待迁移的 Bash 脚本

### 1. Common 库

| 脚本 | 功能 | 目标模块 |
|------|------|---------|
| `common/registry.sh` | Agent 注册、查询、移除 | `core/pipeline/registry.ts` |
| `common/phase.sh` | Phase 跟踪、推进、状态查询 | `core/pipeline/phase.ts` |
| `common/task-queue.sh` | 按状态/assignee 筛选任务 | `core/task/queue.ts` |
| `common/task-utils.sh` | 任务路径安全检查、归档 | `core/task/utils.ts` |

### 2. Multi-Agent 脚本

| 脚本 | 功能 | 目标命令 |
|------|------|---------|
| `multi-agent/plan.sh` | 启动 Plan Agent | `trellis pipeline plan` |
| `multi-agent/start.sh` | 启动 Dispatch Agent + worktree | `trellis pipeline start` |
| `multi-agent/status.sh` | 监控 agent 状态 | `trellis pipeline status` |
| `multi-agent/cleanup.sh` | 清理 worktree + 归档任务 | `trellis pipeline cleanup` |
| `multi-agent/create-pr.sh` | 创建 PR | `trellis pipeline create-pr` |

### 3. 其他脚本

| 脚本 | 功能 | 目标 |
|------|------|------|
| `create-bootstrap.sh` | 创建引导任务 | `trellis init --bootstrap` |

## 目标结构

```
src/
├── core/
│   ├── pipeline/                      # Pipeline 模块 (新增)
│   │   ├── index.ts                   # 统一导出
│   │   ├── schemas.ts                 # AgentSchema, PhaseSchema, RegistrySchema
│   │   ├── state.ts                   # 统一状态管理 (registry + phase + currentTask)
│   │   ├── orchestrator.ts            # 编排逻辑 (组合调用各模块)
│   │   └── worktree.ts                # Git worktree 管理
│   │
│   ├── platforms/claude/
│   │   ├── index.ts                   # 现有 adapter
│   │   ├── context.ts                 # 现有 context generator
│   │   └── launcher.ts                # Agent 启动逻辑 (新增)
│   │
│   ├── task/
│   │   ├── ...                        # 现有文件
│   │   ├── queue.ts                   # 任务队列筛选 (新增)
│   │   └── utils.ts                   # 任务工具函数 (新增)
│   │
│   └── ...                            # 其他现有模块
│
├── cli/commands/
│   ├── pipeline/                      # Pipeline 命令 (新增)
│   │   ├── index.ts                   # pipeline 子命令入口
│   │   ├── plan.ts                    # trellis pipeline plan
│   │   ├── start.ts                   # trellis pipeline start
│   │   ├── status.ts                  # trellis pipeline status
│   │   ├── cleanup.ts                 # trellis pipeline cleanup
│   │   └── create-pr.ts               # trellis pipeline create-pr
│   │
│   └── ...                            # 其他现有命令
```

## 技术要求

### 1. Zod Schemas

```typescript
// core/pipeline/schemas.ts
import { z } from "zod";

export const AgentSchema = z.object({
  id: z.string(),                              // UUID
  taskDir: z.string(),                         // 任务目录路径
  worktreePath: z.string(),                    // Worktree 路径
  branch: z.string(),                          // 分支名
  pid: z.number().optional(),                  // 进程 ID
  status: z.enum(["running", "stopped", "failed"]),
  startedAt: z.string(),                       // ISO timestamp
});

export const RegistrySchema = z.object({
  agents: z.array(AgentSchema),
  version: z.number(),                         // 用于并发写保护
});

export const PhaseActionSchema = z.object({
  phase: z.number(),
  action: z.string(),                          // "implement" | "check" | "finish" | "create-pr"
});

export type Agent = z.infer<typeof AgentSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
export type PhaseAction = z.infer<typeof PhaseActionSchema>;
```

### 2. 统一状态管理

```typescript
// core/pipeline/state.ts

// Registry 操作 (存储在 workspace/{dev}/.agents/registry.json)
export function addAgent(agent: Agent, repoRoot?: string): void;
export function getAgentById(id: string, repoRoot?: string): Agent | null;
export function getAgentByTaskDir(taskDir: string, repoRoot?: string): Agent | null;
export function removeAgent(id: string, repoRoot?: string): void;
export function listAgents(repoRoot?: string): Agent[];
export function updateAgentStatus(id: string, status: Agent["status"], repoRoot?: string): void;

// Phase 操作 (存储在 task.json 的 current_phase 字段)
export function getCurrentPhase(taskDir: string): number;
export function getTotalPhases(taskDir: string): number;
export function getPhaseAction(taskDir: string, phase: number): string | null;
export function setPhase(taskDir: string, phase: number): void;
export function advancePhase(taskDir: string): number;

// CurrentTask 操作 (存储在 .trellis/.current-task)
export function setCurrentTask(repoRoot: string, taskDir: string): void;
export function getCurrentTask(repoRoot: string): string | null;
export function clearCurrentTask(repoRoot: string): void;
```

### 3. Worktree 管理

```typescript
// core/pipeline/schemas.ts (追加)
export const WorktreeOptionsSchema = z.object({
  branch: z.string(),
  baseBranch: z.string(),
  repoRoot: z.string().optional(),
});

export const WorktreeConfigSchema = z.object({
  post_create: z.array(z.string()).optional(),  // shell commands to run after create
  env_files: z.array(z.string()).optional(),     // extra env files to copy
});

export type WorktreeOptions = z.infer<typeof WorktreeOptionsSchema>;
export type WorktreeConfig = z.infer<typeof WorktreeConfigSchema>;

// core/pipeline/worktree.ts
export async function createWorktree(options: WorktreeOptions): Promise<string>;
export async function removeWorktree(worktreePath: string): Promise<void>;
export async function copyEnvFiles(worktreePath: string, repoRoot: string): Promise<void>;
export async function runPostCreateHooks(worktreePath: string): Promise<void>;
export function getWorktreeConfig(worktreePath: string): WorktreeConfig | null;
```

### 4. 编排器

```typescript
// core/pipeline/schemas.ts (追加)
export const StartPipelineOptionsSchema = z.object({
  taskDir: z.string(),
  repoRoot: z.string().optional(),
  verbose: z.boolean().optional(),
});

export const StartPipelineResultSchema = z.object({
  agent: AgentSchema,
  worktreePath: z.string(),
});

export type StartPipelineOptions = z.infer<typeof StartPipelineOptionsSchema>;
export type StartPipelineResult = z.infer<typeof StartPipelineResultSchema>;

// core/pipeline/orchestrator.ts
export async function startPipeline(options: StartPipelineOptions): Promise<StartPipelineResult>;
export async function stopPipeline(agentId: string, repoRoot?: string): Promise<void>;
export async function cleanupPipeline(agentId: string, archive?: boolean, repoRoot?: string): Promise<void>;
```

## 实施步骤

### Phase 1: Core Pipeline 模块
- [ ] `core/pipeline/schemas.ts` - AgentSchema, RegistrySchema, PhaseActionSchema
- [ ] `core/pipeline/state.ts` - 统一状态管理 (registry + phase + currentTask)
- [ ] `core/pipeline/worktree.ts` - Worktree 创建、清理、env 复制、hooks
- [ ] `core/pipeline/orchestrator.ts` - 编排逻辑
- [ ] `core/pipeline/index.ts` - 统一导出

### Phase 2: Platform Launcher
- [ ] `core/platforms/claude/launcher.ts` - Claude agent 启动逻辑
- [ ] 更新 `core/platforms/claude/index.ts` - 导出 launcher

### Phase 3: Task 扩展
- [ ] `core/task/queue.ts` - 任务队列筛选 (按 status/assignee)
- [ ] `core/task/utils.ts` - 任务工具函数

### Phase 4: Pipeline CLI 命令
- [ ] `cli/commands/pipeline/index.ts` - 子命令入口
- [ ] `cli/commands/pipeline/plan.ts` - 启动 Plan Agent
- [ ] `cli/commands/pipeline/start.ts` - 创建 worktree + 启动 Dispatch
- [ ] `cli/commands/pipeline/status.ts` - 查看 agent 状态
- [ ] `cli/commands/pipeline/cleanup.ts` - 清理 worktree + 归档
- [ ] `cli/commands/pipeline/create-pr.ts` - 创建 PR

### Phase 5: 清理
- [ ] 移动本项目 shell 脚本到 `.trellis/scripts/_archive/`
- [ ] 更新 workflow.md 文档引用

### Phase 6: 验证
- [ ] `pnpm build` 编译通过
- [ ] `pnpm lint` 无警告
- [ ] 测试所有 pipeline 命令
- [ ] 验证 hooks 仍正常工作 (Python hooks 不变)

## 验收标准

- [ ] Agent Registry 功能完整 (CRUD + status update)
- [ ] Phase 管理功能完整 (get/set/advance)
- [ ] Worktree 管理功能完整 (create/remove/env copy/hooks)
- [ ] 所有 pipeline 命令可用且行为与 shell 脚本一致
- [ ] Python hooks 继续正常工作 (不迁移)
- [ ] 本项目 shell 脚本已移到 `_archive/`
- [ ] `pnpm build` 和 `pnpm lint` 通过

## 范围外 (Out of Scope)

- **Hooks 迁移**：`inject-subagent-context.py` 和 `ralph-loop.py` 暂不迁移，后续单独 task
- **模板迁移**：`src/templates/scripts/` 保持 shell，用户项目不受影响
- **OpenCode 支持**：架构预留，但本次不实现 OpenCodeAdapter

## 外部依赖

- `execa` - 执行 git 命令 (agent 启动通过 PlatformAdapter)
- `zod` - 类型验证
- `@clack/prompts` - CLI 交互 (可选)

## 平台支持矩阵

| 功能 | Claude Code | OpenCode | Cursor | Codex |
|------|-------------|----------|--------|-------|
| Multi-Agent Pipeline | ✅ 完整支持 | 🚧 待实现 | ❌ 不支持 | ❌ 不支持 |
| Agent Registry | ✅ | ✅ | ❌ | ❌ |
| Phase 管理 | ✅ | ✅ | ❌ | ❌ |
| Worktree 管理 | ✅ | ✅ | ✅ | ✅ |

不支持 Multi-Agent 的平台，pipeline 命令会提示用户使用手动工作流。
