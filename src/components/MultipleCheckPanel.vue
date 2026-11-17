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
          <td>{{ row.current === null ? 'n/a' : row.current + '×' }}</td>
          <td>
            <input v-model.number="targets[row.key]" class="input-section mcheck__input" type="number" step="0.1" :aria-label="t(row.labelKey)" />
          </td>
          <td>{{ moneyIn(currency, row.implied) }}</td>
          <td :class="row.marginClass">{{ row.margin }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { MULTIPLES, currentMultiple, impliedPrice } from '../lib/multiples'
import { useMoney } from '../composables/useMoney'
import APopover from './APopover.vue'

const props = defineProps({
  bases: { type: Object, required: true },
  price: { type: [Number, String], default: 0 },
  currency: { type: String, default: '¥' },
  fairValue: { type: [Number, String], default: 0 },
})

const { t } = useI18n()
const { moneyIn } = useMoney()
const DEFAULTS = { pe: 10, pfcf: 10, pbv: 1 }

const seeded = () => Object.fromEntries(MULTIPLES.map((item) => [
  item.key,
  currentMultiple(props.bases[item.baseField], props.price) ?? DEFAULTS[item.key],
]))
const targets = reactive(seeded())

const rows = computed(() => MULTIPLES.map((item) => {
  const implied = impliedPrice(props.bases[item.baseField], targets[item.key])
  const fair = Number(props.fairValue)
  const gap = Number.isFinite(fair) && fair > 0 && implied !== null ? 1 - implied / fair : null
  return {
    ...item,
    current: currentMultiple(props.bases[item.baseField], props.price),
    implied,
    margin: gap === null ? 'n/a' : (100 * gap).toFixed(1) + '%',
    marginClass: gap === null ? 'faint' : gap >= 0 ? 'mcheck__good' : 'mcheck__bad',
  }
}))
</script>
