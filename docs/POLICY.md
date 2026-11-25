# 公开口径 v3（public policy v3）

这份文档说明 `src/lib/policy.js` 里冻结的口径。**代码是唯一事实源**：参数、拒绝码和警告码都从该模块读取；本文的数字若与 `public/data/intrinsic/v3.json` 或 `src/lib/policy.js` 不一致，以代码与发布值文件为准。`public/data/intrinsic/v2.json` 是已冻结的上一版发布值，保留复现。线上 GitHub Pages 仍在交付冻结的 v2；本文件描述的是本仓库尚未推送的官方 v3。

修改 `POLICY_V1` 会改变每一个发布数字。必须同时升 `POLICY_VERSION`、重算并更新 `POLICY_V1_HASH`，否则 `npm run verify:data` 会以 `policy hash pinned` 失败。拒绝码与警告码只增不改：新增用新代码，不复用、不重编号。

## 1. 口径参数

| 参数 | 现行值（官方 v3） | 代码常量 |
| --- | --- | --- |
| 估值基数 | `repeatable-earnings`：最多五年完整财年每股收益按近因加权正常化（干净年份权重 1.0，非经营或未知 0.25）。非金融企业若确认持续盈利台阶，改用最近三年加权值（`PERSISTENT_STEP_BASE`）。近十二个月盈利只展示，不作为正式基数。维护性资本开支按折旧摊销计（M≈D）。两边都能形成正估值且对称差距 50%–200% 时，公开值取两套估值的中点；金融机构仍只用盈利侧剩余收益，不用现金流中点 | `POLICY_V1.basis` / `revision.earningsBase` / `revision.cashCrossCheck` |
| 一般公司模型 | `owner`：两期折现（`presentValue`） | `POLICY_V1.model.nonFinancial` |
| 金融机构模型 | `residual`：剩余收益（`residualIncomeValue`） | `POLICY_V1.model.financialInstitution` |
| 第一阶段年数 | `DCF_DEFAULTS.years` = 10 | `POLICY_V1.horizon.years` |
| 第二阶段年数 | `DCF_DEFAULTS.yearsOfTerminalGrowth` = 10 | `horizon.yearsOfTerminalGrowth` |
| 终值增速 | `DCF_DEFAULTS.terminalGrowthRate` = 4% | `horizon.terminalGrowthRate` |
| 历史增速窗口 | 两扇已披露干净窗口先经 0% 下限与 15% 上限，取较慢的一扇做中位官方增速；较快的只进区间上沿。只有一扇窗时就用那一扇 | `growth.windowYears` / `revision.officialGrowth` |
| 承保增速上限 | `MAX_UNDERWRITTEN_GROWTH` = 15%（十年窗与五年单独窗口相同） | `growth.cap` |
| 五年作为官方窗口 | 不再设 10% 硬上限；仍标 `SHORT_HISTORY`。五年窗为正时，区间高端可向 15% 加宽；负历史、起点已归零时不把高端发明为 15% | `growth.shortHistory` = `wider-band` |
| 窗口冲突 | 符号相反，或任一窗为负，标 `REGIME_UNCERTAIN`，区间可含终值 0。同向差距只把另一窗纳入包络，不标体制不确定。`regimeGapPp`（8 个百分点）仅保留为加宽参考，不再作为体制阈值 | `growth.regimeGapPp` |
| 拆股清洗后最短年数 | `MIN_CLEAN_YEARS` = 4 | `growth.cleanYears` |
| 负增长 | `zero-start-default-terminal`：长窗口为负时起点 0%，淡出到默认终值 4%，标 `REGIME_UNCERTAIN`；不再把终值机械置 0，也不再发出 `NEGATIVE_HISTORY_ZEROED` | `growth.negative` |
| 无窗口、基数为正 | `zero-start`：起点 0%，终值仍 4%，标注 `NO_WINDOW_ZERO_START` | `growth.missingWindow` |
| 折现率规则 | 全市场同一条：`max(10%, ceil(该企业报告币种十年期) + 6)`，再夹到 0–50。不按个股定制 WACC、beta 或折现参数 | `discount.rule` / `revision.requiredReturn` |
| 股权风险溢价 | `EQUITY_PREMIUM` = 6 个百分点 | `discount.spread` |
| 取整 | `ceil` | `discount.rounding` |
| 利率币种 | `reporting`：跟随企业报告币种。显式 ISO `reporting_currency` 优先；A 股市场默认人民币、美国上市默认美元，否则回退报价币种。港币代理美元十年期；人民币不用美债。同一企业因输入（报告币种、报表）相同而得到同一折现，不是为某对上市组合写了特例 | `discount.currency` |
| 港币代理 | `USD`：港币用美元十年期作代理 | `discount.hkdProxy` |
| 缺失利率 | `fallback`：照常出值，回退值 + `RATE_FALLBACK` | `discount.missing` |
| 兜底折现率 | `FALLBACK_DISCOUNT_RATE` = 10%；要求回报下限 10% | `discount.fallback` / `discount.floor` |
| 折现率夹取 | 0–50% | `discount.min` / `discount.max` |
| 价格过期提示 | 超过 7 天标 `STALE_PRICE`（不改数字） | `price.marginWarningDays` |
| 基本面过期 | 盈利所属期间距发布日超过 120 天标 `STALE_DATA`（照常出值） | `staleness.fundamentalsDays` |
| 利率过期 | 超过 10 天在校验提示 | `staleness.ratesDays` |
| 区间 | 折现率 ±2 个百分点，再叠加已披露窗口的增速情景包络；官方增速已是较慢窗时，较快窗只进上沿。若公开值是两套估值的中点，区间取两套折现/增速包络的并集，须覆盖两边且默认值落在区间内。头条 `mid` 是居中点估计，不是不对称包络的算术中点 | `band.discountSpread` / `band.growthEnvelope` |
| 终值占比 | 披露 | `terminalShareDisclosed` |

