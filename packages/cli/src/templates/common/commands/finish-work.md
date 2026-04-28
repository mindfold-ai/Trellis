# 收尾工作

结束当前开发会话。

## 第 1 步：质量门禁

Phase 3 通常已运行 `trellis-check`。若未运行，先补跑并确保 lint、type-check、tests 与 spec 合规全部通过。

## 第 2 步：提醒用户提交

如存在未提交变更：

> "请先审阅变更，确认后再提交。"

不要替用户执行 `git commit`。

## 第 3 步：记录会话（提交后）

归档已完成任务（以实际状态判断，不仅看 `status` 字段）：

```bash
{{PYTHON_CMD}} ./.trellis/scripts/task.py archive <task-name>
```

追加会话记录（自动处理日志轮转、行数与索引）：

```bash
{{PYTHON_CMD}} ./.trellis/scripts/add_session.py \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary"
```
