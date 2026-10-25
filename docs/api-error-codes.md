# API 错误码契约

2026-10-24 随前端 0.1.13 配套交付。共享清单是 `shared/error-codes.json`，生成脚本是 `scripts/generate-error-codes.mjs`；从前端执行 `pnpm errors:generate` 更新 Go/TypeScript 产物，`pnpm errors:check` 检查是否过期。无需安装额外生成依赖。

错误响应为 `{ code, error }`，`code` 用于程序判断，`error` 是登记的英文兼容描述。成功响应保持原样，上传错误的 `missing`、`completed`、`total`、`expected`、`actual` 附加字段继续保留。内部异常记录在服务端日志，不透传诊断细节。

| HTTP | code | 兼容英文描述 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | invalid request |
| 400 | `INVALID_CURRENT_PASSWORD` | current password is incorrect |
| 400 | `SELF_FOLLOW_NOT_ALLOWED` | cannot follow yourself |
| 400 | `UNSUPPORTED_FILE_TYPE` | unsupported file type |
| 400 | `UPLOAD_HASH_MISMATCH` | upload hash mismatch |
| 401 | `AUTH_REQUIRED` | authentication required |
| 401 | `INVALID_TOKEN` | invalid token |
| 401 | `TOKEN_EXPIRED` | token expired |
| 401 | `TOKEN_REVOKED` | token has been revoked |
| 401 | `INVALID_REFRESH_TOKEN` | invalid refresh token |
| 401 | `INVALID_CREDENTIALS` | invalid username or password |
| 403 | `FORBIDDEN` | permission denied |
| 404 | `ACCOUNT_NOT_FOUND` | account not found |
| 404 | `VIDEO_NOT_FOUND` | video not found |
| 404 | `COMMENT_NOT_FOUND` | comment not found |
| 404 | `UPLOAD_SESSION_NOT_FOUND` | upload session not found |
| 409 | `USERNAME_TAKEN` | username already exists |
| 409 | `ALREADY_LIKED` | video already liked |
| 409 | `NOT_LIKED` | video is not liked |
| 409 | `ALREADY_FOLLOWED` | account already followed |
| 409 | `NOT_FOLLOWING` | account is not followed |
| 409 | `UPLOAD_INCOMPLETE` | not all chunks uploaded |
| 413 | `FILE_TOO_LARGE` | file too large |
| 429 | `RATE_LIMITED` | too many requests |
| 500 | `INTERNAL_ERROR` | internal server error |
| 503 | `UPLOAD_SERVICE_UNAVAILABLE` | upload service unavailable |

注册和改名由数据库唯一约束兜底，冲突返回 409 USERNAME_TAKEN；登录的不存在账号与密码错误统一为 401 INVALID_CREDENTIALS；改密凭据不符为 400 INVALID_CURRENT_PASSWORD，内部故障仍为 500。删除他人评论为 403 FORBIDDEN。上传会话缺失、Redis 故障和损坏数据分别为 404、503、500，未完成合并为 409，文件超限为 413。NOT_LIKED 用于取消未点赞视频的既有业务冲突。

当前前端调用的账号、视频、信息流、点赞、评论、关注、私信与共用鉴权/限流使用本契约。未使用接口保留原行为；没有新增后端语言协商或 SSE 专项改造。

客户端优先按已知 code 翻译，旧后端无 code、未知 code、非 JSON 错误按 HTTP 状态和操作上下文降级，不展示原始后端错误文本。ApiError 保留 status、payload、可选 code 及原构造方式。

受保护请求 401 保留单次刷新及重放；登录、注册、改密使用 auth:none；403 不刷新也不清除登录，400/404/409/413/429 不自动重试。分片仅对网络和 5xx 有限重试，合并和发布不自动重试，结果不确定时保留恢复指引。

部署先后端、后前端。本次 HTTP 状态调整是接口行为变化，发布说明不能仅标记为翻译更新。详见 [实施验收](frontend-i18n-verification.md)。
