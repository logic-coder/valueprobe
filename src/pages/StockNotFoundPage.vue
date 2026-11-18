<template>
  <div class="notfound">
    <q-icon name="search_off" size="44px" class="faint" />
    <h1 class="notfound__title">{{ t('nf_title') }}</h1>
    <p class="muted">{{ t('nf_body', { symbol: route.params.symbol || route.path }) }}</p>
    <p class="muted" v-html="t('nf_format')" />
    <p class="faint">{{ t('nf_markets', { markets: markets.join(listSeparator) }) }}</p>
    <q-btn class="q-mt-md" color="primary" unelevated rounded :label="t('nf_back')" @click="goDefault" />
    <p class="faint nf__try">
      {{ t('nf_try') }}
      <a v-for="item in EXAMPLES" :key="item.symbol" :href="'#/stock/' + item.symbol + '/dcf'">{{ item.label }}</a>
    </p>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useLocale } from '../composables/useLocale'
import { DEFAULT_SYMBOL, MARKET_CODES } from '../config/markets'

const { t } = useI18n()
const { listSeparator } = useLocale()
const route = useRoute()
const router = useRouter()
const markets = MARKET_CODES

const goDefault = () => router.push('/stock/' + DEFAULT_SYMBOL + '/dcf')
// A dead end should still offer a way into a real valuation.
const EXAMPLES = [
  { symbol: 'SHSE:601398', label: '工商银行' },
  { symbol: 'HKSE:00700', label: '腾讯控股' },
  { symbol: 'HKSE:00941', label: '中国移动' },
  { symbol: 'NASDAQ:AAPL', label: '苹果' },
]
</script>

<style scoped>
.notfound__title { font-size: 22px; margin: 12px 0 8px; }
.notfound p { margin: 0 0 6px; font-size: 13.5px; }
.nf__try { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.nf__try a { color: var(--accent-strong); }
</style>
