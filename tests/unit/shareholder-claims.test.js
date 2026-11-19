import { expect, it } from 'vitest'
import claims from '../../public/research/shareholder-claims.json'
import holdout from '../../public/research/sector-holdout-2015.json'
import { settleClaim } from '../../scripts/research/shareholder-ledger.mjs'

const claim = name => claims.holdings.find(r => r.initial === name)
const positions = row => Object.fromEntries(row.securities.map(s => [s.ticker, s.quantity]))

it('holds different entitlements for the two sides of the same merger', () => {
  expect(positions(claim('UTX'))).toEqual({ RTX: 1, CARR: 1, OTIS: 0.5 })
  expect(positions(claim('RTN'))).toEqual({ RTX: 2.3348 })
  expect(positions(claim('DD.old')).DD).toBeCloseTo(1.282 / 3, 10)
  expect(positions(claim('DHR')).VNT).toBeCloseTo(0.2, 10)
  expect(claim('DHR').ledger.some(e => e.kind === 'dividend' && e.date === '2016-07-05')).toBe(false)
  expect(positions(claim('HON')).ASIX).toBe(0.04)
})

it('retains prior cash through later distributions and values only surviving shares', () => {
  const emc = claim('EMC')
  const dell = 0.11146 * 1.8066
  expect(positions(emc)).toEqual({ DELL: dell })
  expect(emc.mergerCash).toBeCloseTo(24.05 + dell * 0.440626 * 142.50, 9)
  expect(claim('PCP')).toMatchObject({ securities: [], distributions: 0, wealth: 235 })
  expect(claim('BRCM').mergerCash).toBe(51.4829)
  for (const row of claims.holdings) {
    expect(row.wealth).toBeCloseTo(row.marketValue + row.distributions + row.mergerCash, 9)
  }
})

it('rejects an unpriced residual security and excludes pre-entry entitlements', () => {
  const input = { initial: 'A', start: '2015-12-31', end: '2016-02-01', terms: [],
    dividends: [{ date: '2015-12-31', leg: 'A', amount: 5 }], quotes: {} }
  expect(() => settleClaim(input)).toThrow('Missing terminal')
  expect(settleClaim({ ...input, quotes: { A: { close: 2 } } }).wealth).toBe(2)
})

it('retains the fixed sample, including firms missing from the paired operating comparison', () => {
  const roster = claims.holdings.filter(c => c.cohort === 'sectorHoldout').map(c => c.initial).sort()
  expect(roster).toEqual(holdout.companies.map(c => c.ticker).sort())
  expect(new Set(roster).size).toBe(16)
  expect(holdout.companies.find(c => c.ticker === 'EMC').actual).toBeUndefined()
  expect(holdout.companies.find(c => c.ticker === 'HPQ').outcomeStatus).toBe('lastEntryFYPrecedesSeparation')
})
