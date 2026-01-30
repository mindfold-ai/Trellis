# 重构 src/core 目录结构 - 引入 platforms 分层和 zod 类型验证

## 背景

当前 `src/core/` 存在以下问题：
1. **task.ts 过大** - 629 行，混合了任务 CRUD 和上下文管理
2. **平铺结构** - 所有模块在一层，随着 session/pipeline 增加会变混乱
3. **缺乏平台抽象** - Claude Code 特定逻辑硬编码，无法适配 OpenCode 等其他平台
4. **类型不严格** - 缺少运行时类型验证
5. **Git 操作待扩展** - 需要支持 worktree 等高级功能

## 设计决策 (Brainstorming 结论)

### 1. 不采用 I/O 分离的 adapters 模式
- **原因**: CLI 工具的 I/O 操作本身就是业务逻辑，强制分离增加不必要的复杂性
- **决策**: 按业务领域区分，不强制分离纯函数和 I/O

### 2. 独立的 platforms 模块
- **原因**: 平台适配不仅是 context 生成，还包括配置目录、Hook 机制、模板格式等
- **决策**: `core/platforms/` 作为独立模块，task 调用它而不是嵌套它

### 3. 使用 execa 而非 simple-git
- **原因**: simple-git 对 worktree 没有封装，需要 `raw()` 调用；execa 是业界标准 (Shadcn/ui 等)
- **决策**: 使用 `execa` 执行 git 命令，Promise API + 优秀错误处理

### 4. Git 模块拆分为目录
- **原因**: worktree 是独立功能集，未来可能还有 hooks、submodules 等
- **决策**: `core/git/` 目录，按功能拆分 base + worktree

## 目标结构

```
src/
├── core/                              # 业务领域模块
│   │
│   ├── platforms/                     # 平台适配（独立模块）
│   │   ├── index.ts                   # detectPlatform() + 统一入口
│   │   ├── types.ts                   # Platform enum, PlatformAdapter 接口
│   │   ├── claude/
│   │   │   ├── index.ts               # Claude adapter 实现
│   │   │   └── context.ts             # Claude context 生成 (.jsonl)
│   │   └── opencode/
│   │       ├── index.ts               # OpenCode adapter 实现 (未来)
│   │       └── context.ts             # OpenCode context 生成 (未来)
│   │
│   ├── task/
│   │   ├── index.ts                   # 统一导出
│   │   ├── crud.ts                    # Task CRUD (create, read, update, archive, list)
│   │   ├── context.ts                 # context 管理 (调用 platforms)
│   │   └── schemas.ts                 # Zod schemas (Task, ContextEntry)
│   │
│   ├── developer/
│   │   ├── index.ts                   # 开发者管理
│   │   └── schemas.ts                 # Developer schema
│   │
│   ├── session/                       # Session/Journal 管理 (新增)
│   │   ├── index.ts                   # 统一导出
│   │   ├── journal.ts                 # Journal 文件操作 (读写、轮转)
│   │   ├── workspace.ts               # Workspace index.md 更新
│   │   └── schemas.ts                 # Session schema
│   │
│   ├── git/
│   │   ├── index.ts                   # 统一导出
│   │   ├── base.ts                    # 基础操作 (status, branch, commit)
│   │   ├── worktree.ts                # worktree 操作 (create, list, remove)
│   │   ├── config.ts                  # worktree.yaml 配置解析
│   │   └── types.ts                   # GitCommit, GitStatus, Worktree, WorktreeConfig
│   │
│   ├── paths.ts                       # 路径工具
│   └── index.ts                       # 统一导出 core 模块
│
├── types/                             # 共享类型
│   ├── index.ts                       # 统一导出
│   ├── task.ts                        # Re-export from core/task/schemas
│   ├── ai-tools.ts                    # (不变)
│   └── migration.ts                   # (不变)
│
├── constants/                         # 常量 (不变)
│   └── paths.ts
│
├── commands/                          # CLI 命令 (不变)
└── cli/                               # CLI 入口 (不变)
```

## 依赖关系

```
┌─────────────┐
│  commands/  │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────┐
│            core/             │
│  ┌───────┐                   │
│  │ task/ │───────┐           │
│  └───────┘       │           │
│  ┌─────────┐     ▼           │
│  │ session │  ┌────────────┐ │
│  └─────────┘  │ platforms/ │ │
│  ┌───────┐    └────────────┘ │
│  │ git/  │                   │
│  └───────┘                   │
│  ┌─────────┐                 │
│  │developer│                 │
│  └─────────┘                 │
│  ┌───────┐                   │
│  │ paths │ ← 被所有模块依赖   │
│  └───────┘                   │
└──────────────────────────────┘
```

## 技术要求

### 1. Zod 类型验证

