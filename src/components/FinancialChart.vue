<template>
  <div>
    <date-selector :value="date" :range="props.range" @on-change="onDateChange" />
    <div v-if="!loading && chartOptions" ref="chartEl" style="width: 100%; height: 280px" />
    <div v-else-if="!loading" class="chart-empty faint">{{ t('chart_empty') }}</div>
    <q-skeleton v-if="loading" type="rect" height="280px" />
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
import DateSelector from './DateSelector.vue'
import { rangeDate } from '../lib/ranges'

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
const trend = ref(null)
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
const data = computed(() => dcfStore.indicator.data || [])
const loading = computed(() => dcfStore.indicator.dataLoading)

const percent = (value) => (100 * Number(value || 0)).toFixed(2) + '%'

const chartOptions = computed(() => {
  if (!data.value || !data.value.length) return null
  const raw = data.value.map((point) => {
    const time = new Date(point[0]).getTime()
    return { time, label: point[0], value: point[1] }
  })
  const visible = raw.filter((point) => point.time > date.value)
  const trendVisible = (trend.value?.simData || []).filter((point) => new Date(point[0]).getTime() > date.value)
  const child = (dcfStore.view.data?.children || []).find((item) => item.name === props.indicator)
  const label = child ? child.display_name : props.indicator
  const values = [
    ...visible.map((point) => point.value),
    ...trendVisible.map((point) => point[1]),
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
    grid: { left: 56, right: 16, top: 32, bottom: 64 },
    xAxis: {
      type: 'category',
      data: visible.map((point) => point.label),
      axisLabel: { rotate: 60, color: ink.value.text },
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
      { type: 'line', name: label, data: visible.map((point) => point.value), color: ink.value.line, showSymbol: false },
      {
        type: 'line',
        name: label + t('trendline') + '(' + percent(trend.value && trend.value.r) + ')',
        data: trendVisible.map((point) => point[1]),
        color: ink.value.trend,
        showSymbol: false,
      },
    ],
  }
})

const getData = async () => {
  if (!props.indicator) return
  const fresh = await dcfStore.loadIndicatorData(props.symbol || stock.value.stockid, props.indicator, { type: 'annual', get_ratio: false })
  if (fresh && data.value.length > 2) trend.value = buildTrend(data.value)
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
