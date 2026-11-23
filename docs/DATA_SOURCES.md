# 数据源框架

数据层按 [wealthfolio](https://github.com/wealthfolio/wealthfolio) 的 `crates/market-data`
设计重写，包含来源注册、市场覆盖声明、熔断、限流、校验与诊断。

## 组成

| 文件 | 作用 |
| --- | --- |
| `src/data/registry.js` | 排序、过滤、熔断、限流、校验、诊断；唯一对外入口 |
| `src/data/circuit.js` | 每源熔断器（连续 5 次失败打开 / 60s 半开 / 2 次成功关闭） |
| `src/data/limiter.js` | 每源令牌桶（按来源声明的 rpm + burst） |
| `src/data/validate.js` | 报价体检：数值、正数、上限、未来时间、过期、币种 |
| `src/data/coverage.js` | 市场覆盖（allow/deny/未知市场放行策略） |
| `src/data/skip.js` | 跳过原因 + 逐次尝试记录（UI 用来说“走了兜底”） |
| `src/data/errors.js` | 错误分类与重试等级 |
| `src/data/preferences.js` | 用户偏好：全局顺序、按代码钉死来源 |
| `src/data/providers/*` | 具体来源 |

重试等级（对应参考实现的 `RetryClass`）：

| 等级 | 触发 | 行为 |
| --- | --- | --- |
| `never` | 校验失败、代码非法 | 直接中止，不换源 |
| `failover_with_penalty` | 超时 | 换源并记熔断失败 |
| `next_provider` | 429、5xx、网络错、无数据、不支持 | 换源，不记罚 |
| `circuit_open` | 熔断已打开 | 跳过 |

## 来源与能力

| id | 能力 | 覆盖 | 优先级 | 限流 | 直连 |
| --- | --- | --- | --- | --- | --- |
| `eastmoney` | 报价、价格历史；沪深港主要指标（每股收益、自由现金流或经营现金流、净资产、增速） | 沪深港美报价，财报仅沪深港 | 40 | 30/min, burst 4 | 否 |
| `edgar` | 资料、年度财报、每股历史（XBRL） | 美 | 60 | 10/min, burst 2 | 否 |
| `snapshot` | 股票/报价/资料/历史与财报（`public/data` 里的季度文件，带 `as_of`） | 已生成的代码 | 15 | 60/min, burst 10 | 是（同源） |
| `fixture` | 全部（快照） | 全部 | 1000 | 600/min | —（本地） |

“股票”能力＝一次返回价格与基本面。没有单源同时具备时，注册表退化为
「报价源 + 资料源」并合并，返回体带 `_sources`。

覆盖不到的市场、用不上的操作、熔断中的源都会**被记录为跳过**而不是静默消失；
状态条会写出兜底来源与跳过原因。

## 传输模式

`VITE_TRANSPORT` 分三档，默认值随环境：dev 下为 `proxy`，生产构建为 `direct`。

| 模式 | 实际请求 | 说明 |
| --- | --- | --- |
| `proxy` | 相对前缀（`/em`、`/sec`…），由 Vite 转到上游 | 本地开发/预览，浏览器不碰 CORS |
| `direct` | 上游绝对 URL | 静态托管；只有 `corsSafe: true` 的源能这样用 |
| `gateway` | `VITE_CORS_GATEWAY` 模板包裹后的绝对 URL | 静态托管 + 非 CORS 源；`corsSafe` 源仍直连 |

`corsSafe` 是 provider 的声明：`eastmoney` / `edgar` 为 false，静态页不能直接请求它们。
`src/data/index.js` 在 `VITE_TRANSPORT=direct`（Pages 工作流显式设置）时只注册 `snapshot`。
线上能算的就是 `public/data/` 里已经生成的代码；没有文件的代码显示「所有数据源都失败」，可改入手填。
东财和 SEC 的这些接口在开发时走 Vite 代理。自托管站点若启用实时请求，需配置自有 CORS 网关（见 `.env.example`），并为 SEC 转发带联系方式的 User-Agent。静态构建不含公共网关。查询串在交给网关之前已拼进目标 URL。

无风险利率不走注册表。十年期国债取自东财 `RPTA_WEB_TREASURYYIELD`（`EMM00166466` 为中国十年期，`EMG00001310` 为美国十年期；美国当日可能尚未写入，取最近一个非空值）。该接口无 CORS，开发时走 Vite `/emdcweb` 代理，发布页读取 `public/data/rates.json`（由 `npm run snapshot` 一并刷新），再退到随包的 `src/data/bundled/risk_free.json`。

**禁止事项**：不要用美国存量国债平均票息（历史上的 `5.14`、`3.399` 等），它们不是十年期收益率，也不是任何兜底值。不要拿这些数字更新 `risk_free.json`。缺当地十年期收益率时，折现率回退为 8%（`FALLBACK_DISCOUNT_RATE`），并在界面写明；不得静默改用美债收益率——只有港币现金流明确使用美元十年期作为代理。旧的 `latest_indicator.json` 已删除，不要恢复。

本机运行 `npm run refresh`，重建并校验快照、估值和发布清单。发布闸门判定为 blocked 时暂存不安装，已发布字节不前进。GitHub Pages 只构建已生成的数据。

扩容先使用单独暂存目录，正式清单仍为 `scripts/watchlist.json`。候选清单须包含原有覆盖和拟新增的证券。下列命令只采集缺失的新增证券，重复执行会接着跑。

```sh
npm run snapshot -- --stage=tmp-snapshot-pilot --universe=tmp-candidates.json --candidates=missing --rates=keep
```

- `--mode=quotes` 只刷新参考报价，保留财报和财报期间。已有交易日时，更新仅接受可确认且不更早的交易日。`--mode=fundamentals` 复用已有报价，刷新财报。
- `--reference=tmp-reference.json` 用于试点。提供统一交易日、公开出处，以及逐证券的收盘价、CIK 和已核对拆股的起始日期。参考文件只用于暂存。新证券需通过财报主体和每股口径检查。
- 财报按供应商及 SEC CIK 缓存，默认存入 `tmp-snapshot-cache`，当日续跑复用。请求按供应商节流，并对临时错误重试。失败保留已验证记录和其日期并记为 partial；定向代码失败或缺失的新增证券会让暂存验收失败。
- 暂存目录的 `outcomes/` 保留各证券最后一次处理结果，`report.json` 报告各市场的声明、快照、可估值、拒绝、基本面过期数量，以及报价/财报结果和 publish 判定。候选批次摘要写入 `publish.json`，全失败时旧发布保持原字节。正式刷新先核验暂存数据，再写入发生变化的发布文件。写入前在 `tmp-snapshot-previous` 保存上一套数据及恢复记录。写入失败时回退。若进程异常停止，确认没有其他刷新进程后，可移除空的 `tmp-snapshot-lock` 再运行。刷新会根据恢复记录还原上一套数据，再开始新一轮采集。

## 排序

1. 该代码被钉死的来源（设置里 `pinProvider`）；
2. 用户全局顺序；
3. 来源自带优先级（数值越小越靠前）。

## 调参

- `VITE_API_MODE=fixture` 只用内置快照；
- `VITE_US_SOURCE=auto|hybrid|edgar|eastmoney` 调来源顺序；
- 卡片右上菜单可以为当前代码固定一个来源或切回自动，偏好仅保存在本机。
- 季度快照：`npm run snapshot` 按 `scripts/watchlist.json` 生成 `public/data/*.json`（带
  `as_of`），提交即随 Pages 发布。`VITE_SNAPSHOT=off` 可暂时跳过快照行情。
  报价日期来自上游时间戳，回退用最近一根不复权日 K 的日期及收盘价。历史快照若没有原始报价日期，页面标为交易日未核实。
- 冒烟/测试里可用 `page.apiMock.down.add('eastmoney')` 让某个源掉线，观察兜底。

## 加点新源

```js
// src/data/providers/mysource.js
export const mysource = {
  id: 'mysource', label: '我的源', priority: 30,
  capabilities: { quote: true, history: false },
  coverage: Coverage.of(['NASDAQ']),
  rateLimit: { requestsPerMinute: 20, burst: 3 },
  async fetchQuote (symbol) { /* -> { price, currency, timestamp, provider } */ },
}
```

再把它加进 `src/data/index.js` 的 `providersFor()`，并在 `tests/unit/registry.test.js`
补一条能力/覆盖用例。报价会被注册表统一体检，不需要自己校验。

## 边界

- EDGAR 有可比 10-Q 时，用最新年报 EPS 加本财年累计 EPS，再减上财年同期累计 EPS，近似最近十二个月每股收益。三项采用同一申报字段，季报比较数须与原申报一致。比较数为零、缺失或经重述时沿用年报值并标 FY。历史增长和年报图表仍使用完整财年。滚动 EPS 采用财报披露值，可能包含投资损益等非持续项目。
- 采集代码发布与公开快照更新各自验收。Pages 只部署已提交的快照和估值文件。针对采用滚动 EPS 后首次批量更新的数据，先核对盈利变动明显或安全边际翻转的条目，确认财报、期间和非经常项目，再提交快照与重新生成的发布文件。
- 熔断与限流状态只在内存里，刷新即复位（故意的，本地单用户工具）；
- 美股每股收益会按拆股重述：仅调整在拆股当年 10-K 之前申报、未被后续比较列重述的年份；收入/股和自由现金流/股本来就按复权股本计算。一年的骤降只有在像漏掉的拆股或单位错误时才会从历史里拿掉，真实的景气下滑（例如英伟达 FY2023）会保留。fiscal year 以期间截止日的年份标记；截止日在 1 月的公司，十年窗口以最新财年为准，更早的年份（英伟达 2016 在最新一年为 2026 时）不会回填。美股与 A/H 一样计算 10/5/1 年盈利和自由现金流增速：期末亏损则不给增速，不用 5% 垫值；十年至少要有七年跨度，五年至少四年；一年增速必须有紧邻的上一财年。窗口第一年若是低谷，起点会向前移并保住最短跨度，而不是整段作废。
- 20-F / IFRS 申报在股东权益、自由现金流、收入和营业利润上使用保守别名：权益只取归属于母公司所有者的部分（`EquityAttributableToOwnersOfParent`），不把少数股东权益算进去；自由现金流是经营活动现金流量减购建固定资产；收入用 `Revenue`，营业利润用 `ProfitLossFromOperatingActivities`。有美国 GAAP 序列时仍以 10-K 为准。港股分红列不采用东财 `DPS_HKD`（该字段不是历史值）。其余历史序列不做复权回填，主要为图表服务；
- EDGAR 对单列油气资产支出的发行人优先采用已披露的资本开支总额。缺总额时，油气资产支出与其他固定资产支出须匹配经营现金流的同一份申报、同一完整财年，才合并扣除。分项不齐的财年保留为空。其余发行人沿用现有资本开支标签。
- 抓取来源各自的条款见 `../ATTRIBUTION.md`。

## 发布值文件与数据校验

`public/data/rates.json` 是唯一发布利率输入：`npm run snapshot` 写它，发布值文件构建只读它。开发/线上运行时的读取顺序仍是「实时 → 已提交快照 → 随包兜底」，其中 `src/data/bundled/risk_free.json` 只在本地/离线兜底，不进入发布值。港币按美元十年期作代理，artifact 里 HKD 行标 `usd_proxy`。

`npm run intrinsic` 把已提交快照写成两个发布文件（实现 `scripts/lib/policy-artifact.mjs`，字段说明 `POLICY.md`）：

- `public/data/intrinsic/v3.json`：每条记录的发布值、band、终值占比、安全边际、reason/warning、inputs 与 asOf；政策版本与 hash 写在文件头。`v2.json` 与 `v1.json` 冻结保留复现。
- `public/data/manifest.json`：同一份 universe/coverage 和利率行，外加 `catalog.json`、`rates.json` 和清单内每份快照的 bytes/sha256。

契约：

- 发布值文件是唯一对外发布值。构建从相同文件生成 `data/valuation/meta.json` 及同一发布标识下的个股详情和列表摘要。个股页加载详情，自选和对比加载摘要，方法页加载元数据。完整审计文件仍可下载。
- 发布元数据和快照优先检查网络，并在离线时使用最近缓存。个股估值详情和列表摘要按发布标识缓存。部署切换时，如果已读取的发布资源已移除，客户端重新核对元数据，再读取对应版本。每条个股估值和它的版本、生成日期一起保存。
- `npm run verify:data` 是可提交前的数据校验（policy hash、可复现、publish 状态与批次摘要、过期、universe、manifest hash、未知代码、抽样重算）；`npm run refresh` 先暂存生成整套数据，再核验。
- 基本面账龄按所用盈利期间截止日计算，股价账龄按报价交易日计算。发布值文件或利率行过期会提示，数据结构和可复现性错误会使校验失败。
- 只对已有快照重算时运行 `npm run intrinsic` 再运行 `npm run verify:data`。


## 每股数据的币种和日期

- 盈利期间来自财报，快照采集日来自刷新任务。A 股缺少对比期时用最近年度 EPS，香港指标的 TTM 使用该字段所在报告日期，美国年度数据使用 XBRL 的期间截止日。
- 东方财富港股主指标表（`RPT_HKF10_FN_MAININDICATOR`）把这里解析的财务值标准化成了人民币。`CURRENCY` 可能写 HKD，不能用作这些字段的单位。对照港铁 FY2025 公告，摊薄 EPS 为 HK$2.36，接口相应字段为约 CNY 2.1316。转换后的财务值记录在港币报价口径，来源单位另存为 `fundamentals_currency`。
- `scripts/lib/verified-earnings.mjs` 记录可由公司公告核实、但结构化源尚未收录的年度盈利。台积电 FY2025 采用公司披露的每 ADR 摊薄盈利 USD 10.65。出现更新的结构化报告后，优先采用更新的期间。
