import { describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { atomicWrite, classifyShareBasis, transport, useQuote } from '../../scripts/lib/snapshot-transport.mjs'
import { installSnapshots, recoverInstall } from '../../scripts/lib/snapshot-install.mjs'
import { assessPublish, classifyOutcome, refreshVerification } from '../../scripts/lib/publish-gate.mjs'
import { POLICY_VERSION } from '../../src/lib/policy'

describe('incremental snapshot refresh', () => {
  it('blocks an upstream 404 without claiming a new verification when rates are kept', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    const onFetched = vi.fn()
    const previous = { price: '$12', currency: '$', quote_as_of: '2026-11-18' }
    const read = transport({ fetcher, onFetched, headers: {} })
    const outcome = await read('https://data.sec.gov/example').catch(error =>
      classifyOutcome({ mode: 'all', prev: previous, patch: previous, fundamentalError: error.message }))
    expect(onFetched).not.toHaveBeenCalled()
    const outcomes = [{ symbol: 'NASDAQ:AAPL', ...outcome }]
    const assessment = assessPublish({ mode: 'all', scope: 'targeted', outcomes, rates: { requested: false } })
    expect(assessment.blocked).toEqual(expect.arrayContaining(['every quote request failed', 'every fundamentals request failed']))
    expect(refreshVerification(assessment, outcomes, { requested: false }, null, '2026-11-21T08:00:00Z'))
      .toEqual({ status: 'blocked', upstreamCheckedAt: null })
  })

  it('keeps the financial period and rejects unknown or older quotes when a dated quote is available', () => {
    const prior = { price: '$12', currency: '$', quote_as_of: '2026-11-18', quote_source: 'filed', eps_as_of: '2026-09-30', as_of: '2026-11-19' }
    expect(useQuote(prior, { price: '$13', asOf: null, currency: '$' })).toBe(prior)
    const undated = { price: '$12', currency: '$' }
    expect(useQuote(undated, { price: '$13', asOf: null, currency: '$' })).toBe(undated)
    expect(useQuote({ ...prior, currency: '$' }, { price: '$13', asOf: '2026-11-17', currency: '$' }).price).toBe('$12')
    expect(useQuote({ ...prior, currency: '$' }, { price: '$14', asOf: '2026-11-19', currency: '$' })).toEqual({
      price: '$14', quote_as_of: '2026-11-19', eps_as_of: '2026-09-30', as_of: '2026-11-19', currency: '$',
    })
  })
  it('does not assume a split from a share-count discrepancy on a new listing', () => {
    expect(classifyShareBasis(1.04, 1)).toBe('comparable')
    expect(classifyShareBasis(1.6, 1)).toBe('review')
    expect(classifyShareBasis(2, 2)).toBe('review')
    expect(classifyShareBasis(NaN, 1)).toBe('unknown')
  })
  it('retries a transient 503 and does not retry a permanent 404', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
    const read = transport({ fetcher, headers: {} })
    await expect(read('https://data.sec.gov/sample')).resolves.toEqual({ ok: true })
    await expect(read('https://data.sec.gov/missing')).rejects.toThrow('404')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})

it('restores the previous snapshot and removes new entries after a failed or interrupted install', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(resolve('tmp-snapshot-test-'))
  try {
    const live = resolve(root, 'live')
    const staged = resolve(root, 'staged')
    const backup = resolve(root, 'backup')
    const run = resolve(root, 'run')
    await mkdir(run)
    const existing = 'NASDAQ-AAPL.json'
    const added = 'NYSE-IBM.json'
    const release = ['catalog.json', 'rates.json', 'intrinsic/v1.json', 'intrinsic/' + POLICY_VERSION + '.json', 'manifest.json', 'publish.json']
    for (const name of [existing, ...release]) {
      await atomicWrite(resolve(live, name), '{"value":"old"}')
      await atomicWrite(resolve(staged, name), '{"value":"new"}')
    }
    await atomicWrite(resolve(staged, added), '{}')
    const fail = async (path, bytes) => {
      if (path.endsWith('manifest.json')) throw new Error('simulated write failure')
      await atomicWrite(path, bytes)
    }
    await expect(installSnapshots(staged, live, backup, run, fail)).rejects.toThrow('simulated write failure')
    for (const name of [existing, ...release]) expect(await readFile(resolve(live, name), 'utf8')).toBe('{"value":"old"}')
    await expect(readFile(resolve(live, added))).rejects.toMatchObject({ code: 'ENOENT' })

    await atomicWrite(resolve(live, existing), '{"value":"interrupted"}')
    await atomicWrite(resolve(live, added), '{}')
    await atomicWrite(resolve(backup, 'install.json'), JSON.stringify({ added: [added] }))
    expect(await recoverInstall(live, backup)).toBe(true)
    expect(await readFile(resolve(live, existing), 'utf8')).toBe('{"value":"old"}')
    await expect(readFile(resolve(live, added))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await recoverInstall(live, backup)).toBe(false)
    await installSnapshots(staged, live, backup, run)
    expect(await readFile(resolve(live, existing), 'utf8')).toBe('{"value":"new"}')
    expect(await readFile(resolve(live, added), 'utf8')).toBe('{}')
  } finally {
    if (dirname(root) === process.cwd() && basename(root).startsWith('tmp-snapshot-test-')) {
      await rm(root, { recursive: true, force: true })
    }
  }
})

it('removes fresh release assets when the first upgrade fails', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(resolve('tmp-snapshot-test-'))
  try {
    const live = resolve(root, 'live')
    const staged = resolve(root, 'staged')
    const backup = resolve(root, 'backup')
    const run = resolve(root, 'run')
    await mkdir(run)
    const existing = 'NASDAQ-AAPL.json'
    const added = 'NYSE-IBM.json'
    const oldRelease = ['catalog.json', 'rates.json', 'intrinsic/v1.json', 'manifest.json']
    const newRelease = ['intrinsic/' + POLICY_VERSION + '.json', 'publish.json']
    for (const name of [existing, ...oldRelease]) await atomicWrite(resolve(live, name), '{"value":"old"}')
    for (const name of [existing, ...oldRelease, ...newRelease]) await atomicWrite(resolve(staged, name), '{"value":"new"}')
    await atomicWrite(resolve(staged, added), '{}')
    const fail = async (path, bytes) => {
      if (path.endsWith('manifest.json')) throw new Error('simulated write failure')
      await atomicWrite(path, bytes)
    }
    await expect(installSnapshots(staged, live, backup, run, fail)).rejects.toThrow('simulated write failure')
    for (const name of [existing, ...oldRelease]) expect(await readFile(resolve(live, name), 'utf8')).toBe('{"value":"old"}')
    for (const name of [added, ...newRelease]) await expect(readFile(resolve(live, name))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    if (dirname(root) === process.cwd() && basename(root).startsWith('tmp-snapshot-test-')) {
      await rm(root, { recursive: true, force: true })
    }
  }
})
