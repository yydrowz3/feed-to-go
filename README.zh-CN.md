# Feed to Go

[English](README.md) | **简体中文** | [日本語](README.ja.md)

使用 Go 后端和 React 前端构建的短视频分享应用。支持浏览视频流、分片上传与断点续传，
以及点赞、评论、关注和私信。

## 功能

- 最新、关注、点赞榜视频流，以及独立热度榜。
- 视频播放、进度跳转、键盘操作和公开视频详情页。
- 注册、登录、令牌刷新、修改密码和用户主页。
- MP4 分片上传、分片校验、上传恢复和封面上传。
- 点赞、评论、关注列表和私信会话。
- 英文、简体中文和日文界面，保存语言偏好。
- 明暗主题，偏好独立于账号会话保存。
- 社交操作、热度、时间线和通知的后台消费者。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 后端 | Go、Gin、GORM、PostgreSQL、JWT、Zap |
| 后台处理 | RabbitMQ、Redis、事务性 Outbox |
| 前端 | React、TypeScript、Vite、TanStack Router / Query / Form |
| 状态与校验 | Zustand、Zod |
| 界面 | Tailwind CSS、daisyUI、Lucide、Sonner |
| 国际化与上传 | i18next、react-i18next、hash-wasm |

## 项目结构

```text
feed-to-go/
  apps/
    api/
      cmd/app/       # API 与消费者的联合入口
      cmd/server/    # API 及相关后台任务入口
      cmd/worker/    # 业务消费者入口
      configs/       # 性能分析配置
      internal/      # 应用、HTTP API、业务服务与消费者
      pkg/           # 后端支持包
    web/
      src/           # 前端路由、功能、组件与翻译
      tests/         # 基于 Node 的前端测试
      scripts/       # 浏览器回归工具
  shared/            # 共享错误码定义
  scripts/           # 代码生成与集成工具
  docs/              # 配置、约定与实施记录
```

## 环境要求

- Go **1.27.2**，以 [go.mod](apps/api/go.mod) 为准，或兼容的更新工具链。
- Node.js **24+**、pnpm **12+**，以 [package.json](apps/web/package.json) 为准。
- 完整运行应用需要 PostgreSQL、Redis 和 RabbitMQ。
- 浏览器需要支持测试 MP4 文件使用的编解码格式。

依赖以仓库中的清单和锁文件为准。启动应用前，请自行安装并配置上述基础服务；
以下命令不会创建这些服务。

## 快速开始

以下示例使用 PowerShell。后端命令在 `apps/api` 执行，前端命令在 `apps/web` 执行，
两者分别管理依赖。

### 1. 克隆仓库

```powershell
git clone https://github.com/yydrowz3/feed-to-go.git
cd feed-to-go
```

### 2. 配置并启动后端

```powershell
cd apps/api
go mod download
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

创建专用开发数据库，并编辑 `apps/api/.env`。以下示例假设基础服务在本机运行；
请将数据库用户、密码、数据库名称、消息代理 URI 和 JWT 密钥替换为自己的配置：

```dotenv
APP_ENV=dev
PORT=8095
WEB_URL=http://localhost:5173

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=feed_to_go
DB_PASSWORD=replace-with-your-local-password
DB_NAME=feed_to_go
DB_SSLMODE=disable

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS=false

AMQP_URL=amqp://guest:guest@127.0.0.1:5672/
JWT_SECRET=replace-with-a-long-random-secret
```

这些配置用于本地开发。测试时应使用专用 Redis 实例和 RabbitMQ vhost。
全部可用字段见 [apps/api/.env.example](apps/api/.env.example)。`AMQP_URL` 优先于
分开的消息代理字段；应用不读取 `DATABASE_URL` 或 `REDIS_URL`。
进程环境变量优先于 `.env`。

启动联合应用：

```powershell
go run ./cmd/app
```

此入口在同一进程中启动 API 和全部消费者，要求三个基础服务全部可用。
启动时会执行数据库结构迁移，因此请使用开发数据库。配置路径相对于 `apps/api` 解析。

在另一终端检查 HTTP 可用性和联合应用就绪状态：

```powershell
Invoke-RestMethod http://localhost:8095/healthz
Invoke-RestMethod http://localhost:8095/readyz
```

如需拆分进程，可分别在两个终端运行 `go run ./cmd/server` 和 `go run ./cmd/worker`，
替代联合入口。依赖和生命周期说明见[后端部署文档](docs/backend-render.md)。

### 3. 配置并启动前端

在仓库根目录打开另一终端：

```powershell
cd apps/web
pnpm install --frozen-lockfile
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

设置 `apps/web/.env`：

```dotenv
VITE_API_BASE=http://localhost:8095
```

