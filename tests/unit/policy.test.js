import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  POLICY_V1, POLICY_V1_HASH, POLICY_VERSION, policyDiscountRate, policyEps, policyGrowth, policyModel, policyValue, quoteDateStatus,
} from '../../src/lib/policy'
import { buildDefaults, presentValue, residualIncomeValue } from '../../src/lib/dcf'
import { rateForCurrency, reportingCurrency } from '../../src/lib/riskFree'
import { toStock } from '../../src/lib/stockRecord'
import { REASON, WARNING, isKnownReason, isKnownWarning } from '../../src/lib/reasons'
import { defaultView } from '../../src/lib/watchlistView'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const artifact = readJson('public/data/intrinsic/' + POLICY_VERSION + '.json')
const ratesFile = readJson('public/data/rates.json')
const catalog = readJson('public/data/catalog.json')
const rateRows = {
  CNY: { value: ratesFile.CNY.value, asOf: ratesFile.CNY.as_of, source: 'snapshot' },
  USD: { value: ratesFile.USD.value, asOf: ratesFile.USD.as_of, source: 'snapshot' },
}
const snapshots = catalog.map((row) => ({ symbol: row.symbol, raw: readJson('public/data/' + row.symbol.replace(':', '-') + '.json') }))
const stockOf = (raw) => toStock(raw)
const yieldOf = (stock) => rateForCurrency(rateRows, reportingCurrency(stock) || stock.currency)?.value ?? null

describe('public policy is frozen', () => {
  it('pins the hash so an unversioned edit cannot ship', () => {
    expect(createHash('sha256').update(JSON.stringify(POLICY_V1)).digest('hex')).toBe(POLICY_V1_HASH)
    expect(POLICY_VERSION).toBe('v3')
  })

  it('keeps the contested constants explicit', () => {
    expect(POLICY_V1.discount.rounding).toBe('ceil')
    expect(POLICY_V1.discount.currency).toBe('reporting')
    expect(POLICY_V1.discount.missing).toBe('fallback')
    expect(POLICY_V1.discount.fallback).toBe(10)
    expect(POLICY_V1.discount.floor).toBe(10)
    expect(POLICY_V1.growth.cap).toBe(15)
    expect(POLICY_V1.growth.shortHistory).toBe('wider-band')
    expect(POLICY_V1.growth.negative).toBe('zero-start-default-terminal')
    expect(POLICY_V1.band.growthEnvelope).toBe('scenario')
    expect(POLICY_V1.growth.missingWindow).toBe('zero-start')
    expect(POLICY_V1.horizon).toEqual({ years: 10, terminalGrowthRate: 4, yearsOfTerminalGrowth: 10 })
    expect(POLICY_V1.discount.rule).toBe('max(floor, local-10y-ceil+6)')
    expect(POLICY_V1.basis).toBe('repeatable-earnings')
  })
})

describe('discount rate tool', () => {
  it('is the local ten-year yield rounded up plus six points, with a 10% floor', () => {
    expect(policyDiscountRate(5.07)).toBe(12)
    expect(policyDiscountRate(5.14)).toBe(12)
    expect(policyDiscountRate(1.5892)).toBe(10)
    expect(policyDiscountRate(6)).toBe(12)
  })

  it('turns a missing yield into null and floors a zero or negative observation at 10%', () => {
    expect(policyDiscountRate(null)).toBeNull()
    expect(policyDiscountRate(undefined)).toBeNull()
    expect(policyDiscountRate(0)).toBe(10)
    expect(policyDiscountRate(-1)).toBe(10)
    expect(policyDiscountRate(-2.5)).toBe(10)
  })
})

