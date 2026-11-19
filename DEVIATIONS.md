# 行为记录（DEVIATIONS）

`calGr2fv` 的对照数字锁在 `tests/unit/kernel-parity.test.js`。下面记录显示层和输入边界上
故意做的取舍，方便复核。

## D1 · `-Infinity` / `NaN` 显示为 `n/a`

早期版本在折现率为 0、股价为 0 之类的边界下直接把 `-Infinity`、`NaN` 打印在页面上
（例如“安全边际 -Infinity%”“内在价值 NaN”）。

- 位置：`src/lib/format.js` 的 `money` / `percent`，被 `DcfCalculator.vue`、
  `FinancialData.vue` 的所有数值单元格使用。
- 行为：非有限数渲染为 `n/a`；安全边际图标/颜色在 `n/a` 时取中性（灰）。
- 内核不变：`marginOfSafety(8.85, 0)` 依旧返回字符串 `'-Infinity'`。

## D2 · 折现率输入限制在 0–50

早期版本折现率输入框接受任意值，0 会得到 `-Infinity`，80 会得到负的内在价值。

- 位置：`DcfCalculator.vue` 的 `clampDiscount`（`@change` 触发）。
- 行为：输入 → 收敛到 [0, 50] 的整数百分比后再进内核；内核算到的仍是普通数字。
- 未改：快速成长/永续增长率、年数都不夹取（年数只保证 ≥ 0，早期版本同样如此）。

## D3 · 图表默认窗口 3 年

早期版本打开就是 30 年窗口，280px 高的图里大部分是空的，新上市股票更是一片空白。

- 位置：`FinancialChart.vue` 的 `date` 初值。
- 行为：默认 3 年前，日期选择器里仍可选到全部年限。

## D4 · 移除用户自定义模版

早期版本允许用户保存多套 DCF 参数模版，并按估值口径（EPS / 自由现金流）隔离。
这与工具目标冲突——内置的一组默认参数即最佳起点，用户不需要维护自己的模版库。
模版 CRUD、导入导出、`fv-dcf-templates` 持久化及其切换按钮已全部移除；
参数仍可直接编辑，「⋮」菜单中的「恢复默认值」可随时回到内置起点。

## D5 · 手动模式与数据状态提示

早期版本登录/付费功能不在复刻范围内；离线或接口失败时早期版本只有一句空表。

- 位置：`DataStateBanner.vue` + `store/dataState.js`。
- 行为：`live`（无横幅）/ `stale`（黄色“离线快照 + 重试 + 切手动”）/
  `manual`（灰色“手动模式 + 回到线上”）。手动模式下所有输入可直接编辑并落
  `localStorage`，不再发请求。

## D6 · 展示货币换算

早期版本只按股票原币显示，跨市场看估值需要自己换算。

- 位置：`store/display.js`、`lib/fx.js`、`composables/useMoney.js`、页头货币选择。
- 行为：可选 原币 / CNY / USD / HKD。**只折算只读结果**（内在价值、成长价值、永续价值、页头价格），
  换算带 `≈` 前缀，缺汇率显示 `≈ n/a`；可编辑输入保持原币并在卡内注明。
- 不改：内核仍按原币计算，安全边际等百分比不受影响。

## D7 · 兜底来源显式提示

早期版本只有一个数据后端，没有“换源”概念。

- 位置：`data/registry.js` 的诊断 + `DataStateBanner` 的兜底态。
- 行为：非首选来源应答时顶部出现蓝色条，写明兜底来源与各源被跳过的原因，并提供“重试主源”；
  所有来源都失败时改为红色条“所有数据源都失败”，不让页面停在骨架屏上。
- 不改：数值口径与公式；只是让换源可见。

## D8 · 分币种十年期国债作无风险利率

早期版本曾用美国十年期国债 +6% 作折现率，后来改成美国存量国债平均票息，并套用到所有币种。取不到利率时静默用 8%，或对人民币、港币仍用美债，页面上容易看错资本成本。

- 位置：`src/lib/riskFree.js`、`src/api/rates.js` 的 `getRiskFreeRates`、
  `store/dcf.js`、`DcfCalculator.vue` 的折现率行下方提示，以及自选/对比页按币种取率。
- 行为：默认折现率是现金流币种的当地十年期国债向上取整再加 6 个百分点。美元对齐十年期国债，不用存量票息。港币使用美元十年期作为代理（`usd_proxy`）。利率写入市场级 `public/data/rates.json`，不摊进每只股票快照。实时（开发代理或自备网关）> 已提交快照 > 随包内置值；某一币种仍取不到时，该币种回退 8% 并标明，不拿美债顶替人民币。显示币种不改变折现率。自定义折现率和分享链接仍优先。
- 内核：`buildDefaults` 仍是 `ceil(rate)+6`，只是传入的 `rate` 改为该币种已选好的十年期收益率；`null` 或非正数回退 8%。不加分国股权风险溢价。

