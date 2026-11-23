# 预测检验工具

这是给维护者复核口径用的内部工具，不是面向普通投资者的功能，也不构成改官方增速或折现率的许可证。不要把它做成站点上的研究工作台，也不要把结果当作官方发布值。

## 怎么跑

在仓库根目录：

```bash
npm run research:forecast            # 按官方 v3 口径重跑，写入 scripts/research/forecast-validation-official.json
npm run research:forecast -- --check # 核对已提交的官方跑数与 2026-11-22 研究跑数
npm run research:forecast -- --historical
npm run research:forecast -- --historical --check
```

`npm run research:check` 会包含上述 `--check`。输入是已冻结的 2006-03-15 入场现金面板 `scripts/research/cash-path-inputs.json`。输出放在 `scripts/research/`，不进入 `public/`，也不会出现在方法页。

## 两份结果不要混读

- `scripts/research/forecast-validation-research-2006.json` 是 2026-11-22 在研究分支口径下记录的历史跑数：朴素十年 CAGR、5/10/1 混合增速、写死的 11% 折现、不含终值。样本 4 家（通用电气、UPS、英特尔、IBM）。中位误差：零增长 14.83%，折半混合 26.02%，混合 29.995%，历史外推 37.52%。这不是官方 v3 结果。当时的 11% 恰好等于 `ceil(4.73) + 6`，但历史模式必须保持写死的 11%，以免被后来的官方口径改动带偏。
- `scripts/research/forecast-validation-official.json` 是同一块冻结面板上、按现行官方 v3 口径的维护者复核：参考增速是 `officialGrowth()`（单一干净长窗口、15% 承保上限、不再取 min、不再把终值机械置 0），折现是 `max(10%, ceil(当地十年期)+6)`。官方、零增长、朴素十年 CAGR、研究用 5/10/1 混合及其折半都计入同一官方终值 4%，以便对齐口径；官方 v3 并不发布 5/10/1 混合。官方窗口会向前走过起始亏损年，所以波音会进入样本；威瑞森仍没有完整现金路径。本轮中位误差：官方 57.38%，零增长 43.97%，折半混合 55.45%，混合 37.48%，历史外推 61.38%（n=5）。官方列中位数没有击败零增长；击败零增长不是发布门禁。这只是同一块冻结面板上的维护者基线，不能拿来改官方发布值。此前官方列约 71.68%（对照列当时不含终值）或更早不含终值的约 49.75%，都不要再当作现行口径。

当前样本仍然很小，未能扩大到冻结的五名 2006 年面板之外。把 2006 年 n=4、不含终值的研究排序当成改官方增速或折现的依据，是错的。过不了零增长，也不因此改官方字节。

## 不会改什么

本工具不改 `POLICY_V1`、政策哈希、`calGr2fv`，也不重算或覆盖 `public/data/intrinsic/v3.json`。门禁只检查重算结果与已提交文件一致，不要求某种增速规则击败零增长基准。
