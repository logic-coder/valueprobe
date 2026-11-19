# 公开口径 v1（public policy v1）

这份文档说明 `src/lib/policy.js` 里冻结的口径。**代码是唯一事实源**：参数、拒绝码和警告码都从该模块读取；本文的数字若与 `public/data/intrinsic/v1.json` 或 `src/lib/policy.js` 不一致，以代码与发布值文件为准。

修改 `POLICY_V1` 会改变每一个发布数字。必须同时升 `POLICY_VERSION`、重算并更新 `POLICY_V1_HASH`，否则 `npm run verify:data` 会以 `policy hash pinned` 失败。拒绝码与警告码只增不改：新增用新代码，不复用、不重编号。

## 1. 口径参数

| 参数 | v1 值 | 代码常量 |
| --- | --- | --- |
| 估值基数 | `eps`（每股收益；自由现金流只作对照，不发布） | `POLICY_V1.basis` |
| 一般公司模型 | `owner`：两期折现（`presentValue`） | `POLICY_V1.model.nonFinancial` |
| 金融机构模型 | `residual`：剩余收益（`residualIncomeValue`） | `POLICY_V1.model.financialInstitution` |
| 第一阶段年数 | `DCF_DEFAULTS.years` = 10 | `POLICY_V1.horizon.years` |
| 第二阶段年数 | `DCF_DEFAULTS.yearsOfTerminalGrowth` = 10 | `horizon.yearsOfTerminalGrowth` |
| 终值增速 | `DCF_DEFAULTS.terminalGrowthRate` = 4% | `horizon.terminalGrowthRate` |
| 历史增速窗口 | 10 年 | `growth.windowYears` |
| 承保增速上限 | `MAX_UNDERWRITTEN_GROWTH` = 15% | `growth.cap` |
| 拆股清洗后最短年数 | `MIN_CLEAN_YEARS` = 4 | `growth.cleanYears` |
| 负增长 | `warn`：照常出值并标注 `NEGATIVE_HISTORY_GROWTH` | `growth.negative` |
| 折现率规则 | 当地十年期国债收益率向上取整 + 股权风险溢价 | `discount.rule` |
| 股权风险溢价 | `EQUITY_PREMIUM` = 6 个百分点 | `discount.spread` |
| 取整 | `ceil` | `discount.rounding` |
| 利率币种 | `quote`：跟随报价/现金流币种，不跟显示货币 | `discount.currency` |
| 港币代理 | `USD`：港币用美元十年期作代理 | `discount.hkdProxy` |
| 缺失利率 | `fallback`：照常出值，回退值 + `RATE_FALLBACK` | `discount.missing` |
| 兜底折现率 | `FALLBACK_DISCOUNT_RATE` = 8% | `discount.fallback` |
| 折现率夹取 | 0–50% | `discount.min` / `discount.max` |
| 价格过期提示 | 超过 7 天标 `STALE_PRICE`（不改数字） | `price.marginWarningDays` |
| 基本面过期 | 超过 120 天标 `STALE_DATA`（照常出值） | `staleness.fundamentalsDays` |
| 利率过期 | 超过 10 天在校验失败 | `staleness.ratesDays` |
| 区间 | 折现率上下 2 个百分点（同一模型） | `band.discountSpread` |
| 终值占比 | 披露 | `terminalShareDisclosed` |

实现细节都以代码为准：

- 折现率：`rateForCurrency()`（`src/lib/riskFree.js`）→ `policyDiscountRate()`（ceil+6）→ 夹到 0–50；取不到当地利率时 `policyValue()` 用兜底值并加 `RATE_FALLBACK`。
- 增速：`policyGrowth()` → `adoptGrowth()`（`src/lib/assumptions.js`）：缺失给 `NO_GROWTH`，超过 15% 按 15% 并给 `CAPPED_GROWTH`，负值照常并给 `NEGATIVE_HISTORY_GROWTH`。
- 模型：`policyModel()` 只读归一化记录上的 `financial_institution` 标记；判定启发式在同一入口 `stockRecord.js` 的 `toStock()` 里执行一次（快照 provider、浏览器与发布值文件构建共用），所以页面与 artifact 不会对同一代码给出不同模型。区间由 `valueBand()` 用同一模型算低/中/高。
- 价格：只进入安全边际，从不进入内在价值；价格缺失给 `PRICE_MISSING`，过期给 `STALE_PRICE`。
- 快照：`toStock()`（`src/lib/stockRecord.js`）统一做拆股清洗与金融机构标记，浏览器和发布值文件构建走同一条路径。

