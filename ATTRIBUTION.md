# 来源与署名

- 行情：东方财富公开报价接口。静态托管没有 CORS 头，需要自备网关。
- 美股基本面：SEC EDGAR companyfacts。数据属公共领域。请求需要带联系方式的 User-Agent。
- 无风险利率：东方财富国债收益率表中的中国、美国十年期国债；港币现金流使用美国十年期作为代理。该接口无 CORS，发布页使用已提交的 `public/data/rates.json`。
- 汇率：Frankfurter 与 open.er-api 上的欧洲央行参考价。
- 本仓库代码以 MIT 发布（`LICENSE`）。各来源的数据条款另计。

- 数据接入设计参考 [Wealthfolio](https://github.com/wealthfolio/wealthfolio)（MIT）。
