# Bootstrap 体验补齐：新开发者引导 + 承接 onboard 职责

## 背景

### 两个交织的缺口

**缺口 1：已有项目里 `trellis init` 不给新开发者任何引导**

`init.ts:623` 的判断（行号在 `04-21-task-schema-unify` 合并后）：
```ts
const isFirstInit = !fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW));
```

`init.ts:1347` 的分支：
```ts
if (isFirstInit) {
  createBootstrapTask(cwd, developerName, projectType, monorepoPackages);
}
```

**问题**：新开发者加入一个已有 Trellis 项目时 `.trellis/` 已存在 → `isFirstInit = false` → **根本不创建 bootstrap task**。他只拿到一个 `init_developer.py` 写进去的 identity，然后就面对一堆陌生的目录、task、spec，没有任何引导说"从哪开始"。

**缺口 2：`/onboard` 命令在 beta 版本被移除，职责没人接**

历史上 `/onboard` 命令负责：
- 引导 AI 或人类 了解项目架构
- 扫描 spec / task / workflow 熟悉约定
- 生成"项目 onboarding 总览"

beta 版本删除后，这个能力**没有迁移到任何地方**：
- Bootstrap task 的 PRD 只谈"填 spec"
- 新开发者首次打开 Claude / Cursor 没有自动引导流程
- Skills market 里虽然有 `onboard` skill，但没有在 init 时被触发或推荐

### 现状 Bootstrap PRD 的覆盖

看 `init.ts::getBootstrapPrdContent()`（`init.ts:152` 起）：

| 章节 | 内容 | 性质 |
|---|---|---|
| Purpose | 介绍 spec 为什么重要 | ✅ |
| Status | checklist 项（由 `getBootstrapChecklistItems` 动态渲染成 `- [ ]`，随 `04-21-task-schema-unify` 从 task.json 的结构化 subtasks 迁移而来） | ✅ |
| Your Task | 按项目类型列出 spec 文件清单 | ✅ |
| Step 0: Import from Existing Specs | 从 CLAUDE.md / .cursorrules 迁移 | ✅ |
| Step 1: Analyze the Codebase | 让 AI 提炼模式 | ⚠️ 泛泛 |
| Step 2: Document Reality | 写真实模式不是理想模式 | ✅ |
| Completion Checklist | finish + archive | ✅ |

**完全没有**：
- ❌ "先了解项目"（架构、核心模块、关键业务概念）
- ❌ 人类新开发者 onboard 与 AI onboard 的共用流程
- ❌ 已存在 `.trellis/spec/` 时怎么用（是通过 spec 来理解项目，还是补齐缺失部分）
- ❌ 项目创建者 vs 加入者两种角色的分流

---

## 任务目标

1. **修复 init 分支**：已有 Trellis 项目 + 新开发者加入 → 生成 **joiner-onboarding** 引导任务（不是 bootstrap-guidelines，是不同内容）
2. **扩展 Bootstrap PRD**：承接被删除的 `/onboard` 命令的职责，加"了解 Trellis 工作流"步骤（注意：onboard 是带用户熟悉 Trellis 流程，不是带用户熟悉自己的业务代码）
3. **区分两种 bootstrap**：
   - **Creator Bootstrap**（项目第一次 init）：填 spec、导入已有约定
   - **Joiner Onboarding**（新开发者加入已有项目）：读 spec、了解架构、熟悉 workflow

---

## 设计

### 分支逻辑重构

`init.ts:1347` 改为三分支判定，信号源统一到 `.trellis/.developer` 文件（gitignored，天然 per-checkout）：

```ts
const hasWorkflow = fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW));
const hasDeveloperFile = fs.existsSync(
  path.join(cwd, DIR_NAMES.WORKFLOW, FILE_NAMES.DEVELOPER),
);

if (!hasWorkflow) {
  // 项目首次 init：创建 creator bootstrap（填 spec）
  createBootstrapTask(cwd, developerName, projectType, monorepoPackages);
} else if (!hasDeveloperFile) {
  // 已有项目 + 当前 checkout 还没有 .developer：新 joiner（fresh clone / 换机器）
  createJoinerOnboardingTask(cwd, developerName);
}
// 否则：同人 re-init（`.developer` 已存在），不重复生成任务
```

