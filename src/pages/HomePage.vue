<template>
  <div class="home">
    <section class="home__hero panel" data-testid="home-hero">
      <p class="home__kicker">{{ t('home_kicker') }}</p>
      <h1 class="home__title">{{ t('home_title') }}</h1>
      <p class="home__lead">{{ t('home_lead') }}</p>
      <div class="home__actions">
        <a class="home__chip home__chip--primary" href="#/watchlist">{{ t('home_watchlist') }}</a>
        <a class="home__chip" href="#/about">{{ t('home_about') }}</a>
      </div>
      <p class="home__examples">
        <span class="faint">{{ t('home_try') }}</span>
        <a v-for="example in examples" :key="example.symbol" :data-symbol="example.symbol" href="#" @click.prevent="open(example.symbol)">{{ example.label }}</a>
      </p>
    </section>

    <section class="home__recent panel" :class="{ 'home__recent--empty': !continueItems.length }">
      <template v-if="!continueItems.length">
        <div class="empty-state">
          <span class="empty-state__title">{{ t('continue_empty_title') }}</span>
          <span class="muted">{{ t('continue_empty') }}</span>
          <p class="empty-state__steps">{{ t('continue_empty_step') }}</p>
        </div>
      </template>
      <template v-else>
      <span class="faint">{{ t('continue_where') }}</span>
      <a v-for="entry in continueItems" :key="entry.symbol" class="home__chip" :href="'#/stock/' + entry.symbol + '/dcf'">
        <q-icon v-if="entry.watched" name="star" size="13px" class="home__star" />
        {{ entry.name || entry.symbol }}
      </a>
      <a v-if="continueItems.length" class="home__clear" href="#/watchlist">{{ t('continue_watchlist') }}</a>
      <button v-if="recent.length" type="button" class="home__clear" @click="clear">{{ t('recent_clear') }}</button>
      </template>
    </section>

    <stock-dcf-page class="home__calc" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { getCatalog } from '../api/catalog'
import { useRouter } from 'vue-router'
import { clearRecent, readRecent } from '../lib/recent'
import { useWatchlistStore } from '../store/watchlist'
import { useI18n } from 'vue-i18n'
import StockDcfPage from './StockDcfPage.vue'

const { t } = useI18n()
const router = useRouter()
const recent = ref([])
const watchlist = useWatchlistStore()
// Watchlist entries first, then recents, deduped: one "continue" list instead of two.
const continueItems = computed(() => {
  const watched = watchlist.symbols.map((symbol) => ({
    symbol,
    name: recent.value.find((entry) => entry.symbol === symbol)?.name || '',
    watched: true,
  }))
  const seen = new Set(watched.map((entry) => entry.symbol))
  const rest = recent.value.filter((entry) => !seen.has(entry.symbol)).map((entry) => ({ ...entry, watched: false }))
  return [...watched, ...rest]
})
const clear = () => {
  clearRecent()
  recent.value = []
}
onMounted(async () => {
  recent.value = readRecent()
  try {
    const rows = await getCatalog()
    const listed = (Array.isArray(rows) ? rows : [])
      .filter((row) => row && row.symbol)
      .map((row) => ({ symbol: row.symbol, label: row.name || row.symbol }))
    if (listed.length) pool.value = listed
  } catch { /* the committed four stay */ }
})
// Only symbols that have a snapshot. A name without a file opens the failure banner.
const PUBLISHED = [
  { symbol: 'SHSE:601398', label: '工商银行' },
  { symbol: 'HKSE:00700', label: '腾讯控股' },
  { symbol: 'HKSE:00941', label: '中国移动' },
  { symbol: 'NASDAQ:AAPL', label: '苹果' },
]
const pool = ref(PUBLISHED)
const examples = computed(() => {
  const list = pool.value
  if (!list.length) return []
  const offset = new Date().getDate() % list.length
  const count = Math.min(3, list.length)
  return Array.from({ length: count }, (_, index) => list[(offset + index) % list.length])
})
const open = (symbol) => router.push('/stock/' + symbol + '/dcf')
</script>
