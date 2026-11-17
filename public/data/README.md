# 季度快照

`npm run snapshot` 按 `scripts/watchlist.json` 刷新这里的 `<交易所>-<代码>.json`：
报价和名称来自东方财富，已有的基本面字段会保留。提交后随 Pages 发布。
实时接口不可用时，页面退到这些文件，并在顶部写出 `as_of`。

- 报价能刷新；每股收益、增速和账面价值仍要在财报后核对。
- 文件只存计算种子。可选的 `history` 与 `financials` 给图表和财务表，页面不会把它们塞进报价对象。
- 删掉某个文件即代表该代码不再有快照兜底。

```bash
npm run snapshot
node scripts/snapshot.mjs SHSE:601398
```
