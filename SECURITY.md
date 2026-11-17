# Security

## How the app handles data

The calculator is a static SPA. It has no backend and no accounts, so there is no server-side attack surface here.

- Everything personal (watchlist, recent list, valuation records, templates, locale) lives in `localStorage` on the device.
- Financial data is fetched straight from public sources or a CORS gateway configured at build time (`VITE_CORS_GATEWAY`).
  The gateway sees the symbols you type — nothing else.
- Shared links carry calculator inputs in the hash query; they never carry identifiers.

## Reporting

Open a private report through the repository's **Security** tab (GitHub private vulnerability reporting), or an issue if the
finding is low risk. Useful details: affected URL or build, browser, and the payload or steps.

Please include the deployment commit when you can; only the latest `master` build is supported.

## Known scope

- The CORS gateway is third-party infrastructure. A malicious gateway can serve tampered JSON; values rendered from it are
  escaped by Vue, but the numbers themselves are only as trustworthy as the source.
- `npm audit` findings in build-time dependencies are triaged when they land; the runtime bundle ships only Vue, Quasar
  and ECharts.