## 2. 拒绝码（REASON）

一条记录要么是“数字 + 若干 warning”，要么是 `null` + 至少一个 reason。

| 代码 | 含义 |
| --- | --- |
| `NO_SNAPSHOT` | 没有可用的本地快照。 |
| `NO_EPS` | 快照里没有每股收益。 |
| `NON_POSITIVE_EPS` | 每股收益不为正，折现模型不出值。 |
| `NO_GROWTH` | 没有可用的历史增速，无法外推。 |
| `NO_BOOK` | 金融机构需要正的每股有形账面价值。 |
| `NOT_FINITE` | 计算结果不是有限正数，不出值。 |

## 3. 警告码（WARNING）

警告只披露，不改变计算；带 warning 的记录照常发布数字。

| 代码 | 含义 |
| --- | --- |
| `CAPPED_GROWTH` | 历史增速高于承保上限，按上限外推。 |
| `NEGATIVE_HISTORY_GROWTH` | 历史增速为负，照常出值并标注。 |
| `GROWTH_ABOVE_RETENTION` | 增速高于留存收益能支撑的水平。 |
| `RATE_FALLBACK` | 取不到当地十年期利率，折现率回退为 8%。 |
| `DISCOUNT_CLAMPED` | 折现率被夹到 0–50% 的公开区间。 |
| `PRICE_MISSING` | 快照里没有价格，安全边际留空。 |
| `STALE_PRICE` | 价格已经过期，只标注，不改变内在价值。 |
| `STALE_DATA` | 基本面快照已经过期，照常出值并标注。 |

UI 翻译键约定为 `reason_<CODE>` / `warning_<CODE>`，文案在 `src/i18n/legal-messages.js`，由 `src/main.js` 合并进 i18n。数据校验拒绝未知代码。

## 4. 发布值文件与 manifest

两个文件都只能由 `npm run intrinsic`（即 `scripts/policy-values.mjs`）生成，不要手改。构建函数在 `scripts/lib/policy-artifact.mjs`，写入与校验共用这一个函数，所以同一份输入得到同一份字节。

路径约定：`scripts/lib/policy-artifact.mjs` 的 `ARTIFACT_PATH` 与 `src/api/policy.js` 的 `ARTIFACT_PATH` 目前都把 `v1` 写死在文件名里。升 `POLICY_VERSION` 时，这两处、方法页显示的路径与本文必须同一次更新；否则浏览器会去读一个不存在的 `intrinsic/v2.json`。

`public/data/intrinsic/v1.json`（`ARTIFACT_PATH`）：

| 字段 | 含义 |
| --- | --- |
| `schema` | 固定为 1。 |
| `policyVersion` / `policyHash` | `POLICY_VERSION` / `POLICY_V1_HASH`。 |
| `generatedAt` | 生成日期（`YYYY-MM-DD`）。 |
| `rates` | `{ asOf, CNY, USD, HKD }`；每行 `{ value, asOf, source, proxy? }`，HKD 为 `usd_proxy`。 |
| `universe` | `{ declared, snapshots, missing[] }`。 |
| `coverage` | `{ valued, refused, reasons{}, warnings{}, models{}, currencies{} }`，按稳定顺序排列。 |
| `crossListing` | 9 组 A/H 对照：`{ id, a, h, status: aligned|input-mismatch|not-valued, valueA, valueH, fxToA, epsFxDiffPct, growthDiffPp, valueDiffPct }`。只报告差异，不平均、不回写。 |
| `entries` | 以 `EXCHANGE:CODE` 为键，值来自 `policyValue()`：`{ symbol, status, value, band, terminalShare, price, marginOfSafety, reasons[], warnings[], inputs{}, asOf, ratesAsOf }`。`inputs` 含 `model, basis, eps, growth, discountRate, terminalGrowthRate, years, yearsOfTerminalGrowth, tangibleBook, addToFairValue, currency, rate{value,asOf,source,proxy}`。 |