describe('earnings input boundary', () => {
  it('keeps explicit zero and string zero for publish and the calculator', () => {
    for (const stock of [{ ttm_eps_nri: 0 }, { ttm_eps: '0' }, { ttm_eps_nri: '', ttm_eps: 0 }]) {
      expect(policyEps(stock)).toBe(0)
      expect(buildDefaults(5, stock, 0).dcfForm.eps).toBe(0)
      expect(policyValue({ ...stock, currency: '$', earning_growth_10y: 3, price: '$10' }, { rates: rateRows }).reasons).toContain(REASON.NON_POSITIVE_EPS)
    }
  })

  it('skips blanks and invalid values instead of turning them into zero', () => {
    for (const stock of [{ ttm_eps_nri: null, ttm_eps: 2 }, { ttm_eps_nri: '', ttm_eps: 2 }, { ttm_eps_nri: 'n/a', ttm_eps: 2 }]) {
      expect(policyEps(stock)).toBe(2)
      expect(buildDefaults(5, stock, 0).dcfForm.eps).toBe(2)
    }
    for (const stock of [null, {}, { ttm_eps_nri: null, ttm_eps: '' }, { ttm_eps: 'n/a' }]) {
      expect(policyEps(stock)).toBeNull()
      expect(buildDefaults(5, stock, 0).dcfForm.eps).toBeNull()
    }
  })
})

describe('growth and model selection', () => {
  it('caps history at fifteen and keeps the reported value', () => {
    expect(policyGrowth(44)).toEqual({ historical: 44, adopted: 15, reason: 'capped' })
    expect(policyGrowth(-3)).toEqual({ historical: -3, adopted: -3, reason: 'historical' })
    expect(policyGrowth(null)).toEqual({ historical: null, adopted: null, reason: 'missing' })
  })

  it('reads the classification recorded on the normalised record', () => {
    expect(policyModel({ financial_institution: true })).toBe('residual')
    expect(policyModel({ exchange_: 'SHSE', cashflow_basis: 'ocf' })).toBe('owner')
    // toStock applies the accounting heuristic once; policy only reads the flag.
    expect(stockOf({ exchange_: 'SHSE', symbol: '600036', price: '¥43.3', company: '招商银行', cashflow_basis: 'ocf' }).financial_institution).toBe(true)
    expect(stockOf({ exchange_: 'HKSE', symbol: '00700', price: 'HK$373.6', company: '腾讯控股', cashflow_basis: 'ocf' }).financial_institution).toBeUndefined()
  })
})

