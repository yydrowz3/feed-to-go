# Feed to Go Web

React 短视频前端，应用版本及依赖以 `package.json` / `pnpm-lock.yaml` 为准。使用 TanStack Router、Query、Form、Zustand、Zod、Tailwind/daisyUI night、Lucide、Sonner 和 hash-wasm。

## 本地运行

2026-10-24 验证环境：Windows、Node **v26.12.1**、pnpm **12.15.0**；package.json 要求 Node >=24、pnpm >=12。从仓库根进入前端目录，使用现有锁文件安装：

```powershell
cd apps/web
pnpm install --frozen-lockfile
```

首次运行时将 `.env.example` 复制为 `.env`，已有 `.env` 时直接检查配置，不覆盖：

```dotenv
VITE_API_BASE=http://localhost:8095
```

`VITE_API_BASE` 必填，须是浏览器可访问的 HTTP(S) 绝对地址；不允许用户名/密码、查询参数或片段，末尾斜杠会去除。不自动添加 `/api`。缺失或非法时页面显示配置错误。此值是公开构建配置，不放任何密钥。

```powershell
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
pnpm test
pnpm build
pnpm lint
pnpm preview --host 127.0.0.1 --port 5173 --strictPort
```

开发与 preview 二选一运行，使用前先停止占用同一端口的服务；浏览器打开 `http://localhost:5173`。preview 默认端口为 4173，上述显式使用 5173 是为了复用本地后端允许的 origin。使用 `127.0.0.1` 访问时后端也必须允许该 origin；它与 `localhost` 不同。

`pnpm test` 使用 Node 内置测试及注入传输层，不需要真实后端、账号或个人 `.env`。`pnpm build` 执行 TypeScript 检查并生成 `dist`，路由树由插件生成。修改前端的版本规则见 [AGENTS.md](AGENTS.md)。

## 后端直连和 CORS

Go 后端、数据库、Redis、上传目录及静态资源服务按独立后端流程启动，参见 [后端 CORS 配置](../../docs/backend-cors.md)。本前端不转发 API 或媒体，不配置 Vite 或部署代理。API 以 JSON / FormData POST 直接访问后端，私有请求使用 `Authorization: Bearer ...`，不启用跨域 Cookie 凭据。

非 dev 后端将 `WEB_URL` 设置为实际前端 origin（例如 `http://localhost:5173`），修改后重启后端。需放行 OPTIONS、POST、Authorization、Content-Type；媒体读取还涉及 GET/HEAD/Range。预检应成功，401/403/429/500 等实际错误响应也应带允许该 origin 的 CORS 头。APP_ENV=dev 的规则见后端文档，不将开发放行策略用于生产配置说明。

```powershell
curl.exe -i -X OPTIONS http://localhost:8095/video/chunk/init -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type'
curl.exe -i -X POST http://localhost:8095/account/logout -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' --data '{}'
```

分别预期为 204 和无凭据的 401，均带允许该 origin 的响应头。curl 通过后仍须在浏览器验证登录、刷新及 FormData 上传。媒体使用后端返回的绝对 URL；`/static/...` 等相对路径补全到后端 origin。浏览器 Network 中 API、视频和封面应直达后端。

## 静态部署

构建前将 `VITE_API_BASE` 设置为实际可访问的 HTTPS 后端地址，例如在构建环境提供 `VITE_API_BASE=https://backend.example.com` 后执行 `pnpm build`。该值在构建时注入；变更后端地址需要重新构建并替换产物，运行时编辑 `.env` 不会改变已有 dist。

静态服务器托管整个 `dist`，前端深链接（如 `/u/1`、`/messages/2`）回退到 `index.html`。例如在专用前端静态站点使用：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

后端设置实际前端 HTTPS origin 的 CORS，并保证其返回的媒体 URL 可从浏览器直接访问。前端站点不配置 `/api` 反代或媒体代理。Vite preview 用于本地验证构建产物，不作为生产服务。本次迁移未执行部署或 push。

## 功能与实际限制

