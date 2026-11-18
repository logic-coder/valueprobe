<template>
  <stock-not-found-page v-if="!parsed.ok" />
  <div v-else>
    <header v-if="embedded" class="example-head">
      <span class="example-head__kicker">{{ t('home_example') }}</span>
      <a :href="'#/stock/' + symbol + '/dcf'">{{ stockStore.stock?.company || t('default_company') }}</a>
      <span class="example-head__code">{{ symbol }}</span>
    </header>
    <data-state-banner
      :state="state"
      :data-at="dataAt"
      :fallback="meta.fallback"
      :providers="meta.providers || []"
      :skips="meta.skips || []"
      :as-of="meta.asOf || ''"
      :busy="retrying"
      :disabled="loading"
      @retry="reload"
      @manual="toManual"
      @live="toLive"
    />
    <div class="workspace">
      <div v-if="!tabReady" class="panel q-pa-md">
        <q-skeleton type="rect" height="160px" />
      </div>
      <dcf-tab
        v-else-if="isManual || stockStore.stock"
        :symbol="symbol"
        :preset="route.query"
        :preset-key="presetKey"
        @reload="reload"
      />
      <section v-if="tabReady && (isManual || stockStore.stock)" class="panel chart-panel">
        <div class="panel__head"><span class="panel__title">{{ t('chart_title') }}</span></div>
        <div class="panel__body">
          <lazy-financial-chart :symbol="symbol" indicator="revenue_per_share" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { DEFAULT_SYMBOL, parseSymbol } from '../config/markets'
import { addRecent } from '../lib/recent'
import { useStockStore } from '../store/stock'
import { useDcfStore } from '../store/dcf'
import { useDataStateStore } from '../store/dataState'
import DcfTab from '../components/stock/DcfTab.vue'
import LazyFinancialChart from '../components/LazyFinancialChart.vue'
import DataStateBanner from '../components/DataStateBanner.vue'
import StockNotFoundPage from './StockNotFoundPage.vue'

const route = useRoute()
const { t } = useI18n()
const stockStore = useStockStore()
const dcfStore = useDcfStore()
const sourceStore = useDataStateStore()

const embedded = computed(() => !route.params.symbol)
const parsed = computed(() => parseSymbol(route.params.symbol || DEFAULT_SYMBOL))
const symbol = computed(() => (parsed.value.ok ? parsed.value.symbol : DEFAULT_SYMBOL))
// A pasted link remounts the calculator so the preset seeds it; plain typing never
// touches the URL, so this stays inert during normal use.
const presetKey = computed(() => JSON.stringify(route.query))

const isManual = computed(() => sourceStore.stateOf(symbol.value) === 'manual')
const settled = ref(false)
const loading = ref(false)
const tabReady = computed(() => settled.value && !stockStore.loading && !loading.value)
const state = computed(() => sourceStore.stateOf(symbol.value))
const meta = computed(() => sourceStore.metaOf(symbol.value))
const dataAt = computed(() => meta.value.dataAt || 0)

const load = async () => {
  loading.value = true
  settled.value = false
  if (!parsed.value.ok) {
    stockStore.notFound = true
    loading.value = false
    return
  }
  const target = symbol.value
  try {
    await stockStore.loadStock(target)
    if (symbol.value !== target) return
    if (!stockStore.stock && !isManual.value) sourceStore.setMode(symbol.value, 'error')
    else await dcfStore.preFetch(target)
    if (symbol.value !== target) return
    if (stockStore.stock) addRecent(symbol.value, stockStore.stock.company)
    settled.value = true
  } finally {
    loading.value = false
  }
}

const retrying = ref(false)
const reload = async () => {
  if (retrying.value) return
  retrying.value = true
  try {
    await load()
  } finally {
    retrying.value = false
  }
}

const toManual = () => {
  sourceStore.markManual(symbol.value)
  dcfStore.financials.data = null
  stockStore.loadStock(symbol.value)
}

const toLive = async () => {
  sourceStore.reset(symbol.value)
  await load()
}

watch(symbol, load)
onMounted(load)
</script>
