<template>
  <div class="compare">
    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('compare_title') }}</span>
        <span class="faint">{{ t('compare_lead') }}</span>
        <div class="cmp__tools">
          <a v-if="store.symbols.length" class="wl__tool" href="#/watchlist">{{ t('watchlist') }}</a>
        </div>
      </div>
      <div class="panel__body">
        <div class="cmp__add">
          <q-input
            v-model="draft"
            dense
            outlined
            :label="t('compare_add')"
            :aria-label="t('compare_add')"
            :disable="rows.length >= MAX_COMPARE"
            list="symbol-suggestions"
            @keyup.enter="add"
          />
          <q-btn dense unelevated class="cmp__add-btn" :label="t('compare_add_btn')" :disable="!draft.trim() || rows.length >= MAX_COMPARE" @click="add" />
        </div>

        <div v-if="!rows.length" class="empty-state">
          <span class="empty-state__title">{{ t('compare_empty_title') }}</span>
          <span class="muted">{{ t('compare_empty') }} <a href="#/">{{ t('compare_empty_link') }}</a></span>
          <ol class="empty-state__steps">
            <li>{{ t('compare_step_add') }}</li>
            <li>{{ t('compare_step_second') }}</li>
          </ol>
        </div>
        <p v-if="allFailed" class="muted cmp__failed">
          {{ t('rows_failed') }}
          <button type="button" class="wl__tool" :disabled="retrying" @click="retry">{{ retrying ? t('retrying') : t('retry') }}</button>
        </p>
        <div v-else-if="rows.length" class="cmp__scroll">
          <table class="cmp__table">
            <thead>
              <tr>
                <th scope="col">{{ t('peer_company') }}</th>
                <th scope="col">{{ t('stock_price') }}</th>
                <th scope="col">{{ t('fair_value') }}</th>
                <th scope="col">{{ t('margin_of_safety') }}</th>
                <th scope="col">P/E</th>
                <th scope="col">P/BV</th>
                <th scope="col"><span class="sr-only">{{ t('actions') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.symbol">
                <th scope="row">
                  <a :href="'#/stock/' + row.symbol + '/dcf'">{{ row.name }}</a>
                  <span class="faint">{{ row.symbol }}</span>
                  <span v-if="row.asOf" class="faint" :title="t('source_hint_snapshot')">{{ row.asOf }}</span>
                </th>
                <td>{{ row.price === null ? 'n/a' : moneyIn(row.currency, row.price) }}</td>
                <td :title="row.policyNote || null">
                  {{ row.fairValue === null ? 'n/a' : moneyIn(row.currency, row.fairValue) }}
                  <span v-if="row.policyNote" class="sr-only">{{ row.policyNote }}</span>
                </td>
                <td :title="row.policyNote || null">
                  <span :class="{ 'cmp__best': row.symbol === best }">{{ row.mos === null ? 'n/a' : row.mos + '%' }}</span>
                </td>
                <td>{{ row.pe === null ? 'n/a' : row.pe.toFixed(1) + '×' }}</td>
                <td>{{ row.pb === null ? 'n/a' : row.pb.toFixed(2) + '×' }}</td>
                <td><button type="button" class="wl__remove" :aria-label="t('compare_remove_row')" @click="remove(row.symbol)">×</button></td>
              </tr>
            </tbody>
          </table>
        <p v-if="rows.length === 1" class="empty-state__next muted">{{ t('compare_one') }}</p>
        </div>
        <p class="faint cmp__note">{{ t('compare_note') }}</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { MAX_COMPARE, parseSymbolsQuery, rankRows } from '../lib/compare'
import { peerRow } from '../lib/peers'
import { defaultView } from '../lib/watchlistView'
import { yieldForStock } from '../lib/riskFree'
import { useCompareStore } from '../store/compare'
import { useWatchlistStore } from '../store/watchlist'
import { usePolicyStore } from '../store/policy'
import { useMoney } from '../composables/useMoney'

const { t } = useI18n()
const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const store = useWatchlistStore()
const compare = useCompareStore()
const policy = usePolicyStore()
const { moneyIn } = useMoney()
const draft = ref('')
const retrying = ref(false)
const rawRows = ref([])

const symbols = computed(() => parseSymbolsQuery(route.query.s))
const rows = computed(() => rankRows(rawRows.value))
const best = computed(() => rows.value.find((row) => row.mos !== null)?.symbol || null)
const allFailed = computed(() => rows.value.length > 0 && rows.value.every((row) => row.price === null))
const retry = async () => {
  retrying.value = true
  await load()
  retrying.value = false
}

const reasonText = (entry) => (entry?.reasons || []).map((code) => t('reason_' + code)).join('；')

// Same rule as the watchlist: the published artifact replaces the page's own
// estimate only when it was built from the snapshot this row is showing.
const publishedView = (row) => {
  const entry = policy.entryOf(row.symbol)
  if (!entry || !row.asOf || entry.asOf !== row.asOf) return null
  if (entry.status !== 'ok') return { fairValue: null, mos: null, policyNote: reasonText(entry) }
  const price = Number(row.price)
  const mos = Number.isFinite(price) && price > 0 && entry.value > 0 ? ((1 - price / entry.value) * 100).toFixed(2) : null
  return { fairValue: entry.value, mos, policyNote: '' }
}

const load = async () => {
  const list = symbols.value
  if (!list.length) {
    rawRows.value = []
    return
  }
  const [rates, , settled] = await Promise.all([
    api.getRiskFreeRates().catch(() => ({})),
    policy.load(),
    Promise.allSettled(list.map((symbol) => api.getStock(symbol))),
  ])
  rawRows.value = settled.map((item, index) => {
    if (!(item.status === 'fulfilled' && item.value)) {
      return { symbol: list[index], name: list[index], price: null, pe: null, pb: null, currency: '¥', asOf: null, fairValue: null, mos: null }
    }
    const row = { ...peerRow(item.value, list[index]), currency: item.value.currency || '¥', asOf: item.value._as_of || null, ...defaultView(item.value, yieldForStock(rates, item.value)) }
    const published = publishedView(row)
    return published ? { ...row, ...published } : row
  })
}

const apply = (list) => {
  compare.replace(list)
  router.replace({ path: '/compare', query: list.length ? { s: list.join(',') } : {} })
}
const add = () => {
  const parsed = parseSymbolsQuery(draft.value)
  if (!parsed.length) {
    $q.notify({ message: t('compare_bad'), color: 'warning', timeout: 2000 })
    return
  }
  const next = parseSymbolsQuery([...symbols.value, ...parsed].join(','))
  if (next.length === symbols.value.length) {
    $q.notify({ message: t('compare_dup'), color: 'grey-8', timeout: 2000 })
    return
  }
  draft.value = ''
  apply(next)
}
const remove = (symbol) => apply(symbols.value.filter((item) => item !== symbol))

watch(symbols, (list) => {
  // A bare /compare (or a hash edit) picks the queue back up instead of starting empty.
  if (!list.length && compare.symbols.length) {
    apply(compare.symbols)
    return
  }
  if (list.length) compare.replace(list)
  load()
}, { immediate: true })
</script>
