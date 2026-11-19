<template>
  <div class="app-shell">
    <button class="skip-link" type="button" @click="focusMain">{{ t('skip_to_content') }}</button>
    <header class="site-header">
      <div class="page-width-1440 site-header__inner">
        <a class="brand" href="#/" aria-label="valueprobe 首页">
          <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M4 22a12 12 0 1 1 24 0" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            <path d="M16 22 23 11" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" />
            <circle cx="16" cy="22" r="2.4" fill="currentColor" />
          </svg>
          <span class="brand__name">value<em>probe</em></span>
          <span class="brand__tag">{{ t('brand_tag') }}</span>
        </a>

        <q-input
          v-model="query"
          ref="searchInput"
          class="symbol-search" data-testid="symbol-input"
          dense
          borderless
          clearable
          :placeholder="t('search_for_your_stocks')"
          :aria-label="t('search_for_stock')"
          list="symbol-suggestions"
          @keyup.enter="goSymbol"
        >
          <template #append>
            <q-icon name="search" class="cursor-pointer" @click="goSymbol" />
          </template>
        </q-input>
        <datalist id="symbol-suggestions">
          <option v-for="item in suggestions" :key="item.symbol" :value="item.symbol">{{ item.name }}</option>
        </datalist>

        <div class="header-actions">
          <a href="#/watchlist" class="header-link watch-link" :aria-label="t('watchlist')">
            <q-icon name="star" size="16px" />
            <span v-if="watchlist.symbols.length" class="watch-link__count">{{ watchlist.symbols.length }}</span>
          </a>
          <a :href="compareHref" class="header-link compare-link" :aria-label="t('compare_title')" :title="t('compare_title')">
            <q-icon name="compare_arrows" size="16px" />
            <span v-if="compare.symbols.length" class="watch-link__count">{{ compare.symbols.length }}</span>
          </a>
          <a href="#" class="header-link locale-link" :class="{ 'text-bold': locale === 'zh-hans' }" @click.prevent="switchLocale('zh-hans')">中文</a>
          <a href="#" class="header-link locale-link" :class="{ 'text-bold': locale === 'en-us' }" @click.prevent="switchLocale('en-us')">EN</a>
          <q-select
            class="currency-select"
            dense
            borderless
            :model-value="display.currency"
            :options="currencyOptions"
            emit-value
            map-options
            hide-bottom-space
            :aria-label="t('display_currency')"
            @update:model-value="display.setCurrency"
          />
          <button class="icon-button theme-button" type="button" :aria-label="theme === 'dark' ? t('theme_to_light') : t('theme_to_dark')" @click="toggleTheme">
            <q-icon :name="theme === 'dark' ? 'light_mode' : 'dark_mode'" size="17px" />
          </button>
        </div>
      </div>
    </header>

    <section v-if="showTicker" class="ticker stock-head">
      <div class="page-width-1440 ticker__inner">
        <div class="ticker__crumb">
          <a href="#/">{{ t('stocks') }}</a> / {{ stock.company || t('default_company') }}
        </div>
        <div class="ticker__line">
          <div class="ticker__identity">
            <h1 class="ticker__name" :title="t('name_as_reported')">{{ stock.company || t('default_company') }}</h1>
            <div class="ticker__meta">
              <span class="ticker__code">{{ stock.symbol || '601398' }} · {{ stock.exchange_ || 'SHSE' }}</span>
              <button
                v-if="currentSymbol"
                type="button"
                class="star-button"
                :class="{ 'is-on': watched }"
                :aria-pressed="watched"
                :aria-label="watched ? t('watch_remove') : t('watch_add')"
                @click="toggleWatch"
              >
                <q-icon :name="watched ? 'star' : 'star_border'" size="18px" />
              </button>
              <button
                v-if="currentSymbol"
                type="button"
                class="compare-button icon-button"
                :class="{ 'is-on': comparing }"
                :aria-pressed="comparing"
                :aria-label="comparing ? t('compare_remove_one') : t('compare_add_one')"
                :title="comparing ? t('compare_remove_one') : t('compare_add_one')"
                @click="toggleCompare"
              >
                <q-icon name="compare_arrows" size="18px" />
              </button>
            </div>
          </div>
          <div class="ticker__price">
            <template v-if="workingPrice">
              <editable-value
                class="ticker__quote"
                :model-value="workingPrice.value"
                :display="moneyIn(stock.currency, workingPrice.value)"
                :label="t('working_price')"
                :currency="codeOf(stock.currency) || stock.currency"
                @update:model-value="dcfStore.setWorkingPrice(currentSymbol, $event)"
              />
              <div v-if="priceEdited" class="ticker__aside">{{ t('price_edited_note', { price: money(stock.currency, priceValue) }) }}</div>
            </template>
            <template v-else>
              <div class="ticker__quote">{{ moneyIn(stock.currency, priceValue) }}</div>
              <div class="ticker__aside">{{ t('price_native_note') }}</div>
            </template>
          </div>
        </div>
      </div>
    </section>

    <main id="main" class="site-main page-width-1440" tabindex="-1">
      <router-view v-if="ready" />
      <div v-else class="row justify-center q-pa-xl"><q-spinner-dots color="primary" size="34px" /></div>
    </main>

    <footer class="site-footer">
      <div class="page-width-1440 site-footer__inner">
        <span>{{ t('footer_tagline') }}</span>
        <span class="muted">{{ t('footer_note') }}</span>
        <a :href="repoUrl" target="_blank" rel="noreferrer">GitHub</a>
        <a :href="issuesUrl" target="_blank" rel="noreferrer">{{ t('footer_issues') }}</a>
        <a href="#/method">{{ t('footer_method') }}</a>
        <a href="#/about">{{ t('footer_about') }}</a>
        <a href="#/about">MIT</a>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import { parseSymbol } from './config/markets'
