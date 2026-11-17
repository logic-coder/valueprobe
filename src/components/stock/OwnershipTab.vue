<template>
  <section class="panel">
    <div class="panel__head"><span class="panel__title">{{ t('ownership_tab') }}</span><span class="faint">{{ t('own_note') }}</span></div>
    <div class="panel__body">
      <dl class="sum__grid">
        <div class="sum__cell"><dt>P/E</dt><dd>{{ multiple(amount(stock.price), amount(stock.ttm_eps)) }}</dd></div>
        <div class="sum__cell"><dt>P/BV</dt><dd>{{ multiple(amount(stock.price), amount(stock.tangible_book)) }}</dd></div>
        <div class="sum__cell"><dt>{{ t('own_position') }}</dt><dd>{{ rangePosition }}</dd></div>
        <div class="sum__cell"><dt>{{ t('own_vs_peers') }}</dt><dd>{{ peerDeviation }}</dd></div>
      </dl>
      <p class="faint">{{ t('own_hint') }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseAmount } from '../../lib/format'

const props = defineProps({
  stock: { type: Object, default: () => ({}) },
  peerMedianPe: { type: Number, default: null },
})
const { t } = useI18n()
const amount = (value) => parseAmount(value) ?? 0
const multiple = (price, base) => (price > 0 && base > 0 ? (price / base).toFixed(1) + '×' : 'n/a')
const rangePosition = computed(() => {
  const low = amount(props.stock.price52wlow)
  const high = amount(props.stock.price52whigh)
  const price = amount(props.stock.price)
  if (!(high > low) || !(price >= 0)) return 'n/a'
  return (100 * (price - low) / (high - low)).toFixed(0) + '%'
})
const peerDeviation = computed(() => {
  const base = amount(props.stock.ttm_eps)
  const price = amount(props.stock.price)
  if (!(base > 0) || !(price > 0) || props.peerMedianPe === null) return 'n/a'
  const own = price / base
  return ((100 * (own - props.peerMedianPe)) / props.peerMedianPe).toFixed(0) + '%'
})
</script>
