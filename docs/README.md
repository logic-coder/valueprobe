# 文档索引

本仓库只有两层说明文档，规则如下。

## 放哪里

- **根目录**只放会被 GitHub、包管理器或法务直接识别的入口与声明：`README.md`、`LICENSE`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`、`ATTRIBUTION.md`。
- **`docs/`** 放产品与工程的说明文档（下表）。新增说明文档一律进 `docs/`，根目录不再增加新的说明文件。
- **内部工作稿与交接笔记**（临时方案、个人评审、HANDOVER 交接稿）不进仓库：留在本机，用 `.git/info/exclude` 或仓库外目录。`docs/` 里只保留能长期维护、对读者负责的内容。
- **引用路径**：根目录文档引用说明文档写 `docs/<文件名>.md`；`docs/` 内部互相引用写同目录文件名；代码注释引用写 `docs/<文件名>.md`。

## 索引

方法页提供[逐公司历史研究数据](../public/research)，包括估值回放、逐年现金和股东权益记录。研究结论、原始档案与 `eval/` 审计留在本地，不随仓库发布。

| 文档 | 内容 | 主要读者 |
| --- | --- | --- |
| [POLICY.md](POLICY.md) | 公开口径 v2：参数、拒绝/警告码、发布值文件与 manifest 结构、刷新与数据校验、覆盖清单替换 | 改发布值的人 |
| [CALCULATION.md](CALCULATION.md) | 模型、度量口径与计算边界（含公开口径对计算的影响） | 改公式/度量的实现者 |
| [DATA_SOURCES.md](DATA_SOURCES.md) | 数据源、传输模式、利率、快照与发布值生成 | 改数据层的实现者 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 分层、依赖方向、数据流与词汇表 | 第一次读代码的人 |
| [DESIGN.md](DESIGN.md) | 界面与交互的设计原则、实现约束、已知取舍 | 改 UI/视觉的人 |
| [DEVIATIONS.md](DEVIATIONS.md) | 每条用户可见的行为差异与理由（编号不复用） | 评审可见变更的人 |
| [RELEASE_V2.md](RELEASE_V2.md) | v2 相对冻结 v1 的发布决定、全量差异、审计证据与回滚 | 发布与复核 v2 的人 |

## 术语表

面向读者的词（内在价值、安全边际、折现率、终值、剩余收益、覆盖清单、快照、情景等）在产品方法页 `#/method` 的「术语表」里用日常语言解释。这里是维护者会遇到的内部用词：

| 词 | 含义 | 出现位置 |
| --- | --- | --- |
| 覆盖清单（universe） | 产品公开覆盖、随数据提交的股票列表，快照、搜索目录和发布值必须与 `scripts/watchlist.json` 一致 | POLICY、DATA_SOURCES |
| 发布值文件（artifact） | `public/data/intrinsic/v2.json`：自选 / 对比 / 方法页只读的发布数值；代码路径与字段名保留英文 artifact | POLICY、DATA_SOURCES |
| 校验 / 门禁（gate） | `npm run verify` 与 CI 的自动检查；发布值的专用检查是 `npm run verify:data` | 全部 |
| 公开口径（policy） | 决定发布值的固定参数与规则，带版本号；代码在 `src/lib/policy.js` | POLICY |
| 快照（snapshot） | 某天抓取并提交的季度基本面数据（`public/data/<MARKET>-<CODE>.json`） | DATA_SOURCES |
| 内核（kernel） | `src/lib/dcf.js` 的公式函数；`calGr2fv` 已冻结（frozen），不再改 | ARCHITECTURE、CONTRIBUTING |
| 红线 / 护栏 | 不可越过的项目约定：内核冻结、只改显示边界、可见差异必须写 DEVIATIONS | CONTRIBUTING |
| 契约（contract） | 模块之间、或测试与代码之间约定的行为与字段 | ARCHITECTURE |
| 兜底（fallback） | 首选来源/输入不可用时的次选值；发布值里缺失利率的 8% 是明确标注的兜底 | CALCULATION、DATA_SOURCES |
| 熔断 / 限流 / 令牌桶 | 数据层防止连续失败与超频的内部机制（circuit breaker / rate limiter / token bucket） | DATA_SOURCES |
| 夹具（fixture） | 测试里使用的固定数据文件 | CONTRIBUTING |
| 扣非 / 拆股重述 | 金融数据术语：扣除非经常性损益后的每股收益；把历史每股数字按后来的拆股口径重算 | DATA_SOURCES |

写作约定：面向读者的文案用第一列的日常说法（「覆盖清单」「发布值文件」）；英文技术词只保留在代码、路径和字段名里，正文首次出现时用括号注明一次。

## 维护约定

- 用户可见行为变化 → `DEVIATIONS.md` 加一条（带理由与位置）。
- 发布口径参数、代码、发布值文件结构 → `POLICY.md`；改 `POLICY_V1` 必须同时升版本与 hash，并重跑 `npm run intrinsic`。
- 升版发布 → 在同一冻结数据上做全量前后差异，写 `RELEASE_V<版本>.md`，归档上一版工件。
- 数据结构、来源与降级 → `DATA_SOURCES.md`。
- 分层、词表与依赖方向 → `ARCHITECTURE.md`。
- 计算边界与度量 → `CALCULATION.md`；设计规范与取舍 → `DESIGN.md`。
- 合入前跑 `npm run verify`；改 UI 再跑 `npm run test:e2e`。文档只改路径/措辞时也跑一次，确保 README 里的门禁链没被改坏。
