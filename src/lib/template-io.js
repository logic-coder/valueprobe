// Template portability: a template set is small, plain JSON, and belongs to the
// user, so it can leave and re-enter the browser as a file.
const FIELDS = ['name', 'basis', 'eps', 'freecashflow', 'yGrowth', 'ebitda_growth', 'desiredYield', 'terminalyear', 'discountRate', 'book']

const NUMERIC = ['eps', 'freecashflow', 'yGrowth', 'ebitda_growth', 'desiredYield', 'terminalyear', 'discountRate', 'book']

const clean = (row) => {
  if (!row || typeof row !== 'object') return null
  const name = String(row.name || '').trim()
  if (!name) return null
  const out = { name: name.slice(0, 60), basis: row.basis === 'freecashflow' ? 'freecashflow' : 'eps' }
  for (const field of NUMERIC) {
    const value = Number(row[field])
    out[field] = Number.isFinite(value) ? value : null
  }
  return out
}

/** Accepts either a bare array or {templates: [...]}; returns cleaned rows. */
/** Copy a saved template onto the form. Years stay on the stage they were saved under. */
export function applyTemplate (current, item) {
  const form = { ...current }
  if (!item) return form
  const take = (field, key) => {
    const value = Number(item[key])
    if (Number.isFinite(value)) form[field] = value
  }
  take('years', 'yGrowth')
  take('yearsOfTerminalGrowth', 'terminalyear')
  take('discountRate', 'discountRate')
  take('terminalGrowthRate', 'desiredYield')
  take('eps', 'eps')
  take('freecashflow', 'freecashflow')
  const growth = Number(item.ebitda_growth)
  if (Number.isFinite(growth)) {
    if ((item.basis || 'eps') === 'freecashflow') form.freecashflowGrowthRate = growth
    else form.growthRate = growth
  }
  return form
}

export function parseTemplateFile (text) {
  let raw
  try {
    raw = JSON.parse(String(text || ''))
  } catch (error) {
    return { ok: false, reason: 'json', templates: [] }
  }
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.templates) ? raw.templates : null
  if (!rows) return { ok: false, reason: 'shape', templates: [] }
  const templates = rows.map(clean).filter(Boolean)
  if (!templates.length) return { ok: false, reason: 'empty', templates: [] }
  return { ok: true, reason: null, templates }
}

export const templateFileName = () => 'dcf-templates-' + new Date().toISOString().slice(0, 10) + '.json'

/** Browser-only: hand the current templates to the user as a download. */
export function downloadTemplates (list) {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), templates: list.map(clean).filter(Boolean) }, null, 2)
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = templateFileName()
  link.click()
  URL.revokeObjectURL(url)
  return payload
}

export { FIELDS }
