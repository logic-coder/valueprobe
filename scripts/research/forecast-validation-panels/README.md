# Forecast-validation expansion panels

Maintainer-only frozen walk-forward panels for the official factor harness.

To add a panel, commit a JSON file in this directory and rerun
`npm run research:forecast`. Each file must include:

- `asOf`, `yieldPct`, `universeFrozenAt`, `universeHash`, and a `universeRule`
  stating how the members were fixed at entry rather than selected from later survivors
- `companies[]` with `ticker`, `cik`, `industry`, dated `epsSeries`, dated
  `baseYears`, optional dated `revenueChecks`, and dated `observations` /
  `cashObservations` plus `epsObservations` for exactly the next ten fiscal years
- `fy`, `periodEnd`, `availableAt`, and `source` on every fact; cash rows also
  need finite `ocf`, `capex`, and positive `shares`, while earnings rows need a
  finite `val` (entry) or `eps` (outcome)

Compute `universeHash` with the exported `panelUniverseHash()` helper. It binds
the frozen ticker/CIK/industry member list. The harness rejects a missing or stale
hash, undated facts, null/undefined/empty numeric fields, and
outcomes other than FY+1..FY+10. Facts with period end or availability after
`asOf` are excluded from entry inputs. The scorer currently uses an NYSE/USD per-share
contract; real A/H panels additionally need explicit market/currency/FX support
before they can be claimed as accepted walk-forward evidence.
The 2006 debug panel is manually verified legacy input and is explicitly exempt
from this dated-panel contract; it is not an expansion panel.

No real expansion panel is committed yet, so cross-year and industry acceptance
remain blocked. See `docs/FORECAST_VALIDATION.md`. This directory is not a
user-facing feature and is not a license to change official policy.