describe('policyValue semantics', () => {
  it('refuses a null record', () => {
    expect(policyValue(null).status).toBe('refused')
    expect(policyValue(null).reasons).toEqual([REASON.NO_SNAPSHOT])
  })

  it('publishes a value with the 10% fallback and says so when the yield is missing', () => {
    const stock = stockOf(snapshots.find((row) => row.symbol === 'SHSE:601398').raw)
    const value = policyValue(stock, { rates: {}, generatedAt: artifact.generatedAt })
    expect(value.status).toBe('ok')
    expect(value.inputs.discountRate).toBe(10)
    expect(value.inputs.rate.source).toBe('fallback')
    expect(value.warnings).toContain(WARNING.RATE_FALLBACK)
  })

  it('publishes a negative history at a 0% start and the default terminal, and does not reuse the old warning', () => {
    const stock = stockOf(snapshots.find((row) => row.symbol === 'NYSE:GPC').raw)
    const value = policyValue(stock, { rates: rateRows, generatedAt: artifact.generatedAt })
    expect(value.status).toBe('ok')
    expect(value.inputs.growth).toBe(0)
    expect(value.inputs.terminalGrowthRate).toBe(4)
    expect(value.warnings).toContain(WARNING.REGIME_UNCERTAIN)
    expect(value.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_ZEROED)
    expect(value.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_GROWTH)
  })

  it('refuses a record with non-positive earnings, and still refuses Visa when EPS history is missing', () => {
    const tesla = stockOf(snapshots.find((row) => row.symbol === 'NASDAQ:TSLA').raw)
    const teslaValue = policyValue(tesla, { rates: rateRows, generatedAt: artifact.generatedAt })
    expect(teslaValue.status).toBe('ok')
    expect(teslaValue.inputs.growth).toBe(0)
    expect(teslaValue.inputs.terminalGrowthRate).toBe(4)
    expect(teslaValue.warnings).toContain(WARNING.REGIME_UNCERTAIN)
    expect(teslaValue.warnings).not.toContain(WARNING.NEGATIVE_HISTORY_ZEROED)
    const loss = stockOf(snapshots.find((row) => row.symbol === 'NASDAQ:INTC').raw)
    const value = policyValue(loss, { rates: rateRows, generatedAt: artifact.generatedAt })
    expect(value.reasons).toContain(REASON.NON_POSITIVE_EPS)
    expect(value.reasons).toContain(REASON.NO_GROWTH)
    expect(value.value).toBeNull()
  })

  it('refuses a residual-income record without tangible book', () => {
    const value = policyValue({ exchange_: 'SHSE', symbol: 'X', financial_institution: true, ttm_eps: 1, earning_growth_10y: 3, price: '¥9', _as_of: '2026-11-18' }, { rates: rateRows })
    expect(value.reasons).toContain(REASON.NO_BOOK)
  })

  it('clamps both ends of the rate domain and discloses it', () => {
    const stock = stockOf(snapshots.find((row) => row.symbol === 'SHSE:601398').raw)
    const high = policyValue(stock, { rates: { CNY: { value: 60, asOf: '2026-11-18' } } })
    expect(high.status).toBe('ok')
    expect(high.inputs.discountRate).toBe(50)
    expect(high.warnings).toContain(WARNING.DISCOUNT_CLAMPED)
    const low = policyValue(stock, { rates: { CNY: { value: -100, asOf: '2026-11-18' } } })
    expect(low.status).toBe('ok')
    expect(low.inputs.discountRate).toBe(10)
    expect(low.warnings).not.toContain(WARNING.DISCOUNT_CLAMPED)
  })

  it('uses a zero or negative yield as observed instead of falling back', () => {
    const stock = stockOf(snapshots.find((row) => row.symbol === 'SHSE:601398').raw)
    const zero = policyValue(stock, { rates: { CNY: { value: 0, asOf: '2026-11-18' } } })
    expect(zero.inputs.discountRate).toBe(10)
    expect(zero.warnings).not.toContain(WARNING.RATE_FALLBACK)
    const negative = policyValue(stock, { rates: { CNY: { value: -2.5, asOf: '2026-11-18' } } })
    expect(negative.inputs.discountRate).toBe(10)
    expect(negative.warnings).not.toContain(WARNING.RATE_FALLBACK)
  })

  it('keeps quote freshness and earnings vintage independent of snapshot capture', () => {
    const stock = {
      ttm_eps: 4, earning_growth_10y: 5, price: '$60', _as_of: '2026-11-19',
      eps_as_of: '2025-12-31', quote_as_of: '2026-11-06',
    }
    const valuation = policyValue(stock, { rates: rateRows, generatedAt: '2026-11-19' })
    expect(valuation).toMatchObject({ priceDate: '2026-11-06', earningsDate: '2025-12-31' })
    expect(valuation.warnings).toEqual(expect.arrayContaining([WARNING.STALE_DATA, WARNING.STALE_PRICE]))
    expect(quoteDateStatus(60, null, '2026-11-19')).toBe('unknown')
    expect(quoteDateStatus(60, '2026-11-18', '2026-11-19')).toBe('dated')
    expect(quoteDateStatus(60, '2026-11-20', '2026-11-19')).toBe('unknown')
    expect(policyValue({ ...stock, price: '' }, { rates: rateRows }).marginOfSafety).toBeNull()
  })

  it('reads a display-string price and derives the margin', () => {
    const stock = stockOf(snapshots.find((row) => row.symbol === 'SHSE:601398').raw)
    const value = policyValue(stock, { rates: rateRows, generatedAt: artifact.generatedAt })
    expect(value.price).toBeGreaterThan(0)
    expect(value.marginOfSafety).toBeCloseTo((1 - value.price / value.value) * 100, 1)
  })
})

