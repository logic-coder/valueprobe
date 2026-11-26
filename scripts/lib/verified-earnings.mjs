import { growthWindow } from '../../src/data/providers/edgar-xbrl.js'

// The company's USD table reports diluted EPS per ADR directly. SEC Company Facts
// still ends in FY2024 for TSM, although the FY2025 Form 20-F is on EDGAR.
const verified = {
  'NYSE:TSM': {
    date: '2025-12-31',
    eps: 10.65,
    source: 'https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-02/cb73d5f4e019a8f6d7a494a0f8f6c6da2dfc4ee2/FS.pdf',
    ordinarySharesPerAdr: 5,
  },
  // Class B EPS is read directly from the 10-K's Equivalent Class B column;
  // ratio 1 records that no ADR-style scaling is needed for the quote.
  'NYSE:BRK.B': {
    date: '2025-12-31',
    eps: 31.04,
    source: 'https://www.sec.gov/Archives/edgar/data/1067983/000119312526083899/brka-20251231.htm',
    ordinarySharesPerAdr: 1,
  },
}

// Ordinary shares quoted in the same class as the SEC per-share facts. The
// quote fallback does not carry market cap, so without this the share-basis
// gate rejects a valid listing as "unknown" instead of accepting its 1:1 basis.
// These are not ADRs and none has a share-class multiplier.
const shareBasisVerified = new Set([
  'NASDAQ:WMT', 'NYSE:GE', 'NASDAQ:HON', 'NYSE:FDX', 'NASDAQ:AAL', 'NYSE:CMG',
  'NASDAQ:DPZ', 'NYSE:PAYC', 'NYSE:NOW', 'NYSE:SNOW', 'NYSE:NET', 'NASDAQ:CRWD',
  'NASDAQ:PANW', 'NASDAQ:ZS', 'NASDAQ:MDB', 'NASDAQ:TEAM',
])

export const verifiedQuoteFactor = (symbol) => {
  const ratio = verified[symbol]?.ordinarySharesPerAdr
  if (ratio) return 1 / ratio
  return shareBasisVerified.has(symbol) ? 1 : null
}

/** Refresh from a checked filing when the machine-readable feed is behind. */
export function applyVerifiedEarnings (record) {
  const filing = verified[record.exchange_ + ':' + record.symbol]
  if (!filing || (record.eps_as_of || '') > filing.date) return record

  const month = filing.date.slice(0, 7)
  const annual = record.financials.annual.filter((row) => row.date !== month)
  const existing = record.financials.annual.find((row) => row.date === month)
  annual.push({ ...existing, date: month, eps_without_nri: filing.eps })
  annual.sort((left, right) => left.date.localeCompare(right.date))
  const points = annual.map((row) => ({ fy: Number(row.date.slice(0, 4)), val: row.eps_without_nri }))
  return {
    ...record,
    ttm_eps: filing.eps,
    ttm_eps_nri: filing.eps,
    eps_period: 'FY',
    eps_as_of: filing.date,
    eps_source: filing.source,
    earning_growth_10y: growthWindow(points, 10),
    earning_growth_5y: growthWindow(points, 5),
    earning_growth_1y: growthWindow(points, 1),
    financials: {
      ...record.financials,
      annual,
      ttm: [{ ...existing, date: month, eps_without_nri: filing.eps }],
    },
  }
}
