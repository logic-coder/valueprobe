import { describe, expect, it } from 'vitest'
import { filingFactsFor, parseSecReport, reportYears } from '../../scripts/lib/sec-filing-fallback.mjs'

const header = (years) => `<tr><th class="th" colspan="${years.length}">12 Months Ended</th></tr>`
  + '<tr>' + years.map(year => `<th class="th"><div>Dec. 31, ${year}</div></th>`).join('') + '</tr>'
const row = (label, concept, cells, member = '') => `<tr class="re"><td class="pl">${label}${member}</td>`
  + `<a onclick="Show.showAR( this, 'defref_us-gaap_${concept}', window )"></a>`
  + cells.map(cell => `<td class="nump">${cell}</td>`).join('') + '</tr>'

const earningsHtml = header([2025, 2024])
  + row('', 'StatementClassOfStockAxis=brka_EquivalentClassAMember', ['', '', ''], 'Equivalent Class A [Member]')
  + row('Net earnings per average equivalent', 'EarningsPerShareBasic', ['$ 46,563', '$ 61,900'])
  + row('Average equivalent shares outstanding', 'WeightedAverageNumberOfSharesOutstandingBasic', ['1,438,223', '1,437,720'])
  + row('', 'StatementClassOfStockAxis=brka_EquivalentClassBMember', ['', '', ''], 'Equivalent Class B [Member]')
  + row('Net earnings per average equivalent', 'EarningsPerShareBasic', ['$ 31.04', '$ 41.27'])
  + row('Average equivalent shares outstanding', 'WeightedAverageNumberOfSharesOutstandingBasic', ['2,157,335,139', '2,156,580,296'])

const cashHtml = header([2025, 2024])
  + row('Net cash flows from operating activities', 'NetCashProvidedByUsedInOperatingActivities', ['45,969', '<td class="fn"></td>30,592'])
  + row('Purchases of property, plant and equipment', 'PaymentsToAcquirePropertyPlantAndEquipment', ['-20,927', '<td class="fn"></td>-18,976'])

const summaryHtml = '<FilingSummary>'
  + '<Report><ShortName>Consolidated Statements of Earnings</ShortName><HtmlFileName>R4.htm</HtmlFileName></Report>'
  + '<Report><ShortName>Consolidated Statements of Cash Flows</ShortName><HtmlFileName>R8.htm</HtmlFileName></Report>'
  + '</FilingSummary>'

const submissions = {
  name: 'BERKSHIRE HATHAWAY INC',
  filings: { recent: {
    form: ['10-K'], filingDate: ['2026-03-02'], reportDate: ['2025-12-31'],
    accessionNumber: ['0001193125-26-083899'], primaryDocument: ['brka-20251231.htm'],
  } },
}
const readText = async (url) => {
  if (url.endsWith('FilingSummary.xml')) return summaryHtml
  if (url.endsWith('R4.htm')) return earningsHtml
  if (url.endsWith('R8.htm')) return cashHtml
  throw new Error('unexpected ' + url)
}

describe('SEC 10-K fallback fundamentals', () => {
  it('reads class-tagged EPS and shares without misreading footnote columns', () => {
    expect(reportYears(earningsHtml)).toEqual([2025, 2024])
    const parsed = parseSecReport(earningsHtml)
    const eps = parsed.rows.filter(row => /EarningsPerShare/i.test(row.concept) && row.values.some(value => value != null))
    expect(eps.map(row => [row.member, row.values.filter(value => value != null)])).toEqual([
      ['A', [46563, 61900]],
      ['B', [31.04, 41.27]],
    ])
  })

  it('builds B-class per-share facts with the A/B ratio from the filing', async () => {
    const pack = await filingFactsFor({ symbol: 'NYSE:BRK.B', cik: 1067983, submissions, shareClass: 'B', readText })
    expect(pack.fields.ttm_eps).toBe(31.04)
    expect(pack.fields.eps_as_of).toBe('2025-12-31')
    expect(pack.filingShares).toBeCloseTo(2_157_335_139 + 1_438_223 * 1500, 0)
    expect(pack.fields.free_cash_flow_per_share).toBeCloseTo((45_969 - 20_927) * 1e6 / pack.filingShares, 4)
    expect(pack.financials.annual.map(row => row.date)).toEqual(['2024-12', '2025-12'])
    expect(pack.fields.earning_growth_1y).not.toBeNull()
  })
})