describe('classification evidence is disclosed, never a silent guess', () => {
  it.each([['NYSE:O', 'reit'], ['NYSE:WELL', 'reit'], ['NYSE:PSX', 'refining']])(
    '%s ships inputs for trial without a published value or margin', (symbol, industry) => {
      const stock = stockOf(snapshots.find(row => row.symbol === symbol).raw)
      const value = policyValue(stock, { rates: rateRows, generatedAt: artifact.generatedAt })
      expect(value).toMatchObject({ status: 'refused', value: null, band: null, marginOfSafety: null })
      expect(value.reasons).toContain('INDUSTRY_MODEL_PENDING')
      expect(value.warnings).toContain(WARNING.MODEL_CAVEAT)
      expect(value.warnings).not.toContain(WARNING.CLASSIFICATION_UNVERIFIED)
      expect(value.inputs).toMatchObject({ model: 'owner', classification: 'industry', industry })
    },
  )

  it('warns when only missing columns produced the route and the other model differs materially', () => {
    const raw = {
      exchange_: 'NYSE', symbol: 'X', company: 'Acme', price: '$50', ttm_eps: 1,
      tangible_book: 100, earning_growth_10y: 5, _as_of: '2026-11-18',
      financials: { annual: [{ book_value_per_share: 100 }] },
    }
    const value = policyValue(stockOf(raw), { rates: rateRows, generatedAt: artifact.generatedAt })
    expect(value.status).toBe('ok')
    expect(value.inputs).toMatchObject({ model: 'residual', classification: 'columns' })
    expect(value.warnings).toEqual(expect.arrayContaining([WARNING.CLASSIFICATION_UNVERIFIED]))
  })
})

describe('cash is a cross-check after the official base is chosen', () => {
  const raw = (annual, ttm = 10) => ({
    exchange_: 'SHSE', symbol: '600000', price: '¥50', ttm_eps: ttm,
    tangible_book: 100, earning_growth_10y: 5, _as_of: '2026-11-18',
    financials: { annual: annual.map((row) => typeof row === 'number' || row == null
      ? { free_cash_flow_per_share: row } : row) },
  })

  it('refuses when cash still differs from the official base by 50% or more', () => {
    const value = policyValue(stockOf(raw([1, 2, 3])), { rates: rateRows, generatedAt: '2026-11-18' })
    expect(value.status).toBe('refused')
    expect(value.value).toBeNull()
    expect(value.cash).toMatchObject({ base: 2 })
    expect(Math.abs(value.cash.gapPct)).toBeGreaterThanOrEqual(50)
    expect(value.reasons).toContain(REASON.CASH_UNRECONCILED)
    expect(value.warnings).not.toContain(WARNING.CASH_DIVERGENCE)
  })

  it('refuses a Tencent-class name when adopting normalised earnings leaves a 50%+ cash gap', () => {
    const rows = [
      { eps_without_nri: 20, free_cash_flow_per_share: 11 },
      { eps_without_nri: 22, free_cash_flow_per_share: 12 },
      { eps_without_nri: 24, free_cash_flow_per_share: 13 },
    ]
    const value = policyValue(stockOf(raw(rows, 24)), { rates: rateRows, generatedAt: '2026-11-18' })
    expect(value.status).toBe('refused')
    expect(value.value).toBeNull()
    expect(value.inputs.eps).toBe(24)
    expect(Math.abs(value.cash.gapPct)).toBeGreaterThanOrEqual(50)
    expect(value.reasons).toContain(REASON.CASH_UNRECONCILED)
  })

  it('warns, and still publishes, when the remaining gap is 25% to 49%', () => {
    const rows = [
      { eps_without_nri: 10, free_cash_flow_per_share: 6 },
      { eps_without_nri: 10, free_cash_flow_per_share: 7 },
      { eps_without_nri: 10, free_cash_flow_per_share: 8 },
    ]
    const value = policyValue(stockOf(raw(rows, 10)), { rates: rateRows, generatedAt: '2026-11-18' })
    expect(value.status).toBe('ok')
    expect(Math.abs(value.cash.gapPct)).toBeGreaterThanOrEqual(25)
    expect(Math.abs(value.cash.gapPct)).toBeLessThan(50)
    expect(value.warnings).toContain(WARNING.CASH_DIVERGENCE)
    expect(value.reasons).not.toContain(REASON.CASH_UNRECONCILED)
  })

  it('marks NORMALIZED_EPS when the official base differs from latest reported EPS by 25%+', () => {
    const rows = [
      { eps_without_nri: 6, free_cash_flow_per_share: 6 },
      { eps_without_nri: 7, free_cash_flow_per_share: 6 },
      { eps_without_nri: 8, free_cash_flow_per_share: 6 },
      { eps_without_nri: 9, free_cash_flow_per_share: 6 },
      { eps_without_nri: 0.5, free_cash_flow_per_share: 6 },
    ]
    const value = policyValue(stockOf({ ...raw(rows, 0.5) }), { rates: rateRows, generatedAt: '2026-11-18' })
    expect(value.inputs.epsLatest).toBe(0.5)
    expect(value.inputs.eps).toBeGreaterThan(0.5)
    expect(value.warnings).toContain(WARNING.NORMALIZED_EPS)
  })

  it('stays null without three reported positive years', () => {
    const value = policyValue(stockOf(raw([1, null, 3])), { rates: rateRows, generatedAt: '2026-11-18' })
    expect(value.status).toBe('ok')
    expect(value.cash).toBeNull()
    expect(value.warnings).not.toContain(WARNING.CASH_DIVERGENCE)
  })
})

