import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const getIndicatorData = vi.fn()
vi.mock('../../src/api', () => ({ api: { getIndicatorData } }))

const { useDcfStore } = await import('../../src/store/dcf')

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  getIndicatorData.mockReset()
  setActivePinia(createPinia())
})

describe('chart request ownership', () => {
  it('keeps the newest answer when requests finish out of order', async () => {
    const first = deferred()
    const second = deferred()
    getIndicatorData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const store = useDcfStore()
    const a = store.loadIndicatorData('X', 'eps', {})
    const b = store.loadIndicatorData('X', 'revenue', {})
    second.resolve([['2025', 2]])
    await b
    first.resolve([['2025', 1]])
    await a
    expect(store.indicator.data).toEqual([['2025', 2]])
    expect(store.indicator.dataLoading).toBe(false)
  })

  it('does not let an old request clear the latest loading state', async () => {
    const first = deferred()
    const second = deferred()
    getIndicatorData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const store = useDcfStore()
    const a = store.loadIndicatorData('X', 'eps', {})
    store.loadIndicatorData('X', 'revenue', {})
    first.resolve([['2025', 1]])
    await a
    expect(store.indicator.dataLoading).toBe(true)
    second.resolve([['2025', 2]])
    await Promise.resolve()
    expect(store.indicator.dataLoading).toBe(false)
  })

  it('shows a latest failure and ignores a failure from a replaced request', async () => {
    const first = deferred()
    const second = deferred()
    getIndicatorData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const store = useDcfStore()
    const a = store.loadIndicatorData('X', 'eps', {})
    const b = store.loadIndicatorData('X', 'revenue', {})
    second.resolve([['2025', 2]])
    await b
    first.reject(new Error('late'))
    await a
    expect(store.indicator.data).toEqual([['2025', 2]])

    getIndicatorData.mockRejectedValueOnce(new Error('latest'))
    await store.loadIndicatorData('X', 'revenue', {})
    expect(store.indicator.data).toEqual([])
    expect(store.indicator.dataLoading).toBe(false)
  })

  it('drops an answer for the previous symbol', async () => {
    const pending = deferred()
    getIndicatorData.mockReturnValueOnce(pending.promise)
    const store = useDcfStore()
    store.symbol = 'X'
    const a = store.loadIndicatorData('X', 'eps', {})
    store.symbol = 'Y'
    pending.resolve([['2025', 1]])
    await a
    expect(store.indicator.data).toBeUndefined()
    expect(store.indicator.dataLoading).toBe(false)
  })

  it('has no duplicate chart map', () => {
    expect(useDcfStore().chartData).toBeUndefined()
  })
})