## D10 · 同行对照

早期版本只有单选中的一家公司，没有同行横截面。

- 位置：`lib/peers.js`（每支股票 4 家同行）、`PeerComparePanel.vue`。
- 行为：并发取同行报价，算中位 P/E、P/BV 与中位 P/E 隐含价，和 DCF 内在价值比一个差；单家取不到只留空格。
  面板靠近视口才取数（IntersectionObserver，200px 预读），首页不会为它先花八次请求。
- 不改：内核、当前股票的取数与状态条；点同行名只是换路由。

## D11 · 估值可导出

早期版本没有导出，参数与结果只能看屏幕。

- 位置：`lib/report.js`、`DcfCalculator.vue` 的导出按钮。
- 行为：把屏幕上的假设、内核三项输出、安全边际、反 DCF、敏感度矩阵、同行与来源拼成 Markdown 下载；
  文件名带代码与时间戳。
- 不改：内核；报告只是当前显示值的快照。

## D12 · 自选股

早期版本靠账户，本地没有跨标的的收藏。

- 位置：`lib/watchlist.js`、`store/watchlist.js`、页头星标与 `/watchlist` 页。
- 行为：本机 localStorage 保存标的最新在前（上限 40），列表页并发取价、可单条移除、空态引导回计算器；
  支持 JSON 导入导出（合并去重）。
- 不改：内核；自选只是导航入口。

## D13 · 独立首页

早期版本没有落地页，直接进具体股票的 DCF 页。

- 位置：`pages/HomePage.vue`、路由 `/`、页头品牌链。
- 行为：首页给出一句话定位、示例标的、自选与方法入口，列出最近打开过的标的（本机，可清空），
  并在下方内嵌默认示例计算器；股票页头部信息在首页隐藏。
- 不改：路由参数与计算逻辑，示例只是往 `/stock/:symbol/dcf` 跳转。

## D14 · 标签页变成真路由

早期版本的标签条只有 DCF 页有内容，其余标签点击无反馈。

- 位置：`pages/StockDcfPage.vue` 的标签分支、`App.vue` 的标签导航、路由 `/stock/:symbol/:tab`。
- 行为：摘要（现价/每股基数/52 周区间/可预测性）、图表（指标下拉 + 指标图 + 表格，选择按标的记忆）、
  财务数据（表格 + CSV 导出）、股东研究（P/E、P/BV、52 周位置速览）各自成页，只有大师交易还是占位说明；
  标签是路由，图表页的指标与区间会写进查询串，链接可还原同一张图；切标签保留查询串。
- 不改：`/dcf` 仍是默认；DCF 工作区与原组件不变。

## D15 · 港股代码补零

上游按五位数字收盘价接口识别港股（`00700`），照抄输入 `HKSE:0700` 会 404。

- 位置：`config/markets.js` 的 `parseSymbol`（输入边界）。
- 行为：港股纯数字代码自动左补零到五位，`HKSE:0700` 与 `HKSE:00700` 等价；其他交易所不动。
- 不改：内核与行情字段；地址栏保留用户输入的写法。

## D16 · 自选股一览带默认估值

早期版本没有自选股，本页的自选此前只有报价和 P/E，仍要逐个点开才知道贵不贵。

- 位置：`pages/WatchlistPage.vue`、`lib/watchlistView.js`。
- 行为：每行按股票页同一套默认假设（该股市种当地十年期国债 + 6 的折现率、盈利十年增速、默认成长窗口）算内在价值与安全边际，
  一次只多一个利率请求；缺报价或算不出时显示 `n/a`。只读展示，不回写任何表单。
  列表同时支持 JSON 与 CSV 首列导入、导出，CSV 行里的港股代码同样补零。
- 不改：内核、股票页的种子与用户手动改过的参数（一览永远按默认假设，避免把某支股票的手调值当成全局设置）。

## D18 · 并排比较

早期版本一次只看一支股票，挑一支就得来回切换。

- 位置：`pages/ComparePage.vue`、`lib/compare.js`、路由 `/compare?s=`。
- 行为：最多五支，同一套默认假设算内在价值与安全边际，按安全边际从高到低排，最佳值加粗；可从自选页一键带过来，
  也可在页内加/删，或用股票页头部的对比按钮攒队列（本机，最多五支，页头图标带回队列）。
  横截面只读，改参数仍回单支页。
