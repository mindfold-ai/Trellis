# Feature: Backend/CLI Development Guidelines

## Overview

为 Trellis 项目填充后端/CLI 开发规范文档，基于现有代码模式和业界最佳实践。

## Background

Trellis 是一个 TypeScript CLI 项目，`.trellis/structure/backend/` 下的规范文件目前都是空模板。需要分析现有代码，提取实际使用的模式，并补充业界最佳实践，生成完整的开发规范文档。

## Requirements

### 需要填充的规范文件

1. **directory-structure.md** - 目录结构规范
   - 分析 `src/` 下的目录组织方式
   - 记录各目录的职责划分
   - 文件命名规范（kebab-case）
   - 入口文件约定（index.ts）
   - 模板文件命名（.txt 后缀）

2. **error-handling.md** - 错误处理规范
   - 顶层 try-catch 模式
   - 类型守卫 `error instanceof Error`
   - 空 catch 处理可选操作
   - process.exit(1) 退出约定
   - 错误消息格式

3. **logging-guidelines.md** - 日志/输出规范
   - chalk 颜色约定（cyan/blue/green/yellow/red/gray）
   - emoji 使用规范
   - 缩进表示层级
   - console.log 在 CLI 项目中的使用

4. **quality-guidelines.md** - 代码质量规范
   - TypeScript strict 模式
   - ESLint 规则（禁止 any、必须声明返回类型、禁止非空断言）
   - 现代语法优先（??、?.、const）
   - 未使用变量命名（_ 前缀）

5. **index.md** - 更新索引状态
   - 将填充的文档状态从 "⬜ To fill" 改为 "✅ Done"

### 不需要填充的文件

- **database-guidelines.md** - 本项目是 CLI 工具，不使用数据库，保留模板即可

## Technical Approach

1. 阅读 Research Agent 分析的代码模式（通过 jsonl 上下文）
2. 参考现有代码文件，提取实际使用的模式
3. 补充业界 TypeScript/Node.js CLI 项目的最佳实践
4. 为每个规范文件编写完整内容

## Acceptance Criteria

- [ ] directory-structure.md 完整描述项目目录结构和命名规范
- [ ] error-handling.md 完整描述错误处理模式
- [ ] logging-guidelines.md 完整描述输出和颜色规范
- [ ] quality-guidelines.md 完整描述代码质量要求
- [ ] index.md 更新所有已填充文档的状态
- [ ] 所有文档使用英文编写
- [ ] 包含实际代码示例
- [ ] 包含 DO/DON'T 清单

## Code Patterns Summary (from Research)

### Directory Structure
- cli/, commands/, configurators/, constants/, types/, utils/, templates/
- kebab-case 文件命名
- index.ts 入口文件
- .txt 后缀模板文件

### Error Handling
```typescript
// 顶层捕获
try {
  await action();
} catch (error) {
  console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
  process.exit(1);
}

// 可选操作静默失败
try {
  optional();
} catch {
  // silently ignore
}
```

### Logging
| Color | Usage |
|-------|-------|
| cyan | 标题/大段信息 |
| blue | 操作提示 |
| green | 成功 |
| yellow | 警告 |
| red | 错误 |
| gray | 次要信息 |

### Quality
- `strict: true` in tsconfig
- `no-explicit-any: error`
- `explicit-function-return-type: error`
- `no-non-null-assertion: error`
- `prefer-nullish-coalescing: error`
- `prefer-optional-chain: error`

## Out of Scope

- 前端规范（frontend/）
- 数据库规范（database-guidelines.md）
- 思维指南（guides/）
