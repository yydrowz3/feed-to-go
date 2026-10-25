# 子计划 01：生成脚本与账号资料

前置：阅读 [执行索引](integration-test-00-index.md)。下一阶段：[视频与封面](integration-test-02-media-fixtures.md)。当前状态：通过（本阶段只生成账号候选与元数据；02 的后续执行结果见对应文档）。

## 目标和产物

建立可续跑的测试数据生成入口，保存 5 个待注册账号及 8 个视频的英文元数据。本阶段不访问注册、登录或发布接口。

产物：根目录脚本、生成物忽略规则、本批次 `accounts.json`、`accounts.md`、`manifest.json`。账号注册状态必须明确为“待注册”，不能把生成候选资料表述为账号已可使用。

## 实施步骤

### 1. 核对运行工具和现有批次

- 检查 `git status`、根目录及祖先适用的 AGENTS、Node 版本、`apps/web/node_modules/@faker-js/faker` 和既有脚本；保留已有用户修改。
- 脚本使用 Node ESM，通过以 `apps/web/package.json` 为基准的包解析加载 `fakerEN`，避免复制 node_modules 或增加根目录依赖安装。
- 实现 `generate` 和 `register` 命令分派、参数校验和帮助信息；本阶段完成 metadata 分支，媒体与注册分支在后续阶段补齐，未实现的分支明确报错。
- seed 默认 `20261024`；batch 默认北京时间时间戳，目录名仅允许字母、数字和连字符，解析后的输出必须位于本仓库的 `.local/test-data/` 内。

### 2. 创建批次及凭据保存机制

- 首次创建批次时写入 schema 版本、batch、seed、北京时间创建时间和每项初始状态；通过临时文件加替换保存 JSON，避免中断留下半份清单。
- 同 batch 重跑保留原用户名和密码，不重新生成；seed 冲突、未知 schema 版本或 JSON 损坏时停止并说明恢复办法。
- `accounts.json` 每项包含 alias（A～E）、username、password、purpose、registration_status、account_id、last_error；账号 ID 在真实注册并查证前为空。
- 为注册阶段预留明确状态：pending、registered、failed、unknown。unknown 表示请求结果未知，需先查证才能重试。
- Markdown 账号文档由 JSON 渲染，包含批次、目标前后端地址、用户名、密码、用途、状态和 ID；API 地址尚未确认时标待确认。
- 在根目录忽略 `.local/test-data/`，用 `git check-ignore` 验证账号文件路径受忽略。

### 3. 生成 5 个英文账号候选

- 使用 Faker 英文姓名构造用户名，将姓名归一化为 a～z，添加 `qa` 前缀和批次字母后缀；账号序号使用字母区分，最终满足 `^[a-z]+$`。
- 批次后缀由 batch 稳定派生，清单内校验唯一；服务端发现冲突时由注册阶段记录并针对未注册候选调整，不改动已注册账号。
- 每个密码独立生成 16 位、无空白的 ASCII 字母数字串，确保包含大小写字母和数字，且 5 个密码互不相同。使用 Node crypto 生成密码，密码不依赖可预测的 Faker seed。
- A、B 为作者和互动双方；C、D、E 用于后续独立登录和备用手工测试。密码及用途保存后检查 Markdown 转义和可复制性。

### 4. 生成媒体元数据

- 为 01～08 生成不同英文 dummy 标题和描述，标题非空且不超过 80 字符，描述非空且不超过 200 字符。
- 素材条目记录编号、标题、描述、目标尺寸/时长/大小、是否音轨、目标封面格式、文件相对路径及验证状态。
- 01～04 指定作者 A，05～08 指定作者 B；封面格式固定为 01～04 JPEG、05～06 PNG、07～08 WebP。
- 媒体目标值沿用主计划；未生成文件的实际大小、MD5、时长、分片数和发布 ID 留空，不填写推算值冒充实测。

### 5. 检查可重复运行和交接