import { guessSymbol } from './lib/symbolInput'
import { readStored, writeStored } from './lib/storage'
import { REPO_URL, REPO_ISSUES_URL } from './config/site'
import { useStockStore } from './store/stock'
import { useCompareStore } from './store/compare'
import { useWatchlistStore } from './store/watchlist'
import { useDisplayStore, codeOf } from './store/display'
import { useDcfStore } from './store/dcf'
import { usePolicyStore } from './store/policy'
import { money, parseAmount } from './lib/format'
import EditableValue from './components/EditableValue.vue'
import { useMoney } from './composables/useMoney'

const { locale, t } = useI18n()
const focusMain = () => document.getElementById('main')?.focus()
const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const stockStore = useStockStore()
const watchlist = useWatchlistStore()
const compare = useCompareStore()
const currentSymbol = computed(() => {
  const parsed = parseSymbol(route.params.symbol || '')
  return parsed.ok ? parsed.symbol : ''
})
const watched = computed(() => Boolean(currentSymbol.value) && watchlist.symbols.includes(currentSymbol.value))
const toggleWatch = () => watchlist.toggle(currentSymbol.value)
const comparing = computed(() => Boolean(currentSymbol.value) && compare.symbols.includes(currentSymbol.value))
const toggleCompare = () => compare.toggle(currentSymbol.value)
const compareHref = computed(() => '#/compare' + (compare.symbols.length ? '?s=' + compare.symbols.join(',') : ''))
// A short datalist: typing "600519" or picking a name beats remembering the EXCHANGE:CODE
// format, and it costs no request.
const BUILTIN_SUGGESTIONS = [
  { symbol: 'SHSE:601398', name: '工商银行' },
  { symbol: 'HKSE:00700', name: '腾讯控股' },
  { symbol: 'HKSE:00941', name: '中国移动' },
  { symbol: 'NASDAQ:AAPL', name: '苹果' },
]
// Per-route document titles: a stock page names the company, other pages name themselves.
const ROUTE_TITLES = { home: 'home_title', watchlist: 'watchlist', compare: 'compare_title', about: 'about_title', method: 'method_title' }
// "/" focuses the lookup, the way search-first sites do; fields keep their own keys.
const searchInput = ref(null)
const isTyping = (target) => target instanceof HTMLElement
  && (target.matches('input, textarea, select, [contenteditable="true"]'))
const onSlash = (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || isTyping(event.target)) return
  event.preventDefault()
  searchInput.value?.focus()
}

const pageTitle = computed(() => {
  if (currentSymbol.value) return [stock.value.company || currentSymbol.value, 'valueprobe'].join(' · ')
  const key = ROUTE_TITLES[String(route.name)]
  return key ? t(key) + ' · valueprobe' : t('doc_title')
})

// A bad or unrelated path renders the not-found page; the last stock's hero must not stay above it.
const showTicker = computed(() => Boolean(currentSymbol.value))
const repoUrl = REPO_URL
const issuesUrl = REPO_ISSUES_URL

const ready = ref(true)
const policyStore = usePolicyStore()
const publishedEntry = computed(() => policyStore.entryOf(currentSymbol.value))
const stock = computed(() => {
  if (stockStore.symbol === currentSymbol.value && stockStore.stock) return stockStore.stock
  const [exchange_, symbol] = currentSymbol.value.split(':')
  return { company: publishedEntry.value?.name || currentSymbol.value, currency: publishedEntry.value?.inputs.currency, exchange_, symbol }
})
const priceValue = computed(() => {
  const entry = publishedEntry.value
  return String((entry ? entry.price : parseAmount(stock.value.price)) ?? '')
})
const dcfStore = useDcfStore()
const workingPrice = computed(() => (currentSymbol.value && dcfStore.workingPrice.symbol === currentSymbol.value ? dcfStore.workingPrice : null))
const priceEdited = computed(() => workingPrice.value !== null && Number(workingPrice.value.value) !== Number(priceValue.value))
watch(pageTitle, (value) => { document.title = value }, { immediate: true })
const display = useDisplayStore()
const { moneyIn } = useMoney()

const currencyOptions = computed(() => [
  { label: t('currency_native'), value: '' },
  { label: 'CNY', value: 'CNY' },
  { label: 'USD', value: 'USD' },
  { label: 'HKD', value: 'HKD' },
])

const theme = ref('light')
const applyTheme = (value) => {
  theme.value = value
  document.documentElement.dataset.theme = value
  writeStored('fv-theme', value)
}
const toggleTheme = () => applyTheme(theme.value === 'dark' ? 'light' : 'dark')

const suggestions = ref(BUILTIN_SUGGESTIONS)
const query = ref('')
const goSymbol = () => {
  const raw = String(query.value || '').trim()
  if (!raw) return
  const attempt = guessSymbol(raw)
  const parsed = parseSymbol(attempt)
  if (!parsed.ok) {
    $q.notify({ message: t('symbol_format_hint') })
    return
  }
  query.value = ''
  router.push('/stock/' + parsed.symbol + '/dcf')
}

const switchLocale = (value) => {
  locale.value = value
  writeStored('fv-locale', value)
}

onMounted(() => {
  window.addEventListener('keydown', onSlash)
  fetch(import.meta.env.BASE_URL + 'data/catalog.json')
    .then((response) => (response.ok ? response.json() : null))
    .then((list) => {
      if (Array.isArray(list) && list.length) suggestions.value = list
    })
    .catch(() => { /* the built-in examples stay */ })
  const saved = readStored('fv-theme')
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  applyTheme(saved === 'dark' || saved === 'light' ? saved : system)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onSlash))
</script>
