# 发布 v2：模型路由、区间与输入边界

本文件是 [ENGINEERING_REVIEW_HANDOFF.md](ENGINEERING_REVIEW_HANDOFF.md) 发布边界的发布记录。v2 在同一份冻结快照（`generatedAt` 2026-11-21）上重算，逐条对照已发布的 v1，明确区分可审计的输入纠正与政策变化。没有沿用 v1 标识覆盖旧结果。

## 基线归档

- 冻结基线：`public/data/intrinsic/v1.json`，来自提交 `f4fb58a` 的释放字节，`generatedAt` 2026-11-20，sha256 `51312f479d4da2ada8e5f6caa4da3ee628d63df4071d91ddd7d5aa39bd61776b`。
- 该文件不再被应用读取，安装清单仍带有它，Pages 上可直接下载复现。
- 基线元数据与哈希另存 `eval/v2-baseline.json`；重算脚本不会写这个文件。

## 当前发布

- `public/data/intrinsic/v2.json`，`generatedAt` 2026-11-21，sha256 `490188d047a11082da199e820c6899fefae4bb683e169af1444511d319d1f9e5`。
- 覆盖仍为 500 条：410 条有值、90 条拒绝；拒绝原因计数与 v1 相同（`NO_GROWTH` 84、`NON_POSITIVE_EPS` 26、`NO_EPS` 1）。
- 逐条差异：`eval/release-v2-diff.json`，生成脚本 `eval/v2-diff.mjs`。

## 差异摘要

| 类别 | 条数 | 说明 |
| --- | ---: | --- |
| `value` | 3 | O 23.51→16.71，PSX 173.03→624.11，WELL 43.96→18.63 美元 |
| `model` | 3 | 三者由 `residual` 改为 `owner`；其余 497 条模型不变 |
| `band` | 40 | 全部是保留的残差条目；旧上限 13/43 等于基准，新上限 0/40 等于基准 |
| `terminalShare` | 3 | 三者原先无终值占比，改走 owner 后有值（0.4638 / 0.5156 / 0.4278） |
| `warnings` | 3 | O/PSX/WELL 各加 `MODEL_CAVEAT`；13 条曾有缺列疑点的金融公司已由行业证据解释，`CLASSIFICATION_UNVERIFIED` 为 0 |
| `inputs.classification` | 500 | 每条新增分类依据（`industry`、`ocf`、`name`、`columns` 或 `none`） |
| `inputs.industry` | 16 | O、WELL（reit）、PSX（refining）及 13 家金融公司的行业标签 |
| `reasons` / `status` | 0 | 拒绝集合与可估集合不变 |

### 逐条样例

- NYSE:O：REIT，行业证据命中，模型 residual→owner；新 band 13.44/16.71/22.15，带 `reit` 和 `MODEL_CAVEAT`。
- NYSE:WELL：REIT，同样 residual→owner；新 band 15.20/18.63/24.29，带 `reit` 和 `MODEL_CAVEAT`。
- NYSE:PSX：炼化，行业证据命中，residual→owner；新 band 491.40/624.11/846.65，仍带 `CAPPED_GROWTH`，并加 `refining`、`MODEL_CAVEAT`。
- HKSE:00939 等 40 条残差条目：基准值不变，band 改为同一残差模型在折现率 ±2 个百分点下的结果，旧上限等于基准的问题消失。

### REIT 与炼化的暂定口径

三条改道结果都是**暂定采用 owner 模型并发布**，不是已完成行业口径复核：

| 标的 | owner（v2） | 旧残差（改道前） | 差 |
| --- | ---: | ---: | ---: |
| NYSE:O | 16.71 | 23.51 | −28.9% |
| NYSE:WELL | 18.63 | 43.96 | −57.6% |
| NYSE:PSX | 624.11 | 173.03 | +260.7% |