**为什么用 `.developer` 文件而不是 workspace 目录**：
- `.trellis/.developer` 是 gitignored → 不会随 clone 带过来，每个 checkout 独立
- `.trellis/workspace/<name>/` 会进 git → 新人 clone 下来就存在，不能作为"是否新人"的信号
- 三态干净：无 `.trellis/` = creator，有 `.trellis/` 无 `.developer` = joiner，都有 = 同人 re-init

**已接受的行为**（非 bug）：
- 同一人换机器也会收到一份 joiner task — 视作"再熟悉一次当前项目约定"的机会，嫌多可直接 archive
- 共享 checkout（多人共用同一工作目录）只有第一位会收到 joiner — 这是 Trellis "一人一 checkout" 的前提

### Creator Bootstrap PRD 扩展

在现有 PRD 的开头插入 "Step 0: Learn the Trellis Workflow"（带用户熟悉 Trellis 本身，不是熟悉他自己的业务代码）：

```markdown
### Step 0: Learn the Trellis Workflow (for you + AI)

Before filling spec files, get familiar with how Trellis works:

- Read `.trellis/workflow.md` end-to-end — this is the contract between you and AI.
- Understand the task lifecycle: planning → in_progress → done → archive.
- Know the three directories: `.trellis/spec/` (conventions), `.trellis/tasks/` (active + archive), `.trellis/workspace/<you>/` (your journal).
- Know the core slash commands: `/trellis:start`, `/trellis:continue`, `/trellis:finish-work`, `/trellis:brainstorm`.

Ask AI:
- "Read .trellis/workflow.md and summarize the 3 phases and what I do in each."
- "When should I use /trellis:continue vs /trellis:finish-work?"
- "What's the difference between spec/ and tasks/?"

Goal: when you start filling spec files, you already know why and where they fit into the workflow.
```

### Joiner Onboarding Task（新任务类型）

**task name**：`00-join-<developer-slug>`（带 developer 名字避免碰撞；slug 规范化复用 creator bootstrap 同一套逻辑，保证空格 / Unicode / 特殊字符被安全处理）

**PRD 内容大纲**：

```markdown
# Joining: Onboard Yourself to This Trellis Project

Welcome! You're joining an existing Trellis project.
Here's a guided path to get productive fast.

## Step 1: Learn the Trellis Workflow

Read `.trellis/workflow.md` end-to-end — this is how you and AI collaborate here.

Ask AI:
- "Summarize .trellis/workflow.md — the 3 phases and what I do in each."
- "What does the task lifecycle look like (planning → in_progress → done → archive)?"
- "When should I use /trellis:continue vs /trellis:finish-work vs /trellis:start?"

## Step 2: Learn This Project's Conventions (via spec)

- `.trellis/spec/` — coding conventions this team has agreed on (start here)
- `.trellis/tasks/` — active work + recent archive (how people actually work)

Ask AI:
- "Summarize .trellis/spec/ — what conventions do I need to follow?"
- "Look at the last 5 archived tasks — what's the typical rhythm of work?" (skip this if `.trellis/tasks/archive/` is empty — the project may just be starting)

(Learning the business code itself is NOT the goal of this task — your teammates or project README handle that separately.)

## Step 3: Identify Your Assigned Work

- Check `.trellis/workspace/<you>/` if it exists
- Run `task.py list --assignee <you>`
- Look at My Tasks section in workflow-state

## Step 4: Try a Small Task

Pick any small P3 task or fix a typo. Run the full workflow once to learn.

## Completion

When you feel oriented:
```bash
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-join-<you>
```
```

### 触发逻辑 + 可复用 helper

实地扫过 `init.ts:100-384` 后确认 creator / joiner 写文件流程高度同构，值得抽两个 helper，再让两个分支各自调用：

**Helper 1 — `writeTaskSkeleton`**（抽自 `createBootstrapTask` 的身体）

```ts
function writeTaskSkeleton(
  cwd: string,
  taskName: string,
  taskJson: TaskJson,
  prdContent: string,
): boolean {
  const taskDir = path.join(cwd, PATHS.TASKS, taskName);
  if (fs.existsSync(taskDir)) return true; // idempotent

  try {
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, FILE_NAMES.TASK_JSON),
      JSON.stringify(taskJson, null, 2),
      "utf-8",
    );
    fs.writeFileSync(path.join(taskDir, FILE_NAMES.PRD), prdContent, "utf-8");
    fs.writeFileSync(
      path.join(cwd, PATHS.CURRENT_TASK_FILE),
      `${PATHS.TASKS}/${taskName}`,
      "utf-8",
    );
    return true;
  } catch {
    return false;
  }
}
```

