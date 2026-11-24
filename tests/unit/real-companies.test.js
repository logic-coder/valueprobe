import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { POLICY_V1, POLICY_V1_HASH, POLICY_VERSION, policyDiscountRate, policyValue } from '../../src/lib/policy'
import { RECENT_BASE_LAG_RATIO } from '../../src/lib/dcf'
import { REASON, WARNING } from '../../src/lib/reasons'
import { toStock } from '../../src/lib/stockRecord'

// Real-company regression for public policy v3: the committed snapshots the
// published site reads go through the same cleaning and valuation path as the
// artifact and must still carry the facts the public method rests on. Assertions
// target the published result (status, model, disclosed rate row) and the raw
// history a reviewer can check; no rate is invented and nothing touches the
// network. A policy version bump is expected to update this file together with
// the artifact golden.
const root = process.cwd()
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const artifact = readJson('public/data/intrinsic/' + POLICY_VERSION + '.json')
// The artifact stores exactly the rows the published values used, including the
// HKD -> USD proxy, so a recompute cannot silently use a different rate.
const rates = artifact.rates
const snapshotOf = (symbol) => readJson('public/data/' + symbol.replace(':', '-') + '.json')
const stockOf = (symbol) => toStock(snapshotOf(symbol))
const valueOf = (symbol) => policyValue(stockOf(symbol), { rates, generatedAt: artifact.generatedAt })
const published = (symbol) => artifact.entries[symbol]

describe('public policy v3 regression runs on the committed artifact', () => {
  it('is written for the version and hash that produced the artifact', () => {
    expect(artifact.policyVersion).toBe(POLICY_VERSION)
    expect(artifact.policyHash).toBe(POLICY_V1_HASH)
  })
})

describe('SHSE:601398 - residual income on a real bank', () => {
  it('publishes the public v3 value around 10.76 on the residual model', () => {
    const value = valueOf('SHSE:601398')
    expect(value.status).toBe('ok')
    expect(value.inputs.model).toBe(POLICY_V1.model.financialInstitution)
    // Public policy v3 golden for ICBC: update only with a policy version bump.
    expect(value.value).toBeCloseTo(10.76, 2)
    expect(value.value).toBe(published('SHSE:601398').value)
    expect(value.inputs.rate.proxy).toBeNull()
    expect(value.inputs.discountRate).toBe(policyDiscountRate(rates.CNY.value))
  })
})

describe('US listings keep a published value', () => {
  for (const symbol of ['NASDAQ:AAPL', 'NASDAQ:MSFT', 'NYSE:TSM']) {
    it(symbol + ' publishes a finite value in USD', () => {
      const value = valueOf(symbol)
      expect(value.status).toBe('ok')
      expect(Number.isFinite(value.value)).toBe(true)
      expect(value.value).toBeGreaterThan(0)
      expect(value.value).toBe(published(symbol).value)
      expect(value.inputs.currency).toBe('USD')
      expect(value.inputs.discountRate).toBe(policyDiscountRate(rates.USD.value))
    })
  }
})


describe('NASDAQ:NVDA - a one-way rise that pinned the normalised base to old years', () => {
  it('publishes a value from the latest earnings/cash midpoint, not the stale normalised median', () => {
    const value = valueOf('NASDAQ:NVDA')
    expect(value.status).toBe('ok')
    expect(value.value).toBe(published('NASDAQ:NVDA').value)
    expect(value.inputs.ownerBaseRecent).toMatchObject({ ratio: expect.any(Number) })
    expect(value.inputs.ownerBaseRecent.ratio).toBeGreaterThanOrEqual(RECENT_BASE_LAG_RATIO)
    expect(value.inputs.eps).toBeCloseTo((4.9 + 3.9437) / 2, 4)
    expect(value.warnings).toContain(WARNING.RECENT_BASE_LAG)
    expect(value.reasons).not.toContain(REASON.CASH_UNRECONCILED)
  })
})

