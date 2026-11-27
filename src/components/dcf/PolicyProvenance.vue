<template>
  <!-- What the published number rests on: the dates it was measured against, then
  the frozen inputs behind it. Kept out of the calculator, which only renders it. -->
  <div class="dcf__provenance" data-testid="valuation-provenance">
    <span>{{ earningsLabel }}</span>
    <span>{{ quoteLabel }}</span>
    <span v-if="shareBasisLabel">{{ shareBasisLabel }}</span>
  </div>
  <details v-if="showExplanation" class="dcf__provenance dcf__explanation">
    <summary>{{ t('valuation_explanation') }}</summary>
    <p>
      {{ t('valuation_inputs', {
        model: t('model_' + entry.inputs.model),
        eps: moneyIn(currency, entry.inputs.eps),
        growth: percent(entry.inputs.growth),
        rate: percent(entry.inputs.discountRate),
      }) }}
    </p>
    <p>
      {{ t('valuation_base_components', {
        latest: formatComponent(entry.inputs.epsLatest),
        normalized: formatComponent(entry.inputs.epsNormalized),
        da: formatComponent(entry.inputs.daPerShare),
        maintenance: formatComponent(entry.inputs.maintenanceCapexProxy),
        sbc: formatComponent(entry.inputs.sbcPerShare),
        cash: formatComponent(entry.inputs.cashMedian),
        adopted: formatComponent(entry.inputs.eps),
        kind: entry.inputs.baseKind ? t('valuation_base_kind_' + entry.inputs.baseKind) : '',
        gap: entry.inputs.ownerBaseGap ? t('valuation_base_gap') : '',
      }) }}
    </p>
    <p v-if="entry.inputs.baseAsOf || entry.inputs.cashAsOf || entry.inputs.ttmAsOf">
      {{ t('valuation_base_periods', {
        baseAsOf: formatDate(entry.inputs.baseAsOf),
        cashAsOf: formatDate(entry.inputs.cashAsOf),
        ttmAsOf: formatDate(entry.inputs.ttmAsOf),
        ttmNote: ttmNote,
        capexToOcf: formatRatio(entry.inputs.capexToOcf),
        capexToRevenue: formatRatio(entry.inputs.capexToRevenue),
      }) }}
    </p>
    <p>{{ t('valuation_band_note', { spread: entry.inputs.bandSpread ?? 2 }) }}</p>
    <p v-if="entry.terminalShare != null">
      {{ t('valuation_later_share', { share: percent(entry.terminalShare * 100) }) }}
    </p>
    <p v-if="entry.earningsSource">
      <a :href="entry.earningsSource" target="_blank" rel="noreferrer">{{ t('valuation_filing') }}</a>
    </p>
    <ul v-if="warnings.length">
      <li v-for="code in warnings" :key="code">{{ t('warning_' + code) }}</li>
    </ul>
    <p><a href="#/method">{{ t('disc_policy_link') }}</a></p>
  </details>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { percent } from '../../lib/format'
import { useMoney } from '../../composables/useMoney'

const props = defineProps({
  entry: { type: Object, required: true },
  currency: { type: String, default: '' },
  earningsLabel: { type: String, default: '' },
  quoteLabel: { type: String, default: '' },
  shareBasisLabel: { type: String, default: '' },
  showExplanation: { type: Boolean, default: false },
})
const { t } = useI18n()
const { moneyIn } = useMoney()
const formatComponent = (value) => value == null || value === '' || !Number.isFinite(Number(value))
  ? t('valuation_base_none')
  : moneyIn(props.currency, value)
const formatDate = (value) => value || t('valuation_base_none')
const formatRatio = (value) => value == null || !Number.isFinite(Number(value))
  ? t('valuation_base_none')
  : percent(Number(value) * 100)
const ttmNote = computed(() => {
  const quality = props.entry.inputs?.ttmQuality
  if (quality === 'nonoperating') return t('valuation_ttm_unused_nonoperating')
  if (quality === 'unknown') return t('valuation_ttm_unused_unknown')
  if (quality === 'clean') return t('valuation_ttm_unused_clean')
  return t('valuation_ttm_unused_none')
})
// The dates and the stale-price flags are already shown above this block.
const warnings = computed(() => (props.entry.warnings || []).filter((code) => ![
  'PRICE_MISSING', 'QUOTE_DATE_UNKNOWN', 'STALE_PRICE', 'EARNINGS_DATE_UNKNOWN',
].includes(code)))
</script>
