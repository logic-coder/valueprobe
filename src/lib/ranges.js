// Range keys for the chart's date selector, plus the cutoff each one stands for.
export const RANGE_KEYS = ['1m', '3m', '6m', 'ytd', '1y', '3y', '5y', '10y', '15y', 'all']

export const RANGE_LABELS = {
  '1m': '1M', '3m': '3M', '6m': '6M', ytd: 'YTD', '1y': '1Y', '3y': '3Y', '5y': '5Y', '10y': '10Y', '15y': '15Y', all: 'ALL',
}

const offset = (years, months, days) => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + (years || 0))
  date.setMonth(date.getMonth() - (months || 0))
  date.setDate(date.getDate() - (days || 0))
  return date
}

export const rangeDate = (key) => ({
  '1m': offset(0, 1, 0), '3m': offset(0, 3, 0), '6m': offset(0, 6, 0), ytd: new Date(new Date().getFullYear(), 0, 1),
  '1y': offset(-1), '3y': offset(-3), '5y': offset(-5), '10y': offset(-10), '15y': offset(-15), all: offset(-30),
}[key] || offset(-3)).getTime()
