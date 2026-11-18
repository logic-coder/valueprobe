# 架构与词汇表

这份文档是重构和交接的护栏。改代码前先读这里的层规则；与 HANDOVER.md 的迁移计划配合使用。

## 红线

1. `src/lib/dcf.js` 的 `calGr2fv` 是逐行移植的闭式解，由 `tests/unit/kernel-parity.test.js` 锁住、不再改动；页面估值用同文件的 `presentValue` 与 `residualIncomeValue`。显示层只读它们的结果，不写回。
2. 任何用户可见的行为差异必须写进 `DEVIATIONS.md`，并带理由。
3. 页面/组件可以在显示层格式化内核结果，但不得改写内核输出。测量同理（`lib/measure.js`）。

## 分层与允许的依赖方向

```
config  ──> lib  ──> data  ──> api  ──> store  ──> composables ──> components ──> pages
             ▲                          │
             └──────────── 只允许向左依赖（下层不 import 上层） ────────────┘
```

| 层 | 职责 | 可以 import |
| --- | --- | --- |
| `config/` | 市场白名单、站点信息、上游常量 | 无（或仅 lib 的纯函数） |
| `lib/` | 内核、纯函数、格式化、持久化原语 | config、其他 lib |
| `data/` | 数据源描述、注册表、传输、覆盖、设置 | config、lib |
| `api/` | 面向页面的取数门面：降级、缓存、数据形状 | config、lib、data、store（记录数据状态） |
| `store/` | 跨组件响应式状态 | config、lib、data、api |
| `composables/` | 可复用视图逻辑 | config、lib、api、store |
| `components/` | 展示与局部交互 | config、lib、api、store、composables；子组件 |
| `pages/` | 路由参数、会话编排 | 全部 |

ESLint 的 `no-restricted-imports` 会拦下最常见的反向依赖（lib→store/api/components/pages、data→api/store/components/pages、store→components/pages、components→pages）。新增例外先改文档再改规则。

## 数据流

1. 路由给 `pages/StockDcfPage.vue` 一个符号；页面解析后交给 `store/stock`。
2. `store/stock` 调 `api/index` 的门面方法。
3. 门面先看数据状态（manual），再走 `data/registry`；注册表按能力、覆盖、顺序、熔断、限流挑源并校验。
4. 失败时门面读陈旧缓存并把状态标为 stale；全失败则抛错，页面显示 error 与重试。
5. 成功数据只进入 store/组件；显示格式化走 `lib/format` 与 `useMoney`，绝不回写。

数据状态机：`live → stale | manual | error`，由 `store/dataState` 持有；方向只能由显式动作（重试、转手动、转实时）改变。

## 词汇表（唯一含义）

| 词 | 定义 | 不要用于 |
| --- | --- | --- |
| Provider | 一个数据源描述对象（id、优先级、能力、覆盖、抓取函数） | 用户排序、页面状态 |
| SourcePreference | 用户对源的偏好：全局 `order` 与按符号 `pinned` | Provider 本身 |
| DataState | `live / stale / manual / error` 四态 | 源、构建模式 |
| DataMode | `live / fixture` 构建模式（`VITE_API_MODE`） | 运行期状态 |
| BundledFixture | 应用内置的演示/确定性数据 | 季度快照 |
| Snapshot | `public/data/` 的季度文件，带 `as_of` | 测试 fixture |
| View | 上游的财务指标定义（当前 `1983`） | 路由视图 |
| Kernel | `lib/dcf.js` 的计算函数 | 其余计算 |

存储键保持旧名兼容：`fv-data-sources`（源偏好）、`fv-source-state`（数据状态）。已下线的 provider id（`cloud`、`api`、`upstreamApi`）在读取时丢弃。

## 持久化键

统一走 `lib/storage.js`，页面和组件不直接碰 `localStorage`。新键用 `fv-` 前缀；读取必须容忍 JSON 损坏与未知值。

| 键 | 内容 |
| --- | --- |
| `fv-watchlist` | 自选符号数组 |
| `fv-recent` | 最近查看 |
| `fv-compare` | 比较队列 |
| `fv-source-state` | 每符号 DataState 与来源元数据 |
| `fv-data-sources` | SourcePreference |
| `fv-manual:<symbol>` | 手工输入记录 |
| `fv-archive:<symbol>` | 估值档案 |
| `fv-display-currency` / `fv-theme` / `fv-locale` | 显示设置 |

## 测试契约

- 关键 DOM 点带 `data-testid`（`dcf`、`dcf-result`、`field-discount`、`symbol-input`、`peers`、`data-banner`、`chart-panel`）。新 e2e 优先用 `tests/e2e/support/pages/` 的页面对象。
- CSS class 仍用于视觉与既有测试；重命名 class 属于可见变更，要同步更新测试与 DEVIATIONS。
- 门禁：`npm run lint`、`npm run test`、`npx playwright test`、`npm run smoke:pages`、`npm run rehearse:pages`、`npm run audit:contrast`，以及 `PW_BASE=1` 基路径用例。改 `src/lib/dcf.js` 时 `kernel-parity` 必须照旧通过。