`createBootstrapTask` 改造成调用 `writeTaskSkeleton`（行为不变），`createJoinerOnboardingTask` 同款用法。

**Helper 2 — `slugifyDeveloperName`**（新）

```ts
function slugifyDeveloperName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    || "user"; // fallback 防止纯符号名 slug 成空串
}
```

为什么不复用 `sanitizePkgName`：后者只剥 `@scope/` 前缀，不处理空格 / Unicode / `/`。developer name 不受约束，得独立处理。

**调用端**

```ts
function createJoinerOnboardingTask(cwd: string, developer: string): boolean {
  const slug = slugifyDeveloperName(developer);
  const taskName = `00-join-${slug}`;
  const taskJson = getJoinerTaskJson(developer, taskName);
  const prdContent = getJoinerPrdContent(developer);
  return writeTaskSkeleton(cwd, taskName, taskJson, prdContent);
}

// 外层调用（独立 try/catch，不被 init_developer.py 的 pipe 吞）
if (!hasWorkflow) {
  createBootstrapTask(cwd, developerName, projectType, monorepoPackages);
} else if (!hasDeveloperFile) {
  try {
    if (!createJoinerOnboardingTask(cwd, developerName)) {
      console.warn(chalk.yellow("⚠ Failed to create joiner onboarding task"));
    }
  } catch (err) {
    console.warn(chalk.yellow(`⚠ Joiner onboarding setup failed: ${err}`));
  }
}
```

**current-task 语义**：joiner 分支同样写 `.current-task`（与 creator 保持一致）。多窗口污染问题由 `04-21-session-scoped-task-state` 统一解。

**⚠️ 两处 joiner 创建点**（实现时漏一处会导致默认用户路径静默失败）：

1. **主 dispatch**（init 末尾，`!hasWorkflow` / `!hadDeveloperFileAtStart` 判定）—— 覆盖首次 init 和 `--force` / `--skip-existing` 走的完整 init
2. **`handleReinit` 的 `doAddDeveloper` 分支**（init.ts:651 附近）—— 默认 `trellis init --user bob` 在 `.trellis/` 已存在时走 re-init fast path 并 early-return，**根本到不了主 dispatch**。这条路径必须在 `init_developer.py` 执行前后独立捕获 `.developer` 存在状态，然后在 "原先没有" 时调用 `createJoinerOnboardingTask`

