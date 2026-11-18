// Bull / base / bear presets: fixed deltas on the three assumption dials.
// Display-layer only — the kernel never knows a scenario exists.
export const SCENARIOS = Object.freeze({
  base: 'base',
  bull: 'bull',
  bear: 'bear',
})

export const DELTAS = Object.freeze({
  bull: { discountRate: -1, growthRate: 2, terminalGrowthRate: 1 },
  bear: { discountRate: 1, growthRate: -2, terminalGrowthRate: -1 },
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const rateOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * @param {{discountRate:number, growthRate:number, terminalGrowthRate:number}} base
 * @param {'base'|'bull'|'bear'} key
 */
export function applyScenario (base, key) {
  const source = {
    discountRate: Number(base?.discountRate) || 0,
    growthRate: rateOrNull(base?.growthRate),
    terminalGrowthRate: Number(base?.terminalGrowthRate) || 0,
  }
  if (key === 'base' || !DELTAS[key]) return source
  return {
    discountRate: clamp(source.discountRate + DELTAS[key].discountRate, 0, 50),
    growthRate: source.growthRate === null ? null : source.growthRate + DELTAS[key].growthRate,
    terminalGrowthRate: source.terminalGrowthRate + DELTAS[key].terminalGrowthRate,
  }
}