- 不改：内核；比较不写任何表单，也不改自选。

## D26 · 首次访问跟随浏览器语言

早期版本只有中文，英文浏览器进来也是中文。

- 位置：`main.js` 的语言默认值（`navigator.language`）。
- 行为：没有保存过选择时，中文浏览器进中文、其他进英文；保存过就按保存值，页头切换仍可覆盖。
- 不改：文案键、路由与渲染；只是首帧的语言默认值。
- 兜底：存的是未知值时当没存过（浏览器语言/系统主题），避免缺键或失效主题。

## D28 · 单一工作流与数据契约

早期版本有两个 workflow（`ci.yml` + `pages.yml`），每次 push 各自跑一遍安装、lint、单测和构建，Actions 分钟翻倍。现合并为 `pages.yml`：push 只跑轻量门禁并部署，Playwright / 对比度 / base-path / rehearsal 只在 PR 跑。

基本面字段早期可在线编辑，与「季度快照是唯一事实源」冲突。现每股收益、每股自由现金流、有形账面价值改为只读（手动模式除外，那是数据源全失败时的兜底）；现价与估值假设仍可编辑。数据契约写入 README / DESIGN / CONTRIBUTING，禁止后续再加基本面 inline 编辑器。


`localStorage` 可能被手改或被旧版本写进未知值。

- 位置：`index.html` 首帧主题、`main.js` 首次语言、`App.vue` 启动主题。
- 行为：`fv-locale` 只认 `zh-hans` / `en-us`，`fv-theme` 只认 `light` / `dark`，其余值等于没存过。
- 不改：正常的保存与切换路径。

## D25 · 离线外壳

静态页面本身不带离线能力，飞机上或断网点开就是浏览器错误页。

- 位置：`public/sw.js`、`main.js` 的生产注册（`import.meta.env.PROD`，dev 不注册）。
- 行为：安装预缓存 `index.html`，导航网络优先、失败回退缓存外壳；同源静态资源缓存优先并回填；
  manifest 提供 192/512 PNG 图标（`scripts/icons.mjs` 从 favicon 渲染）。
  缓存按季度快照照常工作，实时行情仍需联网；每次成功导航会刷新外壳。
- 不改：构建产物哈希与数据请求逻辑。

## D24 · 斜杠聚焦搜索

早期版本没有键盘入口。

- 位置：`App.vue` 的 `keydown` 监听与输入框 `ref`。
- 行为：焦点不在输入控件/可编辑区时，按 `/` 跳到代码查询框并阻止默认输入；在字段里仍是普通字符。
- 不改：搜索逻辑；只是焦点移动。

## D23 · 每页各自的标题

早期版本所有路由共用一个标题，后退历史和收藏看不出是哪支、哪一栏。

- 位置：`App.vue` 的 `pageTitle` 监听、页面文案。
- 行为：股票页标题写成“公司 · 标签 · valueprobe”，静态页写成“页面 · valueprobe”；语言切换会跟着重算。
- 不改：路由与渲染；标题只是 `document.title`。

## D22 · 猜错时的出口

代码猜错或抄错会落到 404 页；早期版本只有一个返回按钮。

- 位置：`pages/StockNotFoundPage.vue`。
- 行为：保留格式说明与支持交易所，另给三条示例标的链接（工商银行 / Apple / Coke），点进去即真实估值。
- 不改：路由与错误判定本身。

## D21 · 裸代码自动判断交易所

早期版本的搜索框只认自由文本，抄一个六位代码进去会落空。

- 位置：`lib/symbolInput.js`、页头查询的 `goSymbol` 与比较页的加号输入（输入边界）。
- 行为：六位数字按首位归上交所（6）或深交所（0/3），1–5 位数字按港股补零，纯字母按纳斯达克；
  带冒号的写法原样保留。只影响跳转前的猜测，`parseSymbol` 仍做最终校验。
- 不改：路由格式、内核；猜错仍是普通的 404 页。

## D20 · 图表代码按需加载

早期版本把图表库打进首屏 chunk，每股页面一打开就先下 158 kB，哪怕读者只看估值结果。

- 位置：`components/LazyFinancialChart.vue`，两处图表用法都换成它。
- 行为：图表组件（连同 echarts）在面板进入视口 300px 内才挂载，实测未滚动时零 echarts 请求；占位 220px 避免布局跳动。
- 不改：图表组件本身与内核；只是挂载时机。

## D19 · 表单与开关的可访问名

