# 子计划 03：联调环境与服务启动

前置：[02 本地素材验证](integration-test-02-media-fixtures.md)。下一阶段：[注册与登录](integration-test-04-auth.md)。当前状态：通过（环境与浏览器 CORS，尚未注册或上传）。

## 目标和环境基线

使用现有配置启动本机 Go API、独立 worker 及 React 前端，确认远程数据库、Redis、RabbitMQ 和本地媒体服务实际可用。探索时配置为前端 `http://localhost:5173`、API `http://localhost:8095`，执行时重新检查；不把历史就绪状态当作当前结果。

## 实施步骤

### 1. 检查配置和端口

- 检查 5173、8095、6060、6061 的占用及对应进程；已有同项目服务先核对工作目录、配置和代码版本，合适时复用，不停止无关进程。
- 从 `apps/api` 启动才能读取正确 `.env` 和相对上传目录；系统已有环境变量优先于 `.env`，核对实际生效值。
- 仅记录端口、前端 origin、TLS 是否启用及依赖是否已配置，不输出数据库、Redis、AMQP 密钥或完整连接 URI。
- 检查 Redis DB 的解析规则；已观察到配置值为 `default`，当前代码数值解析失败后使用 0。验证实际连接结果并记录，不因本计划自行覆盖 `.env`。
- 确认 VITE_API_BASE 指向 API，WEB_URL 与浏览器实际 origin 一致。`APP_ENV=development` 不等于源码中的 `dev`，保持正确受限 CORS 配置。

### 2. 启动并验证 API 和 worker

从 `apps/api` 分别运行下列两个进程，已有合适进程时复用：

```powershell
go run ./cmd/server
go run ./cmd/worker
```

- API 启动会连接数据库并执行现有 AutoMigrate；记录成功或具体失败，不添加额外迁移，不触碰既有数据。
- 确认 Redis 真正连接成功；API 在缓存禁用时也可能启动，但此时不能进入分片上传验收。
- 确认 RabbitMQ 连接和 worker 消费者启动成功。API 内含 timeline/outbox 和通知相关任务，独立 worker 处理点赞、评论、关注、热度等业务，不以重复启动多个 worker 掩盖异常。
- 请求 `/healthz` 验证 API HTTP 可用；同时检查依赖日志，因为 healthz 成功不代表 Redis、MQ 或数据库业务均可用。
- 核对 `apps/api/.run/uploads` 的本地落盘位置和可写性，不把测试素材生成目录作为后端上传目录。

### 3. 启动前端并验证直连

从 `apps/web` 运行：

```powershell
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

- 使用浏览器访问 `http://localhost:5173`；浏览器地址中的 localhost 与 WEB_URL 对齐，不随意换成 127.0.0.1。
- 验证公开页面和真实 API 请求可访问，Network 中请求直达 8095，无新增 `/api` 前缀或代理。
- 对 `/account/logout`、`/video/chunk/init`、`/video/chunk/upload`、`/video/uploadCover` 检查来自前端 origin 的预检，预期 204 且允许必要方法和请求头。
- 无 token 的受保护请求应得到 401 且保留正确 CORS 头；浏览器应能读取错误，不表现为模糊跨域错误。
- `/static` 的真实媒体读取和 Range 在 05 发布后验证；此时只确认静态路由及存储配置，不虚构成功样本。

### 4. 保存环境交接信息

- 记录 Node、pnpm、Go、FFmpeg 版本、代码版本、前后端地址、API/worker/前端进程及日志位置，日志先脱敏。
- 把实际 API 基址写入本批次清单及账号文档；后续 register 命令发现地址不一致时停止，避免同批次写入两套环境。
- 启动为长期进程时使用当前工具支持的后台方式；若用 PowerShell Start-Process，指定隐藏窗口并保存 PID、工作目录和日志位置。
- 就绪条件不足时保存阻塞原因、已尝试检查和恢复入口，保留本地素材；不自动切换依赖、关闭 TLS 或禁用 MQ/Redis 后宣称全部通过。

## 验收条件

- [x] 前端和 API 实际地址确认，API、worker 和前端进程可追踪。
- [x] 数据库、Redis、RabbitMQ 与业务消费者就绪。
- [x] 浏览器 API 直连和 CORS 预检/401 响应验证通过。
- [x] 上传目录可写，启动及恢复方式已记录，无密钥泄漏。

## 实施记录