- `/` 推荐/关注/点赞榜，`/feed` 兼容跳首页；`/hot` 独立热榜。搜索按 q 本地过滤已加载的标题和作者，不是全库搜索。
- `/video/{id}` 公开详情；`/video` 登录后发布。账号、设置、用户主页及私信沿用迁移计划中的 URL。
- 视频为非空 MP4，最多 **200 MiB**；封面 JPG/JPEG/PNG/WebP，最多 **10 MiB**。浏览器能否播放还取决于 MP4 内部编码。
- 完整文件 MD5 按 **2 MiB** 增量读取；上传按 **5 MiB** 串行分片，每片独立 MD5。仅分片网络/5xx 错误最多尝试 3 次。
- 分片状态依赖后端 Redis，上传目录须可写，合并结果及封面须可被静态服务读取。上传会话 TTL 约 **24 小时**，以服务端有效状态为准；刷新后需重新选择同一文件恢复尚未合并的分片，不保存浏览器 File。
- 当前页面保留已成功合并的视频和封面检查点。封面失败后重试可复用视频；发布响应丢失/取消时结果可能未知，应先查看作品，不能假定后端已回滚或自动重复发布。离开页面后不保留媒体检查点。
- 私信加载最近 **50 条**，进入会话或手动刷新读取，发送后更新；没有轮询、实时推送或历史分页。发送响应丢失时不自动重发。
- 点赞和评论在后端 MQ 开启时可能延迟出现在读取结果中，不能将成功响应等同于所有列表已同步。
- `_deprecated` 仅供只读参考，不进入前端运行或构建。

## 当前验收状态

2026-10-24 最新：版本 **0.1.10**，81 项测试、TypeScript/生产构建及 lint 通过。批次 `20261024-012143` 已有 5 个真实可登录账号、8 个浏览器分片发布作品；取消/刷新续传、MD5/Range、播放拖动、自动刷新、双账号互动及私信真实读回通过。当前本机入口为 **http://localhost:5174**（生产 preview），API 8095；以上 5173 示例在本批应换成 5174，后端进程 WEB_URL 保持一致。

详情页进度条支持鼠标及键盘跳转，未取得有效时长前禁用。生产页面的桌面/移动 CSS 视口通过同源 iframe 检查，实际视口分别为 1440×900、390×844；这不代表真实设备或跨浏览器验收。测试音实际听感已由用户逐一试听确认，**本联调计划完整验收通过**；本次补验已完成前端迁移验收，跨浏览器、真机和长期压力仍未验证。账号、素材、实际作品映射和证据入口见[本次真实联调汇总](../../docs/integration-test-verification.md)；专用账号密码仅保存在被 Git 忽略的本地批次文档中。

完整证据、路由矩阵和补验步骤见 [最终验收记录](../../docs/react-migration-verification.md) 与 [阶段 05 记录](../../docs/react-migration-05-verification-handover.md)。


## 浏览器回归与迁移验收

最终迁移版本 **0.1.12**，83 项前端测试通过；完整证据和验证层次见 [迁移最终验收](../../docs/react-migration-verification.md)。已有真实联调服务使用前端 `http://localhost:5174` / API `http://localhost:8095`；前文 5173 为启动示例，使用实际端口时同步配置后端允许的 origin。

除不依赖后端的 `pnpm test` 外，可显式启动生产 UI 隔离回归：

```powershell
pnpm build
pnpm test:browser --media C:/path/to/test.mp4
```

打开命令输出的 `http://127.0.0.1:5186/__checks`，点击 Run checks；结果为 JSON，也可读取 `/__report`。测试服务仅绑定本机，可用 `BROWSER_TEST_PORT` 更换端口，以 Ctrl+C 停止。`--media` 只读取指定的测试视频作为本机播放资源；省略时仍可检查失败恢复和资源释放，但不验证有效视频解码。

此入口使用构建产物和明确的隔离请求，验证守卫、表单、错误恢复、上传检查点和 12 轮页面切换，不写真实后端，也不进入生产入口。真实注册、作品发布、双账号互动、后端 CORS 和媒体结果按最终验收记录单独验证。
