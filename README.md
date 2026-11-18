# valueprobe

Open-source, local-first stock valuation. Ordinary companies are discounted from per-share earnings or shareholder free cash flow; banks use residual income. The default discount rate is a US Treasury hurdle plus 6 points, for every currency. Annual per-share earnings stay as filed, not split-adjusted. Not investment advice.

## Run

```bash
npm install --legacy-peer-deps
npm run dev
```

`public/data` is the published source for EPS, cash flow, book value and growth. Refresh it locally with `npm run snapshot`, then commit. The deployed site does not fetch quotes. Price and valuation assumptions stay editable.

## Deploy

Push to `main` with Pages set to GitHub Actions. The workflow is `.github/workflows/pages.yml`. A private repository on the free plan cannot enable Pages.

## Tests

```bash
npm test
npm run test:e2e
```

`CALCULATION.md` and `DEVIATIONS.md` note where the formulas differ from a plain finite annuity. `CONTRIBUTING.md` has the house rules.

MIT. Market data stays under its sources' terms (`ATTRIBUTION.md`).