实现细节都以代码为准：

- 折现率：`yieldForStock()` 按 `reportingCurrency()` 取该企业报告币种的十年期（`src/lib/riskFree.js`）→ `policyDiscountRate()`（ceil+6，再套 10% 下限）→ 夹到 0–50。取不到该币种利率时 `policyValue()` 用 10% 兜底并加 `RATE_FALLBACK`。港币报告币种代理美元十年期；人民币报告币种只用人民币利率，不用美债。公式全市场同一条，不为单只股票或某一对 A/H 上市写例外参数。
- 增速：官方值在 `toStock()` 时用同一套 `windowGrowth()`（低谷年向前移，十年窗至少 7 年、五年窗至少 4 年）从年度序列重算，必要时先经过 `cleanGrowth` 后缀；重算失败时为空，不再回退到快照缓存。然后 `officialGrowth()`（`policyValue()`、`buildDefaults()` 与页面播种共用）：两扇窗口都存在时，先各自经过 0% 下限与 15% 上限，取较慢的一扇作为居中官方增速，较快的只进入区间上沿。只有一扇窗口（包括仅有五年历史）时就用那一扇。五年单独窗口不再另设 10% 硬上限，只标 `SHORT_HISTORY`。十年与五年窗口符号相反，或任一窗为负时，点估计用较慢的已裁剪窗口（负窗口为 0%），标 `REGIME_UNCERTAIN`，区间须覆盖较快窗口并可含终值 0。无窗但有报告盈利且基数为正时起点取 0%、终值仍 4%，标 `SHORT_HISTORY` 与 `NO_WINDOW_ZERO_START`。长窗口为负时起点 0%、淡出到默认终值 4%，标 `REGIME_UNCERTAIN`；旧码 `NEGATIVE_HISTORY_ZEROED` 与 `NEGATIVE_HISTORY_GROWTH` 保留定义以读取历史工件，新发布不再发出。一年增速只供对照。不设 5% 楼板。采用值触到 15% 上限时标 `CAPPED_GROWTH`。没有报告盈利、也无法形成窗口时仍为 `NO_GROWTH`（维萨因缺未加维度的摊薄每股收益走这条，不编造，也不再用现金冒充官方基数）。
- 模型：`policyModel()` 只读归一化记录上的 `financial_institution` 标记；判定启发式在同一入口 `stockRecord.js` 的 `toStock()` 里执行一次（快照 provider、浏览器与发布值文件构建共用），所以页面与 artifact 不会对同一代码给出不同模型。区间由 `valueBand()` / `residualIncomeBand()` 在同一模型上组合折现率 ±2 个百分点与已披露窗口的增速情景包络（官方增速已是较慢窗时，较快窗只进上沿；五年窗为正且作为唯一官方窗时高端可到 15%；负历史或无窗口不凭空发明 15%；体制不确定时低端再纳入终值 0 的情景；中点规则下对两套基数分别取包络再取并集）。头条 `mid` 是官方点估计，必须等于默认值并落在区间内，不是不对称包络的算术中点。真实无效的一端返回缺项，允许单侧区间。
- 价格只进入安全边际。价格缺失给 `PRICE_MISSING`，过期给 `STALE_PRICE`，交易日无法确认给 `QUOTE_DATE_UNKNOWN`。使用历史快照报价时，安全边际随报价状态标注。刷新时美股财报链失败但报价成功，会沿用上次每股数据只更新报价并标 `SPLIT_UNVERIFIED`：其间若发生拆股，价格与每股数据可能不同口径。
- 快照：`toStock()`（`src/lib/stockRecord.js`）统一做拆股清洗与金融机构标记，浏览器和发布值文件构建走同一条路径。

