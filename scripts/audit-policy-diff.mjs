// Reproduce the full release comparison without internal research files.
import { readFileSync } from 'node:fs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const [previous, current] = process.argv.slice(2)
const before = read(previous || 'public/data/intrinsic/v1.json')
const after = read(current || 'public/data/intrinsic/v2.json')
const keys = ['status', 'value', 'band', 'marginOfSafety', 'price', 'priceDate', 'earningsDate', 'reasons', 'warnings']
const select = row => row ? Object.fromEntries([...keys.map(key => [key, row[key]]),
  ['model', row.inputs.model], ['classification', row.inputs.classification], ['industry', row.inputs.industry ?? null]]) : null
const symbols = [...new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])].sort()
const rows = symbols.map(symbol => ({ symbol, before: select(before.entries[symbol]), after: select(after.entries[symbol]) }))
const counts = Object.fromEntries([...keys, 'model', 'classification', 'industry'].map(key => [key, rows.filter(row =>
  JSON.stringify(row.before?.[key]) !== JSON.stringify(row.after?.[key])).length]))
console.log(JSON.stringify({ before: before.policyVersion, after: after.policyVersion, total: rows.length, counts, rows }, null, 2))
