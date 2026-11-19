# valueprobe

Open-source, local-first stock valuation. The published number is the **intrinsic value** under **public policy v1**: ordinary companies are discounted from per-share earnings in two stages; banks, insurers and brokers use residual income. It is an estimate, not investment advice, and not a price target.

Default values are generated from financial data and shared, versioned rules. Coverage grows when the required data can be refreshed and the relevant valuation rule can be applied automatically.

## What you see on a stock

A stock in the covered list opens on its **ValueProbe fair value** — the published number, its margin of safety, the earnings period, quote date, release date and policy version. The page never asks you to fill in a blank calculator first.

You can still edit the price and assumptions. Edits update the single headline in place and relabel it as *your calculation*; the published number and `POLICY_V1` are never changed. Nothing you type is written back to the policy, the artifact or any shared state — it applies only to the page you are looking at. 「恢复默认值」 returns to the published inputs. Stocks outside the coverage list, or refused by the policy, show that explicitly and remain available for calculation only.

## Run

```bash
npm install
npm run dev
```

`public/data` is the published source for EPS, free cash flow, book value, growth and the ten-year rates. The deployed site does not fetch quotes. Price and valuation assumptions stay editable. A fixed 12× line shows today's earnings if they never grow; it is a cross-check, not the intrinsic value, and banks do not show it.

## Scripts

| script | what it does |
| --- | --- |
| `npm run dev` | Local dev server. |
| `npm run build` | Static build into `dist/`. |
| `npm run snapshot` | Refresh `public/data/<MARKET>-<CODE>.json` and `public/data/rates.json` from the public sources. Run locally, then commit. |
| `npm run intrinsic` | Write the published values `public/data/intrinsic/v1.json` and the hash manifest `public/data/manifest.json` from the committed snapshots. |
| `npm run verify:data` | Data gate: policy hash, artifact reproducibility, freshness warnings, covered-symbol list and catalog agreement, manifest hashes, known codes, independent recompute. |
| `npm run refresh` | `snapshot` → `intrinsic` → `verify:data`. |
| `npm run verify` | `lint → test → test:real → verify:data → smoke:pages`, the same chain as `package.json` `verify`. |
| `npm run test:e2e` | Playwright browser suites; CI runs these on pull requests only. |

## Data contract

- `public/data/intrinsic/v1.json` is the only published value. The stock, watchlist, comparison and method pages read the release. The stock calculator starts with those assumptions and runs a local calculation when assumptions are edited.
- `public/data/manifest.json` pins the artifact's policy version and hash, the covered-symbol counts, the rate rows, and the sha256 of every snapshot it was built from. An artifact that no longer matches the committed inputs fails `npm run verify:data`.
- `POLICY_VERSION` and `POLICY_V1_HASH` in `src/lib/policy.js` identify the policy that produced the artifact. Any change to `POLICY_V1` must bump the version and the hash in the same commit.
- The gate fails on a hash mismatch, a non-reproducible artifact, a missing rate row, a coverage-list/catalog/file disagreement, or an unknown reason/warning code. An old artifact or rate row only prints a warning; the value itself carries `STALE_DATA` / `STALE_PRICE`, so the gate stays independent of the day it runs.
- The ten-year yields used by the artifact are `public/data/rates.json`; the bundled file is a local fallback only. A missing local yield keeps the value and carries `RATE_FALLBACK`.

`docs/CALCULATION.md`, `docs/POLICY.md` and `docs/DEVIATIONS.md` record the parameters and where the formulas differ from a plain finite annuity. `CONTRIBUTING.md` has the house rules.

## Deploy

Push to `main` with Pages set to GitHub Actions. The workflow is `.github/workflows/pages.yml`. A private repository on the free plan cannot enable Pages.

Run `npm run verify` before pushing. Pages serves the committed snapshots and never refreshes them during deployment. Review snapshot and valuation diffs before committing a data refresh. For a code-only release, confirm `git diff HEAD -- public/data` is empty before committing.

## Docs

Start with [`docs/README.md`](docs/README.md): it lists every document and the rule for where docs live.

- `docs/POLICY.md` — public policy v1 parameters, reason/warning codes, artifact and manifest schema, refresh and checks, coverage list and replacements.
- `docs/CALCULATION.md` — models and the calculation boundaries.
- `docs/DATA_SOURCES.md` — providers, transport modes, rates and the artifact gate.
- `docs/ARCHITECTURE.md` — layers, data flow and vocabulary.
- `docs/DESIGN.md` — product/design rules and trade-offs.
- `docs/DEVIATIONS.md` — every visible behaviour difference, with its reason.

MIT. Market data stays under its sources' terms (`ATTRIBUTION.md`).