describe('centered envelope and regime rules', () => {
  const at = (symbol) => {
    const stock = stockOf(snapshots.find((row) => row.symbol === symbol).raw)
    return { stock, value: policyValue(stock, { rates: rateRows, generatedAt: artifact.generatedAt }) }
  }
  const owner = (value, discount, growth, terminal = value.inputs.terminalGrowthRate) => presentValue(
    value.inputs.tangibleBook, value.inputs.years, discount, growth, value.inputs.eps, terminal, value.inputs.yearsOfTerminalGrowth, false,
  ).fairValue

  it('does not label a normalised earnings base as a midpoint just because cash is close', () => {
    const stock = {
      exchange_: 'NYSE', symbol: 'X', currency: '$', ttm_eps: 10, earnings_base: 10, eps_normalized: 10, cash_base: 10,
      earning_growth_10y: 5, price: '$100', _as_of: '2026-11-18',
    }
    expect(policyValue(stock, { rate: 5.07 }).inputs.baseKind).toBe('normalized')
  })

  it('uses the disclosed five-year window on the low side for Apple-style positive history, not 0% growth', () => {
    const { value } = at('NASDAQ:AAPL')
    expect(value.status).toBe('ok')
    expect(value.inputs.growth).toBe(15)
    expect(value.inputs.growth5).toBeCloseTo(9.87, 2)
    expect(value.warnings).not.toContain(WARNING.REGIME_UNCERTAIN)
    const low = owner(value, value.inputs.discountRate + 2, value.inputs.growth5)
    const zeroed = owner(value, value.inputs.discountRate + 2, 0)
    expect(value.band.low).toBe(low)
    expect(value.band.low).toBeGreaterThan(zeroed)
  })

  it('moves only the discount rate on the low side when Microsoft-style five-year growth is not lower', () => {
    const { value } = at('NASDAQ:MSFT')
    expect(value.inputs.growth).toBe(15)
    expect(value.inputs.growth5).toBeGreaterThan(15)
    const low = owner(value, value.inputs.discountRate + 2, 15)
    expect(value.band.low).toBe(low)
  })

  it('does not invent a 15% high for Tesla-style zeroed five-year history', () => {
    const { value } = at('NASDAQ:TSLA')
    expect(value.status).toBe('ok')
    expect(value.inputs.growth).toBe(0)
    expect(value.inputs.growthWindow).toBe('5y')
    expect(value.warnings).toContain(WARNING.REGIME_UNCERTAIN)
    const high = owner(value, Math.max(value.inputs.discountRate - 2, value.inputs.terminalGrowthRate + 2), 0)
    const invented = owner(value, Math.max(value.inputs.discountRate - 2, value.inputs.terminalGrowthRate + 2), 15)
    expect(value.band.high).toBe(high)
    expect(value.band.high).toBeLessThan(invented)
  })

  it('still widens a positive five-year-only history toward the 15% cap', () => {
    const { value } = at('HKSE:01810')
    expect(value.inputs.growthWindow).toBe('5y')
    expect(value.inputs.growth).toBeGreaterThan(0)
    const high = owner(value, Math.max(value.inputs.discountRate - 2, value.inputs.terminalGrowthRate + 2), 15)
    expect(value.band.high).toBe(high)
  })

  it('keeps an opposite-sign window as a regime, including Alibaba', () => {
    const { value } = at('HKSE:09988')
    expect(value.status).toBe('ok')
    expect(value.inputs.growth10).toBeGreaterThan(0)
    expect(value.inputs.growth5).toBeLessThan(0)
    expect(value.warnings).toContain(WARNING.REGIME_UNCERTAIN)
    const decline = owner(value, value.inputs.discountRate + 2, 0, 0)
    expect(value.band.low).toBe(decline)
  })

  it('does not refuse a Fiserv-style same-sign gap as an unstable regime', () => {
    const { value } = at('NASDAQ:FISV')
    expect(value.inputs.growth10).toBeCloseTo(13.18, 2)
    expect(value.inputs.growth5).toBeCloseTo(35.27, 2)
    expect(value.warnings).not.toContain(WARNING.REGIME_UNCERTAIN)
    expect(value.reasons).not.toContain(REASON.UNSTABLE_BASE_REGIME)
  })
})

