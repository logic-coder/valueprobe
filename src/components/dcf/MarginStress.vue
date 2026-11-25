<template>
  <section class="stress" data-testid="margin-stress">
    <header class="stress__heading">
      <h3>{{ t('stress_title') }}</h3>
      <div v-if="headlineRow?.value > 0" class="stress__headline">
        <span class="stress__headline-hint">{{ t('stress_headline_hint') }}</span>
        <span class="stress__headline-value">{{ moneyOf(headlineRow.value) }}</span>
      </div>
    </header>
    <small>{{ t(custom ? 'stress_trial_quote' : 'stress_quote', { price: quote }) }}</small>
    <div v-for="(row, i) in rows" :key="i" class="stress__row">
      <span>{{ t(labels[i]) }}</span>
      <span class="stress__figures">
        <span v-if="row.value > 0" class="stress__value">{{ moneyOf(row.value) }}</span>
        <strong>{{ percent(row.margin) }}</strong>
      </span>
      <div class="stress__track" aria-hidden="true">
        <i :class="{ negative: row.margin < 0 }" :style="{ width: Math.abs(row.margin) / axisLimit * 50 + '%' }" />
      </div>
    </div>
    <div class="stress__axis" aria-hidden="true"><span>−{{ axisLimit }}%</span><span>0</span><span>+{{ axisLimit }}%</span></div>
    <div class="stress__notes">
      <small>{{ t(bank ? 'stress_bank_note' : 'stress_owner_note') }}</small>
      <small v-if="expectation">{{ expectation }}</small>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { money, percent } from '../../lib/format'
const props = defineProps({ rows: { type: Array, required: true }, bank: Boolean, custom: Boolean,
  quote: { type: String, required: true }, expectation: { type: String, default: '' }, currency: { type: String, default: '¥' } })
const { t } = useI18n()
const labels = ['stress_earnings', 'stress_joint']
const moneyOf = (value) => money(props.currency, value)
const headlineRow = computed(() => props.rows.at(-1))
const axisLimit = computed(() => Math.max(100, Math.ceil(Math.max(...props.rows.map(row => Math.abs(row.margin))) / 50) * 50))
</script>

<style scoped>
.stress { display: flex; flex-direction: column; padding: 12px 16px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.stress h3 { margin: 0 0 8px; font-size: 15px; line-height: 1.4; font-weight: 650; }
.stress__headline { display: none; }
.stress__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; margin: 6px 0; font-size: 13px; }
.stress__figures { display: inline-flex; align-items: baseline; gap: 10px; }
.stress__value { color: var(--text); font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.stress__track { position: relative; grid-column: 1 / -1; height: 5px; background: var(--surface-2); }
.stress__track::after { content: ''; position: absolute; left: 50%; top: -1px; bottom: -1px; border-left: 1px solid var(--text-muted); }
.stress__track i { position: absolute; left: 50%; height: 100%; background: var(--accent-strong); }
.stress__track .negative { left: auto; right: 50%; background: var(--danger); }
.stress__axis { display: flex; justify-content: space-between; font-size: 11px; line-height: 1.4; color: var(--text-muted); }
.stress__notes { margin-top: 8px; }
.stress small { display: block; margin-top: 6px; color: var(--text-muted); line-height: 1.45; }
.stress__notes small:first-child { margin-top: 0; }
@media (min-width: 1024px) {
  .stress { height: 100%; min-height: 0; padding: 16px 18px; border: 1px solid var(--border); border-radius: var(--radius); }
  .stress__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .stress__heading h3 { margin: 0; flex: 1; min-width: 0; }
  .stress__headline { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .stress__headline-hint { font-size: 11px; line-height: 1.3; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
  .stress__headline-value { color: var(--accent-strong); font-size: 23px; font-weight: 700; line-height: 1.15; white-space: nowrap; }
  .stress__notes { margin-top: auto; padding-top: 12px; }
}
</style>
