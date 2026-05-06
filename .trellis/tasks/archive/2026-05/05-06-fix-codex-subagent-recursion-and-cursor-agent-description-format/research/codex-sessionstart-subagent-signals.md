# Codex SessionStart sub-agent 识别信号研究

- **Query**: Codex CLI（multi_agent_v2）下，SessionStart hook 在被 spawn 出来的 sub-agent 会话里如何识别"我是 sub-agent"？
- **Scope**: external（OpenAI Codex CLI 文档 + codex-rs 源码 + GitHub issue）+ internal（仓库 hook/agent 代码）
- **Date**: 2026-05-06

---

## 结论一句话

**当前 Codex CLI（截至 0.118.0 / `codex_hooks` Stage::Stable）SessionStart hook 的 stdin payload 里完全没有任何字段能区分主会话 vs sub-agent**——这是 OpenAI 官方已确认的功能缺口（issue [openai/codex#16226](https://github.com/openai/codex/issues/16226)，`@eternal-openai` 2026-05-04 回复 "We're working on the subagent hooks"，状态 OPEN）。Codex 内核**自己知道**当前是不是 sub-agent（`SessionSource::SubAgent(SubAgentSource::ThreadSpawn { parent_thread_id, depth, agent_path, agent_role, .. })`），但**没有把这些字段透传给 hook**。

因此 Trellis 修 #234 递归只有两条可走的路：

1. **治标（推荐立即落地）**：在 `.codex/agents/trellis-implement.toml` / `trellis-check.toml` 的 `developer_instructions` 里加硬约束（"你是 trellis-implement 子代理，绝不再 spawn trellis-implement / trellis-check"）。这条路不依赖任何平台暴露字段。
2. **治本（依赖上游 fix #16226 落地后才可行）**：等 Codex 给 SessionStart hook 加 `agent_id` / `agent_type` 字段之后，在 `codex/hooks/session-start.py` 里检测这俩字段并跳过 dispatch 措辞注入。**现在做不到**。

**自注入 env-var 路线（Q4）也不靠谱**——`shell_environment_policy` 控制的是"Codex 启动子进程（如 bash 工具）时给子进程的 env"，**不是** "spawn sub-agent 时给 sub-agent 的 env"。sub-agent 是同一个 codex 进程内的另一条线程/会话，没有独立的进程级 env 注入点；并且 codex 默认会把 `*KEY*`/`*SECRET*`/`*TOKEN*` 类变量过滤掉，自定义 env var 即使设了也不一定 propagate 到 hook 子进程。

---

## Q1: hook stdin payload 字段

### 当前 SessionStart 实际字段（来自 [Codex Hooks 官方文档](https://developers.openai.com/codex/hooks)）

Common input fields（所有 hook 事件共用）：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `session_id` | string | 当前 session/thread id |
| `transcript_path` | string \| null | session transcript 文件路径 |
| `cwd` | string | 工作目录 |
| `hook_event_name` | string | "SessionStart" |
| `model` | string | active model slug |
| `permission_mode` | string | 权限模式 |

SessionStart 额外字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `source` | string | "startup" / "resume" / "clear" |

**没有** `agent_id` / `agent_type` / `parent_session_id` / `is_subagent` / `agent_path` / `agent_role` 等任何区分主会话 vs sub-agent 的字段。

### 内核侧确实有这些字段

`codex-rs/protocol/src/protocol.rs` 定义了 `SessionSource`：

```rust
pub enum SessionSource {
    Cli,
    VSCode,
    Exec,
    Mcp,
    Custom(String),
    SubAgent(SubAgentSource),  // ← sub-agent 走这个分支
    Unknown,
}

pub enum SubAgentSource {
    Review,
    Compact,
    MemoryConsolidation,
    ThreadSpawn {
        parent_thread_id: ThreadId,
        depth: i32,
        agent_path: Option<String>,
        agent_role: Option<String>,
        // ...
    },
    Other(String),
}
```

`codex-rs/core/src/hook_runtime.rs::run_pending_session_start_hooks` 构造 `SessionStartRequest` 时**只塞了** `session_id, cwd, transcript_path, model, permission_mode, source`——**没有把 `session_source: SessionSource` 透传**。这就是缺口所在。

### 官方 issue + 计划修复

[openai/codex#16226 — "Hooks: distinguish subagent events from main agent"](https://github.com/openai/codex/issues/16226)（2026-03-30 by @WaelBKZ，OPEN）：

> All hook events (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop) fire identically for both the main agent and subagent sessions. The hook input JSON contains no field to distinguish between the two, making it impossible for hook scripts to apply logic only to the main session or only to subagents.

提议方案（issue 描述里给出了完整 diff 草案）：

- 主会话事件不带 `agent_id` / `agent_type`（`skip_serializing_if`，JSON 里完全省略）。
- sub-agent 事件带 `agent_id`（= 子会话自己的 thread/session id）+ `agent_type`（来自 `SubAgentSource`：`"review"` / `"compact"` / `"memory_consolidation"` / `agent_role`（`ThreadSpawn` 的角色名，例如 `"trellis-implement"`） / `Other(label)`）。
- 主会话判定：`agent_id` 字段缺失 = 主会话。

OpenAI contributor `@eternal-openai`（即原 hooks 系统作者 Andrei Eternal）2026-05-04 回复："Thanks guys! We're working on the subagent hooks." → 状态仍是 OPEN，未发版。

**结论**：今天写 hook 没办法靠 stdin 字段判断 sub-agent；上游修了之后可以。

### 第三方独立验证

[`agent-hook-schemas` 库 README](https://github.com/mherod/agent-hook-schemas/blob/main/README.md) 给出的跨平台字段对照表里，`agent_id`/`agent_type` 列：

| 字段 | Claude | **Codex** | Gemini | Cursor |
|---|---|---|---|---|
| `agent_id`/`agent_type` | Yes | **—** | — | — |

Codex 那一栏明确是 "—"（未提供），佐证文档列出的就是全部字段。

---

## Q2: 环境变量

### 已知 Codex 会自动设置的 env var

仓库自己的 hook 已经在用：

- `CODEX_SESSION_ID`
- `CODEX_THREAD_ID`
- `CODEX_NON_INTERACTIVE`（`should_skip_injection()` 在用）

**关键问题：sub-agent 的 `CODEX_SESSION_ID` / `CODEX_THREAD_ID` 跟主会话的关系是什么？**

未在公开文档/issue 里找到明确说法。从源码看：

- 每个 sub-agent 是 `Codex::spawn(CodexSpawnArgs { ..., session_source: SessionSource::SubAgent(subagent_source), ... })`（`codex-rs/core/src/codex_delegate.rs::run_codex_thread_interactive`），有自己独立的 `conversation_id: ThreadId`。所以 sub-agent 进程里的 `CODEX_SESSION_ID` 应当是子线程自己的 ID，跟父线程不同。
- 但 hook 拿不到"父 thread id"——`parent_thread_id_header_value` 只在 HTTP 请求 header（`OpenAI-Subagent-Parent-Thread-ID` 等）里传给后端 OpenAI 服务，**不会**写到 hook 进程的 env 或 stdin。

**结论**：靠 `CODEX_SESSION_ID` / `CODEX_THREAD_ID` 也无法识别 sub-agent。它们只是个不透明的 ID，没有"父子"关系暴露给 hook。

### 没找到的 env var

搜索 `"CODEX_SUBAGENT"` / `"CODEX_AGENT_NAME"` / `"CODEX_PARENT"` / `"CODEX_AGENT_KIND"` / `"CODEX_AGENT_PATH"` 在 GitHub 全网都没有返回 OpenAI codex 仓库相关的命中。代码搜索 `codex-rs/core/src/exec_env.rs` 里的 `populate_env` 函数也只处理用户配置的 `shell_environment_policy.set` 覆盖项，**没有**任何"自动注入 sub-agent 元信息 env var"的逻辑。

### 子进程 env 是怎么来的？

`codex-rs/core/src/exec_env.rs::create_env(policy)` 的算法是：

1. 按 `policy.inherit`（`all` / `core` / `none`）从 `std::env::vars()` 拉取。
2. 默认排除 `*KEY*` / `*SECRET*` / `*TOKEN*`（除非 `ignore_default_excludes = true`）。
3. 应用 `policy.exclude` / `policy.set` / `policy.include_only`。

这是**给"agent 启动的子进程（bash / apply_patch）"用的**，不是"给 spawn 出来的 sub-agent 进程用的"——实际上 sub-agent 根本不是独立进程，是同一个 codex 进程里的另一个 `Session`/`ThreadId`。hook 进程是 codex 主进程 fork 出来的子进程（`command_runner.rs` 在 hook 触发时执行的），**hook 进程的 env 来自 codex 主进程的 env**。

### 结论

- 没有 Codex 自动注入的 sub-agent 标识 env var。
- `CODEX_SESSION_ID` / `CODEX_THREAD_ID` 不能用来反推父子关系。
- env-var 路线（Q4 备选）需要"主会话能在 spawn sub-agent 时给 sub-agent 注入一个 env var"——这个能力 Codex 不暴露（详见 Q4）。

---

## Q3: hook 触发时机

### SessionStart 在 sub-agent 会话里**确实会触发**

证据链：

1. **源码**：`codex-rs/core/src/codex_delegate.rs::run_codex_thread_interactive` 里 sub-agent 通过 `Codex::spawn(CodexSpawnArgs { ..., session_source: SessionSource::SubAgent(...), ... })` 启动。`Codex::spawn` 走的是和主会话**完全相同**的 session 初始化路径。`hook_runtime.rs::run_pending_session_start_hooks` 在 session 启动时会被调用——它不区分 `SessionSource`，所以 sub-agent session 也会触发 SessionStart hook。

2. **issue #16226 直接确认**：

   > All hook events (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop) fire identically for both the main agent and subagent sessions.

   这是 issue 标题和第一句话——bug 报告者明确观察到 SessionStart 在 sub-agent 也跑了一次。

3. **#234 报告者观察到的嵌套结构**：

   ```
   /root/implement_w5300_mac                         running
   /root/implement_w5300_mac/implement_w5300_mac     completed
   ```

   这就是 sub-agent 会话里 SessionStart 跑了一次、读到主会话同款的"dispatch trellis-implement"指令、自己又 spawn 了一个同名子代理的活证据。

### 是否有 CLI flag 关掉 sub-agent 的 SessionStart？

未找到。文档（[Codex Hooks](https://developers.openai.com/codex/hooks) + [Subagents](https://developers.openai.com/codex/multi-agent/) + [Configuration Reference](https://developers.openai.com/codex/config-reference)）里没有 `--no-session-start-hook` / `agents.disable_hooks` / 类似开关。

唯一相关的是 `agents.max_depth = 0` 可以禁止任何 sub-agent spawn（默认 1）——但这是治标里的"治标"：直接禁掉子代理功能，不是我们想要的。

### 进程模型补充

需要明确一个常被搞混的点：

> **Codex 主会话和 sub-agent 跑的是同一个 codex 进程内的两个 `Session`，不是两个独立 OS 进程。**

依据：`codex-rs/core/src/codex_delegate.rs::run_codex_thread_interactive` 用 `tokio::spawn` 启动 sub-agent 的事件转发任务，sub-agent 的 `Session` 通过 `async_channel` 跟父 session 通信。sub-agent 没有 `fork()` / 独立 PID。

**但 hook 仍然跑两次**——因为 hook 是命令行程序（`command_runner.rs` 用系统 shell 执行），每个 session（不管主/子）启动时都会触发自己的 SessionStart hook 调用，每次都会 fork 一个新的 hook 子进程。所以从 hook 脚本的视角，确实是"被调起两次"，每次拿到不同的 `session_id`。

---

## Q4: 备选方案 — 自注入 env var

**结论：不可行。Codex 没暴露"主会话给 sub-agent 注入 env var"的能力。**

详细论证：

### 4.1 codex 自定义 agent toml 不支持设 env

[官方 schema](https://developers.openai.com/codex/multi-agent/) 列出 custom agent toml 支持的字段：

| 字段 | 必需 |
|---|---|
| `name` | Yes |
| `description` | Yes |
| `developer_instructions` | Yes |
| `nickname_candidates` | No |
| `model` | No |
| `model_reasoning_effort` | No |
| `sandbox_mode` | No |
| `mcp_servers` | No |
| `skills.config` | No |

> You can also include other supported `config.toml` keys in a custom agent file, such as `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, and `skills.config`.

可继承的 `config.toml` key 清单里**没有** `shell_environment_policy`，也没有任何"给 sub-agent 设 env var"的字段。

### 4.2 `shell_environment_policy.set` 不是 sub-agent env

`shell_environment_policy` 控制的是 codex 启动**用户态子进程**（bash / apply_patch / MCP server）时给那个子进程的 env。它**不**控制：

- sub-agent session 自身（sub-agent 不是独立进程）。
- sub-agent session 内部 hook 子进程的 env。

实际上 hook 子进程的 env 是从 codex 主进程的 `std::env::vars()` 直接继承（参见 `command_runner.rs`）——意味着如果**主会话启动前**就在 shell 环境里 `export TRELLIS_AGENT_KIND=main`，所有 hook（主会话的 + 任何 sub-agent 的）都会看到同一个值，**无法区分**。

### 4.3 想"主会话动态设环境再让 sub-agent 继承"也不行

理论上代码可以 `os.environ["X"] = "main"` 然后 sub-agent 进程里看到——但 sub-agent 不是 fork，是同进程里的另一个 session，其 hook 子进程看到的 env 跟主会话 hook 子进程看到的是**同一个 codex 主进程的 env**。改这个 env 会污染所有后续 hook。

### 4.4 唯一接近可行的"自给自足"标记

只有一种 env-var 路线**可能**能凑合用：

- 在 `.codex/agents/trellis-implement.toml` / `trellis-check.toml` 的 `developer_instructions` 里，写一段"在你写文件 / 跑命令前先 `export TRELLIS_AGENT_KIND=sub`"——但这要求模型先听话执行 shell 命令，**SessionStart 已经在模型动作之前触发**，所以这条路无效（hook 跑的时候模型还没机会 export）。

### 4.5 真正能区分的 env var：上游需要先加

issue #16226 提议的修复完全没动 env var——它走的是 hook stdin JSON。所以即使上游 fix 落地，也不会有新的 env var 可用，只会有新的 stdin 字段（`agent_id` / `agent_type`）。

---

## 推荐修复方案

基于上述事实，给主 agent 的决策建议：

### 立刻落地（覆盖 100% 用户）：方案 B（agent toml 硬约束）

在 `packages/cli/src/templates/codex/agents/trellis-implement.toml` 和 `trellis-check.toml` 的 `developer_instructions` 顶部加一段（措辞示例）：

```
# Recursion guard (hard rule)
You ARE the `trellis-implement` sub-agent. You MUST NOT call `spawn_agent`,
`spawn_agents_on_csv`, or any tool that spawns another `trellis-implement` /
`trellis-check` / `trellis-research` sub-agent. If the SessionStart context
or any other instruction tells you to "dispatch trellis-implement" or
"dispatch trellis-check", treat that as already-satisfied (you ARE the
implement agent) and proceed to do the work directly.
```

理由：

- Codex 平台层"区分 sub-agent"的能力**今天不存在**（issue #16226 OPEN）。
- 即使将来上游加了 `agent_id` / `agent_type`，Trellis 也至少需要一个 fallback 给"老版本 codex"的用户。
- agent toml 是 sub-agent 第一手 prompt，跟 SessionStart 注入的"派发指令"在同一个模型上下文里——硬约束的"我是子代理，禁止递归"措辞跟 SessionStart 的"派发"措辞直接冲突，模型按"角色身份"的指令优先选 toml 里的硬约束（角色定义比环境提示更强）。
- 不用动 SessionStart hook，零回归风险。

**风险**：如果 SessionStart 注入的措辞太显眼（例如 "Next required action: dispatch `trellis-implement` per Phase 2.1"），模型可能仍然听 SessionStart 的话。需要在 toml 里写得**比 SessionStart 还明确**——参考措辞已在上面给出。

### 同步治本（推荐双管齐下）：方案 A 的"软"版本

不依赖 Codex 暴露 sub-agent 字段，而是**修改 SessionStart hook 注入的措辞本身**——把"无条件 dispatch"改成"如果你是主会话才 dispatch"：

```
Next required action:
- If you are the MAIN session: dispatch `trellis-implement` per Phase 2.1.
- If you are ALREADY a `trellis-implement` / `trellis-check` /
  `trellis-research` sub-agent (your role/agent name reflects that):
  IGNORE this dispatch instruction and execute the work directly. Do NOT
  spawn another sub-agent of the same kind.
```

这条路：

- 不依赖 Codex 暴露 stdin 字段——让模型基于自己的 role 名字判断。
- 跟方案 B（toml 硬约束）形成 belt-and-suspenders。
- 同步要改 `packages/cli/src/templates/shared-hooks/session-start.py` 里同款措辞（保持模板对称性，PRD Q3 倾向）。

### 等上游修：方案 A 的"硬"版本（未来）

issue #16226 修了之后，在 `codex/hooks/session-start.py::should_skip_injection()` 加：

```python
def should_skip_injection_for_subagent(hook_input: dict) -> bool:
    """After openai/codex#16226 lands, hook stdin will carry agent_id for sub-agents."""
    return bool(hook_input.get("agent_id"))
```

碰到 sub-agent 直接 `sys.exit(0)`，不注入任何 dispatch 措辞。**但这条路得等上游发版，没有时间表**（@eternal-openai 2026-05-04 才说 "we're working on it"）。Trellis release window 不能依赖它。

### 最终推荐组合

**B（toml 硬约束） + A-soft（hook 措辞自带分支）**——立刻可落地，不依赖上游，覆盖所有 Codex 版本。等 #16226 落地后再补 A-hard。

---

## 引用来源

- [Codex Hooks 官方文档](https://developers.openai.com/codex/hooks) — Common input fields + SessionStart 字段权威列表，明确没有 agent_id 类字段。
- [openai/codex#16226 "Hooks: distinguish subagent events from main agent"](https://github.com/openai/codex/issues/16226) — 官方确认缺口、提供修复 diff、状态 OPEN（contributor 2026-05-04 回复 "working on it"）。
- [codex-rs/core/src/hook_runtime.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/hook_runtime.rs) — `run_pending_session_start_hooks` 的 `SessionStartRequest` 构造，证明 `session_source` 没透传。
- [codex-rs/core/src/codex_delegate.rs](https://github.com/openai/codex/blob/eaf81d3f/codex-rs/core/src/codex_delegate.rs) — `run_codex_thread_interactive` 里 sub-agent 用 `Codex::spawn(... session_source: SessionSource::SubAgent(...) ...)`，证明 sub-agent 是同进程独立 session。
- [codex-rs/core/src/client.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/client.rs) — `subagent_header_value` / `parent_thread_id_header_value` 把父子关系塞进 HTTP header（`OPENAI_SUBAGENT_HEADER` / `OPENAI_PARENT_THREAD_HEADER`），但**没塞进 hook 输入**。
- [codex-rs/protocol/src/protocol.rs](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs) — `SessionSource::SubAgent` + `SubAgentSource::ThreadSpawn { parent_thread_id, depth, agent_path, agent_role }` 定义。`HookEventName` enum：`PreToolUse`, `PostToolUse`, `SessionStart`, `UserPromptSubmit`, `Stop`（5 个）。
- [Subagents – Codex](https://developers.openai.com/codex/multi-agent/) — custom agent toml schema（确认没有 env var 字段）；`agents.max_depth` 默认 1；sub-agent 继承父 session 的 `model` / `mcp_servers` / `skills.config` / sandbox 等。
- [Configuration Reference – Codex](https://developers.openai.com/codex/config-reference) — `shell_environment_policy` 完整 schema，证明它只控制 codex 启动子进程的 env，不影响 sub-agent。
- [codex-rs/core/src/exec_env.rs](https://github.com/openai/codex/blob/a8e0fe8b/codex-rs/core/src/exec_env.rs) — `create_env` / `populate_env` 实现，证明默认会过滤 `*KEY*`/`*SECRET*`/`*TOKEN*`。
- [Codex Hooks 官方文档 — SessionStart](https://developers.openai.com/codex/hooks) — `matcher` 只支持 `startup` / `resume` / `clear`，没有"main vs subagent"匹配维度。
- [agent-hook-schemas README](https://github.com/mherod/agent-hook-schemas/blob/main/README.md) — 第三方独立编纂的跨平台 hook 字段对照表，Codex 一栏 `agent_id`/`agent_type` = "—"，佐证缺口。
- [openai/codex#15486 "Expose CollabAgentSpawn{Begin,End} as hook events"](https://github.com/openai/codex/issues/15486) — 另一个相关 OPEN issue：希望把 sub-agent spawn lifecycle 暴露为 hook 事件（包含 `parent_thread_id` / `new_thread_id` / `new_agent_role`）。同样未发版。
- [openai/codex#13276 "start of hooks engine"](https://github.com/openai/codex/issues/13276) — codex_hooks MVP PR 描述，确认 hook 是从 SessionStart + Stop 起步的，sub-agent 维度不在初版设计里。

## Caveats / Not Found

- 未找到任何"实际 sub-agent SessionStart stdin payload 的完整 JSON dump"。但综合 issue #16226 一手描述 + `hook_runtime.rs` 源码 + 官方 hook 文档 schema，可以**确定**当前 payload 结构跟主会话**完全一致**（没有任何 sub-agent 标识字段）。
- 未找到 #234 报告者的"嵌套结构 `/root/implement_w5300_mac/implement_w5300_mac`"在 Codex 协议层的精确字段名。从 `list_agents` UI 看，那个层级路径很可能就是 `SubAgentSource::ThreadSpawn::agent_path: Option<String>` 的渲染——**但这个字段也没暴露给 hook**。
- 未验证 `CODEX_SESSION_ID` / `CODEX_THREAD_ID` 在 sub-agent hook 进程里到底是什么值（是子 session id 还是父 session id）。**建议如果走治本路线，先用一个 debug hook 把整个 `os.environ` + stdin payload 落盘抓一份样本**——这能把所有"猜测"变成事实。
- 上游 fix #16226 没有发版时间表。Trellis 修 #234 不应该依赖它。