**安装依赖**:
```bash
pnpm add zod
```

**Schema 定义示例** (`core/task/schemas.ts`):
```typescript
import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "planning",
  "in_progress",
  "completed",
  "archived",
]);

export const TaskPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  // ...
});

// 从 schema 推导类型
export type Task = z.infer<typeof TaskSchema>;
```

### 2. Git 操作使用 execa

**安装依赖**:
```bash
pnpm add execa yaml
```

> `yaml` 用于解析 `worktree.yaml` 配置文件

**使用示例** (`core/git/worktree.ts`):
```typescript
import { execa } from 'execa';

export async function createWorktree(
  repoRoot: string,
  worktreePath: string,
  branchName: string,
): Promise<void> {
  await execa('git', ['worktree', 'add', worktreePath, '-b', branchName], {
    cwd: repoRoot,
  });
}

export async function listWorktrees(repoRoot: string): Promise<Worktree[]> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
  });
  return parseWorktreeOutput(stdout);
}
```

### 3. Platform Adapter 接口

```typescript
// core/platforms/types.ts
export type Platform = 'claude' | 'opencode' | 'cursor' | 'codex';

export interface PlatformAdapter {
  readonly platform: Platform;

  // === Context 生成 ===
  generateContextFiles(taskDir: string, devType: DevType): void;
  getConfigDir(): string;  // .claude/ or .opencode/

  // === 能力检测 ===
  supportsMultiAgent(): boolean;  // 是否支持 multi-agent pipeline
  supportsHooks(): boolean;       // 是否支持 hooks

  // === Agent 启动 (用于 multi-agent pipeline) ===
  launchAgent(options: LaunchAgentOptions): Promise<AgentProcess>;
  parseAgentLog(line: string): AgentLogEntry | null;
}

export interface LaunchAgentOptions {
  agentType: 'plan' | 'dispatch';
  workDir: string;
  taskDir: string;
  agentFile?: string;    // 自定义 agent 文件路径
  background?: boolean;  // 是否后台运行
}

export interface AgentProcess {
  pid: number;
  logFile: string;
  sessionId?: string;
}

export interface AgentLogEntry {
  type: 'tool_call' | 'message' | 'error' | 'complete';
  timestamp: string;
  content: unknown;
}
```

**设计说明**：
- Pipeline 模块通过 `PlatformAdapter` 接口调用 agent，不直接硬编码 `claude` 命令
- 这样后续添加 OpenCode 支持时，只需实现新的 adapter，Pipeline 逻辑不需要改动
- `supportsMultiAgent()` 用于检测平台能力，不支持时优雅降级

### 4. Session 模块

**功能来源**: `add-session.sh`, `common/developer.sh` (workspace 部分)

```typescript
// core/session/schemas.ts
import { z } from "zod";

export const SessionSchema = z.object({
  title: string,
  commit: z.string().optional(),
  summary: z.string().optional(),
  timestamp: z.string(),
});

export type Session = z.infer<typeof SessionSchema>;
```

```typescript
// core/session/journal.ts
export interface JournalInfo {
  filePath: string;
  lineCount: number;
  sessionCount: number;
}

// 获取当前 journal 文件信息
export function getActiveJournal(developer: string, repoRoot?: string): JournalInfo;

// 添加 session 到 journal
export function addSession(developer: string, session: Session, repoRoot?: string): void;

// 自动轮转 (超过 2000 行时创建新文件)
export function rotateJournalIfNeeded(developer: string, repoRoot?: string): string;
```

```typescript
// core/session/workspace.ts
// 更新 workspace/index.md 的标记区域
export function updateWorkspaceIndex(developer: string, repoRoot?: string): void;
```

### 5. Worktree 配置解析

**功能来源**: `common/worktree.sh`

```typescript
// core/git/config.ts
import { z } from "zod";

export const WorktreeConfigSchema = z.object({
  base_dir: z.string().optional(),
  copy_files: z.array(z.string()).optional(),
  post_create: z.array(z.string()).optional(),
});

export type WorktreeConfig = z.infer<typeof WorktreeConfigSchema>;

// 解析 .trellis/worktree.yaml
export function loadWorktreeConfig(repoRoot?: string): WorktreeConfig;
```

### 6. 向后兼容

保持 `src/core/index.ts` 的导出不变：
```typescript
// src/core/index.ts
export * from "./task/index.js";
export * from "./developer/index.js";
export * from "./session/index.js";
export * from "./git/index.js";
export * from "./platforms/index.js";
export * from "./paths.js";
```

## 实施步骤

### Phase 1: 准备工作
- [ ] 安装依赖: `pnpm add zod execa yaml`
- [ ] 创建目录结构

