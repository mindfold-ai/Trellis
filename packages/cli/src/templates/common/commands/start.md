# 开始会话

初始化一个 Trellis 托管的开发会话。当前平台无 session-start hook，请按以下步骤手动加载等价上下文。

---

## 第 1 步：当前状态

开发者身份、git 状态、当前任务、活跃任务、日志位置。

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py
```

## 第 2 步：工作流总览

阶段索引 + 技能路由 + 禁止跳步规则。

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode phase
```

完整说明见 `.trellis/workflow.md`（按需阅读）。

## 第 3 步：规范索引

发现包与 spec 分层，并阅读相关索引文件。

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode packages
cat .trellis/spec/guides/index.md
cat .trellis/spec/<package>/<layer>/index.md   # 对每个相关层执行
```

索引是导航：真正编码前需继续阅读其中列出的具体规范文档。

## 第 4 步：决定下一步动作

根据第 1 步拿到的当前任务，检查任务目录：

- **有活动任务 + 存在 `prd.md`** → 进入 Phase 2 step 2.1：
  ```bash
  {{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode phase --step 2.1 --platform {{CLI_FLAG}}
  ```
- **有活动任务 + 无 `prd.md`** → 进入 Phase 1.1，加载 `trellis-brainstorm`
- **无活动任务** → 用户描述多步骤工作时，先 `trellis-brainstorm` 澄清需求，再用 `task.py create` 建任务；若只是一次性问答或小改动，可直接处理

---

## 技能路由（速查）

| 用户意图 | Skill |
|---|---|
| 新功能 / 需求不清 | `trellis-brainstorm` |
| 即将写代码 | `trellis-before-dev` |
| 编码完成 / 质量检查 | `trellis-check` |
| 卡住或反复修同类 bug | `trellis-break-loop` |
| 有可沉淀经验 | `trellis-update-spec` |

完整规则与反自我合理化表在 `.trellis/workflow.md`。
