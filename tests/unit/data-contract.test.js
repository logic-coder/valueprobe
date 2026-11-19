import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LISTING_GROUPS } from '../../src/data/listingGroups'
import { POLICY_V1_HASH, POLICY_VERSION } from '../../src/lib/policy'
import { isKnownReason, isKnownWarning } from '../../src/lib/reasons'

// Contract for the committed public data a static deploy reads directly with no
// build step: artifact, manifest, catalog, rates and snapshots must describe one
// policy version and one universe. Runs offline, so CI can gate a data refresh
// before Pages publishes it.
const root = process.cwd()
const DATA = resolve(root, 'public/data')
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const sha256 = (body) => createHash('sha256').update(body).digest('hex')
const SNAPSHOT_FILE = /^[A-Z]{2,}-.+\.json$/
const symbolOf = (name) => name.replace(/\.json$/, '').replace(/^([A-Z]+)-/, '$1:')
const snapshotFiles = readdirSync(DATA).filter((name) => SNAPSHOT_FILE.test(name)).sort()
const snapshotSymbols = snapshotFiles.map(symbolOf)

const artifact = readJson('public/data/intrinsic/v1.json')
const manifest = readJson('public/data/manifest.json')
const catalog = readJson('public/data/catalog.json')
const rates = readJson('public/data/rates.json')
const watchlist = readJson('scripts/watchlist.json')
const entries = Object.entries(artifact.entries)

describe('policy pin', () => {
  it('is built from the frozen public policy v1', () => {
    expect(artifact.schema).toBe(1)
    expect(manifest.schema).toBe(1)
    expect(artifact.policyVersion).toBe(POLICY_VERSION)
    expect(manifest.policyVersion).toBe(POLICY_VERSION)
    expect(artifact.policyHash).toBe(POLICY_V1_HASH)
    expect(manifest.policyHash).toBe(POLICY_V1_HASH)
  })
})

