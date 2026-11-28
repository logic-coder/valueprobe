<template>
  <div class="dcf__strip" data-testid="dcf-result" :data-mode="bandMode">
    <div v-if="officialPresent" class="dcf__band-official">
      <div class="dcf__strip-head">
        <div class="dcf__strip-title" data-testid="value-title">{{ t('official_title') }}</div>
        <div v-if="!trialActive" class="dcf__strip-context" data-testid="value-context">{{ officialContext }}</div>
      </div>
      <div class="dcf__band-main">
        <div class="dcf__band-hero">
          <div class="dcf__label">
            <a-popover placement="top">
              <h3 class="dcf__label-text">
                {{ t(comparisonStatus === 'cash_scenario' ? 'comparison_short_cash_scenario' : comparisonStatus === 'historical' ? 'comparison_short_historical' : 'default_price') }}
                <q-icon class="faint" name="help" size="14px" />
              </h3>
              <template #content>{{ t('fair_value_desc') }}</template>
            </a-popover>
          </div>
          <q-skeleton v-if="loading" type="rect" height="30px" width="80px" />
          <div v-else class="dcf__fair-figures">
            <div class="dcf__fair-value button-font-weight" data-testid="dcf-fair-value">
              <animated-amount :value="officialResult.fairValue" :format="(amount) => moneyIn(stock.currency, amount)" />
            </div>
          </div>
        </div>
        <div class="dcf__band-meta">
          <div v-if="officialHasBand" class="dcf__range" data-testid="dcf-fair-range">
            <span class="dcf__range-label">{{ t('value_range_label') }}</span>
            <b class="dcf__range-values">{{ officialBandText }}</b>
          </div>
          <div v-if="!trialActive && basisLine" class="dcf__basis-line" data-testid="value-basis-line">{{ basisLine }}</div>
          <p v-if="trialActive && !comparisonStatus" class="dcf__band-stay">{{ t('default_price_unchanged') }}</p>
        </div>
      </div>
      <div v-if="officialCash" class="dcf__cash" data-testid="dcf-cash-check">
        <a-popover placement="top">
          <span class="dcf__cash-label">{{ t('cash_cross_check') }}</span>
          <template #content>{{ t('cash_cross_desc') }}</template>
        </a-popover>
        <span class="dcf__cash-value">{{ moneyIn(stock.currency, officialCash.value) }}</span>
        <span class="dcf__cash-gap">{{ t('cash_cross_gap', { gap: percent(officialCash.gapPct) }) }}</span>
      </div>
      <div v-else-if="cashUnchecked" class="dcf__cash dcf__cash--missing" data-testid="dcf-cash-missing">
        <span>{{ t('cash_cross_missing') }}</span>
      </div>
      <p v-if="comparisonStatus" class="dcf__trial-note" data-testid="comparison-note">{{ t('comparison_note_' + comparisonStatus) }}</p>
      <div v-else class="dcf__band-metrics">
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
          <q-skeleton v-if="loading" type="rect" height="22px" width="50px" />
          <div v-else class="button-font-weight" data-testid="dcf-margin-of-safety" :style="{ color: officialSafetyColor }">
            <animated-amount :value="officialResult.marginOfSafety" :format="percent" />
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
          <q-skeleton v-if="loading" type="rect" height="22px" width="50px" />
          <div
            v-else-if="!reverseState"
            class="dcf__implied-value"
            data-testid="reverse-growth"
          >
            {{ percent(officialResult.reverseGrowthRate) }}
          </div>
          <div v-else class="dcf__implied-empty" data-testid="reverse-growth" :data-state="reverseState">
            {{ t(reverseState) }}
          </div>
        </div>
      </div>
    </div>
    <div v-if="trialActive" class="dcf__band-trial" data-testid="dcf-trial">
      <div class="dcf__trial-head">
        <div class="dcf__strip-title" :data-testid="officialPresent ? 'trial-title' : 'value-title'">
          {{ officialPresent ? t('trial_by_assumptions') : t(unavailable ? 'policy_refused_title' : 'official_trial_title') }}
        </div>
        <span class="dcf__pill dcf__pill--custom">{{ t('scenario_custom') }}</span>
      </div>
      <div v-if="!officialPresent" class="dcf__strip-context" data-testid="value-context">{{ trialContext }}</div>
      <div class="dcf__trial-hero">
        <div v-if="officialPresent" class="dcf__label dcf__trial-spacer" aria-hidden="true">
          <div class="dcf__label-text">&nbsp;</div>
        </div>
        <q-skeleton v-if="loading" type="rect" height="30px" width="80px" />
        <div v-else class="dcf__trial-figures">
          <div
            class="dcf__trial-value button-font-weight"
            :data-testid="officialPresent ? 'dcf-trial-value' : 'dcf-fair-value'"
          >
            <animated-amount :value="trialResult.fairValue" :format="(amount) => moneyIn(stock.currency, amount)" />
          </div>
          <div v-if="trialHasBand && !officialPresent" class="dcf__range">{{ trialBandText }}</div>
        </div>
      </div>
      <p v-if="officialPresent && !comparisonStatus" class="dcf__trial-note">{{ t('trial_not_default_price') }}</p>
      <button
        v-if="!unavailable"
        type="button"
        class="dcf__restore"
        data-testid="restore-default-assumptions"
        @click="emit('reset')"
      >
        {{ t('restore_default_assumptions') }}
      </button>
      <div v-if="comparisonEnabled" class="dcf__band-metrics">
        <div class="dcf__block dcf__mos">
          <div class="dcf__label">
            <a-popover placement="top">
              <h3 class="dcf__label-text">
                {{ t(officialPresent ? 'trial_margin_of_safety' : marginLabel) }}
                <q-icon class="faint" name="help" size="14px" />
              </h3>
              <template #content>{{ t('margin_of_safety_desc') }}</template>
            </a-popover>
          </div>
          <q-skeleton v-if="loading" type="rect" height="22px" width="50px" />
          <div v-else class="button-font-weight" :data-testid="officialPresent ? 'dcf-trial-margin-of-safety' : 'dcf-margin-of-safety'" :style="{ color: trialSafetyColor }">
            <animated-amount :value="trialResult.marginOfSafety" :format="percent" />
          </div>
        </div>
        <div v-if="!officialPresent && showImplied" class="dcf__block dcf__implied">
          <div class="dcf__label">
            <a-popover placement="top">
              <h3 class="dcf__label-text">
                {{ t('rdcf_implied') }}
                <q-icon class="faint" name="help" size="14px" />
              </h3>
              <template #content>{{ t('rdcf_implied_desc') }}</template>
            </a-popover>
          </div>
          <q-skeleton v-if="loading" type="rect" height="22px" width="50px" />
          <div
            v-else-if="!reverseState"
            class="dcf__implied-value"
            data-testid="reverse-growth"
          >
            {{ percent(trialResult.reverseGrowthRate) }}
          </div>
          <div v-else class="dcf__implied-empty" data-testid="reverse-growth" :data-state="reverseState">
            {{ t(reverseState) }}
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="!officialPresent" class="dcf__band-official">
      <div class="dcf__strip-head">
        <div class="dcf__strip-title" data-testid="value-title">{{ t(unavailable ? 'policy_refused_title' : 'official_trial_title') }}</div>
        <div class="dcf__strip-context" data-testid="value-context">{{ unavailable ? '' : trialContext }}</div>
      </div>
      <q-skeleton v-if="loading" type="rect" height="30px" width="80px" />
      <div v-else class="dcf__fair-figures">
        <div class="dcf__fair-value button-font-weight" data-testid="dcf-fair-value">n/a</div>
      </div>
      <div class="dcf__band-metrics">
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
          <div class="button-font-weight" data-testid="dcf-margin-of-safety">n/a</div>
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
          <div class="dcf__implied-empty" data-testid="reverse-growth" :data-state="reverseState">
            {{ t(reverseState) }}
          </div>
        </div>
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
  officialResult: { type: Object, default: null },
  trialResult: { type: Object, default: () => ({}) },
  officialPresent: { type: Boolean, default: false },
  trialActive: { type: Boolean, default: false },
  liveSummary: { type: String, default: '' },
  showImplied: { type: Boolean, default: false },
  officialContext: { type: String, default: '' },
  basisLine: { type: String, default: '' },
  trialContext: { type: String, default: '' },
  unavailable: { type: Boolean, default: false },
  marginLabel: { type: String, default: 'margin_of_safety' },
  reverseState: { type: String, required: true },
  cash: { type: Object, default: null },
  cashUnchecked: { type: Boolean, default: false },
  comparisonEnabled: { type: Boolean, default: true },
  comparisonStatus: { type: String, default: '' },
})
const emit = defineEmits(['reset'])
const { t } = useI18n()
const { moneyIn } = useMoney()

