# CLI 命令扩展 - 收敛 Shell 脚本到 TypeScript CLI

## 背景

当前 Trellis 的核心功能依赖 `.trellis/scripts/` 下的 Bash 脚本实现，导致：
1. **Windows 用户无法使用** - 缺少 bash 环境
2. **维护困难** - ~3,500 行 bash 代码分散在多个文件
3. **扩展受限** - 上层 AI IDE 适配（OpenCode/Codex）最终还是要调用这些脚本

现有 CLI 已实现 `init` 和 `update` 命令，使用 Commander.js 框架。

## 目标

将 `.trellis/scripts/` 中的核心功能迁移到 TypeScript CLI，实现：
- 跨平台支持（Windows/macOS/Linux）
- 统一的命令接口
- 为上层 AI IDE 适配提供稳定的调用层

## 范围

### Phase 1: 核心命令（本任务）

| 新命令 | 替代脚本 | 优先级 | 状态 |
|--------|---------|--------|------|
| `trellis context` | `get-context.sh`, `git-context.sh` | P0 | ✅ |
| `trellis developer init` | `init-developer.sh` | P0 | ✅ |
| `trellis developer show` | `get-developer.sh` | P0 | ✅ |
| `trellis task create` | `task.sh create` | P0 | ✅ |
| `trellis task list` | `task.sh list` | P0 | ✅ |
| `trellis task start` | `task.sh start` | P1 | ✅ |
| `trellis task finish` | `task.sh finish` | P1 | ✅ |
| `trellis task archive` | `task.sh archive` | P1 | ✅ |
| `trellis task context init` | `task.sh init-context` | P1 | ✅ |
| `trellis task context add` | `task.sh add-context` | P2 | ✅ |
| `trellis task bootstrap` | `create-bootstrap.sh` | P2 | ✅ |
| `trellis session add` | `add-session.sh` | P2 | ✅ |
| `trellis session status` | (新增) | P2 | ✅ |

### Phase 2: Pipeline 命令（后续任务）

| 命令 | 替代脚本 |
|------|---------|
| `trellis pipeline plan` | `multi-agent/plan.sh` |
| `trellis pipeline start` | `multi-agent/start.sh` |
| `trellis pipeline status` | `multi-agent/status.sh` |
| `trellis pipeline cleanup` | `multi-agent/cleanup.sh` |
| `trellis pipeline create-pr` | `multi-agent/create-pr.sh` |

### 不在范围内

- Hook 系统重构（保持现有 Python hooks）
- AI IDE 适配（单独任务 01-30-multi-ide-support）

## 技术设计

### 目录结构

```
src/
├── cli/
│   └── index.ts              # 现有，添加新命令
├── commands/
│   ├── init.ts               # 现有
│   ├── update.ts             # 现有
│   ├── context.ts            # 新增
│   ├── developer.ts          # 新增
│   ├── task/
│   │   ├── index.ts          # task 命令入口
│   │   ├── create.ts
│   │   ├── list.ts
│   │   ├── start.ts
│   │   ├── finish.ts
│   │   ├── archive.ts
│   │   └── context.ts        # task context 子命令
│   └── session.ts            # 新增
├── core/                     # 新增：核心逻辑层
│   ├── paths.ts              # 路径工具（对应 common/paths.sh）
│   ├── developer.ts          # 开发者管理
│   ├── task.ts               # 任务 CRUD
│   ├── task-queue.ts         # 任务队列
│   ├── context.ts            # 上下文生成
│   └── git.ts                # Git 操作封装
└── types/
    └── task.ts               # 任务类型定义
```

### 核心模块设计

#### 1. paths.ts（对应 common/paths.sh）

```typescript
// 常量
export const DIR_WORKFLOW = '.trellis';
export const DIR_TASKS = 'tasks';
export const DIR_SPEC = 'spec';
export const DIR_WORKSPACE = 'workspace';

// 函数
export function getRepoRoot(): string;
export function getTasksDir(): string;
export function getCurrentTask(): string | null;
export function setCurrentTask(taskDir: string): void;
export function clearCurrentTask(): void;
```

