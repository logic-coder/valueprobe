<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="min-width: 680px; max-width: 90vw">
      <q-card-section class="row items-center">
        <div class="text-h6">{{ t('valuation_history') }}</div>
        <q-space />
        <q-btn v-if="records.length" flat dense color="grey-7" icon="delete_sweep" :label="t('clear_all')" @click="clear" />
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div v-if="!records.length" class="text-body2 text-grey-7">{{ t('no_records_yet') }}</div>

        <template v-else>
          <div v-if="measured.quality.status !== 'ok'" class="quality-note" :class="'quality-note--' + measured.quality.status">
            {{ t('quality_' + measured.quality.status) }}
            <span v-if="reasons.length">（{{ reasons.join(listSeparator) }}）</span>
          </div>

          <div class="row q-gutter-sm q-mb-md">
            <div v-for="tile in tiles" :key="tile.key" class="metric-tile">
              <div class="text-caption text-grey-7">{{ tile.label }}</div>
              <div class="text-subtitle1 text-bold" :class="tile.tone">{{ tile.value }}</div>
            </div>
          </div>

          <q-markup-table dense flat>
            <thead>
              <tr>
                <th class="text-left">{{ t('updated_at') }}</th>
                <th class="text-right">{{ t('stock_price') }}</th>
                <th class="text-right">{{ t('fair_value') }}</th>
                <th class="text-right">{{ t('margin_of_safety') }}</th>
                <th class="text-right">{{ t('shares') }}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in records" :key="record.id">
                <td class="text-left">{{ new Date(record.at).toLocaleString(stamp, { hour12: false }) }}</td>
                <td class="text-right">{{ money(nativeCurrency, record.stockPrice) }}</td>
                <td class="text-right">{{ money(nativeCurrency, record.fairValue) }}</td>
                <td class="text-right">{{ percent(record.marginOfSafety) }}</td>
                <td class="text-right">{{ Number(record.shares) || 0 }}</td>
                <td class="text-right">
                  <q-btn flat dense size="sm" icon="delete" color="grey-7" @click="remove(record.id)" />
                </td>
              </tr>
            </tbody>
          </q-markup-table>
          <div class="text-caption text-grey-7 q-mt-sm">{{ t('record_measure_note') }}</div>
        </template>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from '../composables/useLocale'
import { useQuasar } from 'quasar'
import { buildMeasurement, clearValuations, listValuations, removeValuation } from '../lib/archive'
import { measure as measureSeries } from '../lib/measure'
import { money, percent } from '../lib/format'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  symbol: { type: String, required: true },
  nativeCurrency: { type: String, default: '¥' },
  tick: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue', 'changed'])
const { t } = useI18n()
const { localeCode, listSeparator } = useLocale()
const stamp = computed(() => localeCode.value)
const $q = useQuasar()

// `tick` is bumped by the parent after an add so storage is re-read.
const records = computed(() => {
  void props.tick
  return listValuations(props.symbol)
})

const measured = computed(() => {
  const series = buildMeasurement(records.value)
  return measureSeries(series.points, series.flows, { method: series.method })
})

const REASON_LABELS = {
  TWO_POINTS_REQUIRED: 'reason_two_points',
  NON_POSITIVE_START: 'reason_start',
  NEGATIVE_DENOMINATOR: 'reason_base',
  OUT_OF_RANGE: 'reason_range',
  NO_SIGN_CHANGE: 'reason_flows',
  NO_CONVERGENCE: 'reason_irr',
  PRICE_ONLY: 'reason_price_only',
}
const reasons = computed(() => [...measured.value.quality.reasons, ...measured.value.quality.warnings]
  .map((reason) => (REASON_LABELS[reason] ? t(REASON_LABELS[reason]) : reason)))

const tile = (key, label, value, tone = '') => ({ key, label, value, tone })
const tiles = computed(() => {
  const r = measured.value
  const asPercent = (value) => (Number.isFinite(value) ? percent(value * 100) : 'n/a')
  return [
    tile('return', t('tile_return'), asPercent(r.returns.valueReturn), toneOf(r.returns.valueReturn)),
    tile('twr', t('tile_twr'), asPercent(r.returns.twr), toneOf(r.returns.twr)),
    tile('annual', t('tile_annual_twr'), asPercent(r.returns.annualizedTwr)),
    tile('irr', t('tile_annual_irr'), asPercent(r.returns.annualizedIrr)),
    tile('drawdown', t('tile_drawdown'), asPercent(r.risk.maxDrawdown), 'text-red'),
    tile('vol', t('tile_volatility'), asPercent(r.risk.volatility)),
  ]
})
const toneOf = (value) => (!Number.isFinite(value) ? '' : value >= 0 ? 'text-green' : 'text-red')

const remove = (id) => {
  removeValuation(props.symbol, id)
  emit('changed')
}
const clear = () => {
  clearValuations(props.symbol)
  emit('changed')
  $q.notify({ message: t('cleared') })
}
</script>

<style scoped>
.metric-tile { min-width: 96px; padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 4px; }
.quality-note { font-size: 12px; padding: 6px 10px; border-radius: 4px; margin-bottom: 10px; }
.quality-note--partial, .quality-note--no_data { background: #fff8e1; color: #6d4c41; }
.quality-note--not_applicable { background: #eceff1; color: #455a64; }
</style>