describe('the committed artifact is what the policy produces', () => {
  it('covers the whole declared universe with the expected shape', () => {
    expect(artifact.policyVersion).toBe(POLICY_VERSION)
    expect(artifact.policyHash).toBe(POLICY_V1_HASH)
    const size = catalog.length
    expect(Object.keys(artifact.entries)).toHaveLength(size)
    expect(artifact.universe).toEqual({ declared: size, snapshots: size, missing: [] })
    expect(artifact.coverage.valued + artifact.coverage.refused).toBe(size)
    expect(Object.values(artifact.coverage.models).reduce((sum, count) => sum + count, 0)).toBe(size)
    expect(Object.values(artifact.coverage.currencies).reduce((sum, count) => sum + count, 0)).toBe(size)
  })

  it('publishes the pinned values and refusals', () => {
    const entry = (symbol) => artifact.entries[symbol]
    expect(entry('SHSE:601398')).toMatchObject({ status: 'ok', value: 10.76 })
    expect(entry('SHSE:601398').inputs.model).toBe('residual')
    expect(entry('NASDAQ:AAPL').value).toBe(122.7)
    expect(entry('NYSE:TSM')).toMatchObject({ value: 125.1, earningsDate: '2025-12-31', earningsPeriod: 'FY', inputs: { eps: 6.25 } })
    expect(entry('HKSE:00700')).toMatchObject({ status: 'refused', value: null, reasons: expect.arrayContaining(['CASH_UNRECONCILED']) })
    expect(entry('NASDAQ:INTC')).toMatchObject({ status: 'refused', value: null })
    expect(entry('NYSE:GPC')).toMatchObject({ status: 'ok' })
    expect(entry('NYSE:GPC').value).not.toBe(1.13)
    expect(entry('NYSE:GPC').value).toBe(71.61)
    expect(entry('NYSE:GPC').warnings).toContain(WARNING.REGIME_UNCERTAIN)
    expect(entry('NYSE:GPC')).toMatchObject({
      inputs: expect.objectContaining({
        epsLatest: expect.any(Number),
        epsNormalized: expect.any(Number),
        cashMedian: expect.any(Number),
        baseKind: expect.stringMatching(/^(midpoint|normalized|cash|latest|repeatable)$/),
      }),
    })
    expect(entry('NASDAQ:AAPL').inputs.baseKind).toBe('normalized')
    expect(entry('NYSE:GPC').inputs.baseKind).toBe('normalized')
    expect(entry('SHSE:601398').inputs.baseKind).toBe('normalized')
    expect(entry('SHSE:601398').value).toBe(10.76)
    expect(entry('NASDAQ:FISV')).toMatchObject({ status: 'ok', value: 118.29 })
    expect(entry('NASDAQ:FISV').warnings).not.toContain(WARNING.REGIME_UNCERTAIN)
    expect(entry('NASDAQ:FISV').reasons).not.toContain(REASON.UNSTABLE_BASE_REGIME)
    expect(entry('NYSE:V')).toMatchObject({ status: 'refused', value: null })
    expect(entry('HKSE:00002').status).toBe('ok')
    expect(entry('HKSE:00066').status).toBe('ok')
  })

  it('stores only known codes and a rate row on every entry', () => {
    for (const [symbol, entry] of Object.entries(artifact.entries)) {
      for (const code of entry.reasons) expect(isKnownReason(code), symbol + ' ' + code).toBe(true)
      for (const code of entry.warnings) expect(isKnownWarning(code), symbol + ' ' + code).toBe(true)
      expect(entry.inputs.rate, symbol).not.toBeNull()
      if (entry.status === 'ok') expect(entry.value, symbol).toBeGreaterThan(0)
      else expect(entry.value, symbol).toBeNull()
    }
  })

  it('reports the A/H cross-listing gap without editing values', () => {
    expect(artifact.crossListing).toHaveLength(9)
    const byd = artifact.crossListing.find((row) => row.id === 'BYD')
    expect(byd.status).toBe('input-mismatch')
    expect(byd.valueDiffPct).toBeCloseTo(-39.22, 2)
  })
})

