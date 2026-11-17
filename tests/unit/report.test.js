import { describe, expect, it } from 'vitest'
import { buildReport, reportFilename } from '../../src/lib/report'

const base = {
  symbol: 'SHSE:601398',
  company: '工商银行',
  currency: '¥',
  price: 9.05,
  basis: 'eps',
  form: { eps: 1.08, freecashflow: 6.64, years: 10, growthRate: 5, terminalGrowthRate: 4, yearsOfTerminalGrowth: 10, discountRate: 12 },
  result: { fairValue: 11.56, growthValue: 7.7, terminalValue: 3.85, marginOfSafety: 21.71, reverseGrowthRate: 0.71, tbv: 11.24, addToFairValue: false },
}

describe('report', () => {
  it('writes the assumptions and the kernel outputs', () => {
    const text = buildReport(base)
    expect(text).toContain('工商银行 (SHSE:601398)')
    expect(text).toContain('| 内在价值 | ¥ 11.56 |')
    expect(text).toContain('| 折现率 | 12.00% |')
    expect(text).toContain('安全边际 | +21.7%')
    expect(text).toContain('不构成投资建议')
  })

  it('expands the sensitivity matrix when given one', () => {
    const text = buildReport({ ...base, grid: { discounts: [11, 12], growths: [4, 5], rows: [[1.1, 1.2], [1.3, 1.4]] } })
    expect(text).toContain('## 敏感度')
    expect(text).toContain('| 12.0% | 1.30 | 1.40 |')
  })

  it('lists peers with their medians', () => {
    const peers = [{ symbol: 'SHSE:601939', name: '建设银行', price: 12.26, pe: 9.1, pb: 0.9 }]
    peers.medianPe = 9.5
    peers.implied = 10.26
    const text = buildReport({ ...base, peers })
    expect(text).toContain('| 建设银行 | ¥ 12.26 | 9.1× | 0.90× |')
    expect(text).toContain('同行中位 P/E 9.5×，隐含 ¥ 10.26')
  })

  it('reports provenance when it exists', () => {
    const text = buildReport({ ...base, meta: { source: 'registry', asOf: '2026-09-30' } })
    expect(text).toContain('来源：registry；数据截至 2026-09-30')
  })

  it('names the file after the symbol and the moment', () => {
    expect(reportFilename('SHSE:601398', new Date('2026-11-16T12:34:00Z'))).toBe('valuation-SHSE-601398-2026-11-16-12-34.md')
  })
})