const bandMode = computed(() => {
  if (props.officialPresent && props.trialActive) return 'compare'
  if (props.officialPresent) return 'default'
  if (props.trialActive) return 'trial'
  return 'empty'
})

const bandText = (result) => {
  if (!result) return ''
  const low = Number.isFinite(Number(result.fairLow)) && Number(result.fairLow) > 0 ? Number(result.fairLow) : null
  const high = Number.isFinite(Number(result.fairHigh)) && Number(result.fairHigh) > 0 ? Number(result.fairHigh) : null
  if (low === null && high === null) return ''
  if (low !== null && low === high) return ''
  const lowText = low === null ? t('band_missing') : moneyIn(props.stock.currency, low)
  const highText = high === null ? t('band_missing') : moneyIn(props.stock.currency, high)
  return lowText + ' – ' + highText
}
const officialHasBand = computed(() => Boolean(bandText(props.officialResult)))
const trialHasBand = computed(() => Boolean(bandText(props.trialResult)))
const officialBandText = computed(() => bandText(props.officialResult))
const trialBandText = computed(() => bandText(props.trialResult))
const officialCash = computed(() => (props.cash && Number.isFinite(Number(props.cash.value)) && Number(props.cash.value) > 0 ? props.cash : null))
const safetyColor = (value) => {
  if (!isNum(value) || Number(value) === 0) return 'var(--text-muted)'
  return Number(value) < 0 ? 'var(--danger)' : 'var(--accent-strong)'
}
const officialSafetyColor = computed(() => safetyColor(props.officialResult?.marginOfSafety))
const trialSafetyColor = computed(() => safetyColor(props.trialResult?.marginOfSafety))
</script>
