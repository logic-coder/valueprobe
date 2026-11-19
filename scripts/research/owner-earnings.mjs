// Research rule, version 1. All rates below are decimals; no fitted parameters.
export function median (values) {
  if (!values.length) return null
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return (ordered[middle] + ordered[Math.floor((ordered.length - 1) / 2)]) / 2
}

export function shareholderValue (earnings, roe, inputs) {
  const { years, growth, terminalGrowthRate, discountRate } = inputs
  const r = discountRate / 100
  const stable = terminalGrowthRate / 100
  if (!(earnings > 0 && roe > 0 && r > stable && r > 0 && years >= 2)) return null
  const growthAt = year => (growth + (terminalGrowthRate - growth) * (year - 1) / (years - 1)) / 100
  let eps = earnings
  let value = 0
  let distributable = 0
  const path = []
  for (let year = 1; year <= years; year++) {
    const growthNow = growthAt(year)
    const growthNext = year < years ? growthAt(year + 1) : stable
    const returnNow = roe + (r - roe) * (year - 1) / (years - 1)
    if ((year === 1 && growthNow > roe) || growthNext > returnNow || growthNow <= -1) return null
    eps *= 1 + growthNow
    distributable = eps * (1 - Math.max(0, growthNext) / returnNow)
    path.push({ earnings: eps, distributable })
    value += distributable / (1 + r) ** year
  }
  value += distributable * (1 + stable) / (r - stable) / (1 + r) ** years
  return Number.isFinite(value) && value > 0 ? { value, eps, distributable, path } : null
}

// Only annual closes are sampled. A gap before an observed crossing prevents
// identifying its first year. Later gaps cannot undo an already observed hit.
export function discountPath (rows) {
  const first = rows[0]
  if (!(first?.value > first?.price && first.price > 0)) return { status: 'ineligible' }
  let gap = false
  for (const [year, row] of rows.entries()) {
    if (!(row?.price > 0 && row?.value > 0)) {
      gap = true
      continue
    }
    if (row.price >= row.value) {
      const p = row.price * row.splitFromStart / first.price
      const v = row.value * row.splitFromStart / first.value
      return { status: gap ? 'crossedAfterGap' : 'observedCrossing', year,
        priceChange: p - 1, valueChange: v - 1,
        crossedAtEntryRate: row.valueAtEntryRate > 0 ? row.price >= row.valueAtEntryRate : null,
        driver: Math.log(p) >= -Math.log(v) ? 'price' : 'lowerEstimate' }
    }
  }
  return { status: gap ? 'incomplete' : 'discountAtAllCloses' }
}
