import { describe, expect, it } from 'vitest'
import { axisExtent } from '../../src/lib/axis'

describe('axisExtent', () => {
  it('pads a tight series without pulling the axis down to zero', () => {
    const extent = axisExtent([2.0, 2.2, 2.4, 2.6])
    expect(extent.min).toBeGreaterThan(1.9)
    expect(extent.min).toBeLessThan(2)
    expect(extent.max).toBeGreaterThan(2.6)
    expect(extent.max).toBeLessThan(2.8)
  })

  it('keeps zero inside the range only when the data already crosses it', () => {
    const extent = axisExtent([-1, 2])
    expect(extent.min).toBeLessThan(0)
    expect(extent.max).toBeGreaterThan(2)
  })

  it('gives a flat series a visible band', () => {
    const extent = axisExtent([5, 5, 5])
    expect(extent.max - extent.min).toBeGreaterThan(0)
    expect(extent.min).toBeLessThan(5)
    expect(extent.max).toBeGreaterThan(5)
  })

  it('ignores blanks', () => {
    expect(axisExtent([null, undefined, 'n/a'])).toBeNull()
    expect(axisExtent([])).toBeNull()
  })
})
