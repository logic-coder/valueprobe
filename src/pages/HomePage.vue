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
      <span class="faint">{{ t('continue_where') }}</span>
      <span v-if="!continueItems.length" class="faint">{{ t('continue_empty') }}</span>
      <a v-for="entry in continueItems" :key="entry.symbol" class="home__chip" :href="'#/stock/' + entry.symbol + '/dcf'">
        <q-icon v-if="entry.watched" name="star" size="13px" class="home__star" />
        {{ entry.name || entry.symbol }}
      </a>
      <a v-if="continueItems.length" class="home__clear" href="#/watchlist">{{ t('continue_watchlist') }}</a>
      <button v-if="recent.length" type="button" class="home__clear" @click="clear">{{ t('recent_clear') }}</button>
    </section>

    <stock-dcf-page class="home__calc" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
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
onMounted(() => { recent.value = readRecent() })
// A small pool, rotated daily: the landing page does not show the same three names
// to every visitor forever, while a given day stays stable for screenshots.
const EXAMPLES = [
  { symbol: 'NYSE:KO', label: 'Coca-Cola' },
  { symbol: 'NASDAQ:AAPL', label: 'Apple' },
  { symbol: 'SHSE:600519', label: '贵州茅台' },
  { symbol: 'NASDAQ:MSFT', label: 'Microsoft' },
  { symbol: 'HKSE:00700', label: '腾讯控股' },
  { symbol: 'NYSE:PEP', label: 'PepsiCo' },
  { symbol: 'SHSE:601398', label: '工商银行' },
  { symbol: 'HKSE:00941', label: '中国移动' },
]
const offset = new Date().getDate() % EXAMPLES.length
const examples = EXAMPLES.map((_, index) => EXAMPLES[(offset + index) % EXAMPLES.length]).slice(0, 3)
const open = (symbol) => router.push('/stock/' + symbol + '/dcf')
</script>
