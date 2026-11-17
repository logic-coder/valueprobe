import { beforeEach, describe, expect, it } from 'vitest'
import { pinProvider, pinnedProvider, readPreferences, resetPreferences, setOrder } from '../../src/data/preferences'

describe('source preferences', () => {
  beforeEach(() => window.localStorage.clear())

  it('drops retired provider ids', () => {
    window.localStorage.setItem('fv-data-sources', JSON.stringify({ order: ['cloud', 'snapshot'], pinned: { 'SHSE:601398': 'upstreamApi' } }))
    expect(readPreferences().order).toEqual(['snapshot'])
    expect(pinnedProvider('SHSE:601398')).toBeNull()
  })

  it('ignores a retired id on write and clears with reset', () => {
    pinProvider('SHSE:601398', 'cloud')
    expect(readPreferences().pinned['SHSE:601398']).toBeUndefined()
    setOrder(['cloud', 'edgar'])
    expect(readPreferences().order).toEqual(['edgar'])
    resetPreferences()
    expect(readPreferences()).toEqual({ order: [], pinned: {} })
  })
})
