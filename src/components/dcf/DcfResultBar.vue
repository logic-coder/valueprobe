<template>
  <div class="dcf__strip" data-testid="dcf-result">
    <div class="dcf__strip-title">{{ t('valuation_result') }}</div>
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

    <!-- margin of safety -->
    <div class="dcf__block dcf__mos">
      <div class="dcf__label">
        <a-popover placement="top">
          <h3 class="dcf__label-text">
            {{ t('margin_of_safety') }}
            <q-icon class="faint" name="help" size="14px" />
          </h3>
          <template #content>{{ t('margin_of_safety_desc') }}</template>
        </a-popover>
      </div>
      <q-space />
      <q-skeleton v-if="loading" type="rect" height="25px" width="50px" />
      <div v-else class="button-font-weight" data-testid="dcf-margin-of-safety">
        <q-icon size="xs" :name="safetyIcon" :style="{ color: safetyColor }" />
        <animated-amount :value="result.marginOfSafety" :format="percent" />
      </div>
    </div>
    <div class="dcf__meter" aria-hidden="true">
      <span :style="{ width: safetyWidth, background: safetyIsNeutral ? 'var(--text-faint)' : safetyColor }" />
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
})
const { t } = useI18n()
const { moneyIn } = useMoney()

const hasBand = computed(() => Number.isFinite(Number(props.result.fairLow)) && Number.isFinite(Number(props.result.fairHigh)) && props.result.fairLow !== props.result.fairHigh)
const bandText = computed(() => moneyIn(props.stock.currency, props.result.fairLow) + ' – ' + moneyIn(props.stock.currency, props.result.fairHigh))
const safetyIsNeutral = computed(() => !isNum(props.result.marginOfSafety) || Number(props.result.marginOfSafety) === 0)
const safetyColor = computed(() => (safetyIsNeutral.value ? 'var(--text-muted)' : props.result.marginOfSafety < 0 ? 'var(--danger)' : 'var(--accent-strong)'))
const safetyIcon = computed(() => (safetyIsNeutral.value || props.result.marginOfSafety < 0 ? 'thumb_down' : 'thumb_up'))
const safetyWidth = computed(() => {
  const mos = Number(props.result.marginOfSafety)
  if (!Number.isFinite(mos)) return '0%'
  return Math.min(100, Math.abs(mos)) + '%'
})
</script>