## 2. 拒绝码（REASON）

一条记录要么是“数字 + 若干 warning”，要么是 `null` + 至少一个 reason。

| 代码 | 含义 |
| --- | --- |
| `NO_SNAPSHOT` | 没有可用的本地快照。 |
| `NO_EPS` | 快照里没有每股收益。 |
| `NON_POSITIVE_EPS` | 每股收益不为正，折现模型不出值。 |
| `BASE_QUALITY_INSUFFICIENT` | 有年度每股收益，但窗口内没有可形成正正式基数的干净完整财年。 |
| `NO_GROWTH` | 没有可用的历史增速，且不符合「无窗但有报告盈利、基数为正则按 0% 起点」的条件。 |
| `NO_BOOK` | 金融机构需要正的每股有形账面价值。 |
| `NOT_FINITE` | 计算结果不是有限正数，不出值。 |
| `INDUSTRY_MODEL_PENDING` | REIT 或炼化的行业口径仍待验证，仅供试算，不出公开值。 |
| `CASH_UNRECONCILED` | 选定官方基数后，盈利估值与现金估值的对称差距大于 200%（更大边超过较小边约 3 倍），拒绝发布。50%–200% 改为取中点并发布。金融机构不走此现金核对。 |
| `UNSTABLE_BASE_REGIME` | 增速体制不确定（`REGIME_UNCERTAIN`：历史为负或窗口符号相反），且最近一期每股收益不为正，拒绝发布。同向差距不触发此码（如 Fiserv）。最近一期为正（如佳品零件）仍可出值。 |

## 3. 警告码（WARNING）

警告只披露，不改变计算；带 warning 的记录照常发布数字。

