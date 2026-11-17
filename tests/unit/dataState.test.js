import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStateStore } from '../../src/store/dataState'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('source state machine', () => {
  it('defaults to live', () => {
    expect(useDataStateStore().stateOf('SHSE:601398')).toBe('live')
  })

  it('tracks manual, stale and back to live', () => {
    const store = useDataStateStore()
    store.markManual('SHSE:601398')
    expect(store.stateOf('SHSE:601398')).toBe('manual')
    store.markStale('SHSE:601398', 'stock', 1234)
    expect(store.metaOf('SHSE:601398')).toMatchObject({ state: 'stale', dataAt: 1234 })
    store.reset('SHSE:601398')
    expect(store.stateOf('SHSE:601398')).toBe('live')
  })

  it('starts empty when the stored map is junk', () => {
    localStorage.setItem('fv-source-state', 'null')
    setActivePinia(createPinia())
    expect(useDataStateStore().stateOf('SHSE:601398')).toBe('live')
  })

  it('drops entries that are not objects', () => {
    localStorage.setItem('fv-source-state', JSON.stringify({ 'SHSE:601398': 'stale', 'NYSE:BABA': { state: 'manual' } }))
    setActivePinia(createPinia())
    const store = useDataStateStore()
    expect(store.stateOf('SHSE:601398')).toBe('live')
    expect(store.stateOf('NYSE:BABA')).toBe('manual')
  })

  it('isolates state per symbol', () => {
    const store = useDataStateStore()
    store.markManual('NYSE:BABA')
    expect(store.stateOf('NYSE:BABA')).toBe('manual')
    expect(store.stateOf('SHSE:601398')).toBe('live')
  })
})
