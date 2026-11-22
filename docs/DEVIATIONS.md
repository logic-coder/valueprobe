# 行为记录（DEVIATIONS）

## 个股首屏的保守假设对照

默认显示当前参考报价下的三种安全边际，共用零线和尺度。先将起始盈利降低 20%，再把股权折现率提高 1 个百分点；普通公司同时将起始增速降低 3 个百分点，金融模型保留发布的账面价值和增速。报价变化时只更新边际和价格隐含要求。用户修改估值假设后，上方继续显示个人试算，下方清楚标识发布口径的对照，以便直接比较；无发布估值、无正报价及手动建模时不展示该对照。对照不写入计算器、自选、比较或归档。小屏取消结果栏吸顶，使下方参数始终可达。

方法页提供[十年历史检验数据](../public/research)。研究使用独立复算命令，个股页只读取显示所需的发布值。

`calGr2fv` 的对照数字锁在 `tests/unit/kernel-parity.test.js`。下面记录显示层和输入边界上
故意做的取舍，方便复核。

## D1 · `-Infinity` / `NaN` 显示为 `n/a`

早期版本在折现率为 0、股价为 0 之类的边界下直接把 `-Infinity`、`NaN` 打印在页面上
（例如“安全边际 -Infinity%”“内在价值 NaN”）。

- 位置：`src/lib/format.js` 的 `money` / `percent`，被 `DcfCalculator.vue`、
  `FinancialData.vue` 的所有数值单元格使用。
- 行为：非有限数渲染为 `n/a`；安全边际图标/颜色在 `n/a` 时取中性（灰）。
- 安全边际仅对有限正报价和有限正估值计算。清空报价、输入 0 或没有有效估值时显示 `n/a`。

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
- 行为：每行读取与股票页同一条发布估值记录，
  一次只多一个利率请求；缺报价或算不出时显示 `n/a`。只读展示，不回写任何表单。
  列表同时支持 JSON 与 CSV 首列导入、导出，CSV 行里的港股代码同样补零。
- 不改：内核、股票页的种子与用户手动改过的参数（一览永远按默认假设，避免把某支股票的手调值当成全局设置）。

## D18 · 并排比较

早期版本一次只看一支股票，挑一支就得来回切换。

- 位置：`pages/ComparePage.vue`、`lib/compare.js`、路由 `/compare?s=`。
- 行为：最多五支，读取同一批发布值，按安全边际从高到低排，最佳值加粗；可从自选页一键带过来，
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

## D44 · 斜杠聚焦搜索

编号曾与下文的 D24 重复，现改用唯一编号。

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
- `STALE_DATA` / `STALE_PRICE`：快照或价格过期，只标注，不拒绝；发布校验另行拒绝过期发布值文件。
- `DISCOUNT_CLAMPED` / `PRICE_MISSING` / `CAPPED_GROWTH` / `GROWTH_ABOVE_RETENTION` 同理只披露。
- 位置：`src/lib/policy.js`、`src/i18n/legal-messages.js`、`POLICY.md`。
- 不改：拒绝码仍只用于输入确实不够的情况（`NO_SNAPSHOT` / `NO_EPS` / `NON_POSITIVE_EPS` / `NO_GROWTH` / `NO_BOOK` / `NOT_FINITE`）。

## D32 · 折现率按报价币种取

折现率跟随报价/现金流币种（`discount.currency = quote`），不跟显示货币。港币用美元十年期作代理（`usd_proxy`）；人民币不会拿美债顶替；取不到时用 8% 兜底并标注。

- 位置：`src/lib/riskFree.js` 的 `rateForCurrency` / `cashflowCurrency`、`src/lib/policy.js`。
- 行为：同一份 A/H 对照报告会因两个市场的报价币种、EPS 口径与增速口径出现差异，这是披露对象，不平均、不仲裁。
- 不改：显示货币只影响读数换算，不改折现率与发布值。

## D33 · 内在价值与情景/基准假设区分

产品只把公开口径算出的数称为「内在价值 / Intrinsic value」。页面上的「基准 / 牛市 / 熊市」情景预设是交互状态，不是第二个发布值：它们不改写发布值文件，也不进入发布口径。

