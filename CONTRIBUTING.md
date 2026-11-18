# Contributing

Thanks for taking a look. This project has one unusual rule, and it shapes everything else.

## The kernel is a red line

`src/lib/dcf.js` holds the two-stage annuity. `calGr2fv` is pinned by `tests/unit/kernel-parity.test.js`
(11.56 / 7.70 / 3.85 / 0.71 / 23.44 / TBV 22.80 for the reference inputs). Growth defaults and the
reverse-DCF guard live in the same file and are covered by `tests/unit/dcf.test.js`.

- Do not change `calGr2fv` without updating the parity test in the same commit.
- Display helpers (`sensitivity`, `scenarios`, `wacc`, `multiples`, `peers`, `permalink`, `report`, …) may change
  freely but never write back into kernel inputs or results.
- Visible behavior that a reader could misread belongs in `DEVIATIONS.md`.

## Before you push

```bash
npm run lint         # eslint: dead code, Vue essentials
npm run test         # unit: kernel parity, registry, measurement, formatting
npm run test:e2e     # playwright, fully offline (intercepted network)
npm run build && npm run smoke:pages   # static-host contract under a sub-path
```

These are local gates: Actions runs only the light suite on push and defers the browser suites to
pull requests, so your machine is where data pushes get validated.

**Do not make fundamental fields editable.** EPS, free cash flow per share, tangible book,
growth history and predictability come from the committed quarterly snapshots under
`public/data/`. Fix the upstream parse in `src/data/providers/` and regenerate with
`npm run snapshot` instead of adding an inline editor. Price and valuation assumptions
(discount rate, growth, terminal growth, horizons, target multiples) stay editable — that is
the user's judgment, not a fact. See the data contract in README.

The e2e suite is a contract: its locators (tabs, calculator order, archive dialog, record list) are pinned on purpose.
New UI gets a test; if a change must move a locator, update the spec in the same commit.

## Style

- Two spaces, no semicolons, single quotes (see existing files); Vue SFCs use `<script setup>`.
- Every user-facing string goes through `vue-i18n` in **both** `src/i18n/zh-Hans.json` and `en-US.json`.
- No new runtime dependency for something a small module can do; document it in the PR body if one is unavoidable.
- Accessibility is not optional: focus rings, `aria-label`s, reduced motion, AA contrast (run `npm run audit:contrast`).

## Data sources

`DATA_SOURCES.md` explains the provider interface, priority/coverage, breaker and validation rules.
A new provider is a module under `src/data/providers/` plus fixtures and tests — never a fetch call inside a component.
Snapshots under `public/data/` are refreshed with `npm run snapshot`; commit them with the symbols list change.

## Commits

Conventional subject, imperative, ≤ 72 characters, and a body of bullets for anything non-obvious. One change per
commit; docs and screenshots ride with the change they describe.

## License

Contributions are MIT. By opening a PR you agree the code can be redistributed under `LICENSE`.