- 保留 owner 的理由：三者都有正的营业利润、自由现金流和收入，旧分类器仅因缺列把它们塞进银行剩余收益模型；REIT 的账面价值按历史成本，剩余收益会把折旧后的账面当成股东可实现价值，炼化的重置资本开支同样不在账面里。
- 未解决：REIT 没有 FFO/AFFO 口径，PSX 的周期正常化盈利与净债务也没有专门处理；安全边际和排序可看，精度不应按已审行业模型理解。
- 披露：三条都带 `MODEL_CAVEAT`，页面文案说明结果暂定。改道前后的两个数都保留在上表，读者可判断差异幅度。
- 复核与重访：另做 FFO/AFFO 与重置资本开支口径的独立复核，再决定是否保留 owner。触发重访的条件是新增 FFO/AFFO 数据、行业模型或复核结论；在此之前 v2 的 owner 结果按暂定值使用。

## 为什么需要新版本

1. 模型路由是输入纠正：旧分类器只要缺 `free_cash_flow_per_share` 就把有收入的美国公司归为金融；O、WELL、PSX 因此走错模型。分类依据与行业证据现在随条目发布。
2. 残差区间是政策修正：旧上限用条件续营值 `enduringBookValue`，不是同一模型的端点；新上限与基准、低值共用 `residualIncomeValue`。
3. 终值边界与零/负利率是政策修正：第二阶段、续营和反推共用一个有效终值增速（至多折现率减 2 个百分点），续营始终计入并把有限价值单列；负收益率不再一律回退 8%。
4. EPS 与利率的有限数边界、A/H 差异桥是输入与披露修正；报价币种、刷新闸门、情景和图表状态不改变 v1 已发布数值。

这些变化需要新的 `POLICY_VERSION` 与 `POLICY_V1_HASH`；v2 的 `POLICY_V1` 增加 `revision` 字段，哈希为 `d699ffe7cec9cc65b112cd1baa00b5bb2712572d9f2917781fb1090e6efefc6a`。

## 审计与验证

- 全量前后差异：`eval/release-v2-diff.json`；分类审计：`eval/g-routing.json`；区间审计：`eval/h-band.json`；终值边界：`eval/i-boundary.json`；跨上市桥：`eval/k-cross.json`。这些审计文件按项目约定留在本地，不入库。
- 单元测试 58 个文件、437 项通过。`npm run lint` 通过。
- `npm run verify:data` 20 项全过：policy hash、字节重算、manifest、universe 四集合相等、发布状态摘要、9 组 A/H 对照和三只抽样重算。
- 发布状态为 `rebuilt`，批次 `ac6e256a897a…`，与 artifact/manifest 字节绑定。上一批指向 v1 发布摘要 `169ae248017b…`。v1 与 v2 均无可核验的本批上游刷新时刻，故 `upstreamCheckedAt` 为 `null`。
- 本地生产构建和 Chrome 上传前检查通过，冻结 v1 的公开研究档案通过逐字节复算。

## 归档与回滚

- v2 政策提交可独立回退。回退该提交会一并恢复 v1 策略、manifest、发布状态与构建检查，保留前一批工程修复。v1 发布值文件可以直接复用。
- 回滚后仍可用 v1 的哈希核对线上字节。不要手改或覆盖 v1；任何再生成都只能写新版本文件。
- `publish.json` 的 `batch` 必须与所选 artifact/manifest 字节一致，否则 `verify:data` 失败。

## 已知限制

- 分类仍是有限证据集，未收录行业或分类依据不明的条目会在替代模型差异 ≥25% 时标 `CLASSIFICATION_UNVERIFIED`；它表示需要复核，不表示新路由一定更准。
- REIT 与炼化改走 owner 只是去掉明显错误的金融模型；尚未引入 FFO/AFFO 或资产价值路径，`refining` 仍可能受周期峰值利润影响。
- 110 条 `STALE_DATA`、150 条 `QUOTE_DATE_UNKNOWN` 与 v1 相同，本次发布没有刷新数据日期。