#### 2. task.ts（对应 task.sh + task-utils.sh）

```typescript
interface Task {
  id: string;
  name: string;
  title: string;
  status: 'planning' | 'in_progress' | 'completed' | 'archived';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  assignee: string;
  dev_type: 'backend' | 'frontend' | 'fullstack' | null;
  branch: string | null;
  // ...
}

export function createTask(title: string, options: CreateTaskOptions): Task;
export function listTasks(filter?: TaskFilter): Task[];
export function getTask(idOrName: string): Task | null;
export function updateTask(id: string, updates: Partial<Task>): Task;
export function archiveTask(name: string): void;
```

#### 3. context.ts（对应 git-context.sh）

```typescript
interface SessionContext {
  developer: string;
  timestamp: string;
  git: {
    branch: string;
    status: string;
    recentCommits: string[];
  };
  currentTask: Task | null;
}

export function getContext(options: { json?: boolean }): SessionContext | string;
```

### 命令示例

```typescript
// src/commands/task/create.ts
import { Command } from 'commander';
import { createTask } from '../../core/task';

export function registerCreateCommand(program: Command) {
  program
    .command('create <title>')
    .description('Create a new task')
    .option('--slug <name>', 'Custom slug for task directory')
    .option('--assignee <dev>', 'Assign to developer')
    .option('--priority <level>', 'Priority (P0-P3)', 'P2')
    .action((title, options) => {
      const task = createTask(title, options);
      console.log(`Created task: ${task.id}`);
    });
}
```

### 依赖

现有依赖已足够：
- `commander` - CLI 框架
- `chalk` - 终端颜色
- `inquirer` - 交互式提示

可能新增：
- `simple-git` - Git 操作（替代 shell 调用）
- `yaml` - YAML 解析（worktree.yaml）

## 兼容性

### 向后兼容

1. **保留 shell 脚本** - 作为 fallback，不立即删除
2. **相同输出格式** - CLI 命令输出与脚本保持一致
3. **Hook 兼容** - 现有 Python hooks 可调用新 CLI 命令

### 迁移路径

1. CLI 命令实现后，hooks 逐步切换调用方式：
   ```python
   # 旧
   subprocess.run(['./.trellis/scripts/task.sh', 'list'])
   # 新
   subprocess.run(['trellis', 'task', 'list'])
   ```

2. 验证无问题后，在后续版本移除 shell 脚本

## 验收标准

### 功能验收

- [x] `trellis context` 输出与 `get-context.sh` 一致
- [x] `trellis developer init/show` 功能正常
- [x] `trellis task create/list/start/finish/archive` 完整可用
- [x] `trellis task context init/add` 正确生成 jsonl 文件
- [x] `trellis session add/status` 功能正常
- [ ] Windows 环境下所有命令可正常运行

### 质量验收

- [x] TypeScript 类型完整，无 any
- [ ] 单元测试覆盖核心模块
- [x] 错误处理友好，有明确提示

## 实施计划

1. ✅ **Step 1**: 创建 `src/core/` 基础模块（paths, developer, git）
2. ✅ **Step 2**: 实现 `trellis context` 命令
3. ✅ **Step 3**: 实现 `trellis developer` 命令
4. ✅ **Step 4**: 实现 `trellis task` 命令族（含 bootstrap）
5. ✅ **Step 5**: 实现 `trellis session` 命令
6. ⬜ **Step 6**: Windows 环境测试
7. ✅ **Step 7**: 更新文档（workflow.md 已更新使用 CLI 命令）

## 参考

- 现有脚本: `.trellis/scripts/`
- 现有 CLI: `src/cli/index.ts`
- 任务类型定义: `src/types/`