- 位置：`src/lib/scenarios.js`（情景预设）、`src/pages/MethodPage.vue`（版本与发布事实）、`src/i18n/legal-messages.js`。
- 行为：股票页沿用原有结果条与表单，不再额外渲染重复的发布值面板；政策版本、asOf 与覆盖率在方法页展示；情景只切假设。
- 文案：用户可见的英文统一为 “Intrinsic value”，中文统一「内在价值」；不再用“fair value”作产品自称。

## D34 · 覆盖清单替换与历史 150 只全量

150 只是历史发布规模。当前公开覆盖以 `scripts/watchlist.json` 为准（现为 500 只），`public/data`、`catalog.json`、发布值文件的 `entries` 必须一致。两处替换：

- `HKSE:00823`（领展房产基金）东方财富无可用数据 → `HKSE:00002`（中电控股）。
- `NYSE:XOM` 的 ticker 在 2026 年指向新的控股实体、SEC facts 不可用 → `HKSE:00066`（港铁公司）。

- 位置：`scripts/watchlist.json`、`public/data/`、`scripts/policy-values.mjs`。
- 行为：替换只换标的，不改口径；universe 检查不通过时 `verify:data` 直接失败。
- 不改：发布时拒绝出值的 27 只（当前数量以发布值文件为准）仍留在覆盖清单里并如实标注原因，不为了凑数换掉。

## D35 · 发布值文件 + manifest + verify:data

可复现的发布值：`npm run intrinsic` 生成 `public/data/intrinsic/v2.json` 与 `public/data/manifest.json`；`npm run verify:data` 用同一构建函数重算并比对字节、policy hash、universe、manifest sha256、过期时间与抽样记录。

- 位置：`scripts/policy-values.mjs`、`scripts/lib/policy-artifact.mjs`、`scripts/verify-data.mjs`、`tests/unit/data-contract.test.js`。
- 行为：发布值文件是唯一的对外发布值，自选、对比与方法页只读它；提交面数据必须同时提交发布值文件与 manifest，否则校验失败。
- 不改：`npm run verify` 链（lint → test → test:real → verify:data → smoke:pages）。

## D36 · 方法页与免责

公开站增加 `#/method` 方法页，集中说明模型、口径参数、拒绝/警告代码、数据刷新与复现、局限与免责；页脚与关于页都有入口。用户可见文案：免费、无账户、无个性化；估算、非投资建议。

- 位置：`src/pages/MethodPage.vue`、`src/router.js`、`src/App.vue`、`src/pages/AboutPage.vue`、`src/i18n/legal-messages.js`、`POLICY.md`。
- 行为：参数表与代码表由 `src/lib/policy.js`、`src/lib/reasons.js` 的导出生成，政策升版自动跟随；发布事实从 `public/data/manifest.json` / 发布值文件读取，不复制易漂移数字。
- 不改：页面不提供账户、保存、个性化推荐；方法说明不进入计算。

## D37 · 移除分享与打印

分享和打印入口已整体移除：股票页的分享按钮与剪贴板、估值参数形式的链接、比较页的“复制比较链接”、页头的打印按钮与 `print.css`、图表组件的 `beforeprint` 补挂，以及对应文案、单测与 e2e。

- 位置：`DcfCalculator.vue`、`DcfHeader.vue`、`ComparePage.vue`、`App.vue`、`StockDcfPage.vue`/`DcfTab.vue`、`lib/permalink.js`、`styles/print.css`、`main.js`、`LazyFinancialChart.vue`、`i18n/*.json`。
- 理由：公开值的版本闭环（分享链接带 policy/asOf、打印带版本与免责）不在本轮范围；保留无版本标注的分享/打印入口，会让读者拿到不可追溯的“内在价值”，比没有入口更危险。
- 行为：URL 查询串仍用于比较队列与图表指标选择，但不再回填估值假设；旧链接打开时按默认假设显示，不报错。
- 历史：D9、D17 随功能一并删除，编号不复用；实现见 git 记录。
- 不改：内核、默认口径与数据产物。

## D38 · 个股页头条即公开口径值，编辑只在本页生效

早期个股页把一套空白计算器交给读者，头条显示计算器结果；发布值只在自选、对比、方法页出现。同一只股票因此可能出现两个不同的内在价值头条。

