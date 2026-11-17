import { describe, expect, it } from 'vitest'
import { buildFinancialCsv, financialsFilename } from '../../src/lib/financials'

const view = { children: [{ name: 'revenue_per_share', display_name: '每股收入' }, { name: 'eps', display_name: '每股收益' }] }
const financials = {
  annual: [{ date: '2024-12-31', revenue_per_share: 3.2, eps: 1.1 }, { date: '2025-12-31', revenue_per_share: 3.5, eps: 1.2 }],
  ttm: [{ date: '2026-09-30', revenue_per_share: 3.6 }],
  quarter: [{ date: '2026-09-30', eps: 0.3 }],
}

describe('financials csv', () => {
  it('writes a header per period and the reported values', () => {
    const csv = buildFinancialCsv(view, financials)
    const [header, revenue, eps] = csv.replace('\uFEFF', '').trim().split('\n')
    expect(header).toBe('indicator,2024-12-31,2025-12-31,TTM 2026-09-30,Q 2026-09-30')
    expect(revenue).toBe('每股收入,3.2,3.5,3.6,')
    expect(eps).toBe('每股收益,1.1,1.2,,0.3')
  })

  it('quotes values that contain commas or quotes', () => {
    const csv = buildFinancialCsv(view, { annual: [{ date: '2025-12-31', revenue_per_share: '1,5"x' }] }, () => 'a,"b"')
    expect(csv).toContain('"a,""b"""')
    expect(csv).toContain('"1,5""x"')
  })

  it('drops indicators the payload does not carry', () => {
    const csv = buildFinancialCsv({ children: [{ name: 'missing', display_name: '缺' }, view.children[0]] }, { annual: financials.annual })
    expect(csv).toContain('每股收入')
    expect(csv).not.toContain('缺')
  })

  it('names the file after the symbol and the day', () => {
    expect(financialsFilename('SHSE:601398', new Date('2026-11-17T01:00:00Z'))).toBe('financials-SHSE-601398-2026-11-17.csv')
  })
})
