# Vue → React 重构计划

## 1. 目标与现状

在现有 `apps/web` React 骨架上，完整迁移旧 Vue 项目所有已接入路由的业务功能，保留 URL、页面布局、深色风格及移动端适配。

当前指定的技术栈均已安装。使用当前已安装的 `hash-wasm`（4.12.0）替代旧版 `spark-md5`，不新增 MD5 依赖或手写类型声明。现有 React 代码通过 TypeScript 检查，Lint 存在 3 条模板代码引起的 Fast Refresh 警告。

迁移以当前仓库 Go 后端为准，同时修复已发现的接口及交互缺陷。

## 2. 架构与技术约定

- **目录组织**：`routes` 负责路由配置；`features` 按账号、视频、社交、私信组织页面和业务逻辑；`components` 放共享组件；`api` 放请求和接口类型；`stores` 放 Zustand 状态；`lib` 放通用工具。
- **路由**：沿用 TanStack Router 文件路由和自动代码拆分，路由树由插件生成。受保护页面使用 `beforeLoad` 检查登录态；登录后按 `redirect` 返回站内原页面，无有效目标则留在账号页。[官方鉴权方案](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)
- **状态**：Zustand 管理登录态及跨组件客户端状态；TanStack Query 管理视频、评论、关注关系和私信；组件局部状态不放入全局 Store。同一份服务端数据不在 Zustand 重复存储。
- **表单**：登录、注册、改密码、改名、视频发布、评论、私信和搜索统一使用 TanStack Form；使用现有 Zod 校验，统一处理字段错误、提交状态及重复提交。[表单校验文档](https://tanstack.com/form/latest/docs/framework/react/guides/validation)
- **样式**：仅保留现有 `src/index.css` 的 Tailwind 导入及 daisyUI 插件配置。使用 daisyUI `night` 深色主题，布局及细节直接写在 `className`；不新增样式文件、自定义 CSS 规则或业务组件内联 `style`。[框架入口配置](https://daisyui.com/docs/install/vite/)
- **组件**：用 daisyUI 重建导航、卡片、表单、抽屉、确认弹窗、加载与错误状态；图标统一使用 Lucide，反馈统一使用 Sonner。上传进度使用原生 `<progress>` 配合 daisyUI。
- **缓存一致性**：点赞、关注、评论及发布成功后更新相关缓存并按需失效刷新；同一对象的重复操作互斥。登录、退出及账号切换时清理缓存并取消旧请求，避免不同会话串数据。[Query 缓存失效机制](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)

## 3. 接口与业务迁移

### 请求与鉴权

- 使用原生 `fetch` 重建类型化请求层，统一 JSON、FormData、错误解析及请求取消；请求层不直接弹通知，避免重复提示。
- 保留 `access_token`、`refresh_token` 存储键，兼容原有登录信息。
- 401 时共享一次刷新请求，成功后每个原请求最多重放一次；刷新未返回新 refresh token 时保留原值。刷新失败则清理会话，受保护页面返回登录入口。
- 登录、注册及改密码等凭据接口不触发自动刷新。用户退出或切换账号后，旧刷新响应不得恢复旧会话。
- 浏览器通过 `VITE_API_BASE` 直接请求后端绝对地址，沿用现有 `.env.example` 的本地示例 `VITE_API_BASE=http://localhost:8095`；生产环境填写浏览器可访问的 HTTPS 后端地址。该配置为必填项，缺失或不是 HTTP(S) 绝对地址时明确报错；统一去除末尾斜杠后拼接接口路径，不默认添加 `/api` 前缀。
- 开发、预览和生产均不使用前端服务器转发 API 或媒体请求；不配置 Vite `server.proxy`，不引入 `API_PROXY_TARGET`。媒体使用后端返回的绝对 URL；若返回 `/static/...` 等相对路径，按 `VITE_API_BASE` 的后端 origin 补全后直接访问。
- 跨域请求继续使用 `Authorization: Bearer ...`，不启用跨域 Cookie 凭据。后端需允许实际前端 origin、`POST` 方法及 `Authorization`、`Content-Type` 请求头，并正确处理 `OPTIONS` 预检和错误响应的 CORS 头。[CORS 机制说明](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- 对齐 Go 后端：作品列表调用 `/video/listByAUthorID`；关注请求使用 `following_id`；关注列表读取 `followings`。统一响应类型和空列表处理，保留头像、简介等已有字段。
- 不继续调用后端未实现的 `/api/error-report`；页面异常提供错误状态和重试入口。

### 页面与功能

| URL | 迁移内容 |
|---|---|
| `/`、`/feed` | `/feed` 重定向首页；保留推荐、点赞排序热门、关注三个标签、滚动播放、分页、搜索及快捷键 |
| `/hot` | 保留独立热榜、分页数量设置、刷新、加载更多及点赞 |
| `/video` | 登录保护；视频与封面选择、预览、分片上传、进度、重试、续传和发布 |
| `/video/$id` | 视频详情、播放、静音、点赞、关注、分享及评论抽屉 |
| `/account` | 登录、个人作品、喜欢列表、粉丝及关注列表 |
| `/account/register` | 注册成功后进入登录页 |
| `/account/change-password` | 修改密码；当前账号修改成功后清理登录态并重新登录 |
| `/settings` | 登录保护；改名、更新 token、退出登录 |
| `/u/$id` | 用户资料、作品、粉丝及关注列表、关注操作、私信入口 |
| `/messages`、`/messages/$peerId` | 登录保护；联系人、历史消息、发送及滚动定位 |

具体行为：

- 首页仅播放当前视频，保留全部滚动占位，只为当前项及相邻项挂载视频资源，避免旧版隐藏元素破坏滚动高度。切页和卸载时清理播放、事件及动画帧。
- 搜索继续通过 `q` 参数过滤已加载视频的标题和作者，不新增服务端搜索。
- 首页热门继续按点赞数排序；独立 `/hot` 继续按热度排序。分页完整传递后端返回的游标，包括热榜数据库回退游标，并按视频 ID 去重。
- 评论抽屉打开或切换视频时自动加载，统一首页与详情页的评论发布、本人删除逻辑。
- 私信保留进入会话时加载、发送后更新的模式，不增加轮询或实时通信；拒绝无效用户 ID 和向自己发信。
- 保留现有必填校验及输入处理规则，不新增密码复杂度要求。

### 上传策略

- 使用现有 `hash-wasm` 的 `createMD5()` 创建文件哈希实例，按 2 MiB 读取文件字节并转换为 `Uint8Array`，依次调用 `update()`，最终通过 `digest('hex')` 获取完整文件 MD5；不将整个视频一次性加载到内存。
- 分片大小保留 **5 MiB**。每片使用 `md5(Uint8Array)` 计算独立 MD5，继续传递现有 `file_hash`、`chunk_hash` 字段；算法保持 MD5，结果格式保持小写十六进制，后端和已有续传标识无需变更。
- 文件哈希与分片哈希不共享可变实例；WASM 异步初始化及计算失败纳入上传错误处理。模块按发布功能需要加载，沿用当前 Vite 构建，不新增 WASM 插件。`hash-wasm` 自带类型声明，WASM 已内嵌于库中。[官方说明与 API](https://github.com/Daninet/hash-wasm#readme)
- 按已确认选择，采用**串行分片上传**，避免本页面并发覆盖后端上传状态。
- 每片最多尝试 3 次，仅对网络及可重试服务端错误重试；失败后保留文件选择，允许重新提交并恢复服务端已上传分片。
- 合并前查询上传状态，确认完整后再合并、上传封面并发布；进度按实际分片字节计算。
- 刷新页面后，用户重新选择同一文件恢复上传，不持久化浏览器 `File` 对象。
- 校验非空 MP4、最大 200 MiB；封面支持 JPG/JPEG/PNG/WebP、最大 10 MiB。卸载时取消请求并释放预览 URL。

## 4. 实施顺序

各阶段的前置依赖、共享契约、进度及执行方式见 [子计划索引](react-migration-00-index.md)。按 01～05 依次实施，每次只完成一个阶段并填写实际验收记录。

实施过程中，每完成子计划“实施步骤”中的一个编号步骤，就在相关检查和记录完成后立即创建一次本地 Git commit，再进入下一步。每次必须生成并提交包含标题和非空正文的完整 commit message，并向用户反馈 hash 及与实际提交一致的完整 message；不能只提供标题。提交信息遵循 [commit-conventions.md](commit-conventions.md)，不得包含任何 `Co-authored-by` / 共同作者信息；只提交本步改动，不执行 push。具体流程见索引中的“逐步骤 Git 提交要求”。

1. **[基础层](react-migration-01-foundation.md)**：后端直连地址配置、哈希工具封装、请求层、接口适配、QueryClient、Zustand 登录态、路由守卫及应用外壳；提前交付最小真实登录与退出，为下一阶段互动验收提供条件；联调前核对后端 CORS 前置条件。
2. **[浏览闭环](react-migration-02-browsing.md)**：首页、热榜、详情、播放器、点赞、关注和共享评论抽屉。
3. **[账号与社交](react-migration-03-account-social-messages.md)**：完善登录及账号页，完成注册、改密码、设置、个人作品/喜欢、用户主页及私信，复用第一阶段的会话链路。
4. **[发布闭环](react-migration-04-upload-publish.md)**：文件校验、预览、MD5、串行分片、断点续传及发布。
5. **[收尾](react-migration-05-verification-handover.md)**：移除 React 示例及阶段占位、修正模板 Lint 警告、更新启动和部署说明，完成全量回归和交付记录。

旧 `_deprecated` 保留作为参考，不参与运行或构建；保留当前 `.gitignore` 中已有的用户修改。

## 5. 验收与边界

- 执行 `pnpm build`、`pnpm lint`，要求构建通过、无 Lint 错误，并消除现有模板警告。
- 不新增测试框架；使用 Node 内置测试验证请求刷新去重、会话失效、接口映射、分页游标及上传调度等关键逻辑。
- MD5 使用已知测试向量及不同分块边界的数据与 Node `crypto` 比对；验证完整文件和分片哈希，以及 WASM 初始化失败和取消上传。规划阶段已在 Node 环境完成 6 组长度的整块及增量比对，均一致；浏览器运行及生产构建仍需在实现阶段验证。
- 浏览器回归覆盖全部 URL、直接访问和刷新、登录返回原页、过期 token、退出及账号切换。
- 在不同前后端 origin 下验证 JSON 请求、Bearer 鉴权、token 刷新、分片及封面上传的 CORS 预检与实际响应；检查失败响应仍可被前端读取。浏览器网络面板中的接口和媒体请求应直接指向后端，路径不被前端添加 `/api` 前缀。
- 验证播放与滚动、快捷键、评论首次加载、跨页面点赞和关注同步、私信切换时旧响应不覆盖当前会话。
- 上传验证单片、多片、末片不足 5 MiB、失败重试、中断后续传、服务端返回空分片列表、合并失败和发布失败。
- 在桌面及移动端检查导航、抽屉、表单、视频区域和长文本；检查键盘操作、弹窗焦点及关闭行为。
- 生产部署说明包含 SPA 路由回退、构建时的 `VITE_API_BASE`、后端 CORS 及媒体直接访问配置；不包含 `/api` 反向代理，本次不执行上线。
- 当前 Go 后端代码未发现 CORS 配置。后端允许跨域是浏览器直连联调的前置条件；本次计划记录该外部依赖，仍仅实施前端重构，不自动扩展到后端改造。
- 本次仅修改前端；复用当前 `hash-wasm`，不安装 `spark-md5`、不新增依赖、不主动升级现有依赖。后续若确需新依赖，先向用户确认。
- 不迁移未接入路由的旧 `FeedView` 调试页，不新增头像编辑、简介编辑、标签流、SSE 通知或其他旧界面尚未启用的功能。
