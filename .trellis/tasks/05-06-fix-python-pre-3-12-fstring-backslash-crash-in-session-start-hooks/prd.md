# Fix: Python ≤3.11 f-string backslash crash in session-start hooks

## Goal

修 Trellis 0.5.0 GA / 0.5.1 在 Python ≤3.11 + 任意带 SessionStart hook 的平台上必现的 `SessionStart hook (failed) — exited with code 1` 崩溃。准备 0.5.2 hotfix 发版。

## Root Cause

rc.6 引入 Windows MSYS/Cygwin/WSL 路径归一化（fixes #226），代码里写了：

```python
return f"{drive}:\\{rest.replace('/', '\\')}"
```

f-string 表达式部分（`rest.replace('/', '\\')`）含反斜杠。**PEP 498 时代（Python ≤3.11）禁止 f-string 表达式部分出现任何反斜杠**，PEP 701（Python 3.12）才放开。结果：Python ≤3.11 用户在 hook 解析阶段就抛 `SyntaxError: f-string expression part cannot include a backslash`，hook 还没跑就退出 code 1。

## Affected Files

9 处，3 个文件：

- `packages/cli/src/templates/codex/hooks/session-start.py:50,56,62`
- `packages/cli/src/templates/copilot/hooks/session-start.py:53,59,65`
- `packages/cli/src/templates/shared-hooks/session-start.py:50,56,62` （Claude Code / Cursor / Gemini CLI / Qoder / CodeBuddy / Factory Droid / Kiro 复用）

## Fix

把含反斜杠的 `replace` 提到 f-string 外面：

```python
# Before
return f"{drive}:\\{rest.replace('/', '\\')}"

# After
rest = rest.replace('/', '\\')
return f"{drive}:\\{rest}"
```

每处 3 行替代 1 行，9 处全改。

## Requirements

- [ ] 9 处全部修掉，3 个文件的 6 处 `re.match` 分支（MSYS / Cygwin / WSL）都改完
- [ ] 加 vitest 测试断言：3 个 session-start.py 文件能在 Python ≤3.11 语法下编译通过（`py_compile` + 检查脚本无 `SyntaxError`）
- [ ] 0.5.2 manifest + docs-site 中英 changelog
- [ ] `pnpm test` / `pnpm lint` 全绿
- [ ] feat/v0.5 → main，发 0.5.2

## Acceptance Criteria

- [ ] 在 Python 3.11 下手动 `python3.11 -c "import py_compile; py_compile.compile('<path>', doraise=True)"` 三个文件都不抛 `SyntaxError`
- [ ] vitest 加一条 regression test 覆盖此点（用 ast 模块或 py_compile 子进程）
- [ ] `trellis update` 后用户在 Python 3.11 + Codex 复现路径不再报 `SessionStart hook (failed)`

## Out of Scope

- 不重构 `_normalize_windows_shell_path` 整体逻辑——只做最小语法兼容修复
- 不重构其他可能存在的 f-string 反斜杠隐患——这次只修 9 处已知点，未来可单独 audit
- 不改 Python 最低版本要求文档

## Technical Notes

- 0.5.0 GA 已发，0.5.1 hotfix 也已发（cherry-pick 到 main，没修这个）。
- 当前在 `feat/v0.5` 分支，从 main HEAD（dd73642 0.5.1）拉出。
- 修法不依赖任何第三方库，一行级替换。
- Python 3.12+ 用户不受影响。
- Codex CLI 用户在 issue 群报告（Codex 0.128 + Trellis 0.5.0），Codex 自己也定位到了 line 50。
