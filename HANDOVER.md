# 交接评估：认知成本与简化方案（5 阶段已实施）

> 读者假设：能力强、完全不了解项目、明天接手。结论先说：这个仓库的复杂度**不来自总量**（src 7,516 行、87 个文件，很小），而来自**职责堆叠和词义冲突**——几个核心文件同时承担产品、状态、持久化和数据访问，而"什么是源、什么是状态、什么能改"主要写在文档和测试里。有经验的工程师 1–2 天可以安全改显示层，3–5 天才敢动数据层，改内核前还要先读两份长文档。

## 1. 导航成本（实测）

| 指标 | 数值 | 含义 |
| --- | --- | --- |
| 源码 | 87 文件 / 7,516 行 | 总量小，可整读 |
| 14 个 >100 行的 JS/Vue 文件 | 3,351 行（约 45% 源码） | 复杂度集中，绕不开 |
| 最长单文件 `DcfCalculator.vue` | 864 行 | 结果条、情景、WACC 对话框已拆到 `components/dcf/` |
| 测试 | 38 个单测、18 个 e2e、3,000 行 | 契约多，改 UI 前必须读测试 |
| e2e 选择器 | 409 处裸 `page.locator`，无页面对象 | 改 class 要全局搜测试 |
| 必读文档 | README、DESIGN、DEVIATIONS（14 KB）、DATA_SOURCES、CALCULATION、ARCHITECTURE 等 8 份 | 关键规则不在代码里 |
| 词义冲突 | "source" 至少 4 义，"state" 3 义，"cloud/snapshot/fixture/view" 各 2 义 | 命名无法自解释 |

用户可感知的规则（内核逐行移植、只改显示边界、行为差异必须记 DEVIATIONS）**只存在于文档**；代码里没有分层检查，任何组件都能直接 import 数据注册表或 `localStorage`。

## 2. 阅读顺序（按天）

| 时间 | 读什么 | 目的 |
| --- | --- | --- |
| 0.5 天 | README、DESIGN、CONTRIBUTING、DEVIATIONS 开头 | 产品定位与红线 |
| 0.5 天 | `src/main.js`、`src/router`、`src/App.vue`、`src/config/markets.js` | 启动、路由、壳层 |
| 1 天 | `src/pages/*`、`src/components/*`、对应 e2e | 页面行为与测试契约 |
| 1 天 | `src/lib/dcf.js`、CALCULATION、`lib/measure.js` | 内核与测量边界 |
| 2–3 天 | `src/data/*`、DATA_SOURCES、`ATTRIBUTION` | 数据层、CORS 与降级 |
| 可选 1 天 | DEVIATIONS 全文 | 行为差异依据 |

之后仍需要：改显示层时逐页对照 e2e；改数据层时逐条对照 `DATA_SOURCES.md`；动内核要先证明 `git diff` 为空。

## 3. 发现（按认知成本排序）

### P0-1 `DcfCalculator.vue`：一个组件承担 9 类职责

当前 [864 行](src/components/DcfCalculator.vue)。结果条、情景条、WACC 对话框已在 `src/components/dcf/`，自定义模版功能已移除。下面是当时的职责清单，行号已过期：

- 9 个表单区（fair value L69、margin L87、price L133、basis L148、discount L191、TBV L212、growth L240、terminal L298、predictability L343）
- 对话框（WACC L474）
- 持久化：估值档案（L901）、手工记录（L920）
- 分享链接与剪贴板（L686）、报告导出（L584）、敏感性网格（L725）、同行加载（L561）、数据源排序/固定（L523、L739）
- 结果 strip、情景预设、无障碍播报

**成本**：计算器仍然偏大，脚本副作用（URL、localStorage、API）与渲染交错。结果条、情景、WACC 对话框已经拆出。

### P0-2 `src/api/index.js`：门面兼五种基础设施

已拆完。[24 行](src/api/index.js) 只转出 `client.js`、`degrade.js`、`stock.js`、`indicator.js`、`manual.js`、`tracking.js`。

### P0-3 `StockDcfPage.vue`：路由页兼 tab 调度器与数据编排器

页头标签已去掉，股票页只剩计算器。[109 行](src/pages/StockDcfPage.vue) 负责加载、重试和手动/实时切换。`components/stock/` 里还留着当时的摘要、图表、财务、股东组件，路由不再挂它们。

### P0-4 词汇冲突：同一个词四种意思

| 词 | 现在指 | 也指 |
| --- | --- | --- |
| source | 数据源描述（`data/preferences`、`fv-data-sources`） | 显示状态 store（`store/dataState` 存 live/stale/manual/error） |
| provider | 数据源 id/优先级 | 同 source；UI 文案、持久化偏好、日志里混用 |
| cloud | 已删除的上游 id | 旧偏好里若还写着 `cloud`，读取时丢弃 |
| snapshot | `public/data` 的季度文件 | `fixtures/` 的测试快照、`VITE_API_MODE=fixture` 本地模式 |
| view | 财务指标"视图定义"（1983） | 路由视图、E2E 页面视图 |

再加 `_provider/_partial/_sources/_manual/_as_of` 五个下划线伪私有字段，以及 `provider.label` 与 `PROVIDER_LABELS` 两份标签。词汇表已写在 ARCHITECTURE：`Provider`、`SourcePreference`、`DataState`、`DataMode`、`BundledFixture`。已下线的 provider id 在读取时丢弃。

### P0-5 架构规则不可执行

