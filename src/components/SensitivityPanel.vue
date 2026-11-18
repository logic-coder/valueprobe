<template>
  <section class="sens">
    <div class="sens__head">
      <a-popover placement="top">
        <h4 class="sens__title">
          {{ t('sensitivity') }}
          <q-icon class="faint" name="help" size="14px" />
        </h4>
        <template #content>{{ t('sensitivity_hint') }}</template>
      </a-popover>
      <span class="faint">{{ t('sensitivity_note') }}</span>
    </div>

    <div class="sens__scroll">
      <table class="sens__grid">
        <thead>
          <tr>
            <th scope="col" class="sens__corner">{{ t('discount_rate') }} \ {{ t('growth_rate') }}</th>
            <th v-for="growth in grid.growths" :key="'g' + growth" scope="col" :class="{ 'is-center': growth === grid.center.growthRate }">
              {{ axisLabel(growth) }}%
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in grid.rows" :key="'r' + rowIndex">
            <th scope="row" :class="{ 'is-center': grid.discounts[rowIndex] === grid.center.discountRate }">
              {{ axisLabel(grid.discounts[rowIndex]) }}%
            </th>
            <td
              v-for="(value, columnIndex) in row"
              :key="'c' + columnIndex"
              :class="[bucket(value), { 'is-center': grid.discounts[rowIndex] === grid.center.discountRate && grid.growths[columnIndex] === grid.center.growthRate }]"
              :title="value === null ? 'n/a' : percent(1 - price / value)"
            >
              {{ moneyIn(currency, value) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { marginBucket } from '../lib/sensitivity'
import { useMoney } from '../composables/useMoney'
import APopover from './APopover.vue'

const props = defineProps({
  grid: { type: Object, required: true },
  currency: { type: String, default: '¥' },
  price: { type: [Number, String], default: 0 },
})

const { t } = useI18n()
const { moneyIn } = useMoney()
const bucket = (value) => 'cell--' + marginBucket(value, Number(props.price))
const axisLabel = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n * 100) / 100)
}
const percent = (value) => (Number.isFinite(value) ? (100 * value).toFixed(1) + '%' : 'n/a')
</script>
