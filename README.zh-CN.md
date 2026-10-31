<a name="readme-top"></a>

<p align="center">
  <a href="https://feed-to-go.onrender.com">
  <img src="./static/logo/feed-to-go-logo.png" alt="Feed-To-Go" width="280" />
  </a>
</p>

<div align="center">

**Feed To Go** 让短视频与人们相聚。

在不断延伸的视频流中观看、分享、建立联系。

下一个让你心动的瞬间，只需轻轻一滑。

[英语](./README.md) · **中文** · [日语](./README.ja.md) · [官方网站](https://feed-to-go.onrender.com) · [反馈](https://github.com/yydrowz3/feed-to-go/issues)

</div>

<p align="center">
  <a href="https://feed-to-go.onrender.com">
  <img src="./static/banner/feed-to-go.png" alt="Feed-To-Go" />
  </a>
</p>

<p align="center">

一款使用 **Go** 后端和 **React** 前端的短视频分享应用。浏览视频流，通过支持断点续传的分片上传发布视频，
并通过点赞、评论、关注和私信进行互动。

</p>

<p align="center">
  <a href="https://feed-to-go.onrender.com">
  <img alt="live-demo-badge" src="https://img.shields.io/badge/Live Demo-Render-000000?logo=render" />
  </a>
</p>

<p align="center">
<img alt="Golang" src="https://img.shields.io/badge/-Go-00ADD8?style=flat-square&logo=go&logoColor=white" />
<img alt="React" src="https://img.shields.io/badge/-React-45b8d8?style=flat-square&logo=react&logoColor=white" />
<img alt="Gin" src="https://img.shields.io/badge/-Gin-008ECF?style=flat-square&logo=gin&logoColor=white" />
<img alt="PostgreSQL" src="https://img.shields.io/badge/-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
<img alt="Redis" src="https://img.shields.io/badge/-Redis-FF4438?style=flat-square&logo=redis&logoColor=white" />
<img alt="RabbitMQ" src="https://img.shields.io/badge/-RabbitMQ-FF6600?style=flat-square&logo=rabbitmq&logoColor=white" />
<img alt="TypeScript" src="https://img.shields.io/badge/-TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white" />
<img alt="TailwindCSS" src="https://img.shields.io/badge/-Tailwind CSS-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white" />
<img alt="Node.js" src="https://img.shields.io/badge/-Node.js-5fa04e?style=flat-square&logo=node.js&logoColor=white" />
</p>

<p align="center">
<img alt="Upstash" src="https://img.shields.io/badge/-Upstash-00E9A3?style=flat-square&logo=upstsh&logoColor=white" />
<img alt="DaisyUI" src="https://img.shields.io/badge/-DaisyUI-FFC63A?style=flat-square&logo=daisyui&logoColor=white" />
<img alt="Vite" src="https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=Vite&logoColor=white" />
<img alt="Neon" src="https://img.shields.io/badge/-Neon-34D59A?style=flat-square&logo=neon&logoColor=white" />
<img alt="Oxc" src="https://img.shields.io/badge/-Oxc-00F7F1?style=flat-square&logo=oxc&logoColor=white" />
</p>

<p align="center">
<sup>现在，带上你的「Feed」，出发吧！</sup>
</p>

## ✨ 功能

- 最新、关注和最多点赞视频流，以及独立的热门排行榜。
- 视频播放、进度跳转、键盘控制和公开视频详情页。
- 账号注册、登录、令牌刷新、密码修改和个人资料。
- MP4 视频发布，支持分片校验、上传恢复和封面图片。
- 点赞、评论、关注列表和私信会话。
- 英语、简体中文和日语界面，支持保存语言偏好。
- 浅色和深色主题，偏好设置独立于账号会话保存。
- 用于处理社交操作、热度、时间线和通知的后台消费者。

## 🛠️ 技术栈

| 层级                     | 技术                                                    |
| ------------------------ | ------------------------------------------------------- |
| 后端                     | Go, Gin, GORM, PostgreSQL, JWT, Zap                     |
| 后台处理                 | RabbitMQ, Redis, 事务性发件箱                            |
| 前端                     | React, TypeScript, Vite, TanStack Router / Query / Form |
| 状态管理与校验           | Zustand, Zod                                            |
| 界面                     | Tailwind CSS, daisyUI, Lucide, Sonner                   |
| 本地化与上传             | i18next, react-i18next, hash-wasm                       |

## 📁 仓库结构

```text
feed-to-go/
  apps/
    api/
      cmd/server/    # API 及相关后台任务入口
      cmd/worker/    # 业务消费者入口
      configs/       # 性能分析配置
      internal/      # 应用、HTTP API、业务服务与工作进程
      pkg/           # 后端支持包
    web/
      src/           # 前端路由、功能、组件与翻译
      tests/         # 基于 Node 的前端测试
      scripts/       # 浏览器回归测试工具
  shared/            # 共享错误码定义
  scripts/           # 代码生成与集成工具
  docs/              # 配置、约定与实现记录
```

## ⌨️ 开发

### 环境要求

- Go **1.27.2**，以 [go.mod](apps/api/go.mod) 中声明的版本为准，或使用兼容的更新工具链。
- Node.js **24+** 和 pnpm **12+**，以 [package.json](apps/web/package.json) 中声明的版本为准。
- 完整运行应用需要 PostgreSQL、Redis 和 RabbitMQ。
- 浏览器需要支持测试 MP4 文件使用的编解码格式。

依赖版本以依赖清单和锁文件为准。启动应用前，
请先安装并配置所需的基础服务；以下命令
不会创建这些服务。

### `A` 克隆仓库

```shell
git clone https://github.com/yydrowz3/feed-to-go.git
cd feed-to-go
```

### `B` 配置并启动后端

```shell
cd apps/api
go mod download
```

创建专用开发数据库，并配置 `apps/api/.env`。
以下示例假设基础服务在本机运行；请将数据库用户、
密码、数据库名称、消息代理 URI 和 JWT 密钥替换为自己的值：

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

这些配置用于本地开发。测试时请使用专用 Redis 实例和
RabbitMQ vhost。全部可用字段见
[apps/api/.env.example](apps/api/.env.example)。`AMQP_URL` 优先于单独配置的
消息代理字段；应用不读取 `DATABASE_URL` 或 `REDIS_URL`。
进程环境变量优先于 `.env`。

### `C` 启动联合应用：

```
go run ./cmd/app
```

此入口在同一进程中启动 API 和全部消费者，要求上述三个
基础服务全部可用。启动时会执行数据库结构迁移，因此请使用
开发数据库。配置相对于 `apps/api` 加载。

<details>

<summary>健康检查</summary>

在另一终端中检查 HTTP 可用性和联合应用的就绪状态：

```powershell
Invoke-RestMethod http://localhost:8095/healthz
Invoke-RestMethod http://localhost:8095/readyz
```

如需拆分进程，可在不同终端分别运行 `go run ./cmd/server` 和 `go run ./cmd/worker`，
替代联合入口。依赖和生命周期的
详细说明见[后端部署文档](docs/backend-render.md)。

</details>

### `D` 配置并启动前端

在仓库根目录打开另一终端：

```shell
cd apps/web
pnpm install
```

将 `apps/web/.env` 设置为：

```dotenv
VITE_API_BASE=http://localhost:8095
```

运行：

```shell
pnpm dev
```

打开 **http://localhost:5173**。注册账号后，发布一个测试视频。

### `E` 检查来源和媒体访问

前端直接访问 API 和媒体 URL。`VITE_API_BASE` 必须是
HTTP(S) 绝对地址；不会自动追加 `/api`。该值属于公开的
构建时配置，不得包含密钥。

`APP_ENV=dev` 允许任意 CORS 来源。其他环境应将 `WEB_URL` 设置为
前端的准确来源，包含协议和端口，不包含路径或末尾
斜杠。`localhost` 和 `127.0.0.1` 是不同来源。后端配置
修改后需要重启。详见 [CORS 配置](docs/backend-cors.md)。

上传文件存放于 `apps/api/.run/uploads`，并通过
`/static` 提供访问。API 进程需要写入权限，且后端返回的
媒体 URL 必须能从浏览器访问。

## 🧪 验证

在 `apps/api` 中执行后端检查：

```shell
go test ./...
go vet ./...
go build ./cmd/app ./cmd/server ./cmd/worker
```

在 `apps/web` 中执行前端检查：

```shell
pnpm test
pnpm lint
pnpm fmt:check
pnpm errors:check
pnpm build
```

前端测试使用测试夹具，不需要真实后端。构建
包含 TypeScript 类型检查。修改 API 错误码时，先编辑
`shared/error-codes.json`，再从 `apps/web` 运行 `pnpm errors:generate`，并
同时提交两份生成产物。详见[错误码契约](docs/api-error-codes.md)。

前端构建完成后，可选择运行浏览器回归测试：

```shell
pnpm test:browser --media C:/path/to/test.mp4
```

打开命令输出的 `http://127.0.0.1:5186/__checks` URL，点击 **Run checks**。
结果可在页面和 `/__report` 查看。使用
Ctrl+C 停止测试工具；可通过 `BROWSER_TEST_PORT` 修改端口。省略 `--media` 时，
将跳过视频能否成功解码的验证。该工具使用隔离的 API 测试夹具；
真实服务的集成检查需要独立的测试环境。

- **后端：** 在 `apps/api` 中运行 `go build -o app ./cmd/app`，然后为生成的
  可执行文件配置所需的环境变量，确保其能访问
  配置文件后运行。联合入口通过 `/readyz` 提供就绪检查。
- **前端：** 在 `apps/web` 中运行 `pnpm build` 前，将 `VITE_API_BASE`
  设置为公开的 HTTPS API URL。使用静态托管服务提供 `apps/web/dist`，
  并为客户端路由回退到 `index.html`。API URL 变更后需要重新构建。
- **运维：** 使用 `APP_ENV=production`，配置 `WEB_URL`，保护凭据，
  限制性能分析端点的访问，并为上传媒体提供持久化存储和
  备份。临时托管环境中的文件可能在实例
  被替换时丢失。Vite preview 用于本地验证构建结果。

演示账号：

| 账号     | 用户名                        | 密码             |
| -------- | ----------------------------- | ---------------- |
| A        | qajohnnyparisianlxncqkkihchva | VG0xUA8Vg2YmL7xr |
| B        | qamarcosstrackelxncqkkihchvb  | nKYzjUk60AnePIyw |
| C        | qaalejandromantelxncqkkihchvc | UQxDTf1tm1EEcOOT |

## 👀 当前限制

- 搜索仅过滤已加载视频流的标题和作者，不会搜索整个数据库。
- 私信会话在进入或手动刷新时加载最近 50 条消息；
  前端不提供轮询、实时消息更新或历史消息分页。
- 视频必须是非空 MP4 文件，最大 **200 MiB**。封面支持
  JPG/JPEG/PNG/WebP，最大 **10 MiB**。能否播放取决于浏览器对编解码格式的支持。
- 未完成的分片上传可在重新选择相同文件后恢复，前提是
  服务端上传会话仍然有效，通常约为 **24 小时**。已完成
  媒体的检查点仅保存在当前页面会话中。
- 使用消息队列的操作可能需要一段时间才会出现在读取结果中。如果发布
  或消息发送返回的结果不确定，请先检查实际结果再重试。

## 📚 文档

| 文档                                             | 内容                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| [前端指南](apps/web/README.md)                   | 前端配置、行为与浏览器检查                           |
| [后端指南](docs/backend-render.md)              | 入口、依赖、部署与关闭流程                           |
| [CORS 配置](docs/backend-cors.md)               | 允许的来源与验证方式                                 |
| [API 错误码](docs/api-error-codes.md)           | 共享错误契约与生成流程                               |
| [贡献指南](CONTRIBUTING.md)                     | 开发流程、检查与拉取请求                             |
| [提交约定](docs/commit-conventions.md)          | 带 Emoji 前缀的 Conventional Commits                |
| [行为准则](CODE_OF_CONDUCT.md)                  | 社区行为要求                                         |
| [安全策略](SECURITY.md)                         | 私下报告安全漏洞                                     |

部分详细实现文档目前使用中文编写。
普通问题请通过 [GitHub Issues](https://github.com/yydrowz3/feed-to-go/issues) 报告。
疑似安全漏洞请按照 [SECURITY.md](SECURITY.md) 中的说明私下报告。

## 🤝 参与贡献

欢迎各种形式的贡献；如果你有兴趣贡献代码，欢迎查看我们的 GitHub [Issues](https://github.com/yydrowz3/feed-to-go/issues)。

> \[!TIP]
>
> 我们正在打造一个以技术为驱动的论坛，促进知识互动与思想交流，让彼此获得启发，共同创新。
>
> 帮助我们做得更好。欢迎直接向我们提供产品设计反馈，参与用户体验讨论。
>
> **主要维护者：** [@yydrowz3](https://github.com/yydrowz3)

## ❤️ 赞助

每一份支持都弥足珍贵，你的一次性捐赠将在我们的支持星河中闪耀！你就像一颗流星，为我们的旅程带来迅速而明亮的助力。感谢你的信任——你的慷慨化作一道道光芒，指引我们向目标前进。

## 📄 许可证

本项目采用 `MIT License`，更多信息请参阅 `LICENSE.md`。

版权所有 © 2026 [Feed To Go](https://github.com/yydrowz3/feed-to-go)。

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>