- 行为：覆盖范围内且有发布值的股票，头条直接显示发布值文件里的 `value`、`marginOfSafety`、独立的财报期间与报价日期，以及发布日和政策版本，并在标题处标为「ValueProbe 公允价」。计算器从同一条 entry 的 `inputs` 播种，所以未编辑时头条等于发布值。
- 编辑：改股价或任一假设只改本页的响应式状态，头条随即标为「试算」并说明不影响公开口径；「恢复默认值」回到发布输入。编辑不写回 `src/lib/policy.js`、`public/data/intrinsic/v2.json`、`manifest.json`，也不进入跨页共享状态。
- 非覆盖 / 政策拒绝出值的股票：明确显示「暂无公开估值」及原因（或「不在公开覆盖清单内」），下方仍可试算，但不冒充官方结论。
- 位置：`DcfCalculator.vue`（播种、编辑标记、恢复）、`dcf/DcfResultBar.vue`（标题与口径行）、`styles/dcf.css`、`i18n/legal-messages.js`、`tests/e2e/dcf.spec.js`。
- 理由：目标是让读者打开一只覆盖内的股票就看到「在既定政策下它值多少、相对现价的安全边际、算到哪一天、依据哪一版政策」；同时保留改参数做对比的能力。两者不能是两套并列的数字，否则读者无法判断哪个是发布结论。
- 文案取舍：产品标题使用「ValueProbe 公允价 / ValueProbe fair value」，但免责声明「估算，非投资建议」紧随其后；除了这一个标题键，法务文案仍禁用「官方 / official / 公允价 / fair value」自称。
- 不改：`POLICY_V1`、发布值生成、hash 与数据校验；编辑不产生任何发布物。

## D39 · 自由现金流口径说明不再承诺不存在的展开

`invest` 口径的提示原文写「可以点开查看」，但横幅没有点击目标，快照也只存了结果数，没有经营现金流、投资现金流与资本开支的构成项。37 只 `invest` 口径股票的个股页都挂着这句无法兑现的话。

- 行为：三处（中英文案与 `docs/CALCULATION.md`）删除「可以点开查看 / You can inspect it」，改为「构成未在本站拆开列示，核对请看财报原文」。公式改述为 OCF − 投资现金流出，避免两次符号换算。
- 行为：该提示只在读者选择「基于每股自由现金流」时出现；选每股收益时不再显示与当前计算无关的全宽橙色警告。保留时用中性信息条（ℹ），警告样式留给真正影响当前结果的事。
- 理由：不承诺页面做不到的操作；数据层若要支持「查看构成」需同时改快照 schema、重跑全量快照与发布值，东财口径下也未必能拆出收购与金融投资，成本与收益不匹配。
- 位置：`DcfCalculator.vue` 口径区、`i18n/zh-Hans.json` 与 `en-US.json` 的 `fcf_basis_invest`、`docs/CALCULATION.md`；回归测试在 `tests/unit/copy-policy.test.js`。
- 不改：快照、发布值、政策与计算口径；`invest` 口径仍照常给出对照用的自由现金流数。

## D40 · 个股页信息去重

同一个值或同一句提示在同屏出现两次，会让人分不清哪个是原件、哪个是结果：

- 股价曾在页眉（可编辑）与计算器（可编辑）各出现一次，两处经 `workingPrice` 双向同步。现在页眉是唯一编辑入口，计算器内改为只读回显并注明「现价在页眉修改」。`result.stockPrice` 仍由 `workingPrice` 写入，估值与「试算」状态标记不变。
- 快照价只在页眉旁注「快照 ¥8.85」出现一次；数据横幅简化为「季度快照 · 数据截至 {asOf}」，不再重复「股价不是实时报价」。
- 同页两个「数据截至」分别是快照日与发布日，容易误读为同一日期冲突。结果条改用「发布日 / published」，只取 artifact 的 `generatedAt`；快照日仍叫「数据截至」。
- 计算器内「每股收益、自由现金流和账面价值取自季度快照，在这里只读」与数据横幅语义重复，删除该条及两个 locale 的文案键。
- 内在价值的可见数字与 `sr-only` 播报、结果条与方法页的免责声明不在同屏重复，**保留**。