| 代码 | 含义 |
| --- | --- |
| `CAPPED_GROWTH` | 官方采用的起始增速触到承保上限 15%。 |
| `NEGATIVE_HISTORY_GROWTH` | v2 旧义：历史增速为负，仍按负值外推并标注。新发布不再使用此码。 |
| `NEGATIVE_HISTORY_ZEROED` | 历史工件用语：负历史曾把起点和终值都传入 0%。新发布不再发出此码，改为 `REGIME_UNCERTAIN` 且终值仍为默认 4%。定义保留以便读取 v2 / 旧 v3 工件。 |
| `SHORT_HISTORY` | 官方增速只用了五年窗，或在没有窗口时按 0% 起点处理。五年单独窗口不再另加 10% 硬上限。 |
| `REGIME_UNCERTAIN` | 长窗口为负，或十年与五年窗口符号相反。点估计仍按规则给出，区间加宽并可含终值 0。同向差距只加宽区间，不发此码。 |
| `OWNER_BASE_GAP` | 所有者收益模型下快照缺少可用的折旧摊销，因而无法单独核验 M≈D；基数仍用正常化收益，只披露不拒绝。 |
| `NO_WINDOW_ZERO_START` | 没有十年或五年窗口，但可重复盈利为正：起点 0%，再淡出到默认终值 4%。不是「永远零增长」。 |
| `GROWTH_ABOVE_RETENTION` | 增速高于留存收益能支撑的水平。 |
| `RATE_FALLBACK` | 取不到当地十年期利率，折现率回退为 10%。 |
| `DISCOUNT_CLAMPED` | 折现率被夹到 0–50% 的公开区间。 |
| `PRICE_MISSING` | 快照里没有价格，安全边际留空。 |
| `STALE_PRICE` | 价格已经过期，只标注，不改变内在价值。 |
| `SPLIT_UNVERIFIED` | 沿用上次每股数据、只更新了报价；其间若发生拆股，两个数字可能不在同一口径。 |
| `STALE_DATA` | 估值采用较早的盈利期间。 |
| `EARNINGS_DATE_UNKNOWN` | 当前快照无法确认盈利期间。 |
| `QUOTE_DATE_UNKNOWN` | 快照报价的交易日无法确认。 |
| `MODEL_CAVEAT` | REIT 或炼化企业，模型口径仍属试算。 |
| `TERMINAL_CAPPED` | 终值输入高于折现率减 2 个百分点，按有效增速封顶。 |
| `CASH_DIVERGENCE` | 现金核对与盈利估值相差 25–49%，只披露仍发布。 |
| `CASH_MIDPOINT` | 两边都能形成正估值且对称差距 50%–200%，公开值取中点；区间覆盖这两套估值。 |
| `LATEST_FY_BASE` | 历史工件用语：盈利与现金流同步抬升时两边曾改用最近完整财年。新政策不再发出此码，改为 `PERSISTENT_STEP_BASE`。定义保留以便读取旧工件。 |
| `PERSISTENT_STEP_BASE` | 最近两年确认新盈利平台，基数改用最近三年加权正常化盈利。 |
| `TTM_NONOPERATING` | 近十二个月盈利含重大非经营收益，未用于正式基数。 |
| `TTM_QUALITY_UNKNOWN` | 近十二个月盈利的非经营质量无法确认，未用于正式基数。 |
| `CASH_PERIOD_LAG` | 近十二个月盈利比年度现金截止日晚 180 天以上；仅提示，同期间年度现金仍可参与核对。 |
| `BASE_HISTORY_SHORT` | 完整财年不足三年，按短历史正常化。 |
| `BASE_QUALITY_REDUCED` | 部分完整财年含非经营收益或质量未知，已降低权重且不得用于确认台阶。 |
| `CLASSIFICATION_UNVERIFIED` | 仅因缺列归入某一模型，且另一模型结果差异较大。 |
| `NORMALIZED_EPS` | 发布基数是可重复盈利，与最近一期报告每股收益相差 25% 或以上。 |
| `LIFE_BOOK_QUALITY` | 寿险公司的有形账面可能受债券未实现损益和递延获客成本扭曲，剩余收益结果应谨慎阅读。 |

UI 翻译键约定为 `reason_<CODE>` / `warning_<CODE>`，文案在 `src/i18n/legal-messages.js`，由 `src/main.js` 合并进 i18n。数据校验拒绝未知代码。

