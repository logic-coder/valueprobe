/**
 * Walk-forward cash prediction validation (maintainer tool).
 *
 * Scores the frozen 2006-03-15 entry-date cash panel. This is a policy-
 * evaluation harness for maintainers, not a user-facing feature and not a
 * release gate on official values or published official artifacts.
 *
 * Modes:
 *   official (default) — officialGrowth() (when both clean disclosed windows
 *     exist, each is floored at 0% and capped at 15%, then the slower rate is
 *     the official mid; the faster window only widens the high end of the
 *     range; a single window is used as official; negative history starts at
 *     0%, keeps the default 4% terminal, and marks REGIME_UNCERTAIN) and the
 *     official required return, including official terminal growth on both the
 *     forecast and the realised cash path. Experimental columns remain
 *     comparisons only and still omit a terminal. The 2006 historical file
 *     stays a no-terminal contrast and is not a license to change official
 *     policy.
 *   historical — reproduces the 2026-11-22 research-branch run (naive CAGRs,
 *     5/10/1 blend, hardcoded 11% discount, no terminal). That file is a
 *     historical research artifact, not an official v3 result.
 *
 * From repo root:
 *   npm run research:forecast
 *   npm run research:forecast -- --check
 *   npm run research:forecast -- --historical
 *   npm run research:forecast -- --historical --check
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { windowGrowth, officialGrowth } from '../../src/lib/assumptions.js'
import {
  POLICY_VERSION, POLICY_V1, POLICY_V1_HASH,
  policyDiscountRate, policyFallbackDiscountRate,
} from '../../src/lib/policy.js'

// Research-branch blend weights, kept here as an experimental comparison.
// Official v3 does not use a 5/10/1 blend as the published growth rate.
export const RESEARCH_GROWTH_BLEND = Object.freeze({
  oneYear: 0.2,
  fiveYear: 0.5,
  tenYear: 0.3,
})
export const DAMPENING_REFERENCE = 0.5
// Hardcoded in the 2026-11-22 research run. It happened to equal
// ceil(4.73) + 6, but historical mode must not drift with later policy edits.
export const HISTORICAL_DISCOUNT_RATE = 11

export const HISTORICAL_OUT = 'scripts/research/forecast-validation-research-2006.json'
export const OFFICIAL_OUT = 'scripts/research/forecast-validation-official.json'
export const PANEL_PATH = 'scripts/research/cash-path-inputs.json'

const root = process.cwd()

export const med = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return null
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const cashPerShare = (row) => (row.ocf - row.capex) / row.shares
const smape = (p, a) => (p === 0 && a === 0) ? 0 : 200 * Math.abs(p - a) / (Math.abs(p) + Math.abs(a))
export const round4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)

export function forecastFlows (base, growth, years) {
  const flows = []
  let cash = base
  for (let t = 1; t <= years; t++) {
    cash *= 1 + growth / 100
    flows.push(cash)
  }
  return flows
}

/**
 * Present value of explicit forecast flows. When terminalGrowthRate is a
 * finite number, a Gordon continuation is added after the last explicit year.
 * The frozen 2006 panel has no observed terminal cash, so default scoring
 * omits it; expanded official reruns should pass official tg.
 */
export function discountFlows (flows, discountRate, terminalGrowthRate = null) {
  if (!Array.isArray(flows) || !flows.length || !Number.isFinite(discountRate)) return null
  const r = discountRate / 100
  const explicit = flows.reduce((sum, cash, i) => sum + cash / (1 + r) ** (i + 1), 0)
  if (!Number.isFinite(terminalGrowthRate)) return explicit
  const last = flows.at(-1)
  const continuing = last * (1 + terminalGrowthRate / 100)
  if (!(r > terminalGrowthRate / 100) || !(continuing > 0) || !Number.isFinite(continuing)) return null
  return explicit + continuing / (r - terminalGrowthRate / 100) / (1 + r) ** flows.length
}

function naiveCagr (series, years) {
  const last = series.at(-1)
  if (!last || !(last.val > 0)) return null
  const first = series.find((row) => row.fy === last.fy - years)
  if (!first || !(first.val > 0)) return null
  const rate = (Math.pow(last.val / first.val, 1 / years) - 1) * 100
  return Number.isFinite(rate) ? rate : null
}

function blendedRate (g5, g10, g1) {
  if (![g5, g10, g1].every((x) => x !== null && Number.isFinite(x))) return null
  return RESEARCH_GROWTH_BLEND.fiveYear * g5
    + RESEARCH_GROWTH_BLEND.tenYear * g10
    + RESEARCH_GROWTH_BLEND.oneYear * g1
}

function epsSeries (company) {
  return company.epsFrom1995
    .map((val, i) => ({ fy: 1995 + i, val }))
    .filter((row) => Number.isFinite(row.val))
}

