// Explicit names whose filed per-share figures were checked against the quoted
// unit (USD / ADS) and could not be converted. This is not a universe-wide
// currency or unit gate, and it does not change SHARE_BASIS_UNVERIFIED from
// disclose-only. Do not guess FX, and do not scale a local-currency series by
// an ADR ratio while still labeling it as USD.
export const UNRECONCILED_QUOTE_UNITS = Object.freeze([
  // NYSE:PKX POSCO Holdings. 20-F: statements in KRW; 1 ADS = 1/4 common share.
  // FY2023 diluted EPS is KRW 22,383 per ordinary share, matching the snapshot.
  // Company Facts DilutedEarningsLossPerShare USD/shares copies the KRW figures
  // (85,240 / 39,296 / 22,383) and is not a usable USD series. No book series.
  'NYSE:PKX',
  // NYSE:WF Woori Financial Group. 20-F: statements in KRW; 1 ADS = 3 common
  // shares. FY2018-2020 USD/shares (2.512 / 2.36 / 1.604) look like real USD
  // per ordinary share, but FY2023-2024 USD/shares (2,502 / 2,673) are about
  // 1,000x too large and are what the snapshot stores. Book (~30) and
  // operating income per share (~3-4) are a different magnitude, so units
  // inside the snapshot are already mixed. No complete trustworthy USD/ADS
  // series.
  'NYSE:WF',
  // NYSE:BCH Banco de Chile. Different mechanism from PKX: not simply local
  // EPS versus a USD quote. 20-F: functional/presentation currency CLP;
  // 1 ADS = 200 common shares. Snapshot EPS 3.98 is CLP per ordinary (the
  // FY2020 USD/shares tag copies that CLP figure). Book ~0.0547 is USD equity
  // divided by ordinary shares (USD per ordinary, not per ADS). Residual
  // income combined the two. Continuing-operations USD/shares of 0.01 is a
  // one-cent rounding, not a per-ADS series. Data stop in 2020.
  'NYSE:BCH',
])

const UNRECONCILED_SET = new Set(UNRECONCILED_QUOTE_UNITS)

export function quoteUnitUnreconciled (record) {
  if (!record || typeof record !== 'object') return false
  const symbol = record.exchange_ && record.symbol
    ? record.exchange_ + ':' + record.symbol
    : record.symbol
  return UNRECONCILED_SET.has(symbol)
}
