<template>
  <section class="stress" data-testid="margin-stress">
    <header class="stress__heading">
      <h3>{{ t('stress_title') }}</h3>
      <span v-if="rows[2]" class="stress__headline" :class="{ negative: rows[2].margin < 0 }">
        {{ percent(rows[2].margin) }}
      </span>
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
    <small>{{ t(bank ? 'stress_bank_note' : 'stress_owner_note') }}</small>
    <small v-if="expectation">{{ expectation }}</small>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { money, percent } from '../../lib/format'
const props = defineProps({ rows: { type: Array, required: true }, bank: Boolean, custom: Boolean,
  quote: { type: String, required: true }, expectation: { type: String, default: '' }, currency: { type: String, default: '¥' } })
const { t } = useI18n()
const labels = ['stress_default', 'stress_earnings', 'stress_joint']
const moneyOf = (value) => money(props.currency, value)
const axisLimit = computed(() => Math.max(100, Math.ceil(Math.max(...props.rows.map(row => Math.abs(row.margin))) / 50) * 50))
</script>

<style scoped>
.stress { padding: 12px 16px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.stress h3 { margin: 0 0 8px; font-size: 15px; line-height: 1.4; font-weight: 650; }
.stress__headline { display: none; }
.stress__row { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; margin: 5px 0; font-size: 13px; }
.stress__figures { display: inline-flex; align-items: baseline; gap: 10px; }
.stress__value { color: var(--text); font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.stress__track { position: relative; grid-column: 1 / -1; height: 5px; background: var(--surface-2); }
.stress__track::after { content: ''; position: absolute; left: 50%; top: -1px; bottom: -1px; border-left: 1px solid var(--text-muted); }
.stress__track i { position: absolute; left: 50%; height: 100%; background: var(--accent-strong); }
.stress__track .negative { left: auto; right: 50%; background: var(--danger); }
.stress__axis { display: flex; justify-content: space-between; font-size: 11px; line-height: 1.4; color: var(--text-muted); }
.stress small { display: block; margin-top: 8px; color: var(--text-muted); line-height: 1.45; }
@media (min-width: 1024px) {
  .stress { padding: 16px 18px; border: 1px solid var(--border); border-radius: var(--radius); }
  .stress__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .stress__heading h3 { margin: 0; }
  .stress__headline { display: block; color: var(--accent-strong); font-size: 23px; font-weight: 700; white-space: nowrap; }
  .stress__headline.negative { color: var(--danger-text); }
  .stress small { margin-top: 5px; }
}
</style>