测试必须同时覆盖 **`force: true`**（走主 dispatch）和 **无 `force`**（走 handleReinit）两条路径，否则 re-init fast path 的 bug 会逃过 CI。
```

---

## 子任务

### 1. 分支逻辑

- [ ] 抽 `writeTaskSkeleton()` helper（mkdir + task.json + prd.md + `.current-task` + try/catch bool）
- [ ] `createBootstrapTask()` 改造成调用 `writeTaskSkeleton()`，行为不变
- [ ] 新增 `slugifyDeveloperName()`（小写 + NFKD + 非字母数字→`-` + trim + 空串 fallback）
- [ ] `init.ts` 把判定改成 `hasWorkflow` / `hasDeveloperFile` 两个 flag 组合出三分支（creator / joiner / no-op）
- [ ] 新增 `createJoinerOnboardingTask()`，用 `writeTaskSkeleton` + `slugifyDeveloperName`
- [ ] 外层调用：joiner 分支移出 `init_developer.py` 的 `try/catch`，独立 try + `console.warn`（修 `init.ts:1373` 静默吞错）
- [ ] `handleReinit` 的 `doAddDeveloper` 分支（init.ts:651）也调用 `createJoinerOnboardingTask`，先捕获 `.developer` 预存在状态，仅 "原先没有" 时触发
- [ ] ~~Single source of truth 写 JSON + PRD 内容（避免 init.ts / create_bootstrap.py 双份）~~ —— **已解决**：`04-21-task-schema-unify` 删除了 `create_bootstrap.py`，task.json 现在统一走 `utils/task-json.ts:emptyTaskJson` 工厂

### 2. Creator Bootstrap PRD 扩展

- [ ] 在 `getBootstrapPrdContent()` 插入 "Step -1: Understand Your Project" 段
- [ ] ~~Python 版 `create_bootstrap.py` 同步（或消除重复）~~ —— **已 N/A**：`04-21-task-schema-unify` 删除 `create_bootstrap.py`，只剩 TS 单源

### 3. Joiner Onboarding Task 新建

- [ ] `getJoinerTaskJson(developer, taskName)` 工厂（P1 / dev_type "docs" / creator=assignee=developer，复用 `emptyTaskJson`）
- [ ] `getJoinerPrdContent(developer)` 工厂（对应上面大纲）
- [ ] PRD "看 archived tasks" 段带 fallback 文案，空 archive 时不误导
- [ ] Monorepo / 单 repo 分支（joiner 可能只碰一个 package）

### 4. Skills / Commands 集成（可选）

- [ ] 检查 marketplace 的 `onboard` skill 是否仍有效
- [ ] 如果还用，PRD 里指引 "run `/onboard` or activate the onboard skill"
- [ ] 如果不再用，确认所有 onboard 知识都沉到 PRD 里了

### 5. 文档

- [ ] `spec/cli/backend/*` 记录两种 bootstrap 的语义
- [ ] Changelog 注明修复了新开发者 init 体验的空白

### 6. 测试

- [ ] 空目录 `trellis init` → creator bootstrap
- [ ] 有 `.trellis/` 但无 `.trellis/.developer`（fresh clone）→ joiner onboarding
- [ ] 有 `.trellis/` + `.trellis/.developer` 已存在（同人 re-init）→ 不生成任何 task
- [ ] joiner archive 后 `.developer` 仍在 → 再次 init 依旧 no-op（不生成重复 task）
- [ ] developer name 含空格 / Unicode → slug 后目录名安全、task 可正常 archive
- [ ] `createJoinerOnboardingTask` 抛错时 stderr 出现 warning，init 本身不中断
- [ ] 覆盖 **handleReinit 路径**（不加 `force: true`）：fresh checkout 应生成 joiner、同人 re-init 应 no-op — 避免 re-init fast path 被漏测

---

## 非目标

- **不自动执行** onboarding（只生成任务，AI 读到 PRD 自己走流程）
- **不恢复** `/onboard` 命令本身（命令删除的决定已做）
- **不改** marketplace 的 `onboard` skill（独立的 skill 生态）
- **不自动**探测"这个 developer 是不是项目维护者"—— 第一个 init 的人是 creator，其他都是 joiner
- **不针对 CI 环境特化**（`--no-onboard` flag、`CI=true` 探测均不做）：`trellis init` 是一次性本地 setup，CI 里跑 init 非预期场景
- **不处理 creator bootstrap 未完成时 joiner 加入的文案降级**（E8）：spec 为空时 joiner 的指令会空转，但由 AI 对话现场处理即可
- **不做 joiner task 去重检查**（E7）：`.developer` 已存在就 no-op，删掉 `.developer` 后重复生成是用户自己的选择

---

## 优先级

🔴 **P1** —— 新开发者加入体验是 Trellis 推广的关键漏斗。目前新人只能拿到一个 identity 然后面对黑盒，是体验事故。

## 风险

- **同一人换机器也会触发 joiner**：`.trellis/.developer` gitignore，所以换机器 = 无 `.developer` = 判定为 joiner。**已接受**：视作再熟悉一次当前项目的机会，不需要则直接 archive，成本低于误判成"不是新人"后零引导的体验事故
- **PRD 内容膨胀**：往 PRD 里堆太多指引会让人没耐心读。Mitigation：joiner PRD 控制在 80 行内，深度指引放 skill / docs site
- **和 `04-21-session-scoped-task-state` 的交互**：joiner onboarding 创建后会 set 为 current-task，如果同时有别的窗口在跑会污染。依赖后者完成后再发布最终体验

## 关联

- `04-21-session-scoped-task-state` —— joiner 自动 set current-task 前，得先做好多窗口隔离
- `04-21-polyrepo-detection` —— 独立
- marketplace `onboard` skill —— 承接旧 `/onboard` 命令的替代
