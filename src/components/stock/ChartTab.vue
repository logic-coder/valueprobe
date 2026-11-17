<template>
  <section class="panel chart-panel" data-testid="chart-panel">
    <div class="panel__head">
      <span class="panel__title">{{ t('chart_title') }}</span>
      <q-select
        v-model="selectedIndicator"
        class="chart-indicator"
        dense
        outlined
        emit-value
        map-options
        :options="indicators"
        :aria-label="t('chart_indicator')"
        @update:model-value="emit('change', $event)"
      />
      <span class="faint">{{ t('click_row_hint') }}</span>
    </div>
    <div class="panel__body">
      <lazy-financial-chart :indicator="selectedIndicator" :symbol="symbol" :range="chartRange" @change="emit('change', $event)" @range="emit('range', $event)" />
    </div>
  </section>
  <section class="panel">
    <div class="panel__head"><span class="panel__title">{{ t('per_share_table') }}</span></div>
    <financial-data :reverse="''" :type="type" @change="emit('change', $event)" />
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import FinancialData from '../FinancialData.vue'
import LazyFinancialChart from '../LazyFinancialChart.vue'

defineProps({
  symbol: { type: String, required: true },
  type: { type: String, default: 'eps' },
  indicators: { type: Array, default: () => [] },
  chartRange: { type: String, default: '3y' },
})
const selectedIndicator = defineModel('selectedIndicator', { type: String, default: 'revenue_per_share' })
const emit = defineEmits(['change', 'range'])
const { t } = useI18n()
</script>
