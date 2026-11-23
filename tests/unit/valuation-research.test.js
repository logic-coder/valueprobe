import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { discountPath, shareholderValue } from '../../scripts/research/owner-earnings.mjs'
import { discountCash, forecastCash, historicalCashBase } from '../../scripts/research/cash-forecast.mjs'
import { marginStress } from '../../src/lib/marginStress'
import { POLICY_VERSION } from '../../src/lib/policy'
import history from '../../public/research/dia-2015.json'
import cashStudy from '../../public/research/cash-path-2006-2015.json'
import cashInputs from '../../scripts/research/cash-path-inputs.json'

const release = JSON.parse(readFileSync('public/data/intrinsic/' + POLICY_VERSION + '.json', 'utf8'))

describe('growth funded by retained earnings', () => {
  const inputs = { years: 10, growth: 5, terminalGrowthRate: 3, discountRate: 10 }
  it('capitalizes next-year earnings at the hurdle when reinvestment earns exactly the hurdle', () => {
    expect(shareholderValue(10, 0.1, inputs).value).toBeCloseTo(10.5 / 0.1, 8)
    expect(shareholderValue(10, 0.2, inputs).value).toBeGreaterThan(105)
    expect(shareholderValue(10, 0.06, inputs).value).toBeLessThan(105)
    expect(shareholderValue(10, 0.04, inputs)).toBeNull()
  })
})

it('holds cash fixed when the required return changes and capitalizes flat cash as a perpetuity', () => {
  const forecast = forecastCash(historicalCashBase([8, 10, 700]), { years: 10, growth: 0, terminalGrowthRate: 0 })
  expect(forecast.flows).toEqual(Array(10).fill(10))
  expect(discountCash(forecast, 10).value).toBeCloseTo(100, 8)
  expect(discountCash(forecast, 20).value).toBeCloseTo(50, 8)
  expect(discountCash(forecast, 0)).toBeNull()
  expect(historicalCashBase([8, null, 700])).toBeNull()
  expect(historicalCashBase([-8, -2, 700])).toBeNull()
  expect(forecastCash(10, { years: 10, growth: -100, terminalGrowthRate: 3 })).toBeNull()
  expect(discountCash({ ...forecast, terminalGrowthRate: 10 }, 10)).toBeNull()
})

describe('historical discounts', () => {
  const start = { price: 8, value: 10, splitFromStart: 1 }
  it('distinguishes a falling estimate, a gap, and an observed discount', () => {
    const lower = { price: 3.5, value: 3, splitFromStart: 2 }
    expect(discountPath([start, lower])).toMatchObject({ status: 'observedCrossing', driver: 'lowerEstimate', priceChange: -0.125 })
    expect(discountPath([start, {}, lower]).status).toBe('crossedAfterGap')
    expect(discountPath([start, {}]).status).toBe('incomplete')
    expect(discountPath([start, start]).status).toBe('discountAtAllCloses')
  })
  it('retains every original constituent and reproduces its path from the public observations', () => {
    expect(new Set(history.companies.map(c => c.cik)).size).toBe(30)
    for (const company of history.companies) {
      expect(company.rows).toHaveLength(11)
      expect(discountPath(company.rows)).toEqual(company.path)
    }
  })
})

it('scores only complete cash paths and discounts each fiscal year without a terminal value', () => {
  const complete = cashStudy.companies.filter(c => c.cumulative)
  expect(complete).toHaveLength(cashStudy.paired)
  for (const company of complete) {
    const source = cashInputs.companies.find(c => c.ticker === company.ticker)
    const actual = source.observations.reduce((pv, x) =>
      pv + (x.ocf - x.capex) / x.shares / (1 + company.discount / 100) ** (x.fy - 2005), 0)
    expect(source.observations.map(x => x.fy)).toEqual(Array.from({ length: 10 }, (_, i) => 2006 + i))
    expect(company.cumulative.observed).toBeCloseTo(actual, 3)
    expect(new Set(company.rows.map(x => x.values.flatCash)).size).toBe(1)
  }
  const censored = cashStudy.companies.find(c => c.ticker === 'VZ')
  expect(censored.cumulative).toBeNull()
  expect(censored.rows.every(r => r.observed == null)).toBe(true)
})

it('requoting both model types only changes margins', () => {
  for (const ticker of ['NASDAQ:AAPL', 'SHSE:601398']) {
    const entry = release.entries[ticker]
    const initial = marginStress(entry, entry.price)
    const repriced = marginStress(entry, entry.price * 2)
    expect(initial[0].value).toBe(entry.value)
    expect(repriced.map(row => row.value)).toEqual(initial.map(row => row.value))
    expect(repriced.every((row, i) => row.margin < initial[i].margin)).toBe(true)
    expect(marginStress(entry, '')).toBeNull()
  }
})
