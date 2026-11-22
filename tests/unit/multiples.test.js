import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LONG_RUN_PE, MULTIPLES, NO_GROWTH_RATE, currentMultiple, impliedPrice } from '../../src/lib/multiples'

describe('multiple cross-check', () => {
  it('implies a price from a base and a target multiple', () => {
    expect(impliedPrice(1.08, LONG_RUN_PE)).toBe(12.96)
    expect(impliedPrice(11.24, 1.2)).toBeCloseTo(13.49, 2)
  })

  it('states the required return the fixed multiple implies', () => {
    // 12× is quoted on the page as a no-growth anchor, so the rate behind it
    // must travel with it instead of being left for the reader to back out.
    expect(NO_GROWTH_RATE).toBe(8.3)
    expect(100 / NO_GROWTH_RATE).toBeCloseTo(12, 0)
  })

  it('computes the multiple the market currently pays', () => {
    expect(currentMultiple(1.08, 9.05)).toBe(8.38)
  })

  it('returns null rather than dividing by zero', () => {
    expect(currentMultiple(0, 9.05)).toBeNull()
    expect(currentMultiple(1.08, 0)).toBeNull()
    expect(impliedPrice(0, 12)).toBeNull()
    expect(impliedPrice(1, -1)).toBeNull()
  })

  it('names the three bases the page can supply', () => {
    expect(MULTIPLES.map((item) => item.baseField)).toEqual(['eps', 'freecashflow', 'tbv'])
  })
})

describe('multiple cross-check panel', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/MultipleCheckPanel.vue'), 'utf8')
  const foot = source.slice(source.indexOf('<tfoot'), source.indexOf('</tfoot>'))

  it('puts the fixed multiple in the table as a value, not a fourth input', () => {
    // The reference row is the same arithmetic as the rows above, so it belongs
    // in the grid; but its multiple is a constant, so it must not be editable.
    expect(source.indexOf('<tfoot')).toBeGreaterThan(source.indexOf('</tbody>'))
    expect(foot).toContain('LONG_RUN_PE')
    expect(foot).not.toContain('<input')
  })

  it('keeps the no-growth caveat out of the table body', () => {
    const note = source.slice(source.indexOf('mcheck__note'))
    expect(note).toContain('multiple_ref_note')
    expect(foot).not.toContain('multiple_ref_note')
  })
})
