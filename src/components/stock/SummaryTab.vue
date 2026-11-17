<template>
  <section class="panel">
    <div class="panel__head">
      <span class="panel__title">{{ t('summary_tab') }}</span>
      <span class="faint">{{ t('sum_lead') }}</span>
    </div>
    <div class="panel__body">
      <dl class="sum__grid">
        <div class="sum__cell"><dt>{{ t('stock_price') }}</dt><dd>{{ moneyIn(currency, amount(stock.price)) }}</dd></div>
        <div class="sum__cell"><dt>{{ stock.eps_period === 'FY' ? t('sum_eps_annual') : t('sum_eps') }}</dt><dd>{{ moneyIn(currency, amount(stock.ttm_eps)) }}</dd></div>
        <div class="sum__cell"><dt>{{ t('sum_tbv') }}</dt><dd>{{ moneyIn(currency, amount(stock.tangible_book)) }}</dd></div>
        <div class="sum__cell"><dt>{{ t('sum_range') }}</dt><dd>{{ priceRange }}</dd></div>
        <div class="sum__cell"><dt>{{ t('business_predictability') }}</dt><dd>{{ rating }}</dd></div>
        <div class="sum__cell"><dt>{{ t('sum_exchange') }}</dt><dd>{{ stock.exchange_ || market }}</dd></div>
      </dl>
      <p v-if="business" class="sum__business">{{ business }}</p>
      <a class="sum__cta" :href="'#/stock/' + symbol + '/dcf'">{{ t('sum_open_dcf') }}</a>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseAmount } from '../../lib/format'
import { useMoney } from '../../composables/useMoney'

const props = defineProps({
  stock: { type: Object, default: () => ({}) },
  symbol: { type: String, required: true },
  market: { type: String, default: '' },
})
const { t } = useI18n()
const { moneyIn } = useMoney()

const amount = (value) => parseAmount(value) ?? 0
const currency = computed(() => props.stock.currency || '¥')
const rating = computed(() => (props.stock.predictability == null ? 'n/a' : props.stock.predictability + ' / 5'))
const business = computed(() => String(props.stock.business_descrpt?.main_business || '').slice(0, 240))
const priceRange = computed(() => {
  if (props.stock.price52wlow == null || props.stock.price52whigh == null) return 'n/a'
  return moneyIn(currency.value, amount(props.stock.price52wlow)) + ' – ' + moneyIn(currency.value, amount(props.stock.price52whigh))
})
</script>