```powershell
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

打开 **http://localhost:5173**，注册账号后即可发布测试视频。

### 4. 检查来源和媒体访问

前端直接访问 API 和媒体 URL。`VITE_API_BASE` 必须是 HTTP(S) 绝对地址，
不会自动追加 `/api`。该值属于公开的构建时配置，不应包含密钥。

`APP_ENV=dev` 允许任意 CORS 来源。其他环境应将 `WEB_URL` 设置为前端的准确 origin，
包含协议和端口，不包含路径或末尾斜杠。`localhost` 和 `127.0.0.1` 是不同来源。
后端配置修改后需重启，详见 [CORS 配置](docs/backend-cors.md)。

上传文件存放于 `apps/api/.run/uploads`，通过 `/static` 提供访问。
API 进程需要写入权限，后端返回的媒体 URL 必须能从浏览器访问。

## 开发与验证

在 `apps/api` 执行后端检查：

```powershell
go test ./...
go vet ./...
go build ./cmd/app ./cmd/server ./cmd/worker
```

在 `apps/web` 执行前端检查：

```powershell
pnpm test
pnpm lint
pnpm fmt:check
pnpm errors:check
pnpm build
```

前端测试使用测试替身，不需要真实后端；构建包含 TypeScript 类型检查。
修改 API 错误码时，先编辑 `shared/error-codes.json`，再从 `apps/web` 执行
`pnpm errors:generate`，并同时提交两份生成产物。
详见[错误码契约](docs/api-error-codes.md)。

前端构建完成后，可选择运行浏览器回归：

```powershell
pnpm test:browser --media C:/path/to/test.mp4
```

打开命令输出的 `http://127.0.0.1:5186/__checks`，点击 **Run checks**。
结果可在页面和 `/__report` 查看。使用 Ctrl+C 停止工具，
可通过 `BROWSER_TEST_PORT` 修改端口。省略 `--media` 时不验证有效视频解码。
该工具使用隔离的 API 测试替身；真实服务集成验证需要独立测试环境。

## 构建与部署

- **后端：** 在 `apps/api` 执行 `go build -o app ./cmd/app`，为生成的可执行文件
  配置环境变量和可访问的配置文件后运行。联合入口通过 `/readyz` 提供就绪检查。
  详见 [Render 部署与生命周期](docs/backend-render.md)。
- **前端：** 在 `apps/web` 执行 `pnpm build` 前，将 `VITE_API_BASE` 设置为公开的
  HTTPS API 地址。静态服务托管 `apps/web/dist`，并对客户端路由回退到 `index.html`。
  API 地址变更后需要重新构建。
- **运维：** 使用 `APP_ENV=production`，配置 `WEB_URL`，保护凭据并限制性能分析
  端点访问，为上传媒体提供持久化存储和备份。临时文件系统中的文件可能随实例替换丢失。
  Vite preview 用于本地验证构建结果。

## 当前限制

- 搜索仅过滤已加载视频的标题和作者，不提供全库搜索。
- 私信进入会话或手动刷新时加载最近 50 条；前端不提供轮询、实时消息更新或历史分页。
- 视频必须是非空 MP4，最大 **200 MiB**；封面支持 JPG/JPEG/PNG/WebP，最大 **10 MiB**。
  能否播放取决于浏览器对编码格式的支持。
- 未完成的分片上传可在重新选择相同文件后恢复，前提是服务端上传会话仍有效，通常约
  **24 小时**。已完成媒体的检查点仅保存在当前页面会话中。
- 使用消息队列的操作可能延迟出现在读取结果中。发布或发送消息的结果不确定时，
  请先检查实际结果再重试。

## 文档与社区

| 文档 | 内容 |
| --- | --- |
| [前端指南](apps/web/README.md) | 前端配置、行为与浏览器检查 |
| [后端指南](docs/backend-render.md) | 入口、依赖、部署与关闭流程 |
| [CORS 配置](docs/backend-cors.md) | 允许来源与验证方式 |
| [API 错误码](docs/api-error-codes.md) | 共享错误契约与生成流程 |
| [贡献指南](CONTRIBUTING.md) | 开发流程、检查与 Pull Request |
| [提交约定](docs/commit-conventions.md) | Emoji 前缀的 Conventional Commits |
| [行为准则](CODE_OF_CONDUCT.md) | 社区行为要求 |
| [安全策略](SECURITY.md) | 私下报告安全漏洞 |

部分详细实施文档目前使用中文编写。
普通问题请通过 [GitHub Issues](https://github.com/yydrowz3/feed-to-go/issues) 报告；
疑似安全漏洞请按照 [SECURITY.md](SECURITY.md) 私下报告。

## 许可证

本项目使用 [MIT 许可证](LICENSE)。