证据：组件直接 import 注册表和设置（[DcfCalculator L523–524](src/components/DcfCalculator.vue#L523-L524)）、页面直接 `localStorage`、数据层硬编码中文标签（[data/index.js L30](src/data/index.js#L30)、[data/skip.js L13](src/data/skip.js#L13)）、banner 里写死全角逗号（[DataStateBanner L61](src/components/DataStateBanner.vue#L61)）。**方案**：`docs/ARCHITECTURE.md` 写清层与允许的 import 方向（config → data → api → store → 页面/组件），用 `no-restricted-imports` 禁上反向依赖；provider 标签并入 i18n。**1 天，低风险**。

### P1-1 数字解析与语言分支各复制 3–6 份

价格清洗在 [App L223](src/App.vue#L223)、[StockDcfPage L223](src/pages/StockDcfPage.vue#L223)、[watchlistView L6](src/lib/watchlistView.js#L6) 重复（内核 [dcf.js L111](src/lib/dcf.js#L111) 的那份必须保留）。`startsWith('zh')` 出现在 6 处，分隔符也各写一套。**方案**：`format.parseAmount`、`composables/useLocale.js`（`localeCode`/分隔符/双语字段选择）。**0.5 天，低风险**。

### P1-2 过度抽象与死面

- `Coverage` 四个工厂（[coverage.js](src/data/coverage.js)），实际只用 `global()`/`of()`，`ofBestEffort`、`except` 零调用；可退化为 `markets: string[] | null` + `allowUnknown`。
- `RetryClass` 9 项映射（[errors.js L30–40](src/data/errors.js#L30-L40)）最终只区分 3 种反应；可并入 `classify` 的三个分支。
- provider 上的 `notSupported` 属性如果没人读，就不要再加。
- `http` 实例按 provider 各建一个，超时/UA 分散。

**成本**：交接时要读一套只有 5 个源用的"框架"。**方案**：砍到最小接口（`id/priority/capabilities/markets/corsSafe/fetch*`），在 `data/types.js` 用 JSDoc 定义一次。**1 天，低风险**。

### P1-3 魔数与运行期数据混在 `bundled/`

视图 id、指标窗口和 TTL 曾经散落各处。运行期自带数据在 `src/data/bundled/`，财务表定义由应用内置，不再向远程拉视图。

### P1-4 e2e 全是裸选择器

409 处 locator、18 个 spec，最高频选择器被 20 个用例共用；无页面对象。选择器变更成本是全域的。**方案**：`tests/e2e/support/pages/*.js` 页面对象 + 关键契约点加 `data-testid`；视觉断言保留 class。**1–2 天**，分 spec 迁移。

### P2 其余

- [App.vue](src/App.vue) 279 行：头部、页面标题表、快捷键、主题/语言、移动端菜单混在一起 → `SiteHeader.vue`、`usePageTitle`。
- `src/lib` 26 个模块平铺，内核/显示/领域/持久化混排；除内核外按 `display/`、`domain/`、`persist/` 分组（`lib/dcf.js` 路径保持不动，红线依赖它）。
- 命名对 `compare.js`/`compareList.js`、`watchlist.js`/`watchlistView.js` → 目录或 `*View` 后缀统一。
- `measure.js` 257 行、10 个原因码本身合理，但需要 CALCULATION 对照页。

## 4. 建议的目标结构

```
src/
  config/          markets, site, upstream        # 常量与白名单
  lib/dcf.js       # 内核，路径与字节都不动
  lib/display/     format, money, locale
  lib/domain/      sensitivity, multiples, wacc, peers, measure, report
  lib/persist/     storage, cache, manual, archive, watchlist
  data/            types.js, registry, coverage, transport, settings
  data/providers/  eastmoney、edgar、snapshot
  data/bundled/    运行期内置数据
  api/             client, degrade, stock, indicator, index(转出)
  store/           stock, dcf, source, display
  composables/     useStoredPreference, useLocale, usePageTitle, useDcfModel
  components/dcf/  DcfCalculator, DcfForm, DcfResultStrip, ScenarioBar, TemplateMenu, WaccDialog
  components/stock/ 各 tab
  pages/           只做路由与会话编排
```

## 5. 分阶段计划（每阶段结束全门禁绿、单独提交）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| 0（0.5 天） | `ARCHITECTURE.md` + glossary + import 规则 + 契约点 testid | lint/e2e 不变，无行为 diff |
| 1（1 天） | `useStoredPreference`、`parseAmount`、`useLocale`，清掉页面直连 localStorage | 单测新增；e2e 全绿 |
| 2（1–2 天） | 拆 `api/*`，保留门面转出 | 单测按模块迁移；调用点零改动 |
| 3（2–3 天） | 拆 `DcfCalculator` 与 `StockDcfPage` | class 与文案不变，e2e 不改 |
| 4（2–3 天，已做） | 术语迁移（source/provider 分离、cloud 改名、bundled 迁移） | 持久化别名迁移测试 |

**护栏**：每次提交前 `git diff <移植提交> -- src/lib/dcf.js` 必须为空；`PW_BASE=1`、`smoke:pages`、`rehearse:pages`、`audit:contrast` 必跑；显示层搬运不改 CSS class 与文案；出现可见差异必须写 DEVIATIONS。**不要现在做**：全量 TypeScript、换 Quasar/Pinia、移动内核文件、重写 measure。

## 6. 值得保留的部分

内核只有 114 行且被 `kernel-parity` 单测锁住；测量模块"数字或 null + 稳定原因"的契约清楚；数据源有跳过原因、熔断、限流、验证与诊断，比多数同类玩具项目扎实；文档和 e2e 覆盖足以支撑重构。**问题集中、不是弥散**——按 P0 顺序做，两周内可把交接成本降一个量级。
