import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_UNDERWRITTEN_GROWTH, clampGrowthInput, growthInputCeiling } from '../../src/lib/assumptions'

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

describe('growthInputCeiling', () => {
  it('does not treat a missing reinvestment cap as 0%', () => {
    expect(growthInputCeiling(null)).toBe(MAX_UNDERWRITTEN_GROWTH)
    expect(growthInputCeiling(undefined)).toBe(MAX_UNDERWRITTEN_GROWTH)
    expect(growthInputCeiling('')).toBe(MAX_UNDERWRITTEN_GROWTH)
    expect(growthInputCeiling(Number.NaN)).toBe(MAX_UNDERWRITTEN_GROWTH)
  })

  it('keeps a true 0% company cap and uses the lower of g* and 15%', () => {
    expect(growthInputCeiling(0)).toBe(0)
    expect(growthInputCeiling('0')).toBe(0)
    expect(growthInputCeiling(8.25)).toBe(8.25)
    expect(growthInputCeiling(20)).toBe(MAX_UNDERWRITTEN_GROWTH)
  })
})

describe('clampGrowthInput', () => {
  it('caps typed and stepped values at the ceiling and leaves missing values alone', () => {
    expect(clampGrowthInput(16, 8)).toBe(8)
    expect(clampGrowthInput(8, 8)).toBe(8)
    expect(clampGrowthInput(7, 8)).toBe(7)
    expect(clampGrowthInput(1, 0)).toBe(0)
    expect(clampGrowthInput('16', '8.25')).toBe(8.25)
    expect(clampGrowthInput('', 8)).toBeNull()
    expect(clampGrowthInput(null, 8)).toBeNull()
  })

  it('does not impose a zero floor on a negative trial rate', () => {
    expect(clampGrowthInput(-2, 8)).toBe(-2)
    expect(clampGrowthInput(-2, 0)).toBe(-2)
  })
})

describe('calculator growth controls', () => {
  const source = read('src/components/DcfCalculator.vue')
  const zh = JSON.parse(read('src/i18n/zh-Hans.json'))
  const en = JSON.parse(read('src/i18n/en-US.json'))

  it('derives the visible ceiling without coercing a missing g* to 0', () => {
    expect(source).toContain('growthInputCeiling')
    expect(source).toContain('clampGrowthInput')
    expect(source).toContain('finiteOrNull(policyEntry.value?.inputs?.sustainableGrowth)')
    expect(source).toContain("t('growth_cap_fifteen')")
    expect(source).toContain("t('growth_cap_company'")
    expect(source).not.toMatch(/Number\(policyEntry\.value\?\.inputs\?\.sustainableGrowth\)/)
  })

  it('binds starting-growth typing and stepping to the same ceiling', () => {
    expect(source.match(/:max="growthCeiling"/g)?.length).toBe(3)
    expect(source.match(/@change="clampGrowth"/g)?.length).toBe(2)
    expect(source).toContain('applyGrowth(current + delta)')
  })

  it('keeps the visible terminal-growth name and its accessible name aligned', () => {
    expect(zh.terminal_growth_short).toBe('永续增长')
    expect(en.terminal_growth_short).toBe('Terminal growth')
    expect(zh).not.toHaveProperty('terminal_growth_rate')
    expect(en).not.toHaveProperty('terminal_growth_rate')
    const row = source.slice(
      source.indexOf("t('terminal_growth_short')"),
      source.indexOf('default_terminal_growth_note'),
    )
    expect(row).toContain(":aria-label=\"t('terminal_growth_short')\"")
    expect(row).not.toContain('terminal_growth_rate')
  })
})
