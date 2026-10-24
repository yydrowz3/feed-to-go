# Render 联合入口部署

后端提供三个入口，均从 `apps/api` 目录执行：

| 命令 | 职责 | 依赖策略 |
| --- | --- | --- |
| `go run ./cmd/app` | 同一进程运行 API 和全部消费者 | PostgreSQL、Redis、RabbitMQ 全部必需 |
| `go run ./cmd/server` | API、Outbox、时间线和通知消费者 | PostgreSQL 必需，Redis/MQ 可降级 |
| `go run ./cmd/worker` | 关注、点赞、评论、热度消费者 | PostgreSQL/MQ 必需，Redis 可选 |

选择联合入口时不需要 `ENABLE_WORKER`，也不再单独部署 `cmd/worker`。

## Render 配置

创建一个 Web Service，连接当前仓库和部署分支：

| 项目 | 值 |
| --- | --- |
| Language | Go，版本满足 `go.mod` 中的 Go 1.27.2 或以上要求 |
| Root Directory | `apps/api` |
| Build Command | `go build -o app ./cmd/app` |
| Start Command | `./app` |
| Health Check Path | `/readyz` |
| 实例数量 | 1 |

使用现有 `.env.example` 中的配置，在 Render 的环境变量或 Environment Group 中设置真实值；不要提交 `.env`。

- `APP_ENV=production`，可设置 `GIN_MODE=release`。
- `WEB_URL` 为前端的正式 origin，包含协议和主机，不带路径或末尾 `/`。
- `JWT_SECRET` 使用固定随机密钥，避免重启后全部 token 失效。
- `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`、`DB_SSLMODE`，以及提供商要求时的 `DB_CHANNEL_BINDING`。
- `REDIS_HOST`、`REDIS_PORT`、`REDIS_PASSWORD`、`REDIS_DB`、`REDIS_TLS`。这是原生 Redis 连接，不是 REST API。
- `AMQP_URL` 使用完整 `amqp://` 或 `amqps://` URI，包含正确的 vhost；也可沿用分开的 `AMQP_*` 字段。
- `PORT` 使用 Render 提供的值；本地未设置时仍为 8095。
- `CONFIG_PATH` 可选，默认 `configs/config.yaml`，用于现有 pprof 配置。联合进程仅使用 API pprof 地址；不要将 pprof 当作公共健康检查。

当前代码不读取 `DATABASE_URL`、`REDIS_URL`。前端构建时另设 `VITE_API_BASE=https://你的后端域名`。

## 启动和健康检查

联合入口只加载一次配置、日志和依赖，先执行现有 `AutoMigrate`，再创建发布者、声明队列，并启动以下任务：

- 四个业务消费者：关注、点赞、评论、热度。
- 一个时间线消费者、三个通知消费者。
- 一个 Outbox 轮询任务；所有通知消费者共享 HTTP API 的 SSEHub。

八个消费者全部成功注册消费、Outbox 循环启动后才开始监听 HTTP。连接和首次注册总预算为 60 秒，TCP/TLS/AMQP 连接握手及 Redis 初始检查另有 10 秒上限。初始化失败会释放已创建的资源并非零退出。

`/healthz` 保留 `200 {"status":"ok"}`，只表示 HTTP 可用。

联合入口新增 `/readyz`：并行检查 PostgreSQL 和 Redis（总超时 2 秒），并检查 RabbitMQ 连接、后台任务就绪状态及关闭状态。就绪返回 `200 {"status":"ok"}`，否则返回 `503 {"status":"not_ready"}`，不暴露连接详情。消费者 Channel 断开时，每 5 秒尝试重建，该消费者重新注册前不就绪。RabbitMQ 整条连接断开时整个进程退出，由 Render 重启；不在旧连接上无限重试。队列参数冲突会启动失败，不会自动删除已有队列。

参考：[Render Web Service](https://render.com/docs/web-services)、[健康检查](https://render.com/docs/health-checks)。免费 Web Service 休眠时 API 和消费者会一起停止；RabbitMQ 中的消息不会唤醒 HTTP 实例。用户访问恢复实例后才继续处理消息。

## 关闭、切换和回退

SIGINT/SIGTERM 触发统一关闭：先标记未就绪、结束 SSE，再最多等待 10 秒排空 HTTP 请求；接着取消后台任务并最多等待 10 秒，最后用最多 5 秒释放连接。正常信号退出为零状态；运行故障或超时为非零。未确认消息随 Channel 关闭重新入队。现有消息重试、最终放弃及业务幂等语义不变，不承诺恰好一次处理。

关闭总预算 25 秒，低于 [Render 默认 30 秒终止等待时间](https://render.com/docs/deploys#graceful-shutdown)。

从分开部署切换时：

1. 停止独立 worker 服务，保留消息和数据库。
2. 将 API 服务改为上表中的联合构建/启动命令和 `/readyz`，重新部署。
3. 确认日志包含八个消费者的注册信息和 `application ready`，验证 Feed、点赞、评论与通知。

回退时，将 API 改回 `go build -o server ./cmd/server` / `./server`，健康检查改回 `/healthz`，并恢复独立 worker 服务。不要在联合入口长期运行的同时额外运行原独立 worker。

本功能不迁移测试数据或媒体，不修改上传目录。现有测试视频能否展示，仍取决于文件是否随部署打包以及数据库媒体地址是否正确。上线后新上传的文件仍可能在实例替换、重启或休眠时丢失。

## 验证

在 `apps/api` 执行：

```sh
go test ./...
go vet ./...
go build ./cmd/app ./cmd/server ./cmd/worker
go test -race ./internal/app ./internal/worker ./internal/api ./pkg/mq ./pkg/cache
```

race 检查需要平台支持和可用的 C 工具链。默认测试使用假依赖、内存 Redis 和本地临时监听端口，不读取 `.env` 或访问现有业务数据库。

真实集成验证必须使用独立 PostgreSQL 数据库/schema、独立 Redis 实例或专用数据库编号、独立 RabbitMQ vhost，以及专用账号与素材：

1. 从 API 工作目录启动联合入口，验证 `/healthz`、`/readyz` 和 Feed。
2. 完成登录、分片上传、封面上传、发布和媒体 Range 请求。
3. 验证点赞/取消、评论/删除、关注/取消、数据库热度、Redis 热度和通知的最终状态。
4. 在隔离环境断开 RabbitMQ 连接，确认进程非零退出；恢复连接并重新启动后确认消费恢复。
5. 在有 SSE 连接、在途 HTTP 请求及待处理消息时发送 SIGTERM，确认按预算退出，未确认消息可重新投递。

没有隔离环境时，应明确将这些真实服务场景列为未验证，不使用现有业务数据代替。

### 本次实施验证记录

2026-10-24（Asia/Shanghai）：全量 `go test ./...`、`go vet ./...`、三个命令入口的 Windows 构建和 Linux amd64 / CGO 禁用构建均通过；上述五个包的 race 检查通过。

已覆盖消费者注册与重建、启动失败清理、就绪检查、SSE 结束、HTTP 排空及强制关闭、后台任务关闭超时、连接清理超时、消息重试取消后重新入队，以及 AMQP/TLS 握手超时。

本次未提供隔离的 PostgreSQL、Redis、RabbitMQ 集成环境，因此真实业务闭环、真实 broker 断线恢复和操作系统 SIGTERM 场景尚未执行；未连接或修改当前业务数据库，也未部署到 Render。
