# valueprobe

Open-source, local-first stock valuation. The browser prices ordinary companies on owner earnings and suggests residual income for banks. Not investment advice.

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