function completePanelCompany (company) {
  const base = company.baseYears
  const observed = company.observations
  const series = epsSeries(company)
  if (!Array.isArray(base) || base.length !== 3 || !base.every((row) => row.shares > 0)) return null
  if (!Array.isArray(observed) || observed.length !== 10 || !observed.every((row) => row.shares > 0)) return null
  if (series.length < 10) return null
  const flatBase = med(base.map(cashPerShare))
  const latestEps = series.at(-1).val
  const fiveMedian = med(series.slice(-5).map((row) => row.val))
  if (!(flatBase > 0) || !(latestEps > 0) || !(fiveMedian > 0)) return null
  return { series, flatBase, latestEps, fiveMedian, observed }
}

function scoreForecast (flows, realisedPv, discountRate, terminalGrowthRate = null) {
  const predicted = discountFlows(flows, discountRate, terminalGrowthRate)
  if (!Number.isFinite(predicted) || !Number.isFinite(realisedPv)) return null
  return round4(smape(predicted, realisedPv))
}

function medianScores (rows, keys) {
  return Object.fromEntries(keys.map((key) => [key, round4(med(rows.map((row) => row[key])))]))
}

function beats (rows, left, right) {
  return rows.filter((row) => Number.isFinite(row[left]) && Number.isFinite(row[right]) && row[left] < row[right]).length
}

export function loadPanel (cwd = root) {
  return JSON.parse(readFileSync(cwd + '/' + PANEL_PATH, 'utf8'))
}

export function officialDiscountRate (study) {
  const rate = policyDiscountRate(study.yieldPct)
  return Number.isFinite(rate) ? rate : policyFallbackDiscountRate()
}

export function buildHistoricalReport (study) {
  const discountRate = HISTORICAL_DISCOUNT_RATE
  const years = 10
  const rows = []
  for (const company of study.companies) {
    const panel = completePanelCompany(company)
    if (!panel) continue
    const { series, flatBase, latestEps, fiveMedian, observed } = panel
    const g10 = naiveCagr(series, 10)
    const g5 = naiveCagr(series, 5)
    const g1 = naiveCagr(series, 1)
    const blended = blendedRate(g5, g10, g1)
    const damp = blended === null ? null : blended * DAMPENING_REFERENCE
    if (damp === null || g10 === null) continue

    const realisedPv = discountFlows(observed.map(cashPerShare), discountRate, null)
    rows.push({
      ticker: company.ticker,
      flat: scoreForecast(forecastFlows(flatBase, 0, years), realisedPv, discountRate),
      historical: scoreForecast(forecastFlows(latestEps, g10, years), realisedPv, discountRate),
      dampened: scoreForecast(forecastFlows(fiveMedian, damp, years), realisedPv, discountRate),
      blended: scoreForecast(forecastFlows(fiveMedian, blended, years), realisedPv, discountRate),
      excludedAfterSplit: Boolean(company.breakFrom),
    })
  }
  const paired = rows.filter((row) => !row.excludedAfterSplit)
  return {
    kind: 'historical-research-run',
    recorded: '2026-11-22',
    policy: 'research-branch-blended-growth',
    asOf: study.asOf,
    note: 'Historical research run recorded 2026-11-22 under the research-branch growth blend (5y 50%, 10y 30%, 1y 20%), a hardcoded 11% discount, and no terminal value. Frozen entry-date cash panel; discounted ten-year cumulative cash. This is not an official v3 result and must not be treated as a license to change official growth or discount.',
    growthBlend: { ...RESEARCH_GROWTH_BLEND },
    dampeningReference: DAMPENING_REFERENCE,
    discountRate,
    terminalIncluded: false,
    sample: rows.length,
    paired: paired.length,
    medians: medianScores(paired, ['flat', 'historical', 'dampened', 'blended']),
    dampenedBeatsFlat: beats(paired, 'dampened', 'flat'),
    dampenedBeatsHistorical: beats(paired, 'dampened', 'historical'),
    blendedBeatsFlat: beats(paired, 'blended', 'flat'),
    blendedBeatsHistorical: beats(paired, 'blended', 'historical'),
    rows,
  }
}

