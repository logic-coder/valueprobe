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

    <stock-dcf-page class="home__calc" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { getCatalog } from '../api/catalog'
import { clearRecent, readRecent } from '../lib/recent'
import { useWatchlistStore } from '../store/watchlist'
import { useI18n } from 'vue-i18n'
import StockDcfPage from './StockDcfPage.vue'

const { t } = useI18n()
const emit = defineEmits(['find-stock'])
const recent = ref([])
const names = ref(new Map())
const watchlist = useWatchlistStore()
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
  clearRecent()
  recent.value = []
}
onMounted(async () => {
  recent.value = readRecent()
  const rows = await getCatalog()
  if (rows) names.value = new Map(rows.map(row => [row.symbol, row.name]))
})
const examples = [
  { symbol: 'HKSE:00700', label: '腾讯控股' },
  { symbol: 'NASDAQ:AAPL', label: '苹果' },
  { symbol: 'SHSE:600519', label: '贵州茅台' },
]
</script>
