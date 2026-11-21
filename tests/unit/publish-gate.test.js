import { describe, expect, it } from 'vitest'
import { assessPublish, classifyOutcome, isPublishReady, latestPeriod, matchesPublishHistory, publishState, publishStatus, refreshVerification, releaseDigest } from '../../scripts/lib/publish-gate.mjs'

function release ({ valued = 3, refused = 1, markets = ['SHSE', 'SHSE', 'HKSE'], generatedAt = '2026-11-21' } = {}) {
  const entries = {}
  markets.forEach((market, index) => { entries[market + ':60000' + index] = { status: 'ok', earningsDate: '2025-12-3' + (index % 9) } })
  for (let index = 0; index < refused; index++) entries['SZSE:9' + index] = { status: 'refused' }
  return { generatedAt, entries, coverage: { valued, refused }, universe: { declared: markets.length + refused } }
}

const rows = (symbols, quote = 'updated', fundamental = 'new-period') =>
  symbols.map(symbol => ({ symbol, quote, fundamental }))

describe('outcome classification', () => {
  const prev = { price: '$1', currency: '$', quote_as_of: '2026-11-20', eps_as_of: '2026-09-30' }
  const same = { price: '$1', currency: '$', asOf: prev.quote_as_of }
  it('separates new periods, verified no-update, kept and missing records', () => {
    expect(classifyOutcome({ mode: 'all', quote: same, prev, patch: prev, fundamentals: true })).toMatchObject({ quote: 'unchanged', fundamental: 'verified-unchanged', quoteVerified: true, fundamentalVerified: false })
    expect(classifyOutcome({ mode: 'all', quote: same, prev, patch: { ...prev, eps_as_of: '2026-10-31' }, fundamentals: true }).fundamental).toBe('new-period')
    expect(classifyOutcome({ mode: 'all', prev, patch: prev, fundamentals: true, fundamentalError: 'x' })).toMatchObject({ quote: 'failed-kept', fundamental: 'failed-kept' })
    expect(classifyOutcome({ mode: 'all', quote: null, prev: null, patch: null, fundamentals: false, fundamentalError: 'x' })).toMatchObject({ quote: 'failed-missing', fundamental: 'failed-missing' })
    const quote = { price: '$2', currency: '$', asOf: '2026-11-21' }
    expect(classifyOutcome({ mode: 'quotes', quote, prev, patch: { ...prev, price: quote.price, quote_as_of: quote.asOf } })).toMatchObject({ quote: 'updated', fundamental: 'skipped', quoteVerified: true })
    expect(classifyOutcome({ mode: 'quotes', quote: { ...same, asOf: '2026-11-19' }, prev, patch: prev }).quote).toBe('failed-kept')
    expect(classifyOutcome({ mode: 'fundamentals', quote: null, prev, patch: prev, fundamentals: true, fundamentalFetched: true })).toMatchObject({ quote: 'skipped', fundamental: 'verified-unchanged', fundamentalVerified: true })
  })
})

describe('publish gate', () => {
  it('publishes a first run that brought new data', () => {
    expect(assessPublish({ mode: 'all', scope: 'all', outcomes: rows(['SHSE:600001']), previous: null, current: release() }).status).toBe('ok')
  })
  it('blocks when every required chain failed', () => {
    expect(assessPublish({ mode: 'quotes', scope: 'all', outcomes: rows(['SHSE:600001'], 'failed-kept'), previous: null, current: release() }).blocked)
      .toContain('every quote request failed')
    expect(assessPublish({ mode: 'fundamentals', scope: 'all', outcomes: rows(['SHSE:600001'], 'skipped', 'failed-kept'), previous: null, current: release() }).blocked)
      .toContain('every fundamentals request failed')
  })
  it('blocks a failed targeted request even when the rest worked', () => {
    const result = assessPublish({ mode: 'all', scope: 'targeted', outcomes: rows(['SHSE:600001', 'NASDAQ:AAPL'], 'updated').map((row, index) =>
      index ? { ...row, quote: 'failed-kept' } : row), previous: null, current: release() })
    expect(result.status).toBe('blocked')
    expect(result.blocked).toContain('requested quote failed: NASDAQ:AAPL')
  })
  it('keeps partial data, discloses the kept record and does not block', () => {
    const result = assessPublish({ mode: 'all', scope: 'all', outcomes: rows(['SHSE:600001', 'NASDAQ:AAPL'], 'failed-kept').map((row, index) =>
      index ? { ...row, quote: 'updated' } : row), previous: null, current: release() })
    expect(result.status).toBe('partial')
    expect(result.partial).toContain('kept quote: SHSE:600001')
  })
  it('reports a verified unchanged run without calling it a failure', () => {
    expect(assessPublish({ mode: 'all', scope: 'all', outcomes: rows(['SHSE:600001'], 'unchanged', 'verified-unchanged'), previous: null, current: release() }).status)
      .toBe('verified-unchanged')
  })
  it('blocks a coverage loss above ten percent and allows a smaller one', () => {
    const previous = release({ valued: 10, markets: Array(10).fill('SHSE') })
    const nine = release({ valued: 9, markets: Array(9).fill('SHSE') })
    const eight = release({ valued: 8, markets: Array(8).fill('SHSE') })
    expect(assessPublish({ mode: 'quotes', scope: 'all', outcomes: rows(['SHSE:600001']), previous, current: eight }).blocked)
      .toContain('valued count fell from 10 to 8 (over 10%)')
    expect(assessPublish({ mode: 'quotes', scope: 'all', outcomes: rows(['SHSE:600001']), previous, current: nine }).blocked).toEqual([])
  })
  it('blocks a refused rise above five or two percent of the universe', () => {
    const previous = release({ refused: 10 })
    previous.universe.declared = 500
    const seven = release({ refused: 17 })
    seven.universe.declared = 500
    const eleven = release({ refused: 21 })
    eleven.universe.declared = 500
    expect(assessPublish({ mode: 'quotes', scope: 'all', outcomes: rows(['SHSE:600001']), previous, current: seven }).blocked).toEqual([])
    expect(assessPublish({ mode: 'quotes', scope: 'all', outcomes: rows(['SHSE:600001']), previous, current: eleven }).blocked.join(' '))
      .toContain('refused count rose by 11')
  })
  it('blocks a market that lost every value', () => {
    const previous = release({ markets: ['SHSE', 'HKSE'] })
    expect(assessPublish({ mode: 'quotes', scope: 'all', outcomes: rows(['SHSE:600001']), previous,
      current: release({ markets: ['SHSE', 'SHSE'] }) }).blocked).toContain('market lost every value: HKSE')
  })
  it('blocks only when no rate was live or kept', () => {
    expect(assessPublish({ mode: 'all', scope: 'all', outcomes: rows(['SHSE:600001']), previous: null, current: release(),
      rates: { requested: true, live: [], kept: [] } }).blocked).toContain('no currency yield')
    expect(assessPublish({ mode: 'all', scope: 'all', outcomes: rows(['SHSE:600001']), previous: null, current: release(),
      rates: { requested: true, live: ['CNY'], kept: ['USD'], failed: ['USD'] } }).partial).toContain('rate kept from existing: USD')
  })
})

