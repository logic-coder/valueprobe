<template>
  <div class="dcf__strip" data-testid="dcf-result">
    <div class="dcf__strip-head">
      <div class="dcf__strip-title" data-testid="value-title">
        {{ t(official ? 'official_title' : unavailable ? 'policy_refused_title' : 'official_trial_title') }}
      </div>
      <div class="dcf__strip-context" data-testid="value-context">
        {{ official ? officialContext : unavailable ? '' : trialContext }}
      </div>
      <div v-if="basisLine" class="dcf__basis-line" data-testid="value-basis-line">{{ basisLine }}</div>
    </div>
    <!-- fair value -->
    <div class="dcf__block dcf__fair">
      <div class="dcf__label">
        <a-popover placement="top">
          <h3 class="dcf__label-text">
            {{ t('fair_value') }}
            <q-icon class="faint" name="help" size="14px" />
          </h3>
          <template #content>{{ t('fair_value_desc') }}</template>
        </a-popover>
      </div>
      <q-space />
      <q-skeleton v-if="loading" type="rect" height="30px" width="50px" />
      <div v-else class="dcf__fair-figures">
        <div class="text-h6 button-font-weight" data-testid="dcf-fair-value">
          <animated-amount :value="result.fairValue" :format="(amount) => moneyIn(stock.currency, amount)" />
        </div>
        <div v-if="hasBand" class="dcf__range" data-testid="dcf-fair-range">{{ bandText }}</div>
      </div>
    </div>
    <div v-if="cash" class="dcf__cash" data-testid="dcf-cash-check">
      <a-popover placement="top">
        <span class="dcf__cash-label">{{ t('cash_cross_check') }}</span>
        <template #content>{{ t('cash_cross_desc') }}</template>
      </a-popover>
      <span class="dcf__cash-value">{{ moneyIn(stock.currency, cash.value) }}</span>
      <span class="dcf__cash-gap">{{ t('cash_cross_gap', { gap: percent(cash.gapPct) }) }}</span>
    </div>

    <!-- margin of safety -->
    <div class="dcf__block dcf__mos">
      <div class="dcf__label">
        <a-popover placement="top">
          <h3 class="dcf__label-text">
            {{ t(marginLabel) }}
            <q-icon class="faint" name="help" size="14px" />
          </h3>
          <template #content>{{ t('margin_of_safety_desc') }}</template>
        </a-popover>
      </div>
      <q-space />
      <q-skeleton v-if="loading" type="rect" height="25px" width="50px" />
      <div v-else class="button-font-weight" data-testid="dcf-margin-of-safety" :style="{ color: safetyColor }">
        <animated-amount :value="result.marginOfSafety" :format="percent" />
      </div>
    </div>
    <div v-if="showImplied" class="dcf__block dcf__implied">
      <div class="dcf__label">
        <a-popover placement="top">
          <h3 class="dcf__label-text">
            {{ t('rdcf_implied') }}
            <q-icon class="faint" name="help" size="14px" />
          </h3>
          <template #content>{{ t('rdcf_implied_desc') }}</template>
        </a-popover>
      </div>
      <q-space />
      <q-skeleton v-if="loading" type="rect" height="22px" width="50px" />
      <div
        v-else-if="!reverseState"
        class="dcf__implied-value"
        data-testid="reverse-growth"
      >
        {{ percent(result.reverseGrowthRate) }}
      </div>
      <div v-else class="dcf__implied-empty" data-testid="reverse-growth">
        {{ t(reverseState) }}
      </div>
    </div>
    <span class="sr-only" role="status" aria-live="polite">{{ liveSummary }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isNum, percent } from '../../lib/format'
import { useMoney } from '../../composables/useMoney'
import AnimatedAmount from '../AnimatedAmount.vue'
import APopover from '../APopover.vue'

const props = defineProps({
  loading: { type: Boolean, default: false },
  stock: { type: Object, default: () => ({}) },
  result: { type: Object, required: true },
  liveSummary: { type: String, default: '' },
  showImplied: { type: Boolean, default: false },
  official: { type: Boolean, default: false },
  officialContext: { type: String, default: '' },
  basisLine: { type: String, default: '' },
  trialContext: { type: String, default: '' },
  unavailable: { type: Boolean, default: false },
  marginLabel: { type: String, default: 'margin_of_safety' },
  reverseState: { type: String, required: true },
  cash: { type: Object, default: null },
})
const { t } = useI18n()
const { moneyIn } = useMoney()

const bandLow = computed(() => (Number.isFinite(Number(props.result.fairLow)) && Number(props.result.fairLow) > 0 ? Number(props.result.fairLow) : null))
const bandHigh = computed(() => (Number.isFinite(Number(props.result.fairHigh)) && Number(props.result.fairHigh) > 0 ? Number(props.result.fairHigh) : null))
const hasBand = computed(() => (bandLow.value !== null || bandHigh.value !== null) && !(bandLow.value !== null && bandLow.value === bandHigh.value))
// A missing endpoint means that scenario has no value, so it stays visible.
const bandText = computed(() => {
  const low = bandLow.value === null ? t('band_missing') : moneyIn(props.stock.currency, bandLow.value)
  const high = bandHigh.value === null ? t('band_missing') : moneyIn(props.stock.currency, bandHigh.value)
  return low + ' – ' + high
})
const cash = computed(() => (props.cash && Number.isFinite(Number(props.cash.value)) && Number(props.cash.value) > 0 ? props.cash : null))
const safetyIsNeutral = computed(() => !isNum(props.result.marginOfSafety) || Number(props.result.marginOfSafety) === 0)
const safetyColor = computed(() => (safetyIsNeutral.value ? 'var(--text-muted)' : props.result.marginOfSafety < 0 ? 'var(--danger)' : 'var(--accent-strong)'))
</script>
