import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { POLICY_V1_HASH, POLICY_VERSION } from '../../src/lib/policy.js'
import { windowGrowth, officialGrowth } from '../../src/lib/assumptions.js'
import {
  HISTORICAL_OUT, OFFICIAL_OUT, HISTORICAL_DISCOUNT_RATE,
  RESEARCH_GROWTH_BLEND, DAMPENING_REFERENCE,
  buildHistoricalReport, buildOfficialReport, reportText, loadPanel,
  discountFlows, forecastFlows, officialDiscountRate,
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

  it('uses official v3 adopted 10-year growth and official discount as the reference', () => {
    const report = buildOfficialReport(study)
    expect(report.kind).toBe('official-policy-run')
    expect(report.policyVersion).toBe(POLICY_VERSION)
    expect(report.policyHash).toBe(POLICY_V1_HASH)
    expect(report.growthRule).toBe('official-growth-dual-window-zeroed-terminal')
    expect(report.discountRule).toBe('max(floor, local-10y-ceil+6)')
    expect(report.discountRate).toBe(officialDiscountRate(study))
    expect(report.discountRate).toBe(11)
    expect(report.terminalIncluded).toBe(true)
    expect(report.defaultTerminalGrowthRate).toBe(4)
    expect(report.asOf).toBe('2006-03-15')
    expect(report.note).toMatch(/not a license to change official growth or discount/)
    expect(report.note).toMatch(/must include official terminal growth/)
    // Official windows walk forward past a starting loss, so BA enters; VZ has no cash path.
    expect(report.rows.map((row) => row.ticker)).toEqual(['GE', 'UPS', 'BA', 'INTC', 'IBM'])
    expect(report.sample).toBe(5)
    expect(report.paired).toBe(5)
    const ba = report.rows.find((row) => row.ticker === 'BA')
    const series = study.companies.find((row) => row.ticker === 'BA').epsFrom1995
      .map((val, i) => ({ fy: 1995 + i, val }))
      .filter((row) => Number.isFinite(row.val))
    const official = officialGrowth({
      growth10: windowGrowth(series, 10),
      growth5: windowGrowth(series, 5),
      hasPositiveBase: true,
    })
    expect(ba.officialGrowth).toBe(official.adopted)
    expect(ba.officialTerminalGrowth).toBe(official.zeroTerminal ? 0 : 4)
    expect(ba.historical).toBeNull()
    expect(Number.isFinite(ba.official)).toBe(true)
    // Official is the default reference; blended remains an experiment.
    expect(report.medians.official).toEqual(expect.any(Number))
    expect(RESEARCH_GROWTH_BLEND).toEqual({ oneYear: 0.2, fiveYear: 0.5, tenYear: 0.3 })
    expect(DAMPENING_REFERENCE).toBe(0.5)
    expect(readFileSync(OFFICIAL_OUT, 'utf8')).toBe(reportText(report))
    expect(OFFICIAL_OUT.startsWith('public/')).toBe(false)
    expect(OFFICIAL_OUT).not.toBe(HISTORICAL_OUT)
  })

  it('can include a terminal value later without using it on the frozen panel', () => {
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
