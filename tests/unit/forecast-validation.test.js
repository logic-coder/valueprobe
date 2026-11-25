import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { POLICY_V1, POLICY_V1_HASH, POLICY_VERSION } from '../../src/lib/policy.js'
import { officialGrowth, windowGrowth } from '../../src/lib/assumptions.js'
import { presentValue } from '../../src/lib/dcf.js'
import {
  HISTORICAL_OUT, OFFICIAL_OUT, LEGACY_GORDON_OUT, HISTORICAL_DISCOUNT_RATE,
  RESEARCH_GROWTH_BLEND, DAMPENING_REFERENCE, BASE_KEYS, GROWTH_KEYS,
  CONTINUATION_SPREAD,
  buildHistoricalReport, buildOfficialReport, reportText, loadPanel,
  discountFlows, forecastFlows, officialDiscountRate,
  publishedPathValue, realizedPublishedPathValue, officialHorizon,
} from '../../scripts/research/forecast-validation-lib.mjs'

const study = loadPanel()

describe('forecast-validation harness', () => {
  it('reproduces the labeled 2026-11-22 research run and does not call it official', () => {
    const report = buildHistoricalReport(study)
    expect(report.kind).toBe('historical-research-run')
    expect(report.policy).toBe('research-branch-blended-growth')
    expect(report.asOf).toBe('2006-03-15')
    expect(report.discountRate).toBe(HISTORICAL_DISCOUNT_RATE)
    expect(report.terminalIncluded).toBe(false)
    expect(report.sample).toBe(4)
    expect(report.paired).toBe(4)
    expect(report.medians).toEqual({
      flat: 14.8314,
      historical: 37.5194,
      dampened: 26.015,
      blended: 29.995,
    })
    expect(report.dampenedBeatsFlat).toBe(1)
    expect(report.dampenedBeatsHistorical).toBe(3)
    expect(report.blendedBeatsFlat).toBe(1)
    expect(report.blendedBeatsHistorical).toBe(3)
    expect(report.rows.map((row) => row.ticker)).toEqual(['GE', 'UPS', 'INTC', 'IBM'])
    expect(report.note).toMatch(/not an official v3 result/)
    expect(report.note).toMatch(/must not be treated as a license/)
    expect(readFileSync(HISTORICAL_OUT, 'utf8')).toBe(reportText(report))
    expect(HISTORICAL_OUT.startsWith('public/')).toBe(false)
  })

  it('scores official factors on the published path with the same base in each growth comparison', () => {
    const report = buildOfficialReport(study)
    expect(report.kind).toBe('official-policy-factor-run')
    expect(report.role).toBe('harness-debug')
    expect(report.policyVersion).toBe(POLICY_VERSION)
    expect(report.policyHash).toBe(POLICY_V1_HASH)
    expect(report.growthRule).toBe(POLICY_V1.revision.officialGrowth)
    expect(report.discountRule).toBe('max(floor, local-10y-ceil+6)')
    expect(report.discountRate).toBe(officialDiscountRate(study))
    expect(report.discountRate).toBe(11)
    expect(report.defaultTerminalGrowthRate).toBe(4)
    expect(report.years).toBe(10)
    expect(report.yearsOfTerminalGrowth).toBe(10)
    expect(report.asOf).toBe('2006-03-15')
    expect(report.debugSet.tickers).toEqual(['GE', 'UPS', 'BA', 'INTC', 'IBM'])
    expect(report.debugSet.sample).toBe(5)
    expect(report.debugSet.pairedCash).toBe(5)
    expect(report.debugSet.pairedOwnerEarnings).toBe(0)
    expect(report.debugSet.universeRule).toMatch(/debug set/)
    expect(report.note).toMatch(/not a license to change official growth or discount/)
    expect(report.note).toMatch(/harness debug set/)
    expect(report.expansion.status).toBe('blocked')
    expect(report.expansion.runs).toEqual([])

    const cash = report.debugSet.cashFactors
    for (const baseKey of BASE_KEYS) {
      expect(Object.keys(cash[baseKey])).toEqual([...GROWTH_KEYS])
    }
    // Main growth comparison is officialSelected, not a mixed-base official-vs-flat table.
    expect(report.debugSet.growthOnOfficialBaseCash).toEqual(cash.officialSelected)
    expect(report.debugSet.growthOnOfficialBaseOwnerEarnings).toBeNull()

    const ba = report.debugSet.rows.find((row) => row.ticker === 'BA')
    const series = study.companies.find((row) => row.ticker === 'BA').epsFrom1995
      .map((val, i) => ({ fy: 1995 + i, val }))
      .filter((row) => Number.isFinite(row.val))
    const official = officialGrowth({
      growth10: windowGrowth(series, 10),
      growth5: windowGrowth(series, 5),
      hasPositiveBase: true,
    })
    expect(ba.growths.slower).toBe(official.adopted)
    expect(ba.growths.five).toBe(official.adopted)
    expect(ba.predictedOfficial).toBe(ba.publishedValue)
    expect(Number.isFinite(ba.cashCells.officialSelected.slower)).toBe(true)

    const intc = report.debugSet.rows.find((row) => row.ticker === 'INTC')
    expect(intc.blend).toBe('midpoint')
    expect(intc.bases.earnings).toBe(0.85)
    expect(intc.bases.cash).toBe(1.4284)
    expect(intc.growths.slower).toBe(0)
    expect(intc.growths.five).toBe(0)
    // When official growth is 0, officialSelected zero and slower match; the
    // leftover gap versus a cash-and-zero cell is a base difference.
    expect(intc.cashCells.officialSelected.slower).toBe(intc.cashCells.officialSelected.zero)
    expect(intc.cashCells.officialSelected.zero).not.toBe(intc.cashCells.cash.zero)
    expect(intc.cashCells.earnings.zero).not.toBe(intc.cashCells.cash.zero)

    expect(RESEARCH_GROWTH_BLEND).toEqual({ oneYear: 0.2, fiveYear: 0.5, tenYear: 0.3 })
    expect(DAMPENING_REFERENCE).toBe(0.5)
    expect(readFileSync(OFFICIAL_OUT, 'utf8')).toBe(reportText(report))
    expect(OFFICIAL_OUT.startsWith('public/')).toBe(false)
    expect(OFFICIAL_OUT).not.toBe(HISTORICAL_OUT)
    expect(LEGACY_GORDON_OUT.startsWith('public/')).toBe(false)
  })

  it('reproduces the retired mixed-base Gordon contrast and the colleague factor split', () => {
    const report = buildOfficialReport(study)
    const legacy = report.legacyConstantGordon
    expect(legacy.kind).toBe('retired-constant-explicit-plus-gordon')
    expect(legacy.note).toMatch(/not a same-base growth comparison/)
    expect(legacy.medians.officialMixed).toBe(76.6889)
    expect(legacy.medians.flatCashZero).toBe(43.9684)
    // Fixed five-year earnings median: long window vs slower window.
    expect(legacy.medians.fiveMedTen).toBe(57.3822)
    expect(legacy.medians.fiveMedSlower).toBe(76.6889)
    // Official selected base (including the INTC midpoint) with the old scorer.
    expect(legacy.medians.officialSelectedTen).toBe(42.1353)
    expect(legacy.medians.officialSelectedSlower).toBe(50.4228)
    expect(legacy.medians.officialSelectedZero).toBe(50.4228)
    expect(legacy.officialMixedBeatsFlatCashZero).toBe(2)
    const frozen = JSON.parse(readFileSync(LEGACY_GORDON_OUT, 'utf8'))
    expect(frozen.medians.official).toBe(76.6889)
    expect(frozen.medians.flat).toBe(43.9684)
    expect(frozen.officialBeatsFlat).toBe(2)
  })

  it('keeps presentValue and the realised published-path tail on the same machinery', () => {
    const horizon = officialHorizon()
    const discountRate = 11
    const growth = 6
    const base = 2
    const predicted = publishedPathValue(base, growth, discountRate, horizon)
    const faded = []
    const r = discountRate / 100
    const gc = Math.min(horizon.terminalGrowthRate / 100, r - CONTINUATION_SPREAD)
    const g0 = growth / 100
    let flow = base
    for (let t = 1; t <= horizon.years; t++) {
      const weight = (t - 1) / (horizon.years - 1)
      flow *= 1 + g0 + (gc - g0) * weight
      faded.push(flow)
    }
    const realised = realizedPublishedPathValue(faded, discountRate, horizon)
    const direct = presentValue(0, horizon.years, discountRate, growth, base, horizon.terminalGrowthRate, horizon.yearsOfTerminalGrowth, false)
    expect(predicted).toBe(direct.fairValue)
    expect(realised).toBe(direct.fairValue)
    const flows = forecastFlows(10, 0, 10)
    expect(discountFlows(flows, 11, null)).toBeCloseTo(
      flows.reduce((sum, cash, i) => sum + cash / (1.11) ** (i + 1), 0),
      10,
    )
    const withTerminal = discountFlows(flows, 11, 4)
    const last = 10
    const continuing = last * 1.04
    const expected = flows.reduce((sum, cash, i) => sum + cash / (1.11) ** (i + 1), 0)
      + continuing / (0.11 - 0.04) / (1.11) ** 10
    expect(withTerminal).toBeCloseTo(expected, 10)
    expect(discountFlows(flows, 4, 4)).toBeNull()
    expect(buildOfficialReport(study).terminalIncluded).toBe(true)
    expect(buildHistoricalReport(study).terminalIncluded).toBe(false)
  })
})
