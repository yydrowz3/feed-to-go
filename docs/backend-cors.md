# 后端 CORS 配置

后端启动入口通过 `godotenv.Load()` 读取当前工作目录的 `.env`，已有系统环境变量优先生效。从 `apps/api` 启动服务，使用 `APP_ENV` 选择 CORS 策略：

- `APP_ENV=dev`：允许任意来源，响应 `Access-Control-Allow-Origin: *`，不受 `WEB_URL` 限制。
- 其他值（包括未设置）：只允许 `WEB_URL` 指定的一个前端 origin。只有去除首尾空白后恰为 `dev` 才开启全部来源；`development`、`DEV` 等仍使用受限策略。

本地开发示例：

```dotenv
APP_ENV=dev
```

非 dev 环境示例：

```dotenv
APP_ENV=production
WEB_URL=http://localhost:5173
```

非 dev 环境下，`WEB_URL` 未设置、留空或仅含空白时，默认使用 `http://localhost:5173`。配置值首尾空白会去除；配置后只允许该 origin，不额外放行默认地址。

- 值为协议、主机和端口，不包含路径或末尾 `/`。
- 如果从 `http://127.0.0.1:5173` 打开前端，应将 `WEB_URL` 改为这个地址；它与 `localhost` 是不同的 origin。
- 使用 Vite preview 时配置实际前端端口，例如 `http://localhost:4173`；生产环境配置实际前端 HTTPS origin。
- 非 dev 配置接受一个 origin，不使用通配符，也不支持逗号分隔多个地址。修改 `APP_ENV` 或 `WEB_URL` 后重启后端生效。
- 前端继续通过 `VITE_API_BASE` 直连后端，该值与后端的 `WEB_URL` 用途不同。

中间件全局注册在业务路由、鉴权、限流和静态资源之前：允许的 origin 的 OPTIONS 预检返回 204；实际请求和业务错误响应保留 `Access-Control-Allow-Origin`。允许 GET、HEAD、POST、OPTIONS，以及 Authorization、Content-Type、Range 请求头。预检缓存为 600 秒，响应包含 `Vary: Origin`，不启用跨域 Cookie 凭据。非 dev 的其他 origin 返回 403，无 Origin 的请求继续由原有路由处理。dev 放行来源后，业务鉴权与限流仍正常执行。

后端启动后，从 PowerShell 验证预检：

```powershell
curl.exe -i -X OPTIONS "http://localhost:8095/account/logout" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
```

预期为 204，并包含 `Access-Control-Allow-Origin`（dev 为 `*`，其他环境为匹配的前端 origin）、允许方法及请求头。验证业务错误响应时，不携带 token 请求受保护接口：

```powershell
curl.exe -i -X POST "http://localhost:8095/account/logout" -H "Origin: http://localhost:5173" -H "Content-Type: application/json" --data "{}"
```

预期为 401，同时仍包含相应的 `Access-Control-Allow-Origin`。非 dev 时上述 Origin 应与配置保持一致；dev 可换成任意其他来源验证。最终仍需在浏览器验证登录、刷新、上传、媒体访问和错误响应；curl 与中间件单元测试不替代浏览器 CORS 验收。

自动测试从 `apps/api` 执行：

```powershell
go test ./internal/api ./internal/config
go test ./...
```