describe('public universe', () => {
  it('declares, snapshots, catalogues and values the same 150 names', () => {
    expect(watchlist).toHaveLength(150)
    expect(snapshotFiles).toHaveLength(150)
    expect(catalog).toHaveLength(150)
    expect(entries).toHaveLength(150)
    expect(artifact.universe).toEqual({ declared: 150, snapshots: 150, missing: [] })
    expect(manifest.universe).toEqual(artifact.universe)
    expect(manifest.counts.snapshots).toBe(150)
    expect([...watchlist].sort()).toEqual([...snapshotSymbols].sort())
    expect(catalog.map((row) => row.symbol).sort()).toEqual([...snapshotSymbols].sort())
    expect(Object.keys(artifact.entries).sort()).toEqual([...snapshotSymbols].sort())
  })

  it('names each snapshot file after the record inside it', () => {
    for (const name of snapshotFiles) {
      const raw = readJson('public/data/' + name)
      expect(raw.exchange_ + ':' + raw.symbol).toBe(symbolOf(name))
      expect(raw.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('manifest', () => {
  it('lists every shipped file with the bytes on disk', () => {
    const expected = ['catalog.json', 'rates.json', ...snapshotFiles].sort()
    const names = manifest.files.map((file) => file.name)
    expect([...names].sort()).toEqual(expected)
    expect(new Set(names).size).toBe(names.length)
    for (const file of manifest.files) {
      const body = readFileSync(resolve(DATA, file.name))
      expect(file.bytes).toBe(body.length)
      expect(file.sha256).toBe(sha256(body))
    }
  })
})

describe('rates', () => {
  it('publishes the committed rows and the HKD USD proxy', () => {
    expect(Number(rates.CNY.value)).toBeGreaterThan(0)
    expect(Number(rates.USD.value)).toBeGreaterThan(0)
    expect(artifact.rates.CNY.value).toBe(Number(rates.CNY.value))
    expect(artifact.rates.CNY.asOf).toBe(rates.CNY.as_of)
    expect(artifact.rates.USD.value).toBe(Number(rates.USD.value))
    expect(artifact.rates.USD.asOf).toBe(rates.USD.as_of)
    expect(artifact.rates.HKD).toMatchObject({
      value: artifact.rates.USD.value,
      asOf: artifact.rates.USD.asOf,
      source: 'usd_proxy',
      proxy: 'USD',
    })
    expect(manifest.rates).toEqual(artifact.rates)
  })
})

describe('entries', () => {
  it('are self-consistent and carry the disclosed rate row', () => {
    for (const [symbol, entry] of entries) {
      expect(entry.symbol).toBe(symbol)
      expect(['ok', 'refused']).toContain(entry.status)
      if (entry.status === 'ok') {
        expect(Number.isFinite(entry.value)).toBe(true)
        expect(entry.value).toBeGreaterThan(0)
        expect(entry.reasons).toEqual([])
      } else {
        expect(entry.value).toBeNull()
        expect(entry.reasons.length).toBeGreaterThan(0)
      }
      expect(entry.inputs?.rate).toBeTruthy()
      expect(Number.isFinite(entry.inputs.rate.value)).toBe(true)
      expect(entry.inputs.rate.value).toBeGreaterThan(0)
      expect(typeof entry.inputs.rate.source).toBe('string')
      expect(entry.ratesAsOf).toBe(entry.inputs.rate.asOf)
      expect(['owner', 'residual']).toContain(entry.inputs.model)
      expect(['CNY', 'USD', 'HKD']).toContain(entry.inputs.currency)
      expect(Array.isArray(entry.reasons)).toBe(true)
      expect(Array.isArray(entry.warnings)).toBe(true)
      for (const code of entry.reasons) expect(isKnownReason(code)).toBe(true)
      for (const code of entry.warnings) expect(isKnownWarning(code)).toBe(true)
      expect(new Set(entry.reasons).size).toBe(entry.reasons.length)
      expect(new Set(entry.warnings).size).toBe(entry.warnings.length)
    }
  })
})

describe('coverage', () => {
  it('matches a recount of the published entries', () => {
    const recount = { valued: 0, refused: 0, reasons: {}, warnings: {}, models: {}, currencies: {} }
    for (const [, entry] of entries) {
      if (entry.status === 'ok') recount.valued++
      else recount.refused++
      for (const code of entry.reasons) recount.reasons[code] = (recount.reasons[code] || 0) + 1
      for (const code of entry.warnings) recount.warnings[code] = (recount.warnings[code] || 0) + 1
      recount.models[entry.inputs.model] = (recount.models[entry.inputs.model] || 0) + 1
      recount.currencies[entry.inputs.currency] = (recount.currencies[entry.inputs.currency] || 0) + 1
    }
    expect(artifact.coverage).toEqual(recount)
    expect(manifest.counts).toEqual({ snapshots: snapshotFiles.length, valued: recount.valued, refused: recount.refused })
  })
})

describe('freshness metadata', () => {
  it('records a valid generation date without making the suite clock-dependent', () => {
    // Age is disclosed by npm run verify:data (warning) and by the value's own
    // STALE_DATA / STALE_PRICE codes; a clock-based assertion here would turn an
    // old checkout into a red test for reasons the code cannot fix.
    expect(artifact.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(manifest.generatedAt).toBe(artifact.generatedAt)
  })
})

describe('cross-listing report', () => {
  it('covers the nine curated pairs and flags the BYD input mismatch', () => {
    const rows = artifact.crossListing
    expect(rows).toHaveLength(9)
    expect(rows.map((row) => row.id)).toEqual(LISTING_GROUPS.map((group) => group.id))
    for (const row of rows) {
      const group = LISTING_GROUPS.find((item) => item.id === row.id)
      expect(row.a).toBe(group.a)
      expect(row.h).toBe(group.h)
      expect(['aligned', 'input-mismatch', 'not-valued']).toContain(row.status)
    }
    expect(rows.find((row) => row.id === 'BYD').status).toBe('input-mismatch')
  })
})
