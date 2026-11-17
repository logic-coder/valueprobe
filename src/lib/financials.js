// CSV snapshot of the per-share table: raw reported values, no derived rates, so
// the file matches what the table shows instead of re-deriving anything.
const FIELDS = ['annual', 'ttm', 'quarter']

const escape = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

const hasValue = (rows, name) => rows.some((row) => row[name] !== null && row[name] !== undefined)

export function buildFinancialCsv(view, financials, label = (child) => child.display_name) {
  const annual = financials?.annual || []
  const ttm = (financials?.ttm || []).slice(-1)
  const quarter = (financials?.quarter || []).slice(-1)
  const children = (view?.children || []).filter((child) => FIELDS.some((field) => hasValue(financials?.[field] || [], child.name)))
  const header = ['indicator', ...annual.map((row) => row.date), ...ttm.map((row) => 'TTM ' + row.date), ...quarter.map((row) => 'Q ' + row.date)]
  const lines = [header.map(escape).join(',')]
  for (const child of children) {
    lines.push([label(child), ...annual.map((row) => row[child.name]), ...ttm.map((row) => row[child.name]), ...quarter.map((row) => row[child.name])].map(escape).join(','))
  }
  // The BOM keeps Excel from mangling the Chinese headers.
  return '\uFEFF' + lines.join('\n') + '\n'
}

export function financialsFilename(symbol, at = new Date()) {
  const stamp = at.toISOString().slice(0, 10)
  return 'financials-' + String(symbol).replace(':', '-') + '-' + stamp + '.csv'
}
