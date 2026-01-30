# Multi-Agent Pipeline 重构 - Agent Registry, Phase, Pipeline 脚本

## 背景

本任务是 `01-30-refactor-core-structure` 的后续任务。

在核心模块重构完成后，需要将 Multi-Agent Pipeline 相关的 bash 脚本逻辑迁移到 TypeScript CLI。

## 依赖

- **前置任务**: `01-30-refactor-core-structure` 必须先完成
- **依赖模块**: `core/task/`, `core/git/`, `core/developer/`, `core/session/`, `core/platforms/`

## 设计决策

### Pipeline 通过 Platform Adapter 启动 Agent

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
│   │   ├── registry.ts                # Agent Registry 管理
│   │   ├── phase.ts                   # Phase 跟踪
│   │   └── schemas.ts                 # Agent, Phase schemas
│   │
│   ├── task/
│   │   ├── ...                        # 现有文件
│   │   ├── queue.ts                   # 任务队列筛选 (新增)
│   │   └── utils.ts                   # 任务工具函数 (新增)
│   │
│   └── ...                            # 其他现有模块
│
├── commands/
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

### 1. Agent Registry

```typescript
// core/pipeline/schemas.ts
import { z } from "zod";

export const AgentSchema = z.object({
  id: z.string(),
  task_dir: z.string(),
  worktree_path: z.string(),
  branch: z.string(),
  pid: z.number().optional(),
  status: z.enum(["running", "completed", "failed"]),
  started_at: z.string(),
});

export type Agent = z.infer<typeof AgentSchema>;
```

```typescript
// core/pipeline/registry.ts
export function addAgent(agent: Agent, repoRoot?: string): void;
export function getAgentById(id: string, repoRoot?: string): Agent | null;
export function getAgentByWorktree(path: string, repoRoot?: string): Agent | null;
export function removeAgent(id: string, repoRoot?: string): void;
export function listAgents(repoRoot?: string): Agent[];
```

### 2. Phase 管理

```typescript
// core/pipeline/phase.ts
export function getCurrentPhase(taskDir: string): number;
export function getTotalPhases(taskDir: string): number;
export function getPhaseAction(taskDir: string, phase: number): string;
export function setPhase(taskDir: string, phase: number): void;
export function advancePhase(taskDir: string): number;
```

### 3. Pipeline 命令

每个命令应该：
- **通过 `PlatformAdapter` 启动 agent**（不直接调用 `claude` 命令）
- 使用 `core/pipeline/` 模块管理状态 (registry, phase)
- 使用 `core/git/worktree.ts` 管理 worktree
- 检测平台能力，不支持时优雅提示
- 提供清晰的输出和错误处理

```typescript
// 示例：commands/pipeline/start.ts
import { getPlatformAdapter } from '../../core/platforms/index.js';
import { createWorktree } from '../../core/git/worktree.js';
import { addAgent } from '../../core/pipeline/registry.js';

export async function start(taskDir: string, options: StartOptions) {
  const adapter = getPlatformAdapter();

  // 1. 检测平台能力
  if (!adapter.supportsMultiAgent()) {
    throw new Error(`${adapter.platform} does not support multi-agent pipeline`);
  }

  // 2. 创建 worktree
  const worktreePath = await createWorktree(repoRoot, branchName);

  // 3. 通过 adapter 启动 agent
  const process = await adapter.launchAgent({
    agentType: 'dispatch',
    workDir: worktreePath,
    taskDir,
    background: true,
  });

  // 4. 注册 agent
  addAgent({
    id: process.sessionId,
    task_dir: taskDir,
    worktree_path: worktreePath,
    pid: process.pid,
    // ...
  });
}
```

## 实施步骤

### Phase 1: Core Pipeline 模块
- [ ] `core/pipeline/schemas.ts` - Agent, Phase schemas
- [ ] `core/pipeline/registry.ts` - Agent Registry
- [ ] `core/pipeline/phase.ts` - Phase 管理
- [ ] `core/pipeline/index.ts` - 统一导出

### Phase 2: Task 扩展
- [ ] `core/task/queue.ts` - 任务队列筛选
- [ ] `core/task/utils.ts` - 任务工具函数

### Phase 3: Pipeline 命令
- [ ] `commands/pipeline/index.ts` - 子命令入口
- [ ] `commands/pipeline/plan.ts`
- [ ] `commands/pipeline/start.ts`
- [ ] `commands/pipeline/status.ts`
- [ ] `commands/pipeline/cleanup.ts`
- [ ] `commands/pipeline/create-pr.ts`

### Phase 4: Init 扩展
- [ ] `commands/init.ts` - 添加 `--bootstrap` 选项

### Phase 5: 验证
- [ ] `pnpm build` 编译通过
- [ ] `pnpm lint` 无警告
- [ ] 测试所有 pipeline 命令

## 验收标准

- [ ] Agent Registry 功能完整 (CRUD)
- [ ] Phase 管理功能完整
- [ ] 所有 pipeline 命令可用
- [ ] 与现有 bash 脚本行为一致
- [ ] 编译和 lint 通过

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
