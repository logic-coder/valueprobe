import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '../../src/api'

describe('user DCF templates', () => {
  beforeEach(() => window.localStorage.clear())

  it('creates, updates and deletes without leaking between calls', async () => {
    expect(await api.getUserDcfTemplate()).toEqual([])
    await api.createUserDcfTemplate({ name: 'bull', discountRate: 9 })
    const [created] = await api.getUserDcfTemplate()
    expect(created.name).toBe('bull')
    await api.updateUserDcfTemplate(created.id, { discountRate: 11 })
    expect((await api.getUserDcfTemplate())[0].discountRate).toBe(11)
    await api.deleteUserDcfTemplate(created.id)
    expect(await api.getUserDcfTemplate()).toEqual([])
  })

  it('survives a corrupted store', async () => {
    window.localStorage.setItem('fv-dcf-templates', '{oops')
    expect(await api.getUserDcfTemplate()).toEqual([])
  })
})
