// Sharing a valuation is a display concern: the kernel never sees these keys.
// Only values that differ from the freshly seeded defaults travel in the URL, so
// a shared link stays short and a deleted parameter falls back to live data.
const NUMERIC = {
  p: ['result', 'stockPrice'],
  eps: ['form', 'eps'],
  fcf: ['form', 'freecashflow'],
  tbv: ['result', 'tbv'],
  y: ['form', 'years'],
  r: ['form', 'discountRate'],
  g: ['form', 'growthRate'],
  fg: ['form', 'freecashflowGrowthRate'],
  tg: ['form', 'terminalGrowthRate'],
  tgy: ['form', 'yearsOfTerminalGrowth'],
}

const YEAR_KEYS = ['y', 'tgy']
const MAX_DECIMALS = 4

const first = (value) => (Array.isArray(value) ? value[0] : value)

const asNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const compact = (value) => Number(Number(value).toFixed(MAX_DECIMALS))

export function encodeState(form, result, basis, defaults = {}) {
  const out = {}
  const seedForm = defaults.dcfForm || {}
  const seedResult = defaults.dcfResultForm || {}
  for (const [key, [group, field]] of Object.entries(NUMERIC)) {
    const live = group === 'form' ? form?.[field] : result?.[field]
    const seed = group === 'form' ? seedForm[field] : seedResult[field]
    const value = asNumber(live)
    if (value === null || value === asNumber(seed)) continue
    out[key] = YEAR_KEYS.includes(key) ? Math.max(0, Math.round(value)) : compact(value)
  }
  if (basis === 'freecashflow' || basis === 'fcf') out.b = 'fcf'
  if (result?.addToFairValue) out.tbv1 = '1'
  return out
}

export function decodeState(query = {}) {
  const form = {}
  const result = {}
  for (const [key, [group, field]] of Object.entries(NUMERIC)) {
    const value = asNumber(first(query[key]))
    if (value === null) continue
    const clean = YEAR_KEYS.includes(key) ? Math.max(0, Math.round(value)) : value
    if (group === 'form') form[field] = clean
    else result[field] = clean
  }
  const basis = first(query.b) === 'fcf' ? 'freecashflow' : undefined
  const tbvIn = first(query.tbv1) === '1' ? true : undefined
  return { form, result, basis, tbvIn }
}

export function isPresetEmpty(preset) {
  return !preset || (!preset.basis && preset.tbvIn === undefined
    && Object.keys(preset.form || {}).length === 0
    && Object.keys(preset.result || {}).length === 0)
}