早期版本的步进按钮、原始输入框、口径单选框和“加入内在价值”勾选框都只有视觉标签，读屏器念不出来。

- 位置：`components/DcfCalculator.vue` 的 `aria-label`、口径一行的 `role="radiogroup"`、安全边际的 `--accent-strong`。
- 行为：每个步进按钮读作“增加/减少”，每个输入框读作对应字段名，勾选框读作字段名；口径单选框成组并各有名字；
  安全边际百分比、主色文字、日期按钮、表格红绿数字都改走主题 token（`--accent-strong` / `--danger` /`--text-muted`），
  Quasar 的蓝、灰、纯红绿在暗色下达不到 AA。
- 不改：布局、字号与内核；`tests/e2e/axe.spec.js` 用 axe 守住 serious/critical 违规为零。

## D24 · 两种算法

一般公司按每股收益或股东口径的自由现金流折现，明确年限之后有一次有上限的永续。企业自由现金流没有净债务，不折现。港股 `invest` 口径（经营现金流加为负的投资现金流）不是股东自由现金流，默认仍按每股收益，点开时给出更强警告。没有可用历史增速时留空。银行、保险、券商默认按剩余收益：净资产收益率逐年降到折现率，超额回报不会一直持续。页面上可以切换，拿不准就保持建议。判定只看快照里已有的证据：A 股的经营现金流口径、名称里的银行/保险/人寿/证券（港股文件只剩名称可用），以及美股申报里有账面却没有营业利润、且缺自由现金流或收入（JPM、MS、GS）。判定和公式在 `src/lib/financialInstitution.js`、`src/lib/valuationModel.js`、`src/lib/dcf.js`。

## D29 · 12 倍现行利润对照

倍数表里的目标倍数仍由读者改。旁边另有一条固定的 12 倍现行每股收益，表示利润不再增长时大约值多少。

- 位置：`lib/multiples.js` 的 `LONG_RUN_PE`、`MultipleCheckPanel.vue`。
- 行为：只在非银行模型且每股收益为正时显示，并写明不是内在价值。银行走剩余收益时不显示，避免和账面模型抢结论。不进自选和比较。
- 不改：内核、默认折现率和可编辑的目标倍数。

## 明确不在范围内

登录、注册、付费墙、其他标签页（摘要/图表/财务数据/大师交易/股东研究/内部交易）。

公开部署**已支持**：`VITE_BASE` 子路径构建、hash 路由、`.nojekyll` 与 Pages 工作流；
发布前复核项见 README 部署节。

## D30 · 公开口径 v1 冻结

发布数字此前由页面表单的默认值推导，刷新数据后页面与提交物可能各算各的。现在 `src/lib/policy.js` 的 `POLICY_V1` 是唯一口径：参数、模型、窗口、夹取、拒绝与警告全部由它决定，`POLICY_V1_HASH` 用 sha256 锁住，改动必须同时升版本与 hash，否则 `npm run verify:data` 失败。

- 位置：`src/lib/policy.js`、`src/lib/reasons.js`、`scripts/lib/policy-artifact.mjs`。
- 行为：页面与发布值共用 `policyValue()`；拒绝码 / 警告码只增不改；内核 `calGr2fv` 的冻结不变，页面模型仍是 `presentValue` / `residualIncomeValue`。
- 不改：公式本体与 `kernel-parity` 对照数字。

## D31 · 缺失利率、负增长、过期数据保留并标注

早期版本遇到缺失利率、负增长或过期快照会静默换值或直接不给结果。现在一律照常出值，并带 warning：

- `RATE_FALLBACK`：取不到当地十年期利率，折现率回退 8%（不静默改用美债，港币代理除外）。
- `NEGATIVE_HISTORY_GROWTH`：历史增速为负，照常外推并披露。
- `STALE_DATA` / `STALE_PRICE`：快照或价格过期，只标注，不拒绝；发布闸门另行拒绝过期 artifact。
- `DISCOUNT_CLAMPED` / `PRICE_MISSING` / `CAPPED_GROWTH` / `GROWTH_ABOVE_RETENTION` 同理只披露。
- 位置：`src/lib/policy.js`、`src/i18n/legal-messages.js`、`docs/POLICY.md`。
- 不改：拒绝码仍只用于输入确实不够的情况（`NO_SNAPSHOT` / `NO_EPS` / `NON_POSITIVE_EPS` / `NO_GROWTH` / `NO_BOOK` / `NOT_FINITE`）。

## D32 · 折现率按报价币种取

折现率跟随报价/现金流币种（`discount.currency = quote`），不跟显示货币。港币用美元十年期作代理（`usd_proxy`）；人民币不会拿美债顶替；取不到时用 8% 兜底并标注。

