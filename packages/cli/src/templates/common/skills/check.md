# 代码质量检查

对刚完成的代码做全面质量验证：规范合规、跨层安全与提交前检查。

---

## 第 1 步：识别变更范围

```bash
git diff --name-only HEAD
git status
```

## 第 2 步：阅读适用规范

```bash
python3 ./.trellis/scripts/get_context.py --mode packages
```

对每个变更到的包/层，阅读其 spec 索引并执行 **Quality Check**：

```bash
cat .trellis/spec/<package>/<layer>/index.md
```

继续阅读索引中引用的具体规范文件（索引只是导航）。

## 第 3 步：运行项目检查

运行项目的 lint、type-check、tests。若失败，先修复再继续。

## 第 4 步：按清单复核

### 代码质量

- [ ] Linter 通过？
- [ ] Type checker 通过（如适用）？
- [ ] Tests 通过？
- [ ] 无遗留调试日志？
- [ ] 无忽略告警或类型安全绕过？

### 测试覆盖

- [ ] 新函数 → 已补 unit test？
- [ ] 修 bug → 已补 regression test？
- [ ] 改行为 → 已更新现有测试？

### 规范同步

- [ ] 是否需要更新 `.trellis/spec/`？（新模式、约定或经验）

> “这次修复/实现里有非显而易见结论吗？未来我是否可能再次踩坑？”如果是，请更新相应 spec。
