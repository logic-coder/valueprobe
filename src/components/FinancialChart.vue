<template>
  <div data-testid="financial-chart" :data-unit-state="unitOk ? 'reconciled' : 'unreconciled'">
    <div v-if="!unitOk" class="chart-empty faint">{{ t('chart_units_unreconciled') }}</div>
    <template v-else>
      <date-selector :value="date" :range="props.range" :dates="annualRanges" @on-change="onDateChange" />
      <div v-if="!loading && chartOptions" ref="chartEl" style="width: 100%; height: 280px" />
      <div v-else-if="!loading" class="chart-empty faint">{{ t('chart_empty') }}</div>
      <p v-if="!loading && trend" class="chart-fit-note muted">{{ t('chart_fit_note', { correlation: trend.r }) }}</p>
      <q-skeleton v-if="loading" type="rect" height="280px" />
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])
import { useStockStore } from '../store/stock'
import { useDcfStore } from '../store/dcf'
import { axisExtent } from '../lib/axis'
import { buildTrend } from '../lib/trend'
import { quoteUnitReconciliation } from '../lib/unreconciledUnits'
import DateSelector from './DateSelector.vue'
import { RANGE_KEYS, rangeDate } from '../lib/ranges'

const props = defineProps({
  indicator: { type: String, default: '' },
  symbol: { type: String, default: '' },
  range: { type: String, default: '' },
})
const emit = defineEmits(['range'])
const { t } = useI18n()
const stockStore = useStockStore()
const dcfStore = useDcfStore()

// D3: the original opens on a 30-year window, which is mostly empty for newer
// listings and unreadable at 280px. Open on 3 years; the selector still offers all.
const date = ref(new Date(new Date().getFullYear() - 3, new Date().getMonth(), new Date().getDate()).getTime())
const annualRanges = RANGE_KEYS.filter(key => !['1M', '3M', '6M', 'YTD'].includes(key.toUpperCase()))
const chartEl = ref(null)
const ink = ref({ line: '', trend: '', text: '', grid: '' })
let instance = null
let themeObserver = null

const readInk = () => {
  const style = getComputedStyle(document.documentElement)
  const pick = (name, fallback) => style.getPropertyValue(name).trim() || fallback
  ink.value = {
    line: pick('--accent', '#0f9d6e'),
    trend: pick('--text-muted', '#475467'),
    text: pick('--text-muted', '#475467'),
    grid: pick('--border', '#e3e7ed'),
  }
}

const stock = computed(() => stockStore.stock || {})
const unitOk = computed(() => !stock.value.symbol || quoteUnitReconciliation(stock.value).ok)
const data = computed(() => dcfStore.indicator.data || [])
const loading = computed(() => dcfStore.indicator.dataLoading)

const visible = computed(() => data.value.filter(([period, value]) =>
  new Date(period).getTime() > date.value && value != null && value !== '' && Number.isFinite(Number(value))))
const trend = computed(() => {
  const fit = visible.value.length >= 3 ? buildTrend(visible.value) : null
  return fit && Number.isFinite(Number(fit.r)) ? fit : null
})

const chartOptions = computed(() => {
  if (!visible.value.length) return null
  const child = (dcfStore.view.data?.children || []).find((item) => item.name === props.indicator)
  const label = child ? child.display_name : props.indicator
  const values = [
    ...visible.value.map((point) => point[1]),
    ...(trend.value?.simData ?? []).map((point) => point[1]),
  ]
  const extent = axisExtent(values)
  return {
    legend: { show: true, textStyle: { color: ink.value.text } },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        let html = params[0] ? params[0].axisValue + '<br>' : ''
        for (const item of params) {
          if (item && item.value !== undefined && item.value !== null) {
            html += item.marker + item.seriesName + ': ' + item.value + '<br>'
          }
        }
        return html
      },
    },
    grid: { left: 56, right: 16, top: 32, bottom: 36 },
    xAxis: {
      type: 'category',
      data: visible.value.map(([period]) => 'FY' + String(period).slice(0, 4)),
      axisLabel: { color: ink.value.text, hideOverlap: true },
      axisLine: { lineStyle: { color: ink.value.grid } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      // The padded extent puts raw floats (13.0000001) on the end ticks, wider than the grid gutter.
      axisLabel: { color: ink.value.text, formatter: (value) => String(Number(Number(value).toPrecision(4))) },
      splitLine: { lineStyle: { color: ink.value.grid } },
      ...(extent ? { min: extent.min, max: extent.max } : {}),
    },
    series: [
      { type: 'line', name: label, data: visible.value.map((point) => point[1]), color: ink.value.line, showSymbol: false },
      ...(trend.value ? [{
        type: 'line',
        name: t('trendline'),
        data: trend.value.simData.map((point) => point[1]),
        color: ink.value.trend,
        lineStyle: { type: 'dashed' },
        showSymbol: false,
      }] : []),
    ],
  }
})

const getData = async () => {
  if (!props.indicator || !unitOk.value) return
  await dcfStore.loadIndicatorData(props.symbol || stock.value.stockid, props.indicator, { type: 'annual', get_ratio: false })
}

const render = () => {
  if (!chartEl.value || !chartOptions.value) return
  if (instance && instance.getDom() !== chartEl.value) {
    instance.dispose()
    instance = null
  }
  if (!instance) instance = echarts.init(chartEl.value)
  instance.setOption(chartOptions.value, true)
  instance.resize()
}

const onDateChange = (payload) => {
  date.value = new Date(payload.value).getTime()
  emit('range', payload.key)
}

// A range restored from the URL or storage re-opens the same window.
watch(() => props.range, (key) => {
  if (key) date.value = rangeDate(key)
})
const resize = () => instance && instance.resize()

watch([chartOptions, chartEl], render, { flush: 'post' })
watch(() => props.indicator, getData)
onMounted(async () => {
  readInk()
  themeObserver = new MutationObserver(readInk)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  await getData()
  render()
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  if (themeObserver) themeObserver.disconnect()
  if (instance) instance.dispose()
})
</script>

<style scoped>
.chart-fit-note { margin: 6px 0 0; font-size: 13px; line-height: 1.5; }
</style>
