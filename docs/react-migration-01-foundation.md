# 子计划 01：基础层、鉴权与应用外壳

前置：[执行约定](react-migration-00-index.md)。下一阶段：[视频浏览与互动](react-migration-02-browsing.md)。

执行要求：下方 7 个编号实施步骤逐个完成、逐个本地 Git commit，先完成本步相关检查和记录再提交，不积攒到阶段末。提交信息遵循 [commit-conventions.md](commit-conventions.md)，不含 `Co-authored-by` 或共同作者声明，不执行 push；范围和核对流程遵循 [逐步骤提交要求](react-migration-00-index.md#逐步骤-git-提交要求)。

## 目标与交付边界

本阶段建立后续页面共用的运行基础，交付可启动、可真实登录和退出、可验证路由保护的 React 应用。未实现的业务页面使用明确的阶段占位。不要在本阶段提前迁移视频流、账号作品列表、私信或上传界面。

最小登录及退出提前到本阶段，用于下一阶段验收需要登录的视频互动；第三阶段在原实现上扩展。

## 开始前核对

1. 阅读主计划和索引，检查工作区已有变更；禁止覆盖用户修改。
2. 确认当前 Vite、React Compiler、TanStack Router 插件、路径别名和两行 CSS 入口正常。保留现有插件，不重新初始化项目。
3. 检查 `.env.example`；保留本地直连地址示例，真实环境由使用者配置 `.env.local`，不写入真实凭据。
4. 真实联调前确认后端 CORS 已就绪；未就绪先完成可注入依赖的请求和会话单元测试，记录联调阻塞。

## 实施步骤

### 1. 建立目录与运行入口

- 创建 `src/api`、`src/lib`、`src/stores`、`src/components`，以及 `src/features/account`。后续功能目录按需创建，避免空壳堆积。
- QueryClient 在应用初始化时创建一次，由最外层 Provider 提供；Router context 传入同一实例，RootRoute 不再自己创建第二个 QueryClient。
- 初始化顺序为读取并验证配置、创建会话 Store、请求客户端和 QueryClient、建立会话协调订阅、创建 Router、渲染。
- 配置错误显示明确的配置错误界面，不发请求；不把开发后端地址作为生产兜底。
- 保留 StrictMode，所有监听订阅都返回清理函数。

### 2. 直连配置与纯工具

- `src/lib/config.ts` 暴露 `parseApiBase(value)`：要求 HTTP(S) 绝对 URL，不允许用户名密码、query 或 hash，去除末尾斜杠。请求 URL 使用 base 加以 `/` 开头的接口路径，不自动补 `/api`。
- `src/lib/media-url.ts` 保留有效的绝对媒体 URL；`/static/...` 等相对路径按后端 origin 补全；空值留空。预览的 blob URL 只在发布组件内使用。
- 从 Vue 工具移植 JWT base64url 解码，不依赖 Vue/Pinia；无效 token 返回 null，中文用户名可以正常解析。
- `src/lib/hash.ts` 提供 `computeFileMd5(file, { signal, onProgress }?)`、`computeBlobMd5(blob)`。内部动态导入 hash-wasm；文件每次读取 2 MiB，转 Uint8Array 后 update，输出小写十六进制。循环中检查取消，不共享可变 hasher；这一阶段只交付工具，不做上传编排。
- 浏览器配置读取放在组装入口，纯工具及请求工厂不得在模块顶层依赖 `import.meta.env` 或 window，以便 Node 测试。

### 3. 统一 API 客户端

在 `src/api/client.ts` 提供 `createApiClient({ baseUrl, fetchImpl, auth })`，由应用组装实际依赖。会话访问器应支持读取当前 token / sessionId、更新同一会话 token、清理同一会话；客户端不导入 Router、QueryClient、Sonner 或业务组件。

| 接口 | 约定 |
| --- | --- |
| `postJson<T>(path, body, options?)` | POST JSON；Content-Type 为 application/json |
| `postForm<T>(path, formData, options?)` | POST FormData；不手动设置 Content-Type，由浏览器生成 boundary |
| `options` | `auth: 'none' / 'optional' / 'required'`，默认 optional；可传 AbortSignal |
| `ApiError` | message、status、payload；网络错误保留独立类型或可识别原因，不伪造为 HTTP 401 |

刷新流程必须实现：

1. required 无 token 时直接拒绝；none 不附带 token、也不触发刷新。
2. 可认证请求捕获发送时的 sessionId 和 token。401 时，若当前已变成新会话则停止处理；若同一会话 token 已更新，直接使用新 token 重放一次。
3. 否则同一会话共享一个 `/account/refresh` Promise，直接使用原始 fetch，避免递归刷新。只提交 refresh_token。
4. 刷新成功更新 access token；响应没有有效的新 refresh token 时保留旧值。更新前核对 sessionId 和发起刷新时的 access token，防止退出后的迟到响应恢复登录，或用旧刷新结果覆盖同会话较新的改名凭据；同会话已有新 token 时使用当前值。
5. 每个原请求最多重放一次，重放仍 401 时清理当前会话。刷新失败也只清理发起它的会话，不清理后来登录的其他账号。
6. 调用方取消后不重放它的请求；一个请求取消不得取消其他请求正在等待的共享刷新。退出会话时使该刷新作废。
7. 不对普通业务请求统一自动重试，不吞异常，不在客户端弹通知，不记录 token 或密码。

### 4. 类型、归一化与业务 API

创建 `src/api/types.ts` 和各领域 API 模块，保留后端 DTO 字段。将旧纯函数迁移到新目录，不从 `_deprecated` 导入。

| 领域 | 本阶段提供的包装与注意点 |
| --- | --- |
| account | login/register/changePassword 不带鉴权且不刷新；logout/rename 必须鉴权；findByID 公开；refresh 只供客户端内部使用 |
| feed | latest、likesCount、popularity 为 optional，following 为 required；完整保留所有分页字段 |
| video | getDetail 和 `/video/listByAUthorID` 公开；publish、封面及 chunk 接口 required |
| like | like/unlike/isLiked/listMyLikedVideos 均 required |
| social | follow/unfollow 用 following_id；getAllFollowers 可传 following_id，getAllVloggers 可传 follower_id；读取 followings、followings_count |
| comment | listAll 公开；publish/delete required |
| message | send/list required；messages 为 null 时归一化为 [] |

- 列表 null / undefined 归一化为 []；保留 Account.avatar_url / bio，不再像旧 normalizeAccount 那样丢失字段。
- FeedVideoItem.create_time 是秒；最新流 next_time 是毫秒，关注流 next_time 是秒。分别传递，不合并成一个时间单位转换器。
- Video.create_time、Comment.created_at、Message.created_at 是日期字符串。展示时单独转换，禁止拿展示格式回传为游标。
- 对上传初始化和状态的 uploaded_chunks 同样做空数组归一化。

### 5. Zustand 会话与 Query 配置

- `src/stores/auth.ts` 管理 accessToken、refreshToken、claims / accountId、username 和仅驻留内存的 sessionId。登录和退出递增 sessionId；刷新和改名更新 access token 时保持 sessionId。
- 沿用两个 localStorage 键。读取/写入失败时应用仍可保持当前内存会话；密码不进入 Store 或持久化。token 结构无效时清理它；过期 token 允许请求层尝试刷新。
- 应用层会话协调器在登录、退出和账号切换时取消旧 Query、取消注册的会话任务、清空缓存、使 Router 鉴权重新计算。不得把这些副作用放进 React 渲染过程。
- Query 默认 `retry: false`、`staleTime: 30_000`、`refetchOnWindowFocus: false`；Mutation 默认不重试，上传分片另行编排。Query function 必须消费 signal。
- 在 `src/lib/query-keys.ts` 集中创建 key：`['feed', sessionId, viewerId, kind, limit]`、`['video', sessionId, viewerId, id]`、`['liked', sessionId, viewerId, id]`、`['followers', sessionId, viewerId, accountId]`、`['followings', sessionId, viewerId, accountId]`、`['comments', sessionId, viewerId, videoId]`；第三阶段扩展同一工厂。

### 6. 文件路由与应用外壳

采用父布局加 index 子页的文件路由，Router 统一 `trailingSlash: 'never'`；保持对外 URL 与主计划一致。

| 文件（相对 src/routes） | 职责 |
| --- | --- |
| `__root.tsx` | 公共根布局、错误边界、notFound、唯一 Sonner Toaster |
| `index.tsx`、`feed.tsx`、`hot.tsx` | 首页、兼容跳转、热榜 |
| `video.tsx` | 仅 Outlet，不加鉴权 |
| `video.index.tsx` | 发布路由，在本页 beforeLoad 加鉴权 |
| `video.$id.tsx` | 公开详情路由 |
| `account.tsx`、`account.index.tsx` | 公开 Outlet；最小登录/账号页 |
| `account.register.tsx`、`account.change-password.tsx` | 公开账号子页 |
| `settings.tsx` | 鉴权，先提供最小退出界面 |
| `u.$id.tsx` | 公开用户主页路由 |
| `messages.tsx` | 鉴权且只渲染 Outlet |
| `messages.index.tsx`、`messages.$peerId.tsx` | 联系人和会话页面 |

- 路由文件只装配 Route，页面组件放 features，公共布局放 components；不要手写 routeTree.gen.ts。启动 Vite 更新生成树后再运行完整 build。
- beforeLoad 从当前 Store 读取状态，不能捕获初始化时的快照。未登录跳转 `/account?redirect=原站内URL`；参数只接受本源站内路径，拒绝外部 URL、`//`、反斜杠及指回登录页的循环目标。
- `q` 通过 search 校验，非字符串归为空；`redirect` 通过专用工具校验。资源 ID 必须是正安全整数，无效时展示错误状态且不请求 API。
- AppShell 迁移旧侧栏、顶部搜索、移动端导航及登录状态；只渲染一次，不在每个页面重复包裹。首页和详情使用全高内容区，其他页面使用带 padding 的容器。
- 建立 LoadingState、EmptyState、ErrorState、FormField、UserAvatar、ConfirmDialog、StagePlaceholder。抽屉/弹窗使用原生 dialog 配合 daisyUI，统一 Esc、遮罩关闭、焦点返回。
- UserAvatar 使用固定尺寸枚举和可静态扫描的 Tailwind 颜色类映射；图片加载失败退回用户名首字，不通过动态 CSS 类或 inline style 生成头像。
- 主题放在根元素 data-theme="night"，根布局使用字体、背景、文字、最小高度工具类；index.css 不写规则。

### 7. 最小真实登录与退出

- 登录表单使用 TanStack Form + Zod，用户名和密码沿用旧版 trim / 必填规则；回车和按钮共用同一 onSubmit，提交时禁用重复操作。
- 登录成功替换会话并持久化两个 token，清理旧缓存、更新路由鉴权；有有效 redirect 时返回，否则在 `/account` 显示账号身份和“完整资料将在阶段 03 实现”的阶段说明。
- 登录失败保留用户名，展示可读错误，不保存或打印密码；成功后清空密码。
- `/settings` 暂时提供身份和退出按钮，使用共享确认弹窗；确认后请求 logout，无论响应成功与否都清理本地会话、停止旧任务并回首页，失败时补充一次通知。

## 自动检查与人工验收

使用当前 Node 的内置 `node:test` / `node:assert/strict`，在 `apps/web/tests` 放 `.test.mjs` 测试，package.json 增加 `"test": "node --test"`。测试直接以带 `.ts` 扩展名的相对路径导入纯逻辑模块，避免 Vite alias、TSX、import.meta.env 和真实浏览器依赖。保持 TypeScript 为可擦除语法，不新增测试框架或转换器。[Node 测试说明](https://nodejs.org/api/test.html)

自动测试至少包含：

- 配置缺失、非法协议、末尾斜杠和 URL 拼接；相对媒体 URL；中文和损坏 JWT。
- 同会话多个 401 只刷新一次，迟到 401 复用新 token，重放仍 401 不循环；FormData 重放和 boundary 处理。
- 退出/换号后旧刷新响应作废；请求取消不误清会话，也不破坏其他请求的刷新。
- 原有存储键恢复及存储异常；Query key 的账号和会话隔离；后端社交字段映射及空列表。
- MD5 已知向量、二进制数据及跨 2 MiB 边界比对 Node crypto；主动取消。

```powershell
pnpm test
pnpm build
pnpm lint
pnpm dev
```

人工检查：

- [ ] 缺失 VITE_API_BASE 显示配置错误；正确配置时网络请求直达后端，没有 /api 前缀或代理。
- [ ] 登录成功、刷新页面恢复、失败提示、退出后本地 token 删除、登录返回受保护的原 URL。
- [ ] 匿名访问 `/video`、`/settings`、`/messages` 被拦截，但 `/video/1`、注册和改密码仍公开。
- [ ] `/feed?q=文字` 返回首页并保留搜索；未知路由和非法 ID 有明确界面。
- [ ] 桌面侧栏、移动端导航、搜索、主题和唯一 Toaster 正常。
- [ ] 当前阶段代码构建通过；记录剩余示例页 Lint 警告，最终在 05 清零。

## 交接给阶段 02

交付可复用的请求实例、领域 API、类型、auth Store、QueryClient / key 工厂、登录跳转工具、共享组件、哈希工具和测试入口。阶段 02 只替换对应占位页，不重新实现这些基础设施。

### 实施记录（完成时填写）

- 实施日期与变更摘要：2026-10-22，开始阶段 01；后端/CORS 暂未就绪，用户要求先完成代码与自动测试。
- 步骤 1：建立运行时组装、单一 QueryClient Provider 和 Router context、配置错误界面、会话协调订阅及销毁入口；保留 StrictMode、现有插件和 CSS。配置解析提前建立以保证入口可用，完整工具在步骤 2 补齐，会话实现于步骤 5 完善。
  - 检查：`pnpm test` 1/1 通过；`pnpm build` 通过；`pnpm lint` 无错误，保留原有 3 条模板 Fast Refresh 警告。
- 各编号步骤的完成内容、检查结果及 commit 清单：待填写；提交 hash 在创建后反馈，不为回填自身 hash 创建额外提交。
- 步骤 1 commit：`ad67b24` — `✨ feat(web): establish application runtime and shared query context`。
- 步骤 2：提供直连 URL 拼接、后端 origin 媒体补全、中文 JWT 身份解码和动态加载 hash-wasm 的独立 MD5 工具；文件按 2 MiB 读取，支持进度和取消。
  - 检查：`pnpm test` 5/5 通过，覆盖已知向量、二进制、跨 2 MiB 边界、并行独立哈希与取消；`pnpm build` 通过。
- 自动检查命令及结果：待填写。
- 步骤 2 commit：`912ce93` — `✨ feat(web): add direct URL JWT and incremental MD5 tools`。
- 步骤 3：实现可注入 fetch/会话访问器的 API 客户端、JSON/FormData、类型化 HTTP 错误、单次重放、同会话共享刷新、旧会话隔离和独立请求取消；组装入口创建客户端。
  - 检查：`pnpm test` 16/16 通过；`pnpm build` 通过；`pnpm lint` 无错误、原有 3 条模板警告。覆盖迟到 401、刷新未返回 refresh token、FormData boundary、退出/换号、改名竞态、取消与错误类型。
- 浏览器直连与鉴权验证：待填写。
- 后端/CORS 阻塞及未完成项：待填写。
- 本阶段交付结论：未开始。
