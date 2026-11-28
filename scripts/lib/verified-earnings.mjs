import { growthWindow } from '../../src/data/providers/edgar-xbrl.js'

// The company's USD table reports diluted EPS per ADR directly. SEC Company Facts
// still ends in FY2024 for TSM, although the FY2025 Form 20-F is on EDGAR.
const verified = {
  'NYSE:TSM': {
    date: '2025-12-31',
    eps: 10.65,
    source: 'https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-02/cb73d5f4e019a8f6d7a494a0f8f6c6da2dfc4ee2/FS.pdf',
    ordinarySharesPerAdr: 5,
    units: {
      reportingCurrency: 'TWD',
      perShareCurrency: 'USD',
      source: 'https://www.sec.gov/Archives/edgar/data/1046179/000162828026025362/tsm-20251231.htm',
    },
  },
  // The 20-F tags USD 2.36 for FY2025 per ordinary share. The quoted ADS
  // represents four shares. USD is a convenience translation of CNY.
  'NASDAQ:PDD': {
    ordinarySharesPerAdr: 4,
    units: {
      reportingCurrency: 'CNY',
      perShareCurrency: 'USD',
      source: 'https://www.sec.gov/Archives/edgar/data/1737806/000110465926050727/pdd-20251231x20f.htm',
    },
  },
  'NYSE:BEKE': {
    date: '2025-12-31',
    eps: 0.37,
    source: 'https://ir.ke.com/news-releases/news-release-details/ke-holdings-inc-announces-fourth-quarter-and-fiscal-year-2025',
    ordinarySharesPerAdr: 3,
    units: {
      reportingCurrency: 'CNY',
      perShareCurrency: 'USD',
      source: 'https://www.sec.gov/Archives/edgar/data/1809587/000110465926048109/beke-20251231x20f.htm',
    },
  },
  // The fiscal 2026 10-K and the next year's 9-month comparison in the
  // November 17 8-K give comparable diluted EPS on the same share basis.
  'NASDAQ:NVDA': {
    date: '2026-10-25',
    period: 'TTM',
    eps: Number((4.90 + 7.55 - 3.14).toFixed(2)),
    source: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000088/supplementalfinancialinfor.htm',
  },
  // Class B EPS is read directly from the 10-K's Equivalent Class B column;
  // ratio 1 records that no ADR-style scaling is needed for the quote.
  'NYSE:BRK.B': {
    date: '2025-12-31',
    eps: 31.04,
    source: 'https://www.sec.gov/Archives/edgar/data/1067983/000119312526083899/brka-20251231.htm',
    ordinarySharesPerAdr: 1,
  },
  // Ratio-only rows. Company Facts / snapshots store USD EPS (and other
  // per-share figures) per the filing share unit, which is not the quoted ADR.
  // Do not add a date/eps overlay unless a checked per-ADR filing figure exists.
  // NYSE:UMC 20-F: 1 ADS = 5 common shares. Diluted EPS is IAS 33 per ordinary
  // share (FY2024 NT$3.94 / USD 0.12), matching the snapshot ttm_eps.
  'NYSE:UMC': { ordinarySharesPerAdr: 5 },
  // NYSE:PBR 20-F: 1 ADS = 2 common shares. The filing itself reports USD 0.58
  // per share and USD 1.16 per ADS equivalent; Company Facts / snapshot keep 0.58.
  'NYSE:PBR': { ordinarySharesPerAdr: 2 },
  // NYSE:AMX 20-F: 1 ADS = 20 B shares. EPS is filed per B share in pesos only,
  // so the USD snapshot has no EPS; still scale book and cash to the ADS quote.
  'NYSE:AMX': { ordinarySharesPerAdr: 20 },
  // NYSE:CHT 20-F: 1 ADS = 10 common shares. The statements show both USD 0.15
  // per share and USD 1.46 per equivalent ADS; Company Facts DilutedEarningsLossPerShare
  // and the snapshot ttm_eps are the per-ordinary USD 0.15 figure.
  'NYSE:CHT': { ordinarySharesPerAdr: 10 },
  // NYSE:CX 20-F: 1 ADS = 10 CPOs, and each CPO = 2 Series A + 1 Series B.
  // Diluted EPS USD 0.0213 uses a weighted-average denominator of 44.066 billion
  // underlying shares (the dilutive-share footnote equates 660.3 million shares
  // to 220.1 million CPOs or 22.01 million ADSs). Snapshot ttm_eps is 0.0213.
  'NYSE:CX': { ordinarySharesPerAdr: 30 },
  // NASDAQ:BZ 20-F: 1 ADS = 2 Class A ordinary shares. Company Facts
  // EarningsPerShareDiluted USD/shares FY2025 = 0.42 is per ordinary share
  // (weighted average ~901 million ordinary shares), matching the snapshot.
  'NASDAQ:BZ': { ordinarySharesPerAdr: 2 },
  // NYSE:VIPS 20-F: 1 ADS = 0.2 Class A ordinary shares (1 ordinary = 5 ADS).
  // Diluted EPS is per Class A/B ordinary share (FY2025 USD 10.12; weighted
  // average ~100 million ordinary shares), matching the snapshot. Scale down.
  'NYSE:VIPS': { ordinarySharesPerAdr: 0.2 },
  // NYSE:TS 20-F: 1 ADS = 2 ordinary shares. Company Facts has no USD EPS tag,
  // so the snapshot has no EPS and stays unpublished; book and revenue are per
  // ordinary share (equity / ~1.08 billion shares) and still need the mapping.
  'NYSE:TS': { ordinarySharesPerAdr: 2 },
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

export const verifiedReportingUnits = symbol => verified[symbol]?.units

/** Refresh from a checked filing when the machine-readable feed is behind. */
export function applyVerifiedEarnings (record) {
  const filing = verified[record.exchange_ + ':' + record.symbol]
  // Ratio-only rows supply ordinarySharesPerAdr for quote scaling. They must
  // not overwrite earnings when date and a checked per-quote EPS are absent.
  if (!filing || filing.date == null || filing.eps == null || (record.eps_as_of || '') > filing.date) return record

  const month = filing.date.slice(0, 7)
  if (filing.period === 'TTM') {
    if (record.eps_as_of === filing.date || record.reporting_currency !== 'USD' || record.split_to_quote) return record
    return {
      ...record,
      ttm_eps: filing.eps,
      ttm_eps_nri: filing.eps,
      eps_period: 'TTM',
      eps_as_of: filing.date,
      eps_source: filing.source,
      // Do not carry the older quarter's quality totals into a new TTM.
      ttm_nonoperating_gain: null,
      ttm_net_income: null,
      ttm_operating_income: null,
      ttm_quality_as_of: filing.date,
      ttm_quality_facts_searched: false,
      financials: {
        ...record.financials,
        ttm: [{ date: month, eps_without_nri: filing.eps }],
      },
    }
  }

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
