# Forecast-validation expansion panels

Maintainer-only frozen walk-forward panels for the official factor harness.

To add a panel, commit a JSON file in this directory and rerun
`npm run research:forecast`. Each file should include:

- `asOf`, `yieldPct`, and a `universeRule` that states how the names were
  fixed at the entry date (not from later survivors)
- `companies[]` with entry-visible earnings, cash, and optional revenue
  series, plus `observations` / `cashObservations` and `epsObservations`
  for the next ten fiscal years

The harness reads only facts that belong on the entry date to form the
forecast, and uses the observation series only as ex-post targets. See
`docs/FORECAST_VALIDATION.md`. This directory is not a user-facing
feature and is not a license to change official policy.