- 执行时间 / batch：2026-10-24（Asia/Shanghai，精确时间见各 evidence）；复用 `20261024-012143`。代码基线 `cdb34b9b427b07a6a06b9f2d103137c03eefa41e`。Node `v26.12.1`、pnpm `12.15.0`、Go `go1.27.3 windows/amd64`、FFmpeg `9.0.2`；实际已安装 Vite `8.3.5`，本次没有安装或升级依赖。
- 端口与进程：初始 5173 为其他项目的 Vite（PID 276），未操作；本项目 API 原 PID 4516、worker 原 PID 13756，由 executable 模块信息、pprof 源路径和工作目录确认。API 重启为 PID 28640，前端新建为 PID 17672。最初复用 worker 13756，最终核对发现它已退出；确认旧进程及 6061 均已消失后，启动当前源码编译的独立 worker PID 2000（日志 runner 7756），没有并发启动重复 worker。旧进程退出原因无法从原控制台取证，保留初始就绪证据并记录替换恢复。API/worker 工作目录为 `apps/api`，前端为 `apps/web`；API/前端和初始 worker 通过 Windows 进程元数据核实，新 worker 明确从 API 目录启动。pprof 6060/6061 只监听 loopback。证据见本地 `evidence/stage-03-process-working-directories.json`、`api-process.json`、`worker-process.json`、`web-process.json`、`worker-readiness.json`。
- 实际配置：前端 `http://localhost:5174`；API `http://localhost:8095`。仅 API 启动进程覆盖 `WEB_URL=http://localhost:5174`，`APP_ENV=development` 保留受限 CORS；前端仍由现有 `.env` 的 `VITE_API_BASE=http://localhost:8095` 直连。真实 `.env` 未改写。Godotenv/配置加载实测只有 WEB_URL 为进程覆盖；Redis `default` 按源码解析为 DB 0。数据库 `sslmode=require`、`channel_binding=require`，Redis/MQ TLS 保留开启。
- 数据库和启动：从 `apps/api` 编译 `./cmd/server` 到被忽略的本批次 `evidence/bin/server.exe`，隐藏窗口启动，代码与 `go run ./cmd/server` 相同。正常启动执行现有 AutoMigrate 后监听，日志无连接、迁移或缓存/MQ 禁用错误。独立只读探针通过 `SELECT 1`，并验证本机数据库连接的 TLS 握手完成；`pg_stat_ssl` 在数据库后端会话返回 false，单独保留该原值，不将其误判为本机客户端 TLS 未启用。
- Redis/MQ/消费者：真实 Redis PING 成功，API 日志确认 cache enabled；RabbitMQ 连接成功且 TLS 握手完成。替换 worker 后再次被动 QueueInspect，`social.events`、`like.events`、`comment.events`、`video.popularity.events` 和 `video.timeline.update.queue` 均恢复为各 1 个消费者、0 个待消费消息。运行中 pprof 确认四类业务 Worker 的 Run，以及 API 的 timeline consumer、outbox 和 notification goroutine。当前 worker 的 `worker.log` 保存 Redis 成功、pprof 及四类 started/consuming 日志；最初复用进程的证据另保留于 `worker-initial-readiness.json`。
- HTTP 检查：12 项通过，含 `/healthz` 200、四条指定路径的 OPTIONS 204 与无 Authorization POST 401、旧来源 5173 的 OPTIONS 403、静态不存在样本 404、公开 feed 200。允许来源响应带正确 CORS 头，预检允许 POST、Authorization、Content-Type、Range；不使用通配来源。`evidence/stage-03-http.json` 记录实际状态、必要响应头、耗时及脱敏响应。
- 浏览器检查：in-app browser 从真实 5174 origin 发起 7 项检查，health/feed 为 200，四项未登录 JSON/FormData 请求为 401，另一个无效公开标记头请求为 401，错误 JSON 均可读取，没有 CORS 阻断。检查页请求明确使用 `http://localhost:8095`，正式首页也通过真实 feed 请求展示“暂无视频”，没有代理或 `/api` 前缀。`evidence/stage-03-browser.json`、`stage-03-browser-cors.png`、`stage-03-frontend.png`、`stage-03-browser-console.json` 保存证据。
- 存储：`apps/api/.run/uploads` 实际创建并通过独立命名临时文件写入、读回及删除检查；真实路径确认位于仓库 API 工作目录下。没有复制素材到上传目录或虚构静态媒体成功样本，实际播放与 Range 留给 05。
- 批次交接：manifest 的 `api_base`、`web_base` 已写入实际地址，accounts.md 由 JSON 重新渲染；账号 JSON 的 SHA-256 与 01 相符，仍为 5 个待注册账号，8 项发布映射仍为空。服务默认保留运行，具体 PID、脱敏日志、启动和停止方式见本地 `services.md`。
- 缺陷 / 版本：无需改动产品代码，前端保持 `0.1.9`。Go 依赖探针和 HTML 浏览器检查页是临时纯验证文件，完成后已移到被忽略的 evidence，产品源码中不保留测试入口。未覆盖 `.env`，未修改配置源码、依赖或锁文件；没有自动提交、推送或部署。
- 受阻项 / 下一阶段：本阶段无受阻项。04 从实际前端 `http://localhost:5174/account/register` 开始，沿用 API 8095 和现有 batch；先完成 A 的真实浏览器注册，再实现并执行其余账号的 register 分支。注册/登录、素材上传和业务互动均未提前执行。
