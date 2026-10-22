# 子计划 04：视频上传、断点续传与发布

前置：[01 基础层](react-migration-01-foundation.md)、[02 浏览互动](react-migration-02-browsing.md)、[03 账号私信](react-migration-03-account-social-messages.md) 已交付；共同约束见 [索引](react-migration-00-index.md)。下一阶段：[全量验收](react-migration-05-verification-handover.md)。

执行要求：下方 7 个编号实施步骤逐个完成、逐个本地 Git commit，先完成本步相关检查和记录再提交，不积攒到阶段末。每次生成和提交的完整 commit message 必须包含标题及非空正文，提交后反馈 hash 和完整 message（标题和正文）。提交信息遵循 [commit-conventions.md](commit-conventions.md)，不含 `Co-authored-by` 或共同作者声明，不执行 push；范围和核对流程遵循 [逐步骤提交要求](react-migration-00-index.md#逐步骤-git-提交要求)。

## 目标与前置条件

替换 `/video` 发布占位，交付选择文件、预览、MD5、串行分片、进度、重试、续传、上传封面和发布的完整流程。继续使用 hash-wasm，不安装 spark-md5，不改变后端上传协议。

- 参考旧 `VideoView.vue`、`api/video.ts` 和 Go `internal/services/chunk`、video handler。
- 后端 Redis 必须可用：chunk 接口无 Redis 返回 503，不得静默切换整文件上传以掩盖缺失条件。
- 后端上传目录可写，浏览器能够直接访问后端返回的媒体 URL；JSON、带 Authorization 的 FormData 和刷新 token 的 CORS 均已验证。
- 当前后端分片状态为整份 Redis 会话读写，因此固定单页面**串行上传**，不复用旧版 MAX_CONCURRENT=3。此策略不保证多个浏览器标签同时上传同一文件时也没有竞争；本次不修改后端处理该情况。

## 模块与接口

| 模块 | 职责 |
| --- | --- |
| `src/features/publish/publish-page.tsx` | 表单、文件选择、预览、阶段和结果展示 |
| `src/features/publish/use-publish-video.ts` | 组件生命周期、取消、任务锁及表单/流水线连接 |
| `src/features/publish/upload-video.ts` | 可独立测试的串行分片编排；注入 API、signal、进度回调和可替换的等待函数 |
| `src/lib/hash.ts` | 复用 01 的完整文件及 Blob MD5，不在上传页面重写算法 |
| `src/api/video.ts` | 复用已有类型化 chunk、封面和发布包装 |

编排公开接口固定为 `uploadVideoChunked(file, { api, signal, onStage, onProgress, fileHash? }) -> Promise<UploadResponse>`。React Hook 保存本次文件 hash 和各阶段已成功结果，编排模块不依赖 React、Zustand、import.meta.env 或通知库。

| 接口 | 发送内容 | 使用结果 |
| --- | --- | --- |
| `/video/chunk/init` | JSON：filename、file_size、chunk_size、total_chunks、file_hash | upload_id、uploaded_chunks |
| `/video/chunk/upload` | FormData：upload_id、chunk_index、chunk_hash、file | 确认该 chunk_index |
| `/video/chunk/status` | JSON：upload_id | uploaded_chunks、total_chunks |
| `/video/chunk/complete` | JSON：upload_id | url 或 play_url |
| `/video/uploadCover` | FormData：file | url 或 cover_url |
| `/video/publish` | JSON：title、description、play_url、cover_url | 真实 Video |

全部使用 required auth，FormData 不能手动设置 boundary；传递同一任务 AbortSignal。chunk_index 从 0 开始。

## 实施步骤

### 1. 表单、文件校验与预览

- TanStack Form 保存 title、description、video: File|null、cover: File|null；title trim 后必填，description trim 后可空。File 不放到全局 Store 或 localStorage。
- 视频必须非空、扩展名 .mp4（大小写不敏感）、不超过 `200 * 1024 * 1024` 字节；封面必须非空、扩展名 .jpg/.jpeg/.png/.webp、不超过 `10 * 1024 * 1024` 字节。
- 文件选择器用 accept 提示类型，扩展名和大小在提交前校验；MIME 不能成为唯一判断依据，避免浏览器返回空 MIME 时拒绝合法文件。
- 支持选择、替换和清除文件，展示名称、大小；提交中禁止更换文件或重复发布，保留取消上传按钮。
- 每个选中文件分别 createObjectURL；替换、清除、成功重置和卸载时 revoke 旧 URL。预览用原生 video / img，不安装播放器。
- 验证失败定位相关字段，禁止仅依赖 Toast；预览失败提示可更换文件。

### 2. MD5 与任务状态

内部状态为 idle → hashing → initializing → uploading → checking → merging → cover → publishing → succeeded；任一步可进入 failed 或 cancelled。状态文案展示“计算文件校验值”“上传视频”“上传封面”等，不把 API 路径暴露给用户。

- 完整文件 MD5 按 2 MiB 字节块增量计算；不能用“分片 MD5 字符串再拼接求 MD5”代替文件 MD5。
- 每个 5 MiB 上传分片独立计算 MD5，最后一片按实际长度。统一输出 32 位小写十六进制；全文件 hash 用于后端续传定位，分片 hash 用于后端完整性校验。
- 一次文件计算只创建一个完整文件 hasher；与分片快捷 md5() 计算不共享可变状态。hash-wasm 初始化失败必须进入 failed 并展示错误，不卡在忙碌态。
- 同一页面同一时刻只运行一个发布任务；任务捕获 sessionId 和递增 taskId，旧任务回调不得写当前任务 UI。
- 使用原生 progress 的 value/max，分别展示哈希阶段与已确认上传字节；不得使用 inline style 控制宽度。

### 3. 初始化与恢复

1. `CHUNK_SIZE = 5 * 1024 * 1024`，`totalChunks = Math.ceil(file.size / CHUNK_SIZE)`。
2. 计算或复用当前文件 hash，再调用 init；不自动重试 init，失败由用户重试同一流水线。
3. 将 uploaded_chunks 的 null/undefined 转为空数组，去重并只接受 `[0, totalChunks)` 范围内的整数。upload_id 缺失时按协议错误处理。
4. 已完成字节按每个 index 的实际切片长度求和，不能简单用“分片数 × 5 MiB”而忽略末片。
5. 未完成分片按 index 从小到大排列。全部已上传也需要查询 status 核对，然后才进入合并。
6. 浏览器刷新后，用户重新选择同一文件，再算相同 MD5，使用 init 恢复服务端已有会话。后端会话默认约 24 小时，不能承诺永久续传或浏览器自动恢复 File。

### 4. 串行上传、重试和进度

- 对待上传 index 逐个 await：slice → 计算 chunk_hash → 上传 → 确认成功 → 更新已确认集合和字节数，再处理下一片。
- 一个分片总共最多 3 次尝试；仅网络传输错误或 HTTP 5xx 可重试，第一次失败后等 500ms，第二次后等 1000ms。等待函数必须可取消，并可在测试中替换。
- 不重试 AbortError、表单校验错误、WASM 计算错误或其他 HTTP 4xx。401 由请求层最多刷新/重放一次，不叠加另一套 token 刷新。
- 分片成功只计数一次，即使第一次上传服务端成功但响应丢失后重试，进度也不得重复累加。
- 中断或失败立即停止后续分片，不进入合并、封面或发布。保留文件和草稿，并显示重试入口；后端已接收分片无需删除。
- 本阶段不使用 axios、上传库或并发池；不把 fetch 的“已发送请求体”冒充实际字节进度，进度按服务端已确认分片跳动。

### 5. 状态核对与合并

- 上传完后调用 status。total_chunks 必须等于本地计算，uploaded_chunks 归一化后应包含全部 index。
- 若服务端仍有缺失片，执行一轮串行补传，再查询一次 status；仍不完整则保留可续传失败状态，不无限补传，不强行 complete。
- 只有完整时调用 complete。complete 不做自动网络/5xx 重试，因为后端合并后会删除会话，重复调用不具备稳定的幂等保证。
- 从 url / play_url 取得有效播放地址；缺失则报协议错误，禁止用空地址发布。结果归属当前 File，替换视频后必须丢弃。
- 合并超时或连接丢失时标记结果可能未知，允许用户重新选择/恢复上传，但不宣称合并已撤销。

### 6. 封面、发布与失败后的恢复

- 视频合并成功后上传封面；封面成功得到有效 url / cover_url 后才提交 publish。视频 URL、封面 URL、title 和 description 均来自本次有效表单。
- Hook 在当前页面内保存成功的 videoUrl / coverUrl 检查点。封面失败后重试复用已合并视频；明确的 publish 拒绝后，修正内容再提交时复用已成功媒体。
- 替换/清除视频时使 video hash、uploadId、videoUrl 失效；替换/清除封面时仅使 coverUrl 失效。编辑标题或描述不重新上传未变的文件。
- 封面和 publish 都不自动重试；发布响应丢失时显示“发布结果暂时无法确认，请先查看我的作品”，提供 `/account` 入口，避免自动提交重复作品。
- publish 成功使用返回的真实 Video 展示结果和详情入口；重置表单、预览、检查点及文件输入值，防止上次文件再次误提交。
- 更新/失效当前账号 works、资料及相关 Feed 查询，复用前面阶段的 key；允许用户打开已发布详情，不依赖等待 Feed 自动出现。
- 业务失败保留可编辑草稿和成功检查点，不在 finally 统一清空全部状态；finally 只释放当前任务锁和忙碌状态。

### 7. 取消、离开页面和退出

- 本页提供取消当前任务按钮；取消、离开页面或 session 变化时触发 AbortController，停止哈希循环、重试等待和网络步骤。
- hash-wasm 的同步 update 无法中途打断；在每个读取块之间检查 signal，取消后不开始下一块。
- 主动取消提示“上传已停止，可重新选择同一文件继续”，不显示普通失败 Toast；不调用不存在的后端删除会话接口。
- 取消 fetch 不代表后端事务或发布已回滚，UI 不作相反承诺。离开页面后的回调不再更新组件或清除其他页面数据。
- 当前页面取消后保留草稿；真正离开页面不持久化 File、hash 状态或媒体检查点。下一次进入仍可借助服务端 init 恢复尚未合并的分片。

## 自动测试

复用 Node 内置测试，以 Blob/File、注入 API、等待函数和 signal 模拟流水线；不启动真实后端、不写 fixture 大文件到仓库、不安装测试库。

| 场景 | 预期 |
| --- | --- |
| 0 字节、超 200 MiB、封面超 10 MiB、错误扩展名 | 提交前拒绝；精确边界允许；空 MIME 合法文件可通过 |
| 1 字节、5 MiB、5 MiB+1、多个完整分片 | 分片索引/长度/总数正确，最终进度恰好等于文件大小 |
| 全文件和每片 MD5 | 与 Node crypto 相同，跨 2 MiB 读取边界无误 |
| uploaded_chunks 为 null、乱序、重复、越界 | 正确归一化和恢复进度，不漏有效片、不重复上传已确认片 |
| 连续两个成功分片 | 任意时刻在途上传不超过 1，顺序正确 |
| 网络/5xx、4xx、取消 | 仅可重试错误最多 3 次；取消停止等待及后续步骤 |
| 全部分片已有、status 缺片 | 完成前核对；一轮补传后再核对，仍缺片则停止 |
| complete、封面或 publish 失败 | 不发布无效 URL；检查点保留范围正确；非分片动作不自动重试 |
| 新任务开始或换号后旧回调返回 | 不更新新任务进度，不发旧成功通知 |

```powershell
pnpm test
pnpm build
pnpm lint
pnpm dev
```

## 真实浏览器验收

- [ ] 小视频和跨多个分片的视频均能选择、预览、发布并播放，封面直接访问后端。
- [ ] 中途取消后重试跳过已确认分片，末片不足 5 MiB 时进度仍正确。
- [ ] 刷新后重选同一文件能续传；新文件不会复用旧视频 URL。
- [ ] 网络中断、Redis 不可用、token 过期、封面失败、发布失败均有明确且可恢复状态。
- [ ] 封面失败重试不重传已合并视频；明确发布失败后重试不重传有效媒体。
- [ ] 请求全部直接到 VITE_API_BASE，没有 /api 前缀或代理；FormData 和 401 重放的 CORS 通过。
- [ ] 退出或离开时任务停止，没有残留预览 URL、重试计时器或旧 Toast。
- [ ] 发布结果可进入详情，本人作品刷新后出现真实视频；未用假数据验收成功。

## 交接给阶段 05

交付发布页面、纯上传编排、失败检查点和自动测试。记录实际测试文件大小、续传步骤和后端依赖，避免只凭 unit tests 宣称浏览器发布成功。

### 实施记录（完成时填写）

- 实施日期与变更摘要：待填写。
- 各编号步骤的完成内容、检查结果及 commit 清单：待填写；提交 hash 在创建后反馈，不为回填自身 hash 创建额外提交。
- 自动检查命令及结果：待填写。
- 真实上传、取消及续传结果：待填写。
- 结果未知或后端依赖问题：待填写。
- 本阶段交付结论：未开始。
