在开始任务前先阅读与本次变更相关的开发规范。

请按以下步骤执行：

1. **发现包与 spec 分层**：
   ```bash
   python3 ./.trellis/scripts/get_context.py --mode packages
   ```

2. **识别适用规范**：
   - 你要修改哪个 package（如 `cli/`、`docs-site/`）
   - 工作类型是什么（backend、frontend、unit-test、docs 等）

3. **阅读对应 spec 索引**：
   ```bash
   cat .trellis/spec/<package>/<layer>/index.md
   ```
   按索引中的 **Pre-Development Checklist** 执行。

4. **阅读清单中列出的具体规范文件**：
   索引只是入口，不是终点。请继续阅读其中指向的规范文件（如 `error-handling.md`、`conventions.md`、`mock-strategies.md`），理解本任务应遵循的编码模式。

5. **始终阅读共享思维指南**：
   ```bash
   cat .trellis/spec/guides/index.md
   ```

6. 明确需要遵循的规范后，再进入开发计划。

写任何代码前，这一步都是**必做项**。
