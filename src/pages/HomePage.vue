<template>
  <div class="home">
    <section class="home__hero panel" data-testid="home-hero">
      <div class="home__intro">
        <h1 class="home__title">{{ t('home_title') }}</h1>
        <p class="home__lead">{{ t('home_lead') }}</p>
        <div class="home__actions">
          <button class="home__chip home__chip--primary" type="button" @click="emit('find-stock')">{{ t('search_for_stock') }}</button>
          <a class="home__method" href="#/method">{{ t('home_about') }}</a>
        </div>
      </div>
      <div class="home__examples">
        <h2>{{ t('home_examples') }}</h2>
        <div class="home__example-links">
          <a v-for="example in examples" :key="example.symbol" :data-symbol="example.symbol"
            :href="'#/stock/' + example.symbol + '/dcf'">
            <span>{{ names.get(example.symbol) || example.label }}</span>
            <span class="home__example-code">{{ example.symbol }}</span>
          </a>
        </div>
      </div>
    </section>

    <section v-if="continueItems.length" class="home__recent" :aria-label="t('continue_where')">
      <span class="faint">{{ t('continue_where') }}</span>
      <a v-for="entry in continueItems" :key="entry.symbol" class="home__chip" :href="'#/stock/' + entry.symbol + '/dcf'">
        <q-icon v-if="entry.watched" name="star" size="13px" class="home__star" />
        {{ entry.name || entry.symbol }}
      </a>
      <a v-if="watchlist.symbols.length" class="home__clear" href="#/watchlist">{{ t('continue_watchlist') }}</a>
      <button v-if="recent.length" type="button" class="home__clear" @click="clear">{{ t('recent_clear') }}</button>
    </section>

    <section class="home__preview panel" :aria-label="t('home_example')" data-testid="home-valuation-preview">
      <div class="home__preview-heading">
        <span class="faint">{{ t('home_example') }}</span>
        <h2>{{ names.get(previewSymbol) || t('home_preview_company') }}</h2>
        <span class="home__example-code">{{ previewSymbol }}</span>
      </div>
      <dl v-if="preview?.status === 'ok'" class="home__preview-values">
        <div>
          <dt>{{ t('fair_value') }}</dt>
          <dd>{{ moneyIn(preview.inputs.currency, preview.value) }}</dd>
        </div>
        <div v-if="preview.marginOfSafety != null">
          <dt>{{ t('valuation_snapshot_margin') }}</dt>
          <dd :class="preview.marginOfSafety < 0 ? 'home__preview-loss' : 'home__preview-gain'">{{ percent(preview.marginOfSafety) }}</dd>
        </div>
      </dl>
      <a class="home__chip" :href="'#/stock/' + previewSymbol + '/dcf'">{{ t('home_open_valuation') }}</a>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { getCatalog } from '../api/catalog'
import { clearRecent, readRecent, restoreRecent } from '../lib/recent'
import { useUndoNotify } from '../composables/useUndoNotify'
import { useWatchlistStore } from '../store/watchlist'
import { useI18n } from 'vue-i18n'
import { DEFAULT_SYMBOL } from '../config/markets'
import { useMoney } from '../composables/useMoney'
import { percent } from '../lib/format'
import { usePolicyStore } from '../store/policy'

const { t } = useI18n()
const { notifyUndo } = useUndoNotify()
const emit = defineEmits(['find-stock'])
const recent = ref([])
const names = ref(new Map())
const watchlist = useWatchlistStore()
const policy = usePolicyStore()
const { moneyIn, display } = useMoney()
const previewSymbol = DEFAULT_SYMBOL
const preview = computed(() => policy.entryOf(previewSymbol))
// Watchlist entries first, then recents, deduped: one "continue" list instead of two.
const continueItems = computed(() => {
  const watched = watchlist.symbols.map((symbol) => ({
    symbol,
    name: names.value.get(symbol) || recent.value.find((entry) => entry.symbol === symbol)?.name || '',
    watched: true,
  }))
  const seen = new Set(watched.map((entry) => entry.symbol))
  const rest = recent.value.filter((entry) => !seen.has(entry.symbol)).map((entry) => ({ ...entry, watched: false }))
  return [...watched, ...rest].slice(0, 5)
})
const clear = () => {
  const snapshot = recent.value.slice()
  clearRecent()
  recent.value = []
  notifyUndo(t('recent_cleared'), snapshot, (list) => { recent.value = restoreRecent(list) })
}
onMounted(async () => {
  recent.value = readRecent()
  if (display.converted && !display.asOf) display.loadRates()
  const [rows] = await Promise.all([getCatalog(), policy.load(previewSymbol)])
  if (rows) names.value = new Map(rows.map(row => [row.symbol, row.name]))
})
const examples = [
  { symbol: 'HKSE:00700', label: '腾讯控股' },
  { symbol: 'NASDAQ:AAPL', label: '苹果' },
  { symbol: 'SHSE:600519', label: '贵州茅台' },
]
</script>
