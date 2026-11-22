<template>
  <section class="mcheck">
    <div class="mcheck__head">
      <a-popover placement="top">
        <h4 class="mcheck__title">
          {{ t('multiple_check') }}
          <q-icon class="faint" name="help" size="14px" />
        </h4>
        <template #content>{{ t('multiple_check_hint') }}</template>
      </a-popover>
      <span class="faint">{{ t('multiple_check_note') }}</span>
    </div>

    <table class="mcheck__table">
      <thead>
        <tr>
          <th scope="col">{{ t('multiples') }}</th>
          <th scope="col">{{ t('multiple_current') }}</th>
          <th scope="col">{{ t('multiple_target') }}</th>
          <th scope="col">{{ t('multiple_implied') }}</th>
          <th scope="col">{{ t('margin_of_safety') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <th scope="row">{{ t(row.labelKey) }}</th>
          <td>{{ show(row.current) }}</td>
          <td>
            <input v-model.number="targets[row.key]" class="input-section mcheck__input" type="number" step="0.1" :aria-label="t(row.labelKey)" />
          </td>
          <td>{{ moneyIn(currency, row.implied) }}</td>
          <td :class="row.marginClass">{{ row.margin }}</td>
        </tr>
      </tbody>
      <!-- Reference row: same arithmetic as the rows above, but the multiple is
           fixed, so it renders as a value instead of an input. -->
      <tfoot v-if="longRun" class="mcheck__foot" data-testid="long-run-pe">
        <tr>
          <th scope="row">
            {{ t('multiple_pe_no_growth') }}
            <span class="mcheck__tag">{{ t('multiple_reference') }}</span>
          </th>
          <td>{{ show(longRun.current) }}</td>
          <td><span class="mcheck__fixed">{{ LONG_RUN_PE }}×</span></td>
          <td>{{ moneyIn(currency, longRun.implied) }}</td>
          <td :class="longRun.marginClass">{{ longRun.margin }}</td>
        </tr>
      </tfoot>
    </table>
    <p v-if="longRun" class="mcheck__note" data-testid="long-run-note">
      {{ t('multiple_ref_note', { multiple: LONG_RUN_PE, rate: NO_GROWTH_RATE }) }}
    </p>
  </section>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { LONG_RUN_PE, MULTIPLES, NO_GROWTH_RATE, currentMultiple, impliedPrice } from '../lib/multiples'
import { useMoney } from '../composables/useMoney'
import APopover from './APopover.vue'

const props = defineProps({
  bases: { type: Object, required: true },
  price: { type: [Number, String], default: 0 },
  currency: { type: String, default: '¥' },
  fairValue: { type: [Number, String], default: 0 },
  longRun: { type: [Number, String], default: null },
})

const { t } = useI18n()
const { moneyIn } = useMoney()
const DEFAULTS = { pe: 10, pfcf: 10, pbv: 1 }

const seeded = () => Object.fromEntries(MULTIPLES.map((item) => [
  item.key,
  currentMultiple(props.bases[item.baseField], props.price) ?? DEFAULTS[item.key],
]))
const targets = reactive(seeded())

const show = (multiple) => (multiple === null ? 'n/a' : multiple + '×')

const marketPrice = computed(() => Number(String(props.price).replace(/[^0-9.+-]/g, '')))

/** Implied price plus the signed gap to the quote, shared by every row. */
const priced = (base, multiple) => {
  const implied = impliedPrice(base, multiple)
  const price = marketPrice.value
  const margin = implied !== null && implied > 0 && price > 0 ? 1 - price / implied : null
  return {
    implied,
    margin: margin === null ? 'n/a' : (100 * margin).toFixed(1) + '%',
    marginClass: margin === null ? 'faint' : margin >= 0 ? 'mcheck__good' : 'mcheck__bad',
  }
}

const rows = computed(() => MULTIPLES.map((item) => ({
  ...item,
  ...priced(props.bases[item.baseField], targets[item.key]),
  current: currentMultiple(props.bases[item.baseField], props.price),
})))

const longRun = computed(() => {
  if (impliedPrice(props.longRun, LONG_RUN_PE) === null) return null
  return {
    ...priced(props.longRun, LONG_RUN_PE),
    current: currentMultiple(props.longRun, props.price),
  }
})
</script>
