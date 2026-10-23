# Commit Message Convention

本项目遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范，并在提交标题最前添加 Emoji，以便快速识别提交类型。

## 提交格式

```text
<emoji> <type>(<scope>): <description>

<body>
```

示例：

```text
✨ feat(logger): add structured logging

Explain why structured logging is needed and how initialization changes.
Describe the affected modules and the checks performed.
```

### 格式要求

- Emoji 放在提交标题最前，用于表示提交类型。
- `type` 必须使用下表中的关键词。
- `scope` 用于说明影响范围，例如 `logger`、`config`、`server` 或 `bootstrap`；没有合适范围时可以省略。
- `description` 使用英文祈使句，首字母小写，不以句号结尾。
- 标题建议不超过 72 个字符。
- 每次生成或创建 commit message 都必须同时包含标题和非空正文，不能只提供标题；标题与正文之间空一行。
- 正文用于说明变更原因、主要内容和影响范围。
- 每行正文建议不超过团队约定的字符数，常用值为 72 或 100。

## 提交关键词与 Emoji

| Type | Emoji | 用途 | 示例 |
| --- | --- | --- | --- |
| `feat` | ✨ | 新增功能 | `✨ feat(config): support yaml configuration` |
| `fix` | 🐛 | 修复 Bug 或错误行为 | `🐛 fix(config): reject invalid timeout values` |
| `refactor` | ♻️ | 重构代码，不改变外部行为 | `♻️ refactor(bootstrap): simplify initialization` |
| `style` | 🎨 | 代码格式、排版或样式调整，不改变逻辑 | `🎨 style(server): format startup options` |
| `chore` | 🔧 | 日常维护、工具、配置或非业务变更 | `🔧 chore(deps): update logging dependencies` |
| `docs` | 📝 | 文档新增或修改 | `📝 docs: add commit conventions` |
| `test` | ✅ | 新增、修改或整理测试 | `✅ test(config): cover timeout validation` |
| `perf` | ⚡ | 性能优化 | `⚡ perf(logging): reduce startup allocations` |
| `build` | 📦 | 构建系统或依赖构建配置变更 | `📦 build: update go build settings` |
| `ci` | 👷 | CI/CD 流程和配置变更 | `👷 ci: add automated test workflow` |
| `revert` | ⏪ | 回滚之前的提交 | `⏪ revert: revert logger initialization` |

Conventional Commits 推荐使用 `fix` 表示 Bug 修复，不使用 `bug` 作为标准 Type。

## 详细提交模板

```text
<emoji> <type>(<scope>): <description>

Why:
- Explain why the change is needed.

What:
- Describe the main implementation changes.
- Mention important behavior or configuration changes.

Impact:
- Describe affected modules, APIs, users, or compatibility.

BREAKING CHANGE: Describe the migration required by consumers.
```

正文建议按 Why / What / Impact 组织，说明原因、主要变更和影响，并如实记录相关检查结果或未验证项。简单提交可以使用简短段落或列表，但不得省略正文。仅在确有破坏性变更时填写 `BREAKING CHANGE`。

向用户交付生成的 commit message 时，使用一个完整文本代码块提供标题、空行和正文，便于直接复制；不能以变更摘要或标题列表替代完整 message。实际创建提交时，Git 中保存的信息必须与交付的完整 message 一致。

## 编写建议

### 推荐

```text
✨ feat(logger): add structured logging

- add development and production logger initialization
- load logger environment from application configuration
- flush buffered log entries during shutdown
```

```text
🐛 fix(config): apply the default server address

The server now falls back to :8091 when no address is configured,
while preserving explicitly configured addresses.
```

### 避免

```text
update code
fix bug
✨ feat (logger) : Add logger.
```

最后一个示例包含多余空格、首字母大写和句末句号，不符合本项目推荐格式。

## Breaking Change

如果提交会破坏现有 API、配置格式或运行方式，需要在正文中使用 `BREAKING CHANGE:` 说明迁移方式：

```text
⚠️ refactor(config)!: rename application config fields

BREAKING CHANGE: rename `server.address` to `server.addr` in application.yaml.
```

也可以在 `type` 后添加 `!`，例如 `feat(api)!: change response format`。

## 提交前检查清单

- [ ] 标题以约定的 Emoji 开头。
- [ ] 使用正确的 Conventional Commits `type`。
- [ ] `scope` 准确且简洁。
- [ ] 描述使用英文祈使句、首字母小写且无句号。
- [ ] 标题不超过 72 个字符。
- [ ] 变更涉及破坏性修改时已添加 `BREAKING CHANGE:`。
- [ ] 正文已说明必要的原因、实现和影响。
- [ ] 生成结果和实际提交均包含标题及非空正文，交付时提供完整 message。
- [ ] 已运行与本次变更相关的测试或检查。
- [ ] 有前端实际改动的实施单元已按 [前端版本规则](../apps/web/AGENTS.md) 更新一次应用版本，版本文件与实现同一步交付，并记录版本前后值；不为反复验证重复升版。