## 4. 发布值文件与 manifest

两个文件都只能由 `npm run intrinsic`（即 `scripts/policy-values.mjs`）生成，不要手改。构建函数在 `scripts/lib/policy-artifact.mjs`，写入与校验共用这一个函数，所以同一份输入得到同一份字节。

路径约定：`ARTIFACT_PATH` 由 `POLICY_VERSION` 派生为 `public/data/intrinsic/<version>.json`；`scripts/pages-smoke.mjs`、方法页下载链接与本文仍需同一次更新。`public/data/intrinsic/v1.json` 是已冻结的上一版发布值，保留复现，不再被应用读取。版本变化和前后差异见 `RELEASE_V3.md`；v2 归档见 `RELEASE_V2.md`。

`public/data/intrinsic/v3.json`（`ARTIFACT_PATH`）：

| 字段 | 含义 |
| --- | --- |
| `schema` | 固定为 1。 |
| `policyVersion` / `policyHash` | `POLICY_VERSION` / `POLICY_V1_HASH`。 |
| `generatedAt` | 生成日期（`YYYY-MM-DD`）。 |
| `rates` | `{ asOf, CNY, USD, HKD }`；每行 `{ value, asOf, source, proxy? }`，HKD 为 `usd_proxy`。 |
| `universe` | `{ declared, snapshots, missing[] }`。 |
| `coverage` | `{ valued, refused, reasons{}, warnings{}, models{}, currencies{} }`，按稳定顺序排列。 |
| `crossListing` | 9 组 A/H 对照：`{ id, a, h, status: aligned|input-mismatch|not-valued, valueA, valueH, fxToA, valueHInA, epsFxDiffPct, growthDiffPp, valueDiffPct, bridge{eps{a,hInA,diffPct}, growth{a,h,diffPp}, book{a,hInA,diffPct}, discountRate{a,h,diffPp}}, reasons[] }`。H 的 EPS、账面值和估值先按 `fxToA` 折成 A 股币种；`valueDiffPct = (valueHInA / valueA − 1) × 100`，负值表示 H 更低。`aligned` 只表示 EPS 差不超过 5%、增长差不超过 2 个百分点且财报期间相同，不代表折现率或估值相同。只报告差异，不平均、不回写。 |
| `entries` | 以 `EXCHANGE:CODE` 为键，值来自 `policyValue()`：`{ symbol, name, status, value, band, terminalShare, cash, price, priceDate, marginOfSafety, reasons[], warnings[], inputs{}, asOf, earningsDate, earningsPeriod, earningsSource, ratesAsOf }`。`cash` 为 `{ value, base, gapPct } | null`，是最近三年每股自由现金流中位数的同参核对，`gapPct` 为正表示现金值更高；不替代 `value`。`inputs` 含 `model, basis, eps, epsLatest, epsNormalized, cashMedian, baseKind, growth, growthWindow, growthCap, growth10, growth5, discountRate, terminalGrowthRate, years, yearsOfTerminalGrowth, tangibleBook, addToFairValue, currency, rate{value,asOf,source,proxy}`。`growthWindow` 为 `10y` / `5y` / `none`；`growthCap` 为当时适用的 15 或 10；`growth10` / `growth5` 是重算后的原始窗口，供对照。`eps` 是官方基数，`epsLatest` 是最近报告每股收益，`epsNormalized` 是五年正常化，`cashMedian` 是三年现金中位数，`baseKind` 是 `midpoint` / `normalized` / `persistent-step` / `short-history` / `median-fallback` / `cash` / `latest` / `repeatable`，只作披露，不改基数定义。`inputs` 另含 `baseMethod`、`baseAsOf`、`cashAsOf`、`ttmAsOf`、`ttmQuality` 及 capex 诊断。估值区间是已披露假设的情景包络。 |

