import { describe, expect, it } from 'vitest'
import { applyTemplate, parseTemplateFile, templateFileName } from '../../src/lib/template-io'

const row = { name: 'conservative', eps: 1.08, growthRate: 5, basis: 'eps' }

describe('parseTemplateFile', () => {
  it('accepts a bare array and keeps the known fields', () => {
    const result = parseTemplateFile(JSON.stringify([row]))
    expect(result.ok).toBe(true)
    expect(result.templates[0].name).toBe('conservative')
    expect(result.templates[0].eps).toBe(1.08)
    expect(result.templates[0].basis).toBe('eps')
  })

  it('accepts the {templates: []} envelope the exporter writes', () => {
    const result = parseTemplateFile(JSON.stringify({ version: 1, templates: [{ ...row, basis: 'freecashflow', ebitda_growth: 9 }] }))
    expect(result.ok).toBe(true)
    expect(result.templates[0].basis).toBe('freecashflow')
    expect(result.templates[0].ebitda_growth).toBe(9)
  })

  it('rejects broken json, wrong shapes and unnamed rows', () => {
    expect(parseTemplateFile('{oops').reason).toBe('json')
    expect(parseTemplateFile('"text"').reason).toBe('shape')
    expect(parseTemplateFile(JSON.stringify([{ eps: 1 }])).reason).toBe('empty')
  })

  it('coerces missing numbers to null instead of NaN', () => {
    expect(parseTemplateFile(JSON.stringify([{ name: 'x', eps: 'abc' }])).templates[0].eps).toBeNull()
  })

  it('names the export file by date', () => {
    expect(templateFileName()).toMatch(/^dcf-templates-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('puts saved years back on the stage they came from', () => {
    const form = applyTemplate(
      { years: 10, yearsOfTerminalGrowth: 10, growthRate: 3, freecashflowGrowthRate: 1, discountRate: 12, terminalGrowthRate: 4 },
      { basis: 'freecashflow', yGrowth: 8, terminalyear: 12, ebitda_growth: 6, discountRate: 9, desiredYield: 2 },
    )
    expect(form.years).toBe(8)
    expect(form.yearsOfTerminalGrowth).toBe(12)
    expect(form.freecashflowGrowthRate).toBe(6)
    expect(form.growthRate).toBe(3)
    expect(form.discountRate).toBe(9)
    expect(form.terminalGrowthRate).toBe(2)
  })
})