`public/data/manifest.json`（`MANIFEST_PATH`）：

| 字段 | 含义 |
| --- | --- |
| `schema` / `policyVersion` / `policyHash` / `generatedAt` | 与发布值文件一致。 |
| `dataAsOf` | 利率表日期。 |
| `universe` / `counts` | 与发布值文件的覆盖清单（`universe`）一致；`counts = { snapshots, valued, refused }`。 |
| `rates` | 与发布值文件的 `rates` 相同，便于页面单独读利率。 |
| `files[]` | `{ name, bytes, sha256 }`：`catalog.json`、`rates.json` 和 150 个快照；发布值文件本身由校验重算比对。 |

## 5. 刷新与校验

```bash
npm run snapshot     # 刷新 public/data/*.json 与 rates.json（本机运行）
npm run intrinsic    # 生成 intrinsic/v1.json 与 manifest.json
npm run verify:data  # 数据校验
npm run refresh      # 上面三步
npm run verify       # lint → test → test:real → verify:data → smoke:pages
```

`npm run verify:data`（`scripts/verify-data.mjs`）逐项检查：

1. `POLICY_V1` 的 sha256 等于 `POLICY_V1_HASH`；
2. committed artifact/manifest 可由已提交文件重算且字节一致（否则 `run npm run intrinsic`）；
3. `generatedAt` 距 120 天（`staleness.fundamentalsDays`）以内；超过只打 `warn`，不使校验失败（口径是“保留并标注”，过期由数值上的 `STALE_DATA` 披露）；
4. CNY/USD/HKD 都有利率行；`asOf` 超过 10 天（`staleness.ratesDays`）同样只 `warn`；缺利率行本身仍是硬失败；
   这样 `verify:data` 的结果只取决于已提交文件，不取决于运行当天的日期（CI 不会在刷新后第 11 天开始因无关提交变红）；
5. `scripts/watchlist.json`、已提交快照、`catalog.json`、artifact entries 四者集合一致；
6. manifest 里每个文件的 bytes/sha256 与磁盘一致；
7. 每条 entry 的 reason/warning 都是已知代码，且带 `inputs.rate`；
8. 快照 schema 的必需键存在；9 组 A/H 对照齐全；抽样重算 `SHSE:601398`、`NASDAQ:AAPL`、`NYSE:TSM` 一致。

CI（`.github/workflows/pages.yml`）与本地 `npm run verify` 跑同一链；冒烟与浏览器套件另列。

## 6. 覆盖清单与替换

公开覆盖清单是 `scripts/watchlist.json` 里的 150 只（发布值文件的字段名仍是 `universe`）：`public/data` 有 150 个快照，`catalog.json` 150 行，artifact `entries` 150 条。任何一边多一只或少一只，校验失败。

替换记录（只换标的，不改口径）：

- `HKSE:00823`（领展房产基金）：东方财富没有可用数据，换成 `HKSE:00002`（中电控股）。
- `NYSE:XOM`：2026 年该 ticker 指向新的控股实体，SEC facts 不可用，换成 `HKSE:00066`（港铁公司）。

替换步骤：改 `scripts/watchlist.json` → `npm run snapshot` → `npm run intrinsic` → `npm run verify:data`，四步产物一起提交。新增或替换后必须让第 5 项 universe 检查保持全绿。

## 7. 当前发布（示例）

以下数字随 `npm run refresh` 变化，**以 `public/data/intrinsic/v1.json` 为准**：

- `generatedAt` 2026-11-19；`rates.asOf` 2026-11-19。
- 利率：CNY 1.5892（asOf 2026-11-18）、USD 5.07（asOf 2026-11-18）、HKD 5.07（`usd_proxy` → USD）。
- universe 150 / 150，missing 0；coverage valued 123 / refused 27。
- reasons：`NO_GROWTH` 25、`NON_POSITIVE_EPS` 9、`NO_EPS` 1。
- warnings：`CAPPED_GROWTH` 43、`NEGATIVE_HISTORY_GROWTH` 25、`GROWTH_ABOVE_RETENTION` 8。
- models：`owner` 122、`residual` 28；currencies：CNY 50、USD 49、HKD 51。