`public/data/manifest.json`（`MANIFEST_PATH`）：

| 字段 | 含义 |
| --- | --- |
| `schema` / `policyVersion` / `policyHash` / `generatedAt` | 与发布值文件一致。 |
| `dataAsOf` | 利率表日期。 |
| `universe` / `counts` | 与发布值文件的覆盖清单（`universe`）一致；`counts = { snapshots, valued, refused }`。 |
| `rates` | 与发布值文件的 `rates` 相同，便于页面单独读利率。 |
| `files[]` | `{ name, bytes, sha256 }`：`catalog.json`、`rates.json` 和清单内快照；发布值文件由校验重算比对。 |

### 4.1 发布状态 `public/data/publish.json`

每次刷新写出候选批次的状态与内容摘要，随发布安装和回滚。它不是页面输入，只供发布闸门与 CI 审计。

| 字段 | 含义 |
| --- | --- |
| `schema` / `status` | 结构版本；`ok`、`partial`、`verified-unchanged`、`rebuilt` 或 `blocked`。 |
| `blocked[]` / `partial[]` | 阻断与披露原因；blocked 时暂存不安装。 |
| `mode` / `scope` | 刷新模式（all/quotes/fundamentals）与范围（all/targeted/candidates）。 |
| `rates` | `{ requested, live[], kept[], failed[] }`；显式 `--rates=keep` 时 `requested=false`。 |
| `generatedAt` / `upstreamCheckedAt` / `latestPeriod` | 工件生成日、上游实际核验时刻、工件内最大报告期。刷新批次的核验时间不早于生成日。离线重算沿用已有核验时间，缺少记录时为 `null`。 |
| `batch` / `previousBatch` | artifact 与 manifest 对应字节的摘要及 Git 历史中上一不同批次。重复生成同批次保留其前序，回退可恢复原批次链。 |

`npm run snapshot` 在建好暂存工件后判定：所需链路全失败、定向代码失败、估值数低于上一批 90%、拒绝数增加超过 max(5, 声明数 2%)、任一市场失去全部估值、没有可用利率，或存在 artifact 构建问题时为 `blocked`；局部失败保留旧记录与真实期间/日期并记 `partial`；供应商成功而期间未更新记 `verified-unchanged`。失败保留的报价或财报不改变旧行日期。手工 `npm run intrinsic` 写 `rebuilt`。阈值取自上一发布批次的覆盖，不用 120 天统一线。

## 5. 刷新、发布与校验

```bash
npm run snapshot     # 刷新 public/data/*.json、rates.json 与 publish.json（本机运行，闸门可阻断安装）
npm run intrinsic    # 生成 intrinsic/<version>.json、manifest.json 与 rebuilt 状态
npm run verify:data  # 数据与发布状态校验
npm run verify:data -- --check-lineage  # 同时对照 Git 历史的前序摘要
npm run audit:policy:diff                # 离线输出 v1 到 v2 的全量逐标的差异
npm run refresh      # 暂存生成快照与估值，随后校验
npm run verify       # lint → test → test:real → verify:data → smoke:pages
```

`npm run verify:data`（`scripts/verify-data.mjs`）逐项检查：

1. `POLICY_V1` 的 sha256 等于 `POLICY_V1_HASH`；
2. committed artifact/manifest 可由已提交文件重算且字节一致（否则 `run npm run intrinsic`）；
3. `publish.json` 存在且状态允许发布。`batch` 与重算的 artifact/manifest 字节一致，`generatedAt` 与 artifact 相同，`latestPeriod` 等于工件最大报告期。刷新批次的 `upstreamCheckedAt` 须不早于生成日，`rebuilt` 可沿用此前的核验时间或记录为未知。部分刷新及离线重算的未知核验时间会产生提示。
4. `generatedAt` 距 120 天（`staleness.fundamentalsDays`）以内；超过只打 `warn`，不使校验失败（口径是“保留并标注”，过期由数值上的 `STALE_DATA` 披露）；
5. CNY/USD/HKD 都有利率行；`asOf` 超过 10 天（`staleness.ratesDays`）同样只 `warn`；缺利率行本身仍是硬失败；
   这样 `verify:data` 的结果只取决于已提交文件，不取决于运行当天的日期（CI 不会在刷新后第 11 天开始因无关提交变红）；