describe('calculator seed and policy inputs cannot drift', () => {
  it('gives buildDefaults and policyValue the same inputs for every snapshot', () => {
    for (const { symbol, raw } of snapshots) {
      const stock = stockOf(raw)
      const yieldPct = yieldOf(stock)
      const seed = buildDefaults(yieldPct, stock, Number(stock.free_cash_flow_per_share) || 0)
      const value = policyValue(stock, { rates: rateRows, generatedAt: artifact.generatedAt })
      if (value.status !== 'ok') continue
      expect(value.inputs.eps, symbol).toBe(seed.dcfForm.eps)
      expect(value.inputs.growth, symbol).toBe(seed.dcfForm.growthRate)
      expect(value.inputs.discountRate, symbol).toBe(seed.dcfForm.discountRate)
      expect(value.inputs.terminalGrowthRate, symbol).toBe(seed.dcfForm.terminalGrowthRate)
      expect(value.inputs.years, symbol).toBe(seed.dcfForm.years)
      expect(value.inputs.yearsOfTerminalGrowth, symbol).toBe(seed.dcfForm.yearsOfTerminalGrowth)
      expect(value.inputs.tangibleBook, symbol).toBe(seed.dcfResultForm.tbv)
      const recomputed = value.inputs.model === 'residual'
        ? residualIncomeValue(value.inputs.tangibleBook, value.inputs.eps, value.inputs.discountRate, value.inputs.growth, value.inputs.terminalGrowthRate, value.inputs.years)?.fairValue
        : presentValue(value.inputs.tangibleBook, value.inputs.years, value.inputs.discountRate, value.inputs.growth, value.inputs.eps, value.inputs.terminalGrowthRate, value.inputs.yearsOfTerminalGrowth, false).fairValue
      expect(recomputed, symbol).toBeCloseTo(value.value, 2)
    }
  })

  it('keeps the watchlist overview on the same function', () => {
    const fixture = readJson('src/data/bundled/stock_icbc.json')
    const view = defaultView(fixture, 6)
    expect(view.fairValue).toBe(13.49)
    expect(view.mos).toBeCloseTo(34.4, 1)
  })
})
