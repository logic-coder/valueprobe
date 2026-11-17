// Y-axis extent for a trend. The range follows the data, with a small pad, and
// does not snap to zero. A series that lives between 2.0 and 2.6 stays readable
// instead of becoming a flat line on a 0-based scale.

const PAD = 0.12

export function axisExtent (values) {
  const finite = []
  for (const value of values || []) {
    if (value === null || value === undefined || value === '') continue
    const number = typeof value === 'number' ? value : Number(value)
    if (typeof value === 'string' && value.trim() === '') continue
    if (Number.isFinite(number)) finite.push(number)
  }
  if (!finite.length) return null
  let min = finite[0]
  let max = finite[0]
  for (const number of finite) {
    if (number < min) min = number
    if (number > max) max = number
  }
  const span = max - min
  const pad = span > 0 ? span * PAD : Math.max(Math.abs(max) * 0.08, 1e-6)
  return { min: min - pad, max: max + pad }
}