6. `scripts/watchlist.json`、已提交快照、`catalog.json`、artifact entries 四者集合一致；
7. manifest 里每个文件的 bytes/sha256 与磁盘一致；
8. 每条 entry 的 reason/warning 都是已知代码，且带 `inputs.rate`；
9. 快照 schema 的必需键存在；9 组 A/H 对照齐全；抽样重算 `SHSE:601398`、`NASDAQ:AAPL`、`NYSE:TSM` 一致。

CI（`.github/workflows/pages.yml`）与本地 `npm run verify` 跑同一链；冒烟与浏览器套件另列。

## 6. 覆盖清单与替换

公开覆盖以 `scripts/watchlist.json` 为准。快照、搜索目录和发布值的证券集合必须一致，拒绝估值的证券保留条目和原因。

替换记录（只换标的，不改口径）：

- `HKSE:00823`（领展房产基金）：东方财富没有可用数据，换成 `HKSE:00002`（中电控股）。
- `NYSE:XOM`：2026 年该 ticker 指向新的控股实体，SEC facts 不可用，换成 `HKSE:00066`（港铁公司）。

扩容先走[暂存流程](DATA_SOURCES.md)，通过核验后同步覆盖清单和生成数据。正式刷新用 `npm run refresh`；新增或替换后必须通过覆盖集合一致性检查。

## 7. 当前发布（示例）

以下数字随 `npm run refresh` 变化，**以 `public/data/intrinsic/v3.json` 为准**：

- `generatedAt` 2026-11-23；`rates.asOf` 2026-11-23。政策哈希为 `07a8a857626ac0122e55de3dfcf062296515a758366c65a62967b1cf6e34625e`（2026-11-25 估值基数修复修订了 `POLICY_V1`）。`upstreamCheckedAt` 为 2026-11-23T12:55:13.240Z（真实上游核验时间，本轮离线重算未改）。发布状态 `partial`。
- 利率：CNY 1.5861（asOf 2026-11-23，live）、USD 4.92（asOf 2026-11-20，live）、HKD 4.92（`usd_proxy` → USD）。要求回报仍是 `max(10%, ceil(报告币种十年期)+6)`，缺失回退 10%。因此人民币官方折现率仍是 10%，美元与港币现为 11%（ceil(4.92)+6；此前美元十年期 5.07 时为 12%）。这是公式在现行收益率下的结果，不是改公式。当前已提交快照仍没有经核验的 `reporting_currency` 字段，因此读时派生：A 股人民币 10%，美国上市美元 11%，港股回退报价港币并代理美元，同为 11%。已对齐 A/H 组大约差 1 个百分点。这是数据缺口，不是给某对 A/H 写了不同公式，也不应把这 1 个百分点当成要保留的政策特征。
- 声明、快照与估值条目各 500 条，有值 452 条，拒绝 48 条（冻结 v2：407 / 93；上一轮居中三规则：450 / 50）。`CASH_UNRECONCILED` 14 条（仅对称差距大于 200% 时拒绝）；`CASH_MIDPOINT` 55 条。`BASE_QUALITY_INSUFFICIENT` 9 条。新政策不再发出 `LATEST_FY_BASE`。`OWNER_BASE_GAP` 仍为 2 条（`NASDAQ:TROW`、`NYSE:PCG`）。
- 拒绝原因出现次数，`NO_GROWTH` 15、`CASH_UNRECONCILED` 14、`NO_EPS` 11、`BASE_QUALITY_INSUFFICIENT` 9、`UNSTABLE_BASE_REGIME` 6、`NON_POSITIVE_EPS` 5、`INDUSTRY_MODEL_PENDING` 3。同一证券可能有多个原因。
- 过期基本面标记 `STALE_DATA` 70 条。`NORMALIZED_EPS` 218 条，`CASH_DIVERGENCE`（25–49%）54 条，`CASH_MIDPOINT` 55 条，`PERSISTENT_STEP_BASE` 134 条，`CASH_PERIOD_LAG` 377 条，`BASE_QUALITY_REDUCED` 38 条，`TTM_NONOPERATING` 7 条，`TTM_QUALITY_UNKNOWN` 7 条。`OWNER_BASE_GAP` 2 条，`REGIME_UNCERTAIN` 111 条，`SHORT_HISTORY` 64 条，`NO_WINDOW_ZERO_START` 42 条，`CAPPED_GROWTH` 87 条，`GROWTH_ABOVE_RETENTION` 17 条，`LIFE_BOOK_QUALITY` 3 条。现行工件不再发出 `NEGATIVE_HISTORY_ZEROED`、`NEGATIVE_HISTORY_GROWTH` 或 `LATEST_FY_BASE`。模型为 `owner` 451 条、`residual` 49 条。
- REIT/炼化仅试算的三条记录带 `INDUSTRY_MODEL_PENDING` 和 `MODEL_CAVEAT`。`CLASSIFICATION_UNVERIFIED` 为 0 条。报价 52 条带日期更新、448 条失败后保留既有报价，其中 `QUOTE_DATE_UNKNOWN` 仍为 140 条，故发布状态保持 `partial`，不把报价视为已全部核验。前后差异见 [RELEASE_V3.md](RELEASE_V3.md)。
- 工件记录的币种覆盖仍是报价侧：CNY 50 条、USD 399 条、HKD 51 条。已提交年报中折旧摊销每股字段覆盖 478 条，股份支付每股 383 条；显式 `reporting_currency` 仍为 0，读时派生。