describe('NYSE:PGR - an underwriting insurer uses residual income', () => {
  it('publishes Progressive on the residual model and does not invent a cash veto', () => {
    const value = valueOf('NYSE:PGR')
    expect(value.status).toBe('ok')
    expect(value.inputs.model).toBe(POLICY_V1.model.financialInstitution)
    expect(value.reasons).not.toContain(REASON.CASH_UNRECONCILED)
    expect(value.value).toBeGreaterThan(0)
    expect(value.value).toBe(published('NYSE:PGR').value)
    expect(published('NYSE:PGR').status).toBe('ok')
  })
})
describe('refusals name the missing fact instead of inventing one', () => {
  it('NASDAQ:INTC is refused for non-positive EPS and no historical growth', () => {
    const value = valueOf('NASDAQ:INTC')
    expect(value.status).toBe('refused')
    expect(value.value).toBeNull()
    expect(value.reasons).toContain(REASON.NON_POSITIVE_EPS)
    expect(value.reasons).toContain(REASON.NO_GROWTH)
    expect(value.reasons).toEqual(published('NASDAQ:INTC').reasons)
  })

  it('NYSE:V is refused after the EPS parser cannot recover a growth history', () => {
    const value = valueOf('NYSE:V')
    expect(value.status).toBe('refused')
    expect(value.value).toBeNull()
    expect(value.reasons).toContain(REASON.NO_GROWTH)
    expect(value.reasons).toEqual(published('NYSE:V').reasons)
  })
})

describe('HKSE listings value in HKD with the disclosed USD proxy', () => {
  for (const symbol of ['HKSE:00002', 'HKSE:00066']) {
    it(symbol + ' publishes a finite value', () => {
      const value = valueOf(symbol)
      expect(value.status).toBe('ok')
      expect(Number.isFinite(value.value)).toBe(true)
      expect(value.value).toBeGreaterThan(0)
      expect(value.value).toBe(published(symbol).value)
      expect(value.inputs.currency).toBe('HKD')
      expect(value.inputs.rate.proxy).toBe('USD')
      expect(value.inputs.discountRate).toBe(policyDiscountRate(rates.USD.value))
    })
  }
})

describe('a negative growth history is published with a default terminal and a regime warning', () => {
  it('keeps a valued company whose official path starts at 0% and fades to the default terminal', () => {
    const candidates = Object.keys(artifact.entries).filter((symbol) =>
      artifact.entries[symbol].status === 'ok'
      && artifact.entries[symbol].warnings.includes(WARNING.REGIME_UNCERTAIN)
      && artifact.entries[symbol].inputs.growth === 0)
    expect(candidates.length).toBeGreaterThan(0)
    const symbol = candidates[0]
    const value = valueOf(symbol)
    expect(value.status).toBe('ok')
    expect(value.value).toBeGreaterThan(0)
    expect(value.inputs.growth).toBe(0)
    expect(value.inputs.terminalGrowthRate).toBe(4)
    expect(value.warnings).toContain(WARNING.REGIME_UNCERTAIN)
    expect(value.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_ZEROED)
    expect(value.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_GROWTH)
    expect(value.value).toBe(published(symbol).value)
  })
})

describe('Hong Kong dividends stay empty rather than repeating one current payout', () => {
  it('stores null dividends_per_share on every HKSE annual row', () => {
    const symbols = Object.keys(artifact.entries).filter((symbol) => symbol.startsWith('HKSE:'))
    expect(symbols.length).toBeGreaterThan(0)
    for (const symbol of symbols) {
      const annual = snapshotOf(symbol).financials?.annual || []
      expect(annual.length).toBeGreaterThan(0)
      for (const row of annual) expect(row.dividends_per_share).toBeNull()
    }
  })
})

describe('raw history facts survive the cleaning path', () => {
  it('NASDAQ:NVDA keeps FY2023 EPS at the restated 0.17', () => {
    // NVIDIA's fiscal year ends in January, so the FY2023 row is dated 2023-01.
    const row = snapshotOf('NASDAQ:NVDA').financials.annual.find((item) => item.date === '2023-01')
    expect(row).toBeDefined()
    expect(row.eps_without_nri).toBeCloseTo(0.17, 4)
    expect(row.operating_income_per_share).toBeGreaterThan(0) // a real year, not a tagging hole
  })

  it('NASDAQ:AAPL keeps FY2017 EPS at 2.3025', () => {
    // Apple's fiscal year ends in September, so the FY2017 row is dated 2017-09.
    const row = snapshotOf('NASDAQ:AAPL').financials.annual.find((item) => item.date === '2017-09')
    expect(row).toBeDefined()
    expect(row.eps_without_nri).toBeCloseTo(2.3025, 4)
  })
})