- 位置：`DcfCalculator.vue`、`App.vue` 旁注未变、`i18n/zh-Hans.json`、`i18n/en-US.json`、`i18n/legal-messages.js`、`styles/dcf.css`、E2E 与 `tests/unit/copy-policy.test.js`。
- 理由：在「官方价默认 + 本地试算」模型下，编辑入口必须唯一，否则读者不知道改的是哪一份状态；日期标签必须区分数据源日期与发布日，否则无法判断数据的新鲜度。
- 不改：发布值、政策、计算口径、页眉改价链路与 `isEdited` 状态机。

## D41 · 第二阶段、续营与反推共用一个有效终值增速

折现率不高于终值增速时，按原始输入做永续资本化没有有限正值。v1 在 `r = g` 时撤掉续营，造成估值期限跳变。v2 统一现金路径采用的有效增速。按同一组起始增长和现金，v1、v2 的跨界数值见 [RELEASE_V2.md](RELEASE_V2.md#终值区间与冻结对照)。

- 行为：`unroundedPresentValue` 先算 `gc = min(terminalGrowth, r − 2)`，第一阶段的增速衰减目标、第二阶段逐年的增速、续营资本化三处都用 `gc`。续营始终计入，不再因 `r ≤ g` 消失；`r = g = 10` 时 `gc = 8`，三个相邻终值增速得到同一个数（55.8）。`terminalValue` 仍等于第二阶段有限价值加续营价值，另返回 `finiteTerminalValue` 与 `continuationValue`，页面把两者分开显示。
- 披露：`effectiveTerminalGrowth` 返回实际采用的 `gc`，现行政策以 `TERMINAL_CAPPED` 披露发生封顶。调整折现率可能同时改变有效增速。
- 反推：页面用 `impliedGrowth` 反推同一条衰减路径。`calculateReverse` 和 `calGr2fv` 保留旧有限年金对照，金样本为 0.71%。有限等比级数在比率等于 1 时取极限，两侧连续。
- 利率取值域：零和负收益率不再一律回退 8%。负值照常取 `ceil(yield) + 6` 后夹到 [0, 50]；负值足够深时 `gc` 可为负，三个阶段仍同号。
- 位置：`src/lib/dcf.js` 的 `unroundedPresentValue` / `presentValue` / `calculateReverse`、`src/lib/policy.js` 的 `policyDiscountRate` 与发布分支、`src/lib/riskFree.js` 的 `pick`、`DcfCalculator.vue` 的阶段面板与 `stageNote`。
- 审计：`eval/audit-hi.mjs`。冻结数据 40 只残差样本的正常折现率都高于 4%，续营项逐条保留；残差矩阵以 1% 为中心时 20 格有 5 格折现率为 0 或负，明确为空。
- 测试：`tests/unit/terminal.test.js`、`tests/unit/dcf.test.js`、`tests/unit/policy.test.js`、`tests/unit/kernel-parity.test.js`。

## D42 · 残差区间用同一模型扰动折现率

残差区间的上限此前取 `enduringBookValue`，那是条件续营情景而不是区间端点。冻结的 40 只已发布残差样本里，旧上限有 13 只与基准值完全相等，区间塌成一点。

- 行为：低值、基准、高值都由 `residualIncomeValue` 计算，只在折现率上作 ±2 个百分点扰动，收敛目标随折现率同步移动；基准仍是发布头条。端点没有超过基准时不补宽、返回 `null`，结果条只渲染真实存在的半边并显示「区间缺项」。
- 缺口：`r − 2 ≤ 0` 时高值无法计算，保留缺项；折现率调节下限为 0，当前发布样本尚未触发。
- 位置：`src/lib/dcf.js` 的 `valueBand` / `residualIncomeBand` / `orderBand`、`src/lib/policy.js` 的区间发布、`dcf/DcfResultBar.vue`。
- 审计：`eval/h-band.json`，40 只逐条旧区间与新区间，O / WELL / PSX 为旧口径误分流样本。
- 测试：`tests/unit/band.test.js`。

## D43 · 反推仍用旧内核，只在测试里作历史对照

`calculateReverse` 解的是固定增速的 `calGr2fv`，页面正向值走 `presentValue` 的线性衰减路径，两者对同一组参数本来就会不同（601398 金样本：旧反推 0.71%，衰减模型反推约 −7.34%）。页面正向与 `impliedGrowth` 成对，反推面板也只读 `impliedGrowth`。

- 行为：`calculateReverse` 的旧有限年金金样本锁在 `kernel-parity`。页面只读取 `impliedGrowth`。`calGr2fv` 两段的等比系数各自处理，等于 1 时取有限级数极限。
- 位置：`src/lib/dcf.js` 的两个内核、`tests/unit/kernel-parity.test.js`、`tests/unit/dcf.test.js`。
- 不改：页面正向调用、金样本数值、`impliedGrowth` 契约。

## D45 · EPS 与利率边界按有限数判断，零值不再当缺失

旧选择器用真值判断（`stock.ttm_eps_nri ? … : …`），显式 0 会落到下一口径或变成缺失；发布脚本只接受大于 0 的利率，快照里的零和负收益率到不了政策。两处都可能把真实观测改写成另一个数。

- 行为：`preferredEps()` 依次取 `ttm_eps_nri`、`ttm_eps`，只跳过 `null`、`undefined`、空串和非有限数；0 与 `'0'` 保留。发布与页面共用这一函数。利率只跳过缺失，有限数（含 0 和负值）都进入 `ceil(yield) + 6` 再夹到 0–50；只有缺失才回退 8%。`readRates()` 不再丢掉 `≤ 0` 的行。
- 残差模型在折现率 0 时没有贴现，全部超额收益保留、账面按 ROE 复利；区间上沿因 `r − 2 ≤ 0` 留空。这是夹取后的边界值，不是可长期维持的 0% 股权成本。
- 位置：`src/lib/dcf.js` 的 `preferredEps`/`buildDefaults`/`residualIncomeValue`、`src/lib/policy.js`、`src/lib/riskFree.js`、`scripts/lib/policy-artifact.mjs` 的 `readRates`。
- 审计：`eval/i-boundary.json`（残差矩阵零利率一侧为空）。
- 测试：`tests/unit/policy.test.js`（0/`'0'`/空串/非法值、`NON_POSITIVE_EPS`、速率 60 与 −100 两端、0 → 6%、−2.5% → 4%）、`tests/unit/riskFree.test.js`、`tests/unit/data-contract.test.js`、`tests/unit/sensitivity.test.js`。
- 不改：拒绝非正 EPS 的 `NON_POSITIVE_EPS` 语义；上限 50 与 `DISCOUNT_CLAMPED`。

## D46 · A/H 对照从倍数差改为逐项差异桥

旧 `crossListing` 只给 EPS 折算差、增长差和估值倍数差，读者无法知道估值差来自哪一项；页面也没有展示。

- 行为：H 的 EPS、账面值和估值先按 `fxToA` 折成 A 股币种，再分别给出 EPS、增长、账面值和折现率差及原因码。`valueDiffPct` 改为 `valueHInA / valueA − 1`（负值＝H 更低），方向与其它差值一致。`aligned` 只要求 EPS 差 ≤5%、增长差 ≤2 个百分点、期间相同，折现率差只作为 `RATE_CURRENCY` 原因披露。方法页表格逐组展示，未估值记 `not-valued`。
- 已知常量：H 股一律走美元十年期代理，A 股走人民币，因此每组折现率差都是 −4 个百分点；`aligned` 不代表估值相同。
- 位置：`scripts/lib/policy-artifact.mjs` 的 `crossListingOf`、`src/pages/MethodPage.vue`、`src/i18n/legal-messages.js`。
- 审计：`eval/k-cross.json`。
- 测试：`tests/unit/data-contract.test.js`、`tests/unit/policy.test.js`。
- 不改：`listingGroups` 的 9 组标的与汇率来源；不平均、不回写任何一方发布值。


## D47 · 刷新结果接入发布闸门与批次摘要

旧刷新最后只按“artifact 构建问题”拦截；报价或财报整批失败、定向代码缺数据、覆盖骤降都可能被当作成功发布，且没有状态区分新期间、无更新和失败保留。

- 行为：刷新记录模式、范围（all/targeted/candidates）、逐标的报价与财报结果和逐币种利率结果。结果分新期间、已核验无更新、失败保留旧值（failed-kept）、失败且无旧值（failed-missing）、明确跳过。整批必需链路全失败、定向代码失败、估值数跌破上一批 90%、拒绝数增加超过 max(5, 声明数 2%)、任一市场失去全部估值、没有任何可用利率时状态为 blocked，命令非零退出且不安装暂存。局部失败保留旧记录与真实期间/日期，状态 partial，继续发布。
- 发布文件新增 `public/data/publish.json`：`schema`、`status`（ok/partial/verified-unchanged/rebuilt/blocked）、`blocked[]`、`partial[]`、`mode`、`scope`、`rates`、`generatedAt`、`upstreamCheckedAt`、`latestPeriod`、`batch`、`previousBatch`。`batch` 是本次 artifact 与 manifest 精确写入字节的 sha256；安装/回滚包含该文件。
- CI：`verify:data` 要求 publish 存在、状态非 blocked、`batch` 等于重算文件、`generatedAt` 等于 artifact 日期、`upstreamCheckedAt` 不早于生成日、`latestPeriod` 等于 artifact 最大报告期。手工 `npm run intrinsic` 也写同批 `rebuilt` 状态，避免摘要在手工重算后失效。
- 失败语义：必需链路全挂时暂存文件仍写出，已发布 artifact/manifest/publish 保持原字节，前次成功批次的日期不前移；报告路径和原因输出到 stderr。
- 位置：`scripts/lib/publish-gate.mjs`、`scripts/snapshot.mjs`、`scripts/policy-values.mjs`、`scripts/verify-data.mjs`、`scripts/lib/snapshot-install.mjs`、`scripts/pages-smoke.mjs`、`scripts/lib/policy-delivery.mjs`。
- 测试：`tests/unit/publish-gate.test.js`（首跑、全失败、定向失败、部分保留、无更新、覆盖/拒绝/市场退化、利率、摘要与就绪）、`tests/unit/snapshot-refresh.test.js`（publish 随安装回滚）。
- 不改：阈值来源是上一发布批次的覆盖；不是 120 天统一拒绝线。指标年龄仍只警告。

## D49 · 验收修正：发布事务、行业证据、共同终值域与冻结回放

发布验收退回 `6225f78` 后，以下问题按根因修正；v2 字节与发布证据随之更新。

- 发布事务：安装日志现在同时记录新快照和本批首次出现的发布资产（含 `intrinsic/v2.json`、`publish.json`）。回滚恢复旧发布并删除本批新增的每个文件；首次升级失败用无 v2/publish 的直播目录回归（`tests/unit/snapshot-refresh.test.js`）。
- 发布状态：报价是否更新改由 `useQuote` 比较，旧日期报价不再算 `updated`。本机 `npm run intrinsic` 继承上一批的真实核验时间，没有则写 null；`verify:data` 对本地重建允许未知或更早的核验时间，对在线刷新仍要求不早于生成时间。
- 行业证据：13 家仅因缺列被归为金融的美国公司补入监管来源。O、WELL、PSX 改为仅试算，以 `INDUSTRY_MODEL_PENDING` 保留适用限制。复核条件见 [RELEASE_V2.md](RELEASE_V2.md)。
- 共同终值域：第一阶段淡出目标、第二阶段与续营价值都用 `min(gT, r−2pp)`。同参算例在三个跨界点的 v2 值均为 55.80，续营 38.57，页面分列有限第二段及续营，反推走同一函数。
- 有限年金：`calGr2fv` 在 g>r 时不再把终值窗口置零，有限几何级数在 g=1 两侧连续；隔离算例不再从 15.22 跳到 8.44。
- 冻结回放：`scripts/research/kernel-v1.mjs` 保留 v1 策略、哈希和分类器。`npm run research:check` 核对企业行、汇总和政策哈希；`factsSha256` 会随后续 SEC 申报变化，不参与比对。CI 按冻结名单下载两批财报后运行同一检查，并保留冻结内核向量和现金路径工件校验。精确字节可解压本地档案对照。较大的原始缓存保留在本地。
- 快照年龄：读取已保存快照时不再按今天检查报价年龄，日期由策略披露（`STALE_PRICE`）；快照作为历史事实继续可读。
- 浏览器上传闸门：使用部署产物运行同版本、搜索、仅试算及 axe 检查。配置错误会使指定的门禁失败。静态冒烟与浏览器共用生产 `dist`。
- 发布证据：报价按实际暂存结果归类。全失败或仅沿用本地记录时保留原核验时间。CI 校验 Git 历史批次链，新克隆可运行 `npm run audit:policy:diff` 复算。
- 提交范围：内部研究、档案与 `eval/` 留在本地；工程修复与待批准的 v2 政策发布分成两个提交，发布提交包含版本、工件、manifest 与发布记录。
- 位置：`scripts/lib/publish-gate.mjs`、`scripts/lib/snapshot-install.mjs`、`src/lib/{dcf,policy,financialInstitution,reasons}.js`、`src/config/industry.js`、`src/data/registry.js`、`scripts/research/*`、`tests/unit/*`、`docs/RELEASE_V2.md`。

v2 改变模型路由、残差区间和终值边界，不能沿用 v1 标识覆盖旧字节。发布边界要求先在同一冻结快照上做全量前后差异，再给新版本号并归档旧版。

- 基线：`public/data/intrinsic/v1.json` 保持提交 `f4fb58a` 的释放字节，`generatedAt` 2026-11-20，sha256 `51312f479d4da2ada8e5f6caa4da3ee628d63df4071d91ddd7d5aa39bd61776b`；安装清单保留该文件，应用不再读取。
- 当前：`public/data/intrinsic/v2.json`，500 条中 407 条有公开值。三个改道标的保留输入和行业证据，页面仅提供试算。生成日与哈希见 [v2 发布记录](RELEASE_V2.md)。
- 差异：存档 v1 与现行 v2 可用 `npm run audit:policy:diff` 全量核对，保留估值的头条一致。
- 决定记录：`docs/RELEASE_V2.md`（理由、样例、验证、回滚）。研究接续条件保留在本地研究稿，不把 v2 结果回写成历史 v1 结论。
- 位置：`src/lib/policy.js`（版本、revision、派生路径）、`scripts/lib/policy-artifact.mjs`、`scripts/pages-smoke.mjs`、`public/data/intrinsic/*`、`docs/RELEASE_V2.md`。
- 测试：v1→v2 差异脚本 `eval/v2-diff.mjs`；全量单测 451、lint、20 项 `verify:data` 通过；生产构建与 Playwright 受本机子进程限制本轮未重跑，仍以 CI 为准。
- 回滚：把 `ARTIFACT_PATH` 指回 v1 并恢复 `pages-smoke` 的版本断言，或 revert 发布提交；v1 哈希用于核对，不覆盖归档。

### D49 现金口径只做公开发布值的对照

2026-11-22。TTM 收益在一次性项目和周期低点时会失真，但研究中的现金候选还不足以替换发布基数，于是把现金结果作为并列核对，不改 `value`、区间、反推或安全边际。

- 基数：最近三个财年每股经营现金流减资本开支（`free_cash_flow_per_share`）全部为正时取中位数；少于三年或任一年非正数为空。必须按财年位置取，不能取最近三条非空值，否则拆股前的旧单位会混入（如 COP）。
- 计算：只对一般公司，沿用同一组窗口、折现率、终值和 `presentValue`，结果四舍五入到分。金融机构因基数本身是收益，不做现金核对。
- 披露：entry 新增 `cash: { value, base, gapPct } | null`，页面显示核对值和差距；绝对差距 ≥50% 加 `CASH_DIVERGENCE`。
- 规模：273/407 条有可用现金基数，绝对差距中位数 3.84%，10% 分位 −43.83%，90% 分位 +68.46%，55 条触发警告；GPC 由 EPS 0.26 的 1.13 对照出中位现金 4.8966 的 21.26。
- 位置：`src/lib/dcf.js`（`sustainableCashBase`）、`src/lib/stockRecord.js`、`src/lib/policy.js`、`src/lib/reasons.js`、`scripts/lib/policy-artifact.mjs`、`DcfResultBar.vue`、`DcfCalculator.vue`、i18n 与样式。
- 测试：`tests/unit/dcf.test.js`（中位数、少于三年/空值/非正数为空）、`tests/unit/policy.test.js`（差距警告、空基数不加警告、发布值不变）；`verify:data` 全过。
- 限制：现金同样是单点 TTM + 历史增速外推，没有现金桥；REIT 的维护性资本开支和炼化的周期正常化仍未处理。