本批扩容保留了原有 150 只的快照及默认估值，用同一份利率计算新增 350 只美国上市证券。新增名单以 2026 年 6 月底 Vanguard 500 Index Fund 权重排序，通过 2026 年 11 月 18 日 SPY 持仓的 CUSIP 与代码核对；收盘价使用 11 月 18 日的公开历史行情，财报按 SEC CIK 核验。存在未核实股本事件或无法对齐证券与财报的候选留在暂存报告中。[权重原表](https://www.sec.gov/Archives/edgar/data/36405/000003640526000473/0000036405-26-000473-index.htm) · [SPY 官方持仓](https://www.ssga.com/us/en/intermediary/etfs/state-street-spdr-sp-500-etf-trust-spy)

## 8. 默认估值的适用边界与升版验证

个股页、自选与对比共用每家公司在同一时点的一个默认公允价值。适用路径由系统按企业经济特征与数据质量确定。方法页提供[历史研究数据](../public/research)。

公开默认估值由发布脚本依据财务数据与版本化规则生成。按财务特征和数据条件选择适用的估值方法，新增股票的常规成本是补齐并验证数据源。默认估值的增长率、折现率或现金流加回比例由适用规则导出。实际财报中的数据修订仍可附原始来源记录。

新口径用多家公司和多个披露时点验证。每次复算仅使用当时可取得的财报与市场数据，对照现行 v1 和不增长的简单基准，检查现金流或盈利预测偏差、相近输入下估值是否稳定、币种及股本口径、缺数据时的结果，以及能持续生成默认估值的比例。公司个例可用来定位异常和检验规则的边界。覆盖资格取决于数据和模型适用性，无需逐只研究员审批。

股价只参与安全边际。测试应覆盖交易日无法确认、上一交易日有可用价格和报价已过期的情况。基本面估值、近期报价及手动试算分别记录输入。公开默认值与页面修改参数后的试算使用同一套可复算方法。
