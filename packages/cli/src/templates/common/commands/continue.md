# 继续当前任务

恢复当前任务，在 `.trellis/workflow.md` 的正确阶段/步骤继续推进。

---

## 第 1 步：加载当前上下文

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py
```

确认：当前任务、git 状态、最近提交。

## 第 2 步：加载阶段索引

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode phase
```

查看阶段索引（Plan / Execute / Finish）及技能路由。

## 第 3 步：判断当前所处位置

结合任务 `prd.md` 与最近活动判断：

- 没有 `prd.md`，或需求仍不清晰 → **Phase 1: Plan**（从 1.0/1.1 开始）
- 已有 `prd.md` 且上下文已配置，但尚未写代码 → **Phase 2: Execute**（2.1）
- 代码已完成，待最终质量门禁 → **Phase 3: Finish**（3.1）

阶段规则（详见 `.trellis/workflow.md`）：

1. 同一阶段内按顺序执行，`[required]` 不能跳过
2. `[once]` 若已有产物可跳过（如 1.1 的 `prd.md`，1.3 已整理的 `implement.jsonl`）
3. 若新发现需要回退，可回到更早阶段

## 第 4 步：加载对应步骤细节

确定恢复步骤后执行：

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode phase --step <X.X> --platform {{CLI_FLAG}}
```

按加载说明执行；每完成一个 `[required]` 步骤，进入下一步。

---

## 参考

完整流程、技能路由和禁止跳步规则在 `.trellis/workflow.md`。本命令仅是入口。