- 在实际交付 batch 运行 metadata，检查恰好 5 个候选账号和 8 项视频元数据。
- 同 batch 再次运行，核对用户名、密码、标题和描述没有变化；生成命令未发出网络写请求。
- 检查非法 batch、seed 冲突、损坏清单的处理；使用独立临时测试目录验证，不破坏交付 batch。
- 确认生成物均被忽略，脚本和计划文档没有明文凭据；记录真实 batch、命令、Node/Faker 版本并交接 02。

## 验收条件

- [x] 账号数量、英文用户名规则、唯一性和密码规则正确。
- [x] Markdown 与 JSON 一致，所有账号均标为待注册。
- [x] 8 项英文媒体元数据完整，作者与封面格式映射明确。
- [x] 同批次重跑不改变凭据或既有数据；异常输入不会覆盖其他目录。
- [x] 本地敏感产物被 Git 忽略，执行记录可以支持下一阶段续跑。

## 实施记录

- 执行时间 / batch：2026-10-24（Asia/Shanghai）；`20261024-012143`，seed `20261024`。Node `v26.12.1`、Faker `10.6.0`；通过 `apps/web/package.json` 基准解析并动态加载已安装的 `fakerEN`，未安装或升级依赖。
- 完成步骤 / 实际产物：新增 `scripts/test-data.mjs`、`scripts/test-data.test.mjs` 和根 `.gitignore`。本批次在 `.local/test-data/20261024-012143/` 保存 `accounts.json`、`accounts.md`、`manifest.json`，5 个账号均为 `pending`、ID 为空；8 项元数据保留实际参数及发布映射空值，A/B 各分配 4 项。前后端地址均待确认。
- 检查命令与结果 / 证据：`node --check scripts/test-data.mjs` 通过；`node scripts/test-data.mjs generate --only metadata` 创建实际批次；`node scripts/test-data.mjs generate --batch 20261024-012143 --only metadata` 重跑，三个文件 SHA-256 均不变。`node --test scripts/test-data.test.mjs` 最终 12 项通过、0 项失败；子进程的 fetch 和 TCP 连接被测试守卫禁止，未发生网络请求。覆盖非法 batch/seed、seed 冲突、损坏/缺失清单、未知 schema、账号及媒体状态不一致、密码/用户名重复、并发锁、目录链接、Markdown 同步和未实现分支。测试使用独立临时批次并在结束后移除，未破坏交付批次。
- 忽略检查：`git check-ignore --verbose` 确认三个交付文件均匹配根规则 `/.local/test-data/`。证据保存于批次 `evidence/stage-01-tests.txt`、`evidence/stage-01-git-ignore.txt` 和 `evidence/stage-01-verification.json`，不含密码或 token。
- 缺陷与修复 / 版本变化：本阶段未改动产品前后端，前端保持 `0.1.9`；未执行注册、登录、上传、提交、推送或部署。增加负例测试时曾因测试用占位文本 `invalid` 与错误提示同词产生误报，已改为检查原始生成密码，最终复测全部通过；无产品阻塞缺陷。
- 受阻项 / 下一阶段交接（01 交付时记录）：本阶段无受阻项；当时用户指定仅执行 01，02～07 保持待执行。02 应复用实际 batch，补齐 media 分支后运行 `node scripts/test-data.mjs generate --batch 20261024-012143 --only media`。01 交付时 media、默认 all 和 register 均明确拒绝执行；后续 media/all 已由 02 实现，register 仍留给 04。
- 恢复说明：同 batch 续跑省略 seed 时沿用保存值，显式冲突时报错；清单损坏、缺失或 schema 未知时从完整备份恢复或另建 batch，不删除单个 JSON 后重建。中断留下 `.metadata.lock` 时先确认旧进程结束，再移除该空锁目录。账号 Markdown 可从校验通过的 JSON 重新渲染；不得将本地凭据复制到仓库文档。
