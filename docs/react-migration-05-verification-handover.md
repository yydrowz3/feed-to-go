# 子计划 05：全量回归、清理与交付

前置：阶段 01～04 已实施，见 [执行索引](react-migration-00-index.md)。本阶段是迁移最终验收，不部署、不 push、不引入新业务功能。

执行要求：下方 6 个编号实施步骤逐个完成、逐个本地 Git commit，先完成本步相关检查和记录再提交，不积攒到阶段末。每次生成和提交的完整 commit message 必须包含标题及非空正文，提交后反馈 hash 和完整 message（标题和正文）。提交信息遵循 [commit-conventions.md](commit-conventions.md)，不含 `Co-authored-by` 或共同作者声明；范围和核对流程遵循 [逐步骤提交要求](react-migration-00-index.md#逐步骤-git-提交要求)。纯审计或验证步骤也要保存实际结果并提交该记录，不创建空提交。

## 目标与进入条件

确认 React 版覆盖旧路由全部功能，清理临时占位和模板内容，验证真实后端直连、会话隔离、媒体和上传链路，留下可复现的启动与验收记录。

开始前逐份阅读前四阶段的实施记录：

- 代码检查和人工验证必须有实际结果，不能只存在待勾选清单。
- 前置阶段若仍有未实现功能，返回对应阶段完成，不用本阶段临时绕过。
- 如果 CORS、账号、数据、Redis 等条件未就绪，可以完成静态检查和文档，但最终结论必须保留真实联调待完成。

## 实施步骤

### 1. 功能和依赖审计

- 逐项对照迁移主计划与索引路由矩阵，确认所有阶段占位已被真实页面替换。
- 移除 React 模板 `/about`、Hello/Welcome 示例内容、不再引用的模板资源、StagePlaceholder 和其导入。删除前检查是否确实无人引用；旧 `_deprecated` 继续保留。
- 当前路由文件应主要装配 Route，页面/布局组件在 feature 或 components 中；修复现有 Fast Refresh 警告，不能整体关闭 React Hooks 或 Refresh 规则来换取通过。
- 检查根部仅有一份 QueryClient、RouterProvider、AppShell 和 Sonner Toaster；没有每个页面重复初始化的客户端或 Store。
- 检查 package.json、pnpm-lock.yaml，只有用户已存在的依赖和获批准变更。test 脚本允许增加，不安装测试框架、CSS 工具、上传库或 Vue 兼容层。
- 检查 `src` 不再依赖 Vue、Pinia、vue-router、spark-md5 或 `_deprecated`，没有旧错误上报地址调用。

### 2. 样式和直连约束审计

- `src/index.css` 仅有 Tailwind 导入及 daisyUI 插件配置；没有新增 CSS/SCSS、CSS Modules、CSS-in-JS、业务内联 style 或 style 注入。
- 动态视觉值使用原生属性或静态可扫描的类映射；上传 progress 使用 value/max，头像样式使用固定 class，不能运行时拼出 Tailwind 类名。
- CSS 由框架构建输出不算新增手写样式文件；Sonner、Lucide 等库内部实现不做无关改造。
- Vite 中无 API / static 代理；配置和文档不引入 API_PROXY_TARGET 或 `/api` 默认基址。所有业务 API 使用统一客户端。
- 生产 VITE_API_BASE 在构建时注入，README 说明改地址需要重新构建；浏览器网络面板确认 API 和媒体目标是后端。

可从仓库根目录执行以下辅助搜索；命中项需人工判断，不能机械删除。

```powershell
rg -n 'vue|pinia|vue-router|spark-md5|_deprecated|error-report' apps/web/src
rg --files apps/web/src -g '*.css' -g '*.scss' -g '*.sass' -g '*.less'
rg -n 'style=|<style|@apply|@layer|API_PROXY_TARGET|server\.proxy' apps/web/src apps/web/vite.config.ts
rg -n 'StagePlaceholder|Hello from|Welcome Home' apps/web/src
```

### 3. 路由和会话回归

| 路径 | 匿名验收 | 登录验收 |
| --- | --- | --- |
| `/`、`/feed?q=...` | 可浏览，兼容跳转和本地搜索正常 | 推荐、点赞榜、关注及互动正常 |
| `/hot` | 可浏览、刷新、翻页 | 点赞及跨页面状态同步 |
| `/video` | 返回登录并保留 redirect | 可进入发布和完成上传 |
| `/video/{id}` | 详情和评论公开 | 点赞、关注、评论发布及本人删除 |
| `/account` | 登录与注册/改密码导航 | 资料、作品、喜欢、粉丝/关注抽屉 |
| `/account/register` | 注册成功返回登录 | 路由仍可直接访问，不继承错误鉴权 |
| `/account/change-password` | 可提交合法账号信息 | 当前账号修改后退出，其他账号不误退出当前会话 |
| `/settings` | 返回登录并保留 redirect | 改名和退出；凭据与缓存更新 |
| `/u/{id}` | 资料和作品，私有列表登录引导 | 本人/他人关注区别、社交列表和私信入口 |
| `/messages` | 返回登录 | 联系人真实去重、空态与部分失败 |
| `/messages/{peerId}` | 返回登录并保留目标 | 历史、发送、切会话隔离 |
| 未知 URL / 非法 ID | 明确 notFound / 参数错误 | 不触发无效业务请求 |

会话专项：

- 连续并发触发多个受保护请求，确认只有一个刷新请求，每个原请求最多重放一次。
- 验证刷新失败、重放仍 401、无 refresh token、存储异常和无效 JWT，不出现循环或卡在 loading。
- 登录 redirect 拒绝外部地址和循环地址；无目标时显示账号页。
- A 登录后加载作品/喜欢/消息，在请求尚未完成时退出并登录 B，确认缓存、弹窗、草稿和迟到响应不串账号。
- 改名与刷新交错时新凭据不被旧响应覆盖；退出在请求失败后仍清除两个存储键。

### 4. 浏览器、上传和资源释放回归

- 至少在 1440×900 和 390×844 视口人工检查；再检查 360px 宽度、长中文用户名/标题/消息，避免横向溢出。
- 使用本机可用浏览器完成完整流程并记录版本。跨浏览器未实际验证时写“未验证”，不自行宣称全部兼容。
- 首屏、空列表、404/401/429/500、离线、慢响应和失败重试均应有可操作界面；读取失败与动作失败不重复弹 Toast。
- 验证只播放当前视频、滚动占位稳定、键盘和输入法互不干扰、抽屉焦点返回、Esc/遮罩关闭、按钮可通过键盘操作。
- 连续进出视频流、详情、私信和发布页，检查无后台视频声音、重复监听、RAF/定时任务或持续增加的对象 URL。
- 上传至少覆盖小视频、多分片、末片不足、token 刷新、网络中断、取消、重选续传、封面失败及发布失败；按阶段 04 记录检查点恢复和结果未知提示。
- 使用两个真实账号完成点赞/关注/评论和发信。MQ 异步延迟按实际记录；不可通过假数据或本地强行插入伪造成功响应代替后端验证。
- 打开生产构建 preview，验证 hash-wasm 实际初始化和文件哈希；不能只依据 Node 环境 MD5 对比结果判定浏览器 WASM 已通过。

### 5. 自动检查和生产构建

从 `apps/web` 执行：

```powershell
pnpm test
pnpm build
pnpm lint
pnpm preview --host 127.0.0.1
```

- 必须使用现有 build 脚本完成 TypeScript 和 Vite 构建，不仅运行开发服务器。
- 路由树由插件生成，检查生成结果只包含目标路由；无手写补丁，产物不含阶段占位。
- 单元测试不得默认依赖真实后端或开发者个人 .env；纯逻辑通过注入 fetch/存储/API 验证。
- 记录测试数量、构建结果、Lint 错误/警告数。最终要求无错误，已知模板 Fast Refresh 警告清零。
- 若失败，修复本次迁移相关问题并重跑受影响检查；不要借机大范围升级依赖或修改后端。

### 6. 启动、部署及验收文档

将 `apps/web/README.md` 从模板说明改为项目使用说明，至少包含：

1. 实际使用的 Node / pnpm 版本、依赖安装命令和 dev/test/build/lint/preview 命令；安装使用现有锁文件，不改变依赖策略。
2. `.env.example` 与 VITE_API_BASE 必填规则、本地 `http://localhost:8095` 示例、生产 HTTPS 后端地址和重新构建要求。
3. 后端启动属于独立流程；浏览器直连需要后端 CORS，列出 origin、OPTIONS、POST、Authorization、Content-Type 和错误响应要求。
4. 静态托管 `dist`、前端深链接回退到 index.html；API 和媒体直接访问后端，不配置 `/api` 反代或媒体代理。
5. 分片 5 MiB、串行、视频 200 MiB/封面 10 MiB、Redis 依赖、刷新后重新选文件续传、后端会话约 24 小时等实际限制。
6. 私信最近 50 条、没有实时推送，以及 MQ 可能造成的读取延迟；不把未实现能力写进功能说明。

在 `docs/react-migration-verification.md` 生成最终验收记录，包含环境、日期、构建/测试结果、上述路由矩阵的实际结果、CORS/媒体/上传证据摘要、已知限制与未验证项。不记录 token、密码或私信正文。

更新本索引和各阶段的实际进度，只勾选确已完成的项目。存在必要验收未通过时，记录问题和可复现步骤，结论写“未完成”，不能用“其余正常”省略阻塞。

## 最终完成标准

- [ ] 主计划所有 URL 和旧界面已启用功能均有真实 React 实现，阶段占位和模板页清除。
- [ ] Query/Zustand/Form 职责正确，鉴权与缓存隔离、取消及错误恢复均通过。
- [ ] Tailwind/daisyUI、Lucide、Sonner、hash-wasm 和后端直连约束通过审计。
- [ ] 自动测试、完整生产构建、Lint 通过，浏览器与真实后端核心闭环通过。
- [ ] README、环境示例、最终验收记录和阶段实施记录完整且与实际一致。
- [ ] 未擅自修改后端、安装依赖、删除 `_deprecated`、覆盖用户修改、push 或上线；每个已完成编号步骤均已有符合 convention 且不含共同作者信息的本地 commit，未混入无关改动。

### 实施记录（完成时填写）

- 实施日期：2026-10-24；从阶段 01～04 已有实现继续阶段 05，不重复实现历史步骤。
- 步骤 1：全部目标路由已装配真实 feature 页面。删除无人引用的 StagePages、StagePlaceholder、`/about` 模板路由及模板 favicon/icons；入口使用中文语言标记及 Feed to Go 标题。路由树由 Vite 插件重建。确认唯一 runtime/QueryClient、RouterProvider、AppShell、Toaster 和会话 Store；未新增/升级依赖，锁文件不变，src 无 Vue/Pinia/spark-md5/_deprecated/error-report 依赖。版本 **0.1.7 → 0.1.8**。
  - 检查：`pnpm test` 78/78、`pnpm build`、`pnpm lint` 通过；Lint 0 错误、0 警告，清理标识搜索无命中。已有真实联调缺项仍待验。
- 步骤 2：样式/直连审计通过。src 仅 index.css，内容为 Tailwind 导入和 daisyUI night 配置；无业务 style、CSS 注入或额外样式文件；条件 class 均是完整静态类，上传进度使用原生 value/max。所有 API 经统一客户端，JSON/FormData 直接 POST 到配置地址，不使用跨域 Cookie；媒体相对路径按后端 origin 补全。Vite 无代理、默认 `/api` 或 API_PROXY_TARGET，依赖/锁文件未变。本步仅验证/文档，版本保持 **0.1.8**。
  - 真实服务：`http://localhost:8095/video/chunk/init` 的 OPTIONS（Origin `http://localhost:5173`）返回 204，允许 POST/Authorization/Content-Type；无 token 的 `/account/logout` 返回 401 JSON 且保留允许该 Origin 的响应头。
  - 浏览器：开发首页 `http://localhost:5173/` 真实读取后端后显示“暂无视频”，控制台无 error/warn。当前没有媒体数据，不能据此通过媒体直连/播放验收。
  - preview 默认 Origin `http://localhost:4173` 的预检返回 403、无允许头；后续生产 preview 使用已允许的 5173 端口，不修改后端或设置代理。生产地址须在构建时提供，改地址须重建，完整操作说明在步骤 6 写入 README。
  - 用户于 2026-10-24 确认暂时没有测试账号及有效 MP4/封面；真实鉴权、双账号互动及有效媒体闭环明确待验。
- 步骤 3：浏览器确认匿名 `/video`、`/settings`、`/messages`、`/messages/2` 跳转 `/account` 并保留 redirect；`/feed?q=中文` 跳首页并保留搜索输入，提交含空格中文搜索正确更新 q；公开注册/改密码独立渲染，登录空字段被本地拦截；`/video/0`、`/u/abc` 显示正整数错误；未知 URL 和已删除 `/about` 显示 notFound。`/hot` 返回真实空榜，修改每页数量后刷新可恢复；`/video/1` 公开请求返回 record not found，有重试入口。
  - 会话逻辑沿用现有并发刷新去重、最多一次重放、存储失败、换号取消、旧刷新/改名迟到、退出失败清理及私信隔离测试；新增“无 refresh token 不发刷新请求”和“刷新返回无效 JWT 不重放”两项真实客户端注入测试。`pnpm test` **80/80**、`pnpm lint`（0 错误/0 警告）、`pnpm exec tsc -b` 通过。测试变更触发版本 **0.1.8 → 0.1.9**。
  - 真实登录/原页面返回、账号切换、过期 token/改名交错、注册/改密码/私信发送未做浏览器成功验收：用户无测试账号。不创建或伪造真实账号；单元测试不等同于真实会话联调。完整矩阵在步骤 6 汇总。
- 步骤 4：在本机 Codex in-app browser 检查生产 preview，1440×900 热榜、390×844 注册/热榜/用户错误、360×844 热榜；document.scrollWidth 分别等于 1440/390/360，无页面横向溢出。移动端长中文用户名及缺密码提交验证本地拦截；未提交注册或修改真实凭据。`/u/1` 的真实资料失败保留重试和独立作品空态。浏览器具体内核版本未由当前接口提供，其他浏览器未验证。本步仅验证，版本保持 **0.1.9**。
  - 生产 WASM：临时本地测试页将现有 `src/lib/hash.ts` 去类型编译后加载实际 dist 的 `index.esm-Br2JuRJr.js`，真实浏览器运行 computeFileMd5 / computeBlobMd5。3 字节 abc、2 MiB+1 和 5 MiB+1 字节 a 的两种 MD5 均匹配 Node crypto，分块读取间 AbortController 取消通过，控制台无错误。该页不调用业务接口、不伪造发布成功，不进入 src/dist 或提交，验证后停止并清除。
  - 资源释放静态复核：播放器卸载 pause；滚动的 listener/ResizeObserver/RAF 有清理；快捷键移除 listener；弹窗关闭并恢复焦点；预览 URL revoke；上传取消/会话变化终止任务及重试等待。既有单元测试覆盖取消边界。没有有效视频/账号，不能将静态复核记为实际播放、资源增长、焦点或上传联调通过。
  - 截图保存在本次任务可视化目录：`stage05-desktop.jpg`（1440×900 热榜空态）、`stage05-mobile.jpg`（390×844 注册）。真实双账号互动、消息、媒体播放、上传重试/续传/401/封面失败及发布结果恢复均待验；离线/慢网、429/500 和交互页面长文本未做浏览器回归。
- 各编号步骤的审计/回归结果及 commit 清单：待填写；提交 hash 在创建后反馈，不为回填自身 hash 创建额外提交。
- 测试数量、build 和 lint 结果：待填写。
- 浏览器与真实后端验收结果：待填写。
- 未验证项、限制及阻塞：待填写。
- 最终验收记录路径：待生成 `docs/react-migration-verification.md`。
- 本阶段交付结论：未开始。