- 位置：`src/lib/riskFree.js` 的 `rateForCurrency` / `cashflowCurrency`、`src/lib/policy.js`。
- 行为：同一份 A/H 对照报告会因两个市场的报价币种、EPS 口径与增速口径出现差异，这是披露对象，不平均、不仲裁。
- 不改：显示货币只影响读数换算，不改折现率与发布值。

## D33 · 内在价值与情景/基准假设区分

产品只把公开口径算出的数称为「内在价值 / Intrinsic value」。页面上的「基准假设」「情景」是交互预设，不是第二个发布值：它们不改写 artifact，也不进入发布口径。

- 位置：`src/lib/scenarios.js`、结果区的 policy-value 展示、`src/i18n/legal-messages.js`（`policy_seed` / `policy_scenario` / `policy_value_title`）。
- 行为：结果条写「内在价值 · 公开口径 v1」，并给计算 asOf 与当前快照的 provenance；情景只切假设。
- 文案：用户可见的英文统一为 “Intrinsic value”，中文统一「内在价值」；不再用“fair value”作产品自称。

## D34 · 宇宙替换与 150 只全量

公开宇宙固定 150 只（`scripts/watchlist.json`），`public/data`、`catalog.json`、artifact entries 必须一致。两处替换：

- `HKSE:00823`（领展房产基金）东方财富无可用数据 → `HKSE:00002`（中电控股）。
- `NYSE:XOM` 的 ticker 在 2026 年指向新的控股实体、SEC facts 不可用 → `HKSE:00066`（港铁公司）。

- 位置：`scripts/watchlist.json`、`public/data/`、`scripts/policy-values.mjs`。
- 行为：替换只换标的，不改口径；universe 检查不通过时 `verify:data` 直接失败。
- 不改：拒绝出值的 27 只仍留在宇宙里并如实标注原因，不为了凑数换掉。

## D35 · 数据 artifact + manifest + verify:data

可复现的发布值：`npm run intrinsic` 生成 `public/data/intrinsic/v1.json` 与 `public/data/manifest.json`；`npm run verify:data` 用同一构建函数重算并比对字节、policy hash、universe、manifest sha256、过期时间与抽样记录。

- 位置：`scripts/policy-values.mjs`、`scripts/lib/policy-artifact.mjs`、`scripts/verify-data.mjs`、`tests/unit/data-contract.test.js`。
- 行为：artifact 是唯一发布值，页面只读 artifact；提交面数据必须同时提交 artifact 与 manifest，否则闸门失败。
- 不改：`npm run verify` 链（lint → test → test:real → verify:data → smoke:pages）。

## D36 · 方法页与免责

公开站增加 `#/method` 方法页，集中说明模型、口径参数、拒绝/警告代码、数据刷新与复现、局限与免责；页脚、关于页与结果区都有入口。用户可见文案：免费、无账户、无个性化；估算、非投资建议。

- 位置：`src/pages/MethodPage.vue`、`src/router.js`、`src/App.vue`、`src/pages/AboutPage.vue`、`src/i18n/legal-messages.js`、`docs/POLICY.md`。
- 行为：参数表与代码表由 `src/lib/policy.js`、`src/lib/reasons.js` 的导出生成，政策升版自动跟随；发布事实从 `public/data/manifest.json` / artifact 读取，不复制易漂移数字。
- 不改：页面不提供账户、保存、个性化推荐；方法说明不进入计算。

## D37 · 移除分享与打印

分享和打印入口已整体移除：股票页的分享按钮与剪贴板、估值参数形式的链接、比较页的“复制比较链接”、页头的打印按钮与 `print.css`、图表组件的 `beforeprint` 补挂，以及对应文案、单测与 e2e。

- 位置：`DcfCalculator.vue`、`DcfHeader.vue`、`ComparePage.vue`、`App.vue`、`StockDcfPage.vue`/`DcfTab.vue`、`lib/permalink.js`、`styles/print.css`、`main.js`、`LazyFinancialChart.vue`、`i18n/*.json`。
- 理由：公开值的版本闭环（分享链接带 policy/asOf、打印带版本与免责）不在本轮范围；保留无版本标注的分享/打印入口，会让读者拿到不可追溯的“内在价值”，比没有入口更危险。
- 行为：URL 查询串仍用于比较队列与图表指标选择，但不再回填估值假设；旧链接打开时按默认假设显示，不报错。
- 历史：D9、D17 随功能一并删除，编号不复用；实现见 git 记录。
- 不改：内核、默认口径与数据产物。
