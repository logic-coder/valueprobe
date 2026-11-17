<template>
  <div class="dcf-financial-card">
    <q-card-section>
      <div class="text-h6">
        <q-item
          v-if="showReverse"
          class="rounded-borders q-mt-sm q-px-lg q-py-md clickable"
          :style="{ border: '1px solid ' + (largerOrNot ? 'red' : 'green') }"
        >
          <q-item-section avatar>
            <q-icon :class="largerOrNot ? 'text-red' : 'text-green'" :name="largerOrNot ? 'thumb_down' : 'thumb_up'" size="md" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-body1 text-weight-medium">{{ reverseTitle }}</q-item-label>
            <q-item-label class="text-subtitle2">{{ reverseTip }}</q-item-label>
          </q-item-section>
        </q-item>
      </div>

      <div v-if="!isloading && reversedGrowthLabel !== null" class="row items-center">
        <a-popover placement="topLeft">
          <font class="row items-center">
            <h3 class="text-body1 text-bold">{{ t('rdcf_growth') }}</h3>
            <q-icon class="text-grey-7" name="help" />:&nbsp;
            <font :style="{ color: largerOrNot ? 'var(--danger)' : 'var(--accent-strong)' }">{{ percent(reverse) }}</font>
          </font>
          <template #content>{{ t('rdcf_growth_desc') }}</template>
        </a-popover>
      </div>
    </q-card-section>

    <q-card-section>
      <q-markup-table v-if="ready" dense flat class="dcf-financial-data default-table">
        <thead class="bg-blue-1">
          <tr>
            <th class="text-left bg-blue-1">{{ t('per_share_data') }}</th>
            <th class="dcf-border" colspan="3">{{ t('annual_rates_per_share') }}</th>
            <th class="dcf-border" :colspan="annual.length">{{ t('annuals_year_end') }}</th>
            <th class="text-right dcf-border">{{ t('ttm') }}</th>
            <th class="text-right">{{ t('last_quarter') }}</th>
          </tr>
          <tr>
            <th class="text-left bg-blue-1">{{ t('fiscal_period') }}</th>
            <th class="text-right">{{ t('10_yrs') }}</th>
            <th class="text-right">{{ t('5_yrs') }}</th>
            <th class="text-right dcf-border">{{ t('1y') }}</th>
            <th
              v-for="index in annual.length"
              :key="'th_annual' + index"
              class="text-right"
              :class="index === annual.length ? 'dcf-border' : ''"
            >
              {{ (annual[index - 1] || {}).date }}
            </th>
            <th class="text-right dcf-border">{{ ttmLast ? ttmLast.date : '' }}</th>
            <th class="text-right">{{ quarterLast ? quarterLast.date : '' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(child, rowIndex) in children" :key="rowIndex">
            <td @click="changeIndicator(child.name)">
              <field-name class="text-primary q-px-xs" :field="child" :stock="stock" />
            </td>
            <template v-for="(rateName, cellIndex) in table[child.name]" :key="'dcf_' + child.name + rateName">
              <td class="text-right" :class="cellIndex === 2 ? 'dcf-border' : ''" :style="cellStyle(rateName)">
                <template v-if="stock[rateName] === 0">N/A</template>
                <template v-else>{{ percent1(stock[rateName]) }}</template>
              </td>
            </template>
            <td
              v-for="index in annual.length"
              :key="'val_annual' + index"
              class="text-right"
              :class="index === annual.length ? 'dcf-border' : ''"
            >
              {{ (annual[index - 1] || {})[child.name] }}
            </td>
            <td class="text-right dcf-border">{{ ttmLast ? ttmLast[child.name] : '' }}</td>
            <td class="text-right">{{ quarterLast ? quarterLast[child.name] : '' }}</td>
          </tr>
        </tbody>
      </q-markup-table>

      <q-markup-table v-else separator="none" flat dense>
        <tbody>
          <tr v-for="row in 9" :key="row">
            <td v-for="col in 9" :key="col" class="text-center">
              <q-skeleton type="rect" height="30px" width="50px" />
            </td>
          </tr>
        </tbody>
      </q-markup-table>
    </q-card-section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { percent, percent1 } from '../lib/format'
import { useI18n } from 'vue-i18n'
import { useStockStore } from '../store/stock'
import { useDcfStore } from '../store/dcf'
import APopover from './APopover.vue'
import FieldName from './FieldName.vue'

const props = defineProps({
  reverse: { type: [Number, String], default: 0 },
  type: { type: String, default: '' },
})
const emit = defineEmits(['change'])
const { t } = useI18n()
const stockStore = useStockStore()
const dcfStore = useDcfStore()

const stock = computed(() => stockStore.stock || {})
const isloading = computed(() => dcfStore.loading)
const financials = computed(() => dcfStore.financials.data)
const view = computed(() => dcfStore.view.data)
const children = computed(() => (view.value?.children || []).filter((child) => table[child.name]))
const annual = computed(() => financials.value?.annual || [])
const ttmLast = computed(() => {
  const ttm = financials.value?.ttm || []
  return ttm.length ? ttm[ttm.length - 1] : null
})
const quarterLast = computed(() => {
  const quarter = financials.value?.quarter || []
  return quarter.length ? quarter[quarter.length - 1] : null
})
const ready = computed(() => !isloading.value && view.value?.children?.length && financials.value && financials.value.annual?.length)
const largerOrNot = computed(() => (props.type === 'eps' ? props.reverse > stock.value.earning_growth_10y : props.reverse > stock.value.cashflow_growth_10y))
const reversedGrowthLabel = computed(() => props.reverse)
const showReverse = computed(() => {
  if (isloading.value || props.reverse === null || props.reverse === undefined || props.reverse === '') return false
  if (!Number.isFinite(Number(props.reverse))) return false
  if (props.type === 'eps') return !(isNaN(stock.value.earning_growth_10y) || stock.value.earning_growth_10y === 0)
  return !(isNaN(stock.value.cashflow_growth_10y) || stock.value.cashflow_growth_10y === 0)
})

const reverseTitle = computed(() => {
  if (props.type === 'eps') return largerOrNot.value ? t('rdcf_growth_tips_title_pos') : t('rdcf_growth_tips_title_neg')
  return largerOrNot.value ? t('rdcf_freecashflow_growth_tips_title_pos') : t('rdcf_freecashflow_growth_tips_title_neg')
})
const reverseTip = computed(() => {
  if (props.type === 'eps') return largerOrNot.value ? t('rdcf_growth_tips_pos') : t('rdcf_growth_tips_neg')
  return largerOrNot.value ? t('rdcf_freecashflow_growth_tips_pos') : t('rdcf_freecashflow_growth_tips_neg')
})

const table = {
  revenue_per_share: ['rvn_growth_10y', 'rvn_growth_5y', 'rvn_growth_1y'],
  ebitda_per_share: ['ebitda_growth_10y', 'ebitda_growth_5y', 'ebitda_growth_1y'],
  operating_income_per_share: ['ebit_growth_10y', 'ebit_growth_5y', 'ebit_growth_1y'],
  free_cash_flow_per_share: ['cashflow_growth_10y', 'cashflow_growth_5y', 'cashflow_growth_1y'],
  eps_without_nri: ['earning_growth_10y', 'earning_growth_5y', 'earning_growth_1y'],
  dividends_per_share: ['dividend_growth_10y', 'dividend_growth_5y', 'dividend_growth_1y'],
  book_value_per_share: ['book_growth_10y', 'book_growth_5y', 'book_growth_1y'],
}

const isHighlighted = (rateName) => (props.type === 'eps' && rateName === 'earning_growth_10y') || (props.type === 'freecashflow' && rateName === 'cashflow_growth_10y')
const cellStyle = (rateName) => {
  if (!isHighlighted(rateName)) return {}
  return largerOrNot.value ? { color: 'var(--danger)', border: '1px solid var(--danger)' } : { color: 'var(--accent-strong)', border: '1px solid var(--accent-strong)' }
}
const changeIndicator = (indicator) => emit('change', indicator)
</script>