export function buildOfficialReport (study) {
  const discountRate = officialDiscountRate(study)
  const years = POLICY_V1.horizon.years
  const rows = []
  for (const company of study.companies) {
    const panel = completePanelCompany(company)
    if (!panel) continue
    const { series, flatBase, latestEps, fiveMedian, observed } = panel
    const growth10 = windowGrowth(series, 10)
    const growth5 = windowGrowth(series, 5)
    const official = officialGrowth({
      growth10,
      growth5,
      hasPositiveBase: latestEps > 0,
    })
    const adopted = official.adopted
    const terminalGrowthRate = POLICY_V1.horizon.terminalGrowthRate
    const g10 = naiveCagr(series, 10)
    const g1 = windowGrowth(series, 1)
    // Experimental blend uses official windows, not the published official rate.
    const blended = blendedRate(growth5, growth10, g1)
    const damp = blended === null ? null : blended * DAMPENING_REFERENCE
    if (!Number.isFinite(adopted)) continue

    const cashPath = observed.map(cashPerShare)
    const realisedWithTerminal = discountFlows(cashPath, discountRate, terminalGrowthRate)
    rows.push({
      ticker: company.ticker,
      official: scoreForecast(forecastFlows(fiveMedian, adopted, years), realisedWithTerminal, discountRate, terminalGrowthRate),
      flat: scoreForecast(forecastFlows(flatBase, 0, years), realisedWithTerminal, discountRate, terminalGrowthRate),
      historical: Number.isFinite(g10)
        ? scoreForecast(forecastFlows(latestEps, g10, years), realisedWithTerminal, discountRate, terminalGrowthRate)
        : null,
      dampened: Number.isFinite(damp)
        ? scoreForecast(forecastFlows(fiveMedian, damp, years), realisedWithTerminal, discountRate, terminalGrowthRate)
        : null,
      blended: Number.isFinite(blended)
        ? scoreForecast(forecastFlows(fiveMedian, blended, years), realisedWithTerminal, discountRate, terminalGrowthRate)
        : null,
      officialGrowth: adopted,
      officialWindow: official.window,
      officialReason: official.reason,
      officialTerminalGrowth: terminalGrowthRate,
      growth10,
      growth5,
      excludedAfterSplit: Boolean(company.breakFrom),
    })
  }
  const paired = rows.filter((row) => !row.excludedAfterSplit)
  const keys = ['official', 'flat', 'historical', 'dampened', 'blended']
  return {
    kind: 'official-policy-run',
    policyVersion: POLICY_VERSION,
    policyHash: POLICY_V1_HASH,
    growthRule: POLICY_V1.revision.officialGrowth,
    discountRule: POLICY_V1.discount.rule,
    asOf: study.asOf,
    note: 'Maintainer evaluation on the frozen 2006 cash panel under official v3 policy. The reference growth rule is officialGrowth(): when both clean disclosed windows exist, each is floored at 0% and capped at 15%, then the slower of the two is the official mid rate; the faster window only widens the high end of the range. A single window is used as official. Negative history starts at 0%, keeps the default 4% terminal, and marks REGIME_UNCERTAIN. There is no mechanical 0% terminal. Official, flat, historical, blended and dampened columns all include that same official terminal so the scores are aligned. In this harness the official column starts from the five-year earnings median and the flat column starts from the three-year cash median; both then use constant explicit-window growth plus the official Gordon terminal, which is not the published fade path. Official v3 does not publish a 5/10/1 blend. Discount is max(10%, ceil(local 10y)+6). The committed 2006 no-terminal research file remains a historical contrast and is not a license to change official growth or discount. This rerun includes official terminal growth on every named column; the sample was not expanded beyond the frozen five-name 2006 panel. n is small. Beating flat is not a publication gate. This is not an official published value.',
    discountRate,
    terminalIncluded: true,
    terminalAligned: true,
    defaultTerminalGrowthRate: POLICY_V1.horizon.terminalGrowthRate,
    growthCap: POLICY_V1.growth.cap,
    shortHistory: POLICY_V1.growth.shortHistory,
    windowYears: POLICY_V1.growth.windowYears,
    growthBlendExperiment: { ...RESEARCH_GROWTH_BLEND },
    dampeningReference: DAMPENING_REFERENCE,
    sample: rows.length,
    paired: paired.length,
    medians: medianScores(paired, keys),
    officialBeatsFlat: beats(paired, 'official', 'flat'),
    officialBeatsHistorical: beats(paired, 'official', 'historical'),
    blendedBeatsFlat: beats(paired, 'blended', 'flat'),
    blendedBeatsHistorical: beats(paired, 'blended', 'historical'),
    rows,
  }
}

export function reportText (report) {
  return JSON.stringify(report, null, 2) + '\n'
}

export function parseArgs (argv) {
  const historical = argv.includes('--historical')
  const official = argv.includes('--official')
  if (historical && official) throw Error('Choose only one of --historical or --official')
  return {
    check: argv.includes('--check'),
    // --check with no mode verifies both committed files.
    mode: historical ? 'historical' : official ? 'official' : argv.includes('--check') ? 'both' : 'official',
  }
}

function writeOrCheck (path, text, check) {
  if (check) {
    let committed
    try {
      committed = readFileSync(root + '/' + path, 'utf8')
    } catch {
      throw Error('Missing committed forecast-validation file: ' + path)
    }
    if (committed !== text) throw Error('forecast validation metrics differ from committed file: ' + path)
    return
  }
  writeFileSync(root + '/' + path, text)
}

export function run (argv, study = loadPanel()) {
  const options = parseArgs(argv)
  const jobs = options.mode === 'both'
    ? [['historical', HISTORICAL_OUT], ['official', OFFICIAL_OUT]]
    : [[options.mode, options.mode === 'historical' ? HISTORICAL_OUT : OFFICIAL_OUT]]
  const summaries = []
  for (const [mode, path] of jobs) {
    const report = mode === 'historical' ? buildHistoricalReport(study) : buildOfficialReport(study)
    writeOrCheck(path, reportText(report), options.check)
    summaries.push({
      mode,
      path,
      kind: report.kind,
      sample: report.sample,
      paired: report.paired,
      medians: report.medians,
    })
  }
  return summaries
}

export function main (argv = process.argv.slice(2)) {
  const summaries = run(argv)
  console.log(JSON.stringify(summaries.length === 1 ? summaries[0] : summaries))
}