describe('publish state', () => {
  const artifact = release()
  const manifest = { files: [{ name: 'SHSE-600000.json', sha256: 'a' }] }
  const state = publishState({ status: 'ok', mode: 'all', scope: 'all', generatedAt: artifact.generatedAt,
    upstreamCheckedAt: '2026-11-21T08:00:00.000Z', artifact, manifest })

  it('binds the digest to both artifact and manifest', () => {
    expect(releaseDigest(artifact, manifest)).not.toBe(releaseDigest({ ...artifact, generatedAt: '2026-11-22' }, manifest))
    expect(state.batch).toBe(releaseDigest(artifact, manifest))
    expect(isPublishReady(state, artifact, manifest)).toBe(true)
    expect(isPublishReady({ ...state, batch: 'x' }, artifact, manifest)).toBe(false)
    expect(isPublishReady({ ...state, previousBatch: state.batch }, artifact, manifest)).toBe(false)
    expect(isPublishReady({ ...state, status: 'blocked', blocked: ['x'] }, artifact, manifest)).toBe(false)
    expect(isPublishReady({ ...state, status: 'rebuilt', upstreamCheckedAt: null }, artifact, manifest)).toBe(true)
    expect(isPublishReady({ ...state, status: 'rebuilt', upstreamCheckedAt: '2026-11-20T08:00:00.000Z' }, artifact, manifest)).toBe(true)
    expect(isPublishReady({ ...state, upstreamCheckedAt: '2026-11-20T08:00:00.000Z' }, artifact, manifest)).toBe(false)
  })

  it('keeps the last verified timestamp on all retained sources and cached or local input', () => {
    const previous = { upstreamCheckedAt: '2026-11-18T08:00:00.000Z' }
    const checkedAt = '2026-11-21T08:00:00.000Z'
    const failed = { blocked: ['every quote request failed'], partial: ['kept'], status: 'blocked' }
    const retained = [{ quote: 'failed-kept', fundamental: 'failed-kept' }]
    expect(refreshVerification(failed, retained, { requested: false }, previous, checkedAt))
      .toEqual({ status: 'blocked', upstreamCheckedAt: previous.upstreamCheckedAt })
    const cached = [{ quote: 'skipped', fundamental: 'verified-unchanged', fundamentalVerified: false }]
    const allowed = { blocked: [], partial: [], status: 'verified-unchanged' }
    expect(refreshVerification(allowed, cached, { live: [] }, previous, checkedAt))
      .toEqual({ status: 'rebuilt', upstreamCheckedAt: previous.upstreamCheckedAt })
    expect(refreshVerification(allowed, [{ ...cached[0], fundamentalVerified: true }], { live: [] }, previous, checkedAt))
      .toEqual({ status: 'verified-unchanged', upstreamCheckedAt: checkedAt })
  })

  it('keeps lineage across same-batch rebuilds and validates transitions or rollbacks', () => {
    const first = { batch: 'a', previousBatch: null }
    const second = { batch: 'b', previousBatch: 'a' }
    expect(matchesPublishHistory(second, [first])).toBe(true)
    expect(matchesPublishHistory({ ...second, previousBatch: null }, [first])).toBe(false)
    expect(matchesPublishHistory(first, [second, first])).toBe(true)
    expect(publishState({ ...state, artifact, manifest, previous: { ...state, previousBatch: 'a' } }).previousBatch).toBe('a')
  })
  it('lets artifact problems block an otherwise partial run', () => {
    const partial = { status: 'partial', blocked: [], partial: ['kept'] }
    expect(publishStatus(partial)).toBe('partial')
    expect(publishStatus({ ...partial, blocked: ['artifact: x'] })).toBe('blocked')
  })
  it('records the latest reported period only from real dates', () => {
    expect(latestPeriod({ entries: { A: { earningsDate: '2025-09-30' }, B: { earningsDate: '2026-03-31' }, C: { earningsDate: null } } }))
      .toBe('2026-03-31')
    expect(latestPeriod({})).toBe(null)
  })
})
