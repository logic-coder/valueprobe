<template>
  <div class="watchlist">
    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('watchlist') }}</span>
        <span class="faint">{{ t('watchlist_hint') }}</span>
        <div class="wl__tools">
          <a v-if="store.symbols.length > 1" class="wl__tool" :href="'#/compare?s=' + store.symbols.slice(0, 5).join(',')">{{ t('compare_open') }}</a>
          <button type="button" class="wl__tool" @click="download('json')">{{ t('watch_export') }}</button>
          <button type="button" class="wl__tool" @click="download('csv')">{{ t('watch_export_csv') }}</button>
          <label class="wl__tool">
            {{ t('watch_import') }}
            <input class="sr-only" type="file" accept="application/json,.json" @change="(event) => importFrom(event, importWatchlist)" />
          </label>
          <label class="wl__tool">
            {{ t('watch_import_csv') }}
            <input class="sr-only wl__csv" type="file" accept=".csv,text/csv" @change="(event) => importFrom(event, importWatchCsv)" />
          </label>
        </div>
      </div>
      <div class="panel__body">
        <p v-if="allFailed" class="muted wl__failed">
          {{ t('rows_failed') }}
          <button type="button" class="wl__tool" :disabled="retrying" @click="retry">{{ retrying ? t('retrying') : t('retry') }}</button>
        </p>
        <div v-if="!store.symbols.length" class="empty-state">
          <span class="empty-state__title">{{ t('watchlist_empty_title') }}</span>
          <span class="muted">{{ t('watchlist_empty') }} <a href="#/">{{ t('watchlist_empty_link') }}</a></span>
          <ol class="empty-state__steps">
            <li>{{ t('watchlist_step_find') }}</li>
            <li>{{ t('watchlist_step_star') }}</li>
          </ol>
        </div>
        <div v-else class="wl__scroll">
        <table class="wl__table">
          <thead>
            <tr>
              <th scope="col">{{ t('peer_company') }}</th>
              <th scope="col">{{ t('stock_price') }}</th>
              <th scope="col">P/E</th>
              <th scope="col">{{ t('fair_value') }}</th>
              <th scope="col">{{ t('margin_of_safety') }}</th>
              <th scope="col"><span class="sr-only">{{ t('actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.symbol">
              <th scope="row">
                <a :href="'#/stock/' + row.symbol + '/dcf'">{{ row.name }}</a>
                <span class="faint">{{ row.symbol }}</span>
                <span v-if="row.asOf" class="faint wl__asof" :title="t('source_hint_snapshot')">{{ row.asOf }}</span>
              </th>
              <td>{{ row.price === null ? 'n/a' : moneyIn(row.currency, row.price) }}</td>
              <td>{{ row.pe === null ? 'n/a' : row.pe.toFixed(1) + '×' }}</td>
              <td>{{ row.fairValue === null ? 'n/a' : moneyIn(row.currency, row.fairValue) }}</td>
              <td>{{ row.mos === null ? 'n/a' : row.mos + '%' }}</td>
              <td>
                <button type="button" class="wl__remove" :aria-label="t('watch_remove')" @click="remove(row.symbol)">×</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="store.symbols.length === 1" class="empty-state__next muted">{{ t('watchlist_one') }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { api } from '../api'
import { peerRow } from '../lib/peers'
import { exportWatchlist, exportWatchlistCsv, importWatchCsv, importWatchlist } from '../lib/watchlist'
import { defaultView } from '../lib/watchlistView'
import { yieldForStock } from '../lib/riskFree'
import { useWatchlistStore } from '../store/watchlist'
import { useMoney } from '../composables/useMoney'

const { t } = useI18n()
const $q = useQuasar()
const { moneyIn } = useMoney()
const store = useWatchlistStore()
const rows = ref([])
const retrying = ref(false)

const load = async () => {
  const symbols = store.symbols.slice()
  const [rates, settled] = await Promise.all([
    api.getRiskFreeRates().catch(() => ({})),
    Promise.allSettled(symbols.map((symbol) => api.getStock(symbol))),
  ])
  rows.value = settled.map((item, index) => (item.status === 'fulfilled' && item.value
    ? { ...peerRow(item.value, symbols[index]), currency: item.value.currency || '¥', asOf: item.value._as_of || null, ...defaultView(item.value, yieldForStock(rates, item.value)) }
    : { symbol: symbols[index], name: symbols[index], price: null, pe: null, currency: '¥', asOf: null, fairValue: null, mos: null }))
}

const allFailed = computed(() => rows.value.length > 0 && rows.value.every((row) => row.price === null))
const retry = async () => {
  retrying.value = true
  await load()
  retrying.value = false
}

const remove = (symbol) => {
  store.remove(symbol)
}

const download = (kind) => {
  const csv = kind === 'csv'
  const blob = new Blob([csv ? exportWatchlistCsv() : exportWatchlist()], { type: csv ? 'text/csv' : 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'watchlist-' + new Date().toISOString().slice(0, 10) + (csv ? '.csv' : '.json')
  link.click()
  URL.revokeObjectURL(url)
  $q.notify({ message: t('watch_exported'), icon: 'download', color: 'positive', timeout: 1600 })
}

const importFrom = async (event, importer) => {
  const file = event.target.files?.[0]
  if (!file) return
  const before = store.symbols.length
  importer(await file.text())
  store.reload()
  const added = store.symbols.length - before
  $q.notify({
    message: added ? t('watch_imported', { count: added }) : t('watch_nothing'),
    icon: 'upload',
    color: added ? 'positive' : 'grey-8',
    timeout: 2000,
  })
  event.target.value = ''
}

watch(() => store.symbols, load)
onMounted(load)
</script>