### Phase 2: Platforms 模块
- [ ] `core/platforms/types.ts` - Platform enum, PlatformAdapter 接口
- [ ] `core/platforms/claude/context.ts` - 从 task.ts 提取 getXxxContext 函数
- [ ] `core/platforms/claude/index.ts` - Claude adapter 实现
- [ ] `core/platforms/index.ts` - detectPlatform() + 统一入口

### Phase 3: Task 模块重构
- [ ] `core/task/schemas.ts` - Zod schemas
- [ ] `core/task/crud.ts` - Task CRUD 逻辑
- [ ] `core/task/context.ts` - 调用 platforms 的 context 管理
- [ ] `core/task/index.ts` - 统一导出

### Phase 4: Git 模块重构
- [ ] `core/git/types.ts` - 类型定义
- [ ] `core/git/base.ts` - 迁移现有代码，改用 execa
- [ ] `core/git/worktree.ts` - worktree 操作
- [ ] `core/git/index.ts` - 统一导出

### Phase 5: Developer 模块
- [ ] `core/developer/schemas.ts` - Developer schema
- [ ] `core/developer/index.ts` - 迁移现有代码

### Phase 6: Session 模块 (新增)
- [ ] `core/session/schemas.ts` - Session schema
- [ ] `core/session/journal.ts` - Journal 文件操作 (来自 add-session.sh)
- [ ] `core/session/workspace.ts` - Workspace index.md 更新
- [ ] `core/session/index.ts` - 统一导出

### Phase 7: 清理与验证
- [ ] 更新 `core/index.ts` 保持兼容
- [ ] 更新所有 import 路径
- [ ] 删除旧文件
- [ ] `pnpm build` 编译通过
- [ ] `pnpm lint` 无警告
- [ ] 测试所有 CLI 命令

## 文件迁移清单

| 操作 | 原文件 | 新文件 |
|------|--------|--------|
| 拆分 | `core/task.ts` (CRUD) | `core/task/crud.ts` |
| 拆分 | `core/task.ts` (context) | `core/task/context.ts` |
| 移动 | `core/task.ts` (getXxxContext) | `core/platforms/claude/context.ts` |
| 新增 | - | `core/task/schemas.ts` |
| 新增 | - | `core/platforms/types.ts` |
| 新增 | - | `core/platforms/index.ts` |
| 新增 | - | `core/platforms/claude/index.ts` |
| 移动 | `core/git.ts` | `core/git/base.ts` |
| 新增 | - | `core/git/worktree.ts` |
| 新增 | - | `core/git/config.ts` |
| 新增 | - | `core/git/types.ts` |
| 移动 | `core/developer.ts` | `core/developer/index.ts` |
| 新增 | - | `core/developer/schemas.ts` |
| 新增 | `scripts/add-session.sh` 逻辑 | `core/session/journal.ts` |
| 新增 | `scripts/add-session.sh` 逻辑 | `core/session/workspace.ts` |
| 新增 | - | `core/session/schemas.ts` |
| 新增 | - | `core/session/index.ts` |
| 保持 | `core/paths.ts` | `core/paths.ts` |
| 删除 | `core/task.ts` | - |
| 删除 | `core/git.ts` | - |
| 删除 | `core/developer.ts` | - |

## 验收标准

- [ ] 目录结构符合设计
- [ ] 所有 JSON 读取使用 zod 验证
- [ ] Git 操作使用 execa
- [ ] Platform adapter 接口定义完成
- [ ] Claude adapter 实现完成
- [ ] Session 模块实现完成 (journal + workspace)
- [ ] Worktree 配置解析实现完成
- [ ] 无 `any` 类型（除了第三方库类型）
- [ ] 编译和 lint 通过
- [ ] 导出路径向后兼容
- [ ] 所有 CLI 命令测试通过

## 不在本次范围

以下功能将在单独的 **Multi-Agent Pipeline 重构** 任务中处理：

- Agent Registry (`common/registry.sh`)
- Phase 管理 (`common/phase.sh`)
- Task Queue (`common/task-queue.sh`)
- Multi-Agent 脚本 (`multi-agent/*.sh`)
  - plan.sh, start.sh, status.sh, cleanup.sh, create-pr.sh
- Bootstrap 任务 (`create-bootstrap.sh`)

## 完成后检查

本任务完成后，需要检查并更新以下后续任务的文档：

- **`01-30-multi-agent-pipeline-refactor/prd.md`**
  - [ ] 确认 `PlatformAdapter` 接口的最终实现与文档一致
  - [ ] 更新依赖模块路径（如有变化）
  - [ ] 确认 `core/platforms/claude/` 的实际导出与 Pipeline 使用方式匹配
  - [ ] 如有新增的类型或接口，同步到 Pipeline 任务文档
