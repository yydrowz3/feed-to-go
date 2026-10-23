# 子计划 02：视频浏览与互动

前置：[基础层](react-migration-01-foundation.md) 已交付；共同约束见 [索引](react-migration-00-index.md)。下一阶段：[账号与私信](react-migration-03-account-social-messages.md)。

执行要求：下方 5 个编号实施步骤逐个完成、逐个本地 Git commit，先完成本步相关检查和记录再提交，不积攒到阶段末。每次生成和提交的完整 commit message 必须包含标题及非空正文，提交后反馈 hash 和完整 message（标题和正文）。提交信息遵循 [commit-conventions.md](commit-conventions.md)，不含 `Co-authored-by` 或共同作者声明，不执行 push；范围和核对流程遵循 [逐步骤提交要求](react-migration-00-index.md#逐步骤-git-提交要求)。

## 目标与边界

完成 `/`、`/feed`、`/hot`、`/video/$id`，形成浏览、播放、点赞、关注、评论和分享闭环。复用阶段 01 的真实登录能力，匿名也能看公开视频和评论。本阶段不实现账号作品页、用户主页、联系人、发布页，只保留已存在的目标路由占位。

## 前置条件与旧版参考

- 确认 01 的请求、会话、缓存和公共组件可用；缺失项先补齐，不创建第二套基础设施。
- 参考 `_deprecated/views/HomeView.vue`、`HotView.vue`、`VideoDetailView.vue`，以及旧视频播放器、Feed、互动 composables 和 CommentDrawer。
- 准备至少 12 条可播放视频以验证分页，两个账号以验证关注和评论权限；视频不足时分页使用传输层 fixture 做自动验证，并记录真实数据限制。
- 沿用主计划的桌面侧栏、移动端导航与深色布局，不复制 scoped CSS、手写 SVG 图标或 Vue 状态对象。

## 数据与 API 约定

### 视频流游标

在 `src/features/feed` 实现四个独立的 infinite query，复用 key 工厂，使用 `useInfiniteQuery` 管理 pages / pageParams，不另建 Zustand 列表。

| 视图 | API | 首次参数 | 下一页参数 |
| --- | --- | --- | --- |
| 首页推荐 | `/feed/listLatest` | limit=10，latest_time=0 | 原样传 next_time，单位毫秒 |
| 首页点赞榜 | `/feed/listLikesCount` | limit=10，不传两个 before 字段 | 同时传 next_likes_count_before、next_id_before；点赞数为 0 也要传 |
| 首页关注 | `/feed/listByFollowing` | limit=10，latest_time=0；required auth | 原样传 next_time，单位秒 |
| 独立热榜 | `/feed/listByPopularity` | limit=10，as_of=0，offset=0 | 传 as_of、next_offset；有备用游标时同步传全部 latest 字段 |

独立热榜备用游标的字段映射：

| 响应 | 下一次请求 |
| --- | --- |
| `next_latest_popularity` | `latest_popularity` |
| `next_latest_before` | `latest_before`，保留原日期字符串 |
| `next_latest_id_before` | `latest_id_before` |

- 三个备用字段作为一组保存；不得因 popularity=0 而漏传，也不得把 as_of=0 当成没有下一页。DB 回退模式依赖备用游标。
- getNextPageParam 首先检查 has_more；游标缺失或与上一页完全相同则停止自动加载，显示可手动刷新的分页异常状态，不能无限请求。
- 展示时按视频 ID 去重、保持服务端顺序；保留原始分页响应和游标，不根据过滤后的结果推算下一页。
- 切换热榜 limit 时重建该 limit 的首页状态，limit 限制为 1～50 的整数；刷新从首页游标重新开始。

## 实施步骤

### 1. 首页视频流

- 创建 FeedPage、FeedTabs、FeedSlide。标签分别为“推荐”“关注”“点赞榜”；默认推荐，每个标签独立缓存，切换时滚动和 activeIndex 归零。
- 关注流匿名时显示登录引导，不发私有请求；登录返回首页后可正常进入关注流。
- AppShell 搜索表单提交至首页 q。对已加载视频标题和作者名做 trim 后不区分大小写的本地过滤；不新增搜索接口。
- 无 q 时，当前项距离原始已加载列表末尾不足 3 项时预取下一页，使用 hasNextPage / isFetchingNextPage 防重复。
- 有 q 时保留本地过滤语义：不自动扫描所有页；提供“加载更多视频”入口请求下一原始页，避免搜索少量匹配项触发无限后台加载。
- 区分初次加载、无数据、无匹配、首屏失败、加载更多失败和已到底。加载更多失败保留已显示数据并提供重试按钮。
- 搜索、切标签或列表缩短后约束 activeIndex；选择评论视频使用明确 videoId，不通过当前列表索引反查旧数据。

### 2. 播放器与滚动占位

在 `src/features/video/use-video-player.ts` 实现可复用 Hook：管理 video 元素 ref、当前激活项、暂停/播放和静音。默认静音；如确需跨页共享静音偏好，用独立 Zustand 客户端偏好 Store，仅保存在内存，不能连带存视频列表。

1. 滚动容器使用固定可用高度和 Tailwind `snap-y snap-mandatory`、每项 `h-full shrink-0 snap-start`。所有 section 持续保留，禁止 display:none 隐藏远处 section。
2. 只有当前项及前后各 1 项挂载带 src 的 video；远处 section 保留尺寸和封面占位。长列表不额外引入虚拟化库。
3. 使用滚动容器 clientHeight / scrollTop 计算 activeIndex，requestAnimationFrame 节流；ResizeObserver 处理容器尺寸变化，保持当前项位置。
4. 激活项变化时先暂停其他视频，再尝试播放当前项。捕获 play() Promise；自动播放失败显示点击播放入口，不反复弹通知。
5. 支持单击播放/暂停、双击点赞、静音、loop 和 playsInline。按钮事件停止冒泡，不误触视频点击。
6. ↑/↓ 切换、空格暂停、M 静音、C 打开评论。输入框、textarea、select、contenteditable、正在输入法组合或打开弹窗时不处理全局快捷键；按钮上的空格保留按钮原生行为。
7. 切换路由、卸载和 StrictMode 重挂载时暂停所有元素，移除事件、ResizeObserver 和 RAF；已经失效的 play() 结果不得激活旧视频。

### 3. 独立热榜与详情

- 热榜使用卡片列表和序号，保留刷新、limit、加载更多、点赞、作者和详情导航。卡片显示秒级创建时间时乘 1000，不改变接口游标。
- 详情页校验正安全整数 id，公开加载 `/video/getDetail { id }`。切 id 立即关闭旧评论状态，暂停旧视频，使用新 key 请求。
- 登录用户单独查询 `/like/isLiked { video_id }`；未登录不调用。后端 Video 不含 is_liked，不从 likes_count 推测本人状态。
- 详情与 Feed 共用播放控制和动作 Hook，详情单视频不需要分页滚动逻辑。
- 分享 URL 使用前端 origin 的 `/video/{id}`；优先 clipboard，失败时打开可选择文本的 daisyUI dialog，不依赖新的分享库。

### 4. 点赞与关注

创建 `src/features/social` 的关注查询/动作、`src/features/video` 的点赞动作，并在不同页面复用。

- 点赞请求使用 `{ video_id }`；关注/取关使用 `{ following_id: authorId }`。本人视频不显示关注自己入口。
- 匿名动作提示登录并携带当前站内 URL 返回账号页；不在组件里直接修改 token。
- 同一 session + videoId 或 authorId 在全应用互斥。使用共享动作门闩防止同一事件循环重复提交，Mutation 状态用于按钮禁用；不要只依赖局部 boolean。
- 请求成功后才变更 UI；失败保留旧状态。更新当前 session 中缓存的 Feed 各页、详情计数和 liked 查询；likes_count 下限为 0。
- 关注成功后更新本人的 followings 缓存，失效本人/目标用户的社交信息、关注流和联系人缓存；第三阶段使用相同 key 工厂，不再维护自己的关注状态。
- 点赞会影响后续的喜欢列表与排序，现有视频只修改数值，不在滚动过程中即时重排；重新刷新时再接受服务端顺序。
- 开启 MQ 的后端可能先确认写入请求再完成读取更新。点赞成功先 patch 已存在的缓存并将相关查询标记 stale（`refetchType: 'none'`），避免紧接着的全量重拉覆盖界面；之后的显式刷新以服务端结果为准。不要承诺消息队列异常时的强一致，也不新增无限轮询。
- 动作结束检查 sessionId；账号已切换时不再写缓存或显示属于旧账号的成功通知。

### 5. 共享评论抽屉

在 `src/features/comments` 提供 `CommentDrawer({ videoId, title, open, onClose })`，由首页与详情共用。

- open 且 videoId 有效时启用评论 query，打开或切换目标即加载，修复旧版打开未调用 loadComments 的问题。关闭后不继续订阅旧视频。
- 列表接口 `/comment/listAll { video_id }`；展示作者、正文和时间。加载、错误、空态、刷新入口独立于表单提交状态。
- 提交用 TanStack Form，trim 后内容不能为空；调用 `/comment/publish { video_id, content }`。成功后清空表单、提示“评论已提交”并刷新对应列表；失败保留草稿。
- 只有本人评论显示删除按钮，确认后调用 `/comment/delete { comment_id }`；成功移除缓存项并刷新，失败保留评论。
- 评论返回只有 message，没有新 Comment；不伪造持久化 ID 或冒充服务端已返回新评论。MQ 延迟时提示列表可能稍后更新，保留刷新入口。
- 桌面右侧抽屉，移动端底部面板。使用原生 dialog 保证焦点约束，打开后聚焦评论输入或标题，关闭返回触发按钮；Esc 和遮罩可关闭，视频快捷键暂停处理。
- 切视频时清空旧草稿和错误，发送过程捕获原 videoId；迟到结果不能清空另一视频的新草稿或刷新错列表。

## 测试与验收

增加 Node 内置测试，覆盖游标构造、分页终止、列表去重、缓存 patch、动作门闩。播放器和抽屉交互用真实浏览器人工验收，不为此安装 DOM 模拟或浏览器测试框架。

| 测试场景 | 预期 |
| --- | --- |
| latest 与 following next_time | 各自原样回传，不发生秒/毫秒混用 |
| likes_count_before=0 | 两个游标一起传递，0 不丢失 |
| popularity 的 Redis 和 DB 回退响应 | 两套游标完整保留，DB as_of=0 时仍正常翻页 |
| 重复视频、重复游标、空页、has_more=false | 不重复展示，不无限请求，不丢已有页 |
| 两处同时点赞/关注 | 同一对象只产生一次在途动作，成功 patch 一致，失败不改状态 |
| 取消或换号后的响应 | 不写入新会话，不弹旧动作通知 |
| 搜索无匹配但原列表有下一页 | 显示无匹配与手动继续加载入口，不后台扫完整个 Feed |

```powershell
pnpm test
pnpm build
pnpm lint
pnpm dev
```

- [ ] 匿名可浏览推荐、点赞榜、热榜、详情和评论；关注流和写操作引导登录。
- [ ] 滚过至少 10 条视频后，滚动高度、当前位置和加载更多仍正确；同时最多只有当前视频播放。
- [ ] 切标签、搜索、横竖屏变化、离开再进入均无旧视频后台发声。
- [ ] 快捷键、输入法、评论输入和按钮键盘操作互不干扰。
- [ ] 首页和详情的点赞/关注能共享状态，评论首次打开自动加载，删除权限正确。
- [ ] 热榜第二页在真实 Redis 模式通过；DB 回退模式至少有 fixture 测试证据。
- [ ] 所有接口和媒体直连后端；失败和空态不遮盖已有有效内容。

## 交接给阶段 03

交付 Feed queries、视频卡片/作品卡片可复用展示、播放器、点赞动作、关注查询/动作、评论抽屉和相关 cache helpers。用户主页与账号页使用它们，不复制业务状态或请求。

### 实施记录（完成时填写）

- 实施日期与变更摘要：2026-10-23，按步骤实施阶段 02。
- 步骤 1：首页三类独立 infinite query、本地搜索、原始页去重与完整游标、分页异常和重试入口；匿名关注不请求。刷新重置首页游标，搜索仅手动加载更多。新增 4 项分页/过滤测试，`pnpm test` 38/38 通过；`pnpm build` 通过，`pnpm lint` 无错误（仅既有 about 示例页警告）。提交 hash 在反馈及后续记录中列出。
- 步骤 1 提交：`d855301`。
- 步骤 2：共享播放器 Hook、默认静音、播放失败点击入口、固定滚动占位及相邻资源挂载、RAF 滚动与 ResizeObserver、快捷键隔离和卸载暂停清理。双击点赞及 C 键评论回调随步骤 4/5 接通。`pnpm test` 39/39、`pnpm exec tsc -b` 通过；`pnpm lint` 仅既有示例页警告。真实浏览器播放验证留待阶段末。
- 步骤 2 提交：`ff2770c`。
- 步骤 3：热榜卡片/序号、1～50 整数 limit 表单、首页刷新和加载更多；公开详情按安全整数 ID 查询，登录后单独读取 isLiked，按资源/会话 key 隔离播放器；分享剪贴板失败使用原生 dialog。复用视频展示及 NativeDialog，移除阶段 02 占位导出。`pnpm test` 39/39、TypeScript、生产构建通过，Lint 仅既有警告。点赞/关注按钮随步骤 4 接入。
- 步骤 3 提交：`b79fb41`。
- 步骤 4：全应用 session + 对象动作门闩、Mutation 禁用、成功后 patch 当前会话各 Feed/详情/liked/作品缓存；点赞下限 0、不即时重排，标记 stale 且不立即 refetch。关注复用本人 followings query、更新关注列表并失效社交/关注流/联系人。匿名返回当前 URL 登录，换号取消请求且不写旧缓存/通知。扩展阶段 03 共用 key 工厂；4 项并发/失败/换号/缓存测试通过，`pnpm test` 43/43、TypeScript 和 Lint（仅既有警告）通过。浏览器已确认真实后端请求失败，互动联调待外部服务。
- 步骤 4 提交：`c1518be`。
- 步骤 5：共享 CommentDrawer，打开/切视频即加载，关闭卸载旧 query；TanStack Form + Zod trim 校验、成功清草稿/失败保留、本人删除确认与缓存移除、MQ 延迟提示。请求捕获视频 ID，关闭/换视频/换号取消旧提交，旧响应不影响新草稿。原生 dialog 提供桌面右侧/移动底部布局、焦点约束、Esc/遮罩关闭及触发按钮焦点恢复。新增 4 项评论测试和四类 Feed 第二页的传输 fixture 测试。格式化本阶段新增文件，并在浏览器检查中修正 StrictMode ref 重挂载播放、night 主题生成和详情页发布导航误高亮；提交 hash 见执行反馈。
- 自动检查（从 `apps/web` 执行）：`pnpm test` **48/48 通过**；`pnpm build` 通过；`pnpm lint` 无错误、仅 `src/routes/about.tsx` 的既有 Fast Refresh 警告；`git diff --check` 通过。未新增或升级依赖，未修改后端、真实 `.env`、锁文件或 `_deprecated`。
- 浏览器验证环境：使用内置浏览器，桌面 1085×916、移动 390×844。真实配置下请求显示 `Failed to fetch`，因此另用独立 Node HTTP fixture（127.0.0.1:8096）与单独 Vite 进程（127.0.0.1:5174，进程级 `VITE_API_BASE` 覆盖）验证前端；14 条 fixture 视频，FFmpeg 生成本地 MP4/JPEG，媒体支持 Range。fixture 服务和素材位于本次聊天的 visualizations 目录，未进入业务代码或生产构建。
- fixture 浏览器结果：滚过第 13 条时保留 14 个 section、挂载 3 个 video、仅 1 个播放；移动容器高度 636、scrollHeight 8904，activeIndex=12；切换桌面尺寸后仍保持 index=12。默认静音自动播放、点击恢复、方向键、M、空格及 C 评论入口通过；评论输入 `mm` 不触发静音，Esc 关闭和按钮触发后的焦点恢复通过。匿名关注显示登录引导，搜索无匹配仍保留下一原始页手动加载入口。热榜 limit=3 后为 3 条首页，离开详情后 DOM 无 video。点赞/关注成功后首页与详情共享状态，分享复制前端 `/video/1` 链接，评论首次加载、空白拦截、提交清草稿、仅本人删除和确认后刷新通过。桌面右抽屉和移动底部面板无横向溢出。
- 验证限制：剪贴板拒绝后的备用 dialog、输入法组合、真实触屏双击、真实两个账号及 MQ 延迟未完成人工实测；快捷键排除逻辑、并发动作、取消/换号、失败保留状态及 DB 回退游标有 Node 测试。真实 Redis 热榜第二页、Go CORS/业务错误响应与实际媒体仍需后端环境和账号数据后补验。fixture 的 CORS/互动通过不能替代真实 Go 后端联调，以上阶段验收复选框保持未勾选。
- 本阶段交付结论：**5 个代码步骤及自动检查完成，fixture 浏览器交互已验证；真实直连联调待完成**。阶段 03 可复用 Feed queries、VideoCard、播放器、LikeButton/useLikeAction、FollowButton/useFollowings、CommentDrawer 和 session/viewer key 工厂，不能复制维护第二套列表或会话状态。本次仅阶段 02，不进入 03、不 push、不部署。

#### 2026-10-24 阶段 05 交接复核

阶段 05 复验：首页/热榜真实空态、搜索参数、公开详情 record not found 及错误恢复通过，1440×900/390×844/360px 局部页面检查通过。当前无账号和视频数据，有数据播放/互动/翻页及 MQ 联调仍待验；此前 fixture 不是实际 Go 闭环。 当前版本 0.1.9；完整实际结果及补验步骤见 [最终验收记录](react-migration-verification.md)。阶段总验收保持未勾选。
