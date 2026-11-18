<template>
  <div class="dcf" data-testid="dcf">
    <q-card flat class="dcf__card panel">
      <div>
        <q-card-section class="dcf__head">
          <dcf-header
            :providers="providers"
            :pinned-source="pinnedSource || ''"
            @share="copyShare"
            @reset="resetToDefaults"
            @pin="pinSource"
          />
        </q-card-section>

          <dcf-result-bar
            :loading="loading"
            :stock="stock"
            :result="result"
            :live-summary="liveSummary"
          />

          <div class="line-height-2 dcf__form">
            <div class="dcf__scenario">
              <a-popover placement="top">
                <span class="dcf__scenario-label">{{ t('model') }} <q-icon class="text-grey-7" name="help" size="14px" /></span>
                <template #content>{{ t('model_help') }}</template>
              </a-popover>
              <div class="dcf__scenario-btns" role="group" :aria-label="t('model')">
                <q-btn
                  v-for="key in models"
                  :key="key"
                  dense
                  flat
                  size="sm"
                  padding="xs md"
                  :class="{ 'is-active': model === key }"
                  :label="t('model_' + key)"
                  @click="model = key"
                />
              </div>
              <span class="dcf__scenario-note dcf__model-note">{{ t('model_suggested', { model: t('model_' + suggested) }) }}</span>
            </div>
            <scenario-bar :keys="scenarioKeys" :active="activeScenario" @pick="setScenario" @reset="resetScenario" />
            <!-- stock price -->
            <div class="dcf__row">
              <div class="text-left">{{ t('stock_price') }}</div>
              <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
              <div v-else class="dcf__value">
                <editable-value v-model="result.stockPrice" :display="money(stock.currency, result.stockPrice)" :label="t('stock_price')" :currency="currencyCode" />
              </div>
            </div>
            <q-separator />

            <!-- earnings basis -->
            <div class="dcf__row basis-row" role="radiogroup" :aria-label="t('earnings_basis')">
              <span class="basis-option">
                <label class="basis-option__choice">
                  <q-radio v-model="dcfBasedOn" dense val="eps" :aria-label="t('eps')" />
                  {{ t('eps') }}
                </label>
                <a-popover placement="top">
                  <q-icon class="text-grey-7" name="help" />
                  <template #content>{{ t('eps_desc') }}</template>
                </a-popover>
              </span>
              <span class="basis-option">
                <label class="basis-option__choice">
                  <q-radio v-model="dcfBasedOn" dense val="freecashflow" :disable="firmClaim" :aria-label="t('total_freecashflow')" />
                  {{ t('total_freecashflow') }}
                </label>
                <a-popover placement="top">
                  <q-icon class="text-grey-7" name="help" />
                  <template #content>{{ t('total_freecashflow_desc') }}</template>
                </a-popover>
              </span>
              <q-space />
              <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
              <div v-else-if="dcfBasedOn === 'eps'" class="dcf__value">
                <editable-value v-if="isManual" v-model="form.eps" :display="money(stock.currency, form.eps)" :label="t('eps')" :currency="currencyCode" />
                <template v-else>{{ money(stock.currency, form.eps) }}</template>
              </div>
              <div v-else class="dcf__value">
                <editable-value v-if="isManual" v-model="form.freecashflow" :display="money(stock.currency, form.freecashflow)" :label="t('total_freecashflow')" :currency="currencyCode" />
                <template v-else>{{ money(stock.currency, form.freecashflow) }}</template>
              </div>
            </div>
            <div v-if="!loading && stock.cashflow_basis" class="dcf__rate-note">
              {{ stock.cashflow_basis === 'ocf' ? t('fcf_basis_ocf') : stock.cashflow_basis === 'none' ? t('fcf_basis_none') : stock.cashflow_basis === 'fcff' ? t('fcf_basis_fcff') : t('fcf_basis_equity') }}
            </div>
            <div v-if="!loading && residualIncome" class="dcf__rate-note" data-testid="residual-income-note">{{ t('residual_income_note') }}</div>
            <q-separator />

            <div v-if="!isManual" class="dcf__rate-note">
              <q-icon name="info" size="14px" />
              {{ t('fundamentals_readonly') }}
            </div>
            <q-separator />

            <!-- discount rate -->
            <div class="dcf__row">
              <div class="text-left text-subtitle2">
                <a-popover placement="top">
                  <font>{{ t('discount_rate') }} <q-icon class="text-grey-7" name="help" /></font>
                  <template #content>{{ t('discount_rate_desc') }}</template>
                </a-popover>
              </div>
              <div class="stepper">
                <q-btn class="bg-indigo-1" square size="sm" flat dense icon="remove" style="border-radius: 0" :aria-label="t('decrease')" @click="form.discountRate--" />
                <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                <input v-else v-model.number="form.discountRate" class="input-section" data-testid="field-discount" :aria-label="t('discount_rate')" type="number" @change="clampDiscount" />
                <q-btn class="bg-indigo-1" square size="sm" flat dense icon="add" style="border-radius: 0" :aria-label="t('increase')" @click="form.discountRate++" />
                <q-btn flat dense size="sm" class="dcf__wacc-btn" icon="functions" :label="t('wacc')" :aria-label="t('wacc')" @click="openWacc" />
              </div>
            </div>
            <div v-if="!loading && rateSource === 'bundled'" class="dcf__rate-note">
              <q-icon name="info" size="14px" />
              {{ t('rate_bundled_note') }}
            </div>
            <div v-if="!loading && !basisReady" class="dcf__rate-note">{{ t('basis_unavailable') }}</div>
            <div v-else-if="!loading && result.reverseGrowthRate == null" class="dcf__rate-note">{{ t('reverse_no_solution') }}</div>
            <div v-else-if="!loading" class="dcf__rate-note" data-testid="reverse-growth">
              {{ t('rdcf_growth') }} {{ percent(result.reverseGrowthRate) }}
            </div>
            <q-separator />

            <!-- tangible book value -->
            <div class="dcf__row dcf__book">
              <div class="dcf__book-label">
                <a-popover placement="top">
                  <font>
                    {{ t('book') }}
                    <q-icon class="text-grey-7" name="help" />
                  </font>
                  <template #content>{{ t('book_desc') }}</template>
                </a-popover>
                <label class="dcf__toggle">
                  <q-checkbox v-model="result.addToFairValue" size="xs" :disable="residualIncome" :aria-label="t('add_to_fair_value')" />
                  {{ t('add_to_fair_value') }}
                </label>
              </div>
              <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
              <div v-else class="dcf__value">
                <editable-value v-if="isManual" v-model="result.tbv" :display="moneyIn(stock.currency, result.tbv)" :label="t('book')" :currency="currencyCode" />
                <template v-else>{{ moneyIn(stock.currency, result.tbv) }}</template>
              </div>
              <p v-if="result.addToFairValue && !residualIncome" class="dcf__book-note">{{ t('tbv_double_count_note') }}</p>
            </div>
            <q-separator />

            <div class="stage-grid">
              <section class="stage-panel">
                <h5 class="stage-panel__title">
                  <a-popover placement="top">
                    <font>
                      {{ t('dcf_growth_in_the_next') }}
                      <q-icon class="text-grey-7" name="help" />
                    </font>
                    <template #content>{{ t('dcf_growth_in_the_next_desc') }}</template>
                  </a-popover>
                </h5>
                <div class="stage-row">
                  <span>{{ t('dcf_years') }}</span>
                  <div class="stepper">
                    <q-btn class="bg-indigo-1" square size="sm" flat dense icon="remove" style="border-radius: 0" :aria-label="t('decrease')" @click="form.years > 0 ? form.years-- : (form.years = 0)" />
                    <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                    <input v-else v-model="form.years" class="input-section" data-testid="field-growth-years" :aria-label="t('growth_year_in_the_next')" type="number" outlined />
                    <q-btn class="bg-indigo-1" square size="sm" flat dense icon="add" style="border-radius: 0" :aria-label="t('increase')" @click="form.years++" />
                  </div>
                </div>
                <div class="stage-row">
                  <span>{{ t('growth_rate') }}</span>
                  <div class="stepper">
                    <q-btn class="bg-indigo-1" square size="sm" flat dense icon="remove" style="border-radius: 0" :aria-label="t('decrease')" @click="decGrowthRate" />
                    <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                    <input
                      v-else-if="dcfBasedOn === 'eps'"
                      v-model="form.growthRate"
                      class="input-section"
                      data-testid="field-growth"
                      :aria-label="t('growth_rate')"
                      type="number"
                      outlined
                    />
                    <input
                      v-else-if="dcfBasedOn === 'freecashflow'"
                      v-model="form.freecashflowGrowthRate"
                      class="input-section"
                      :aria-label="t('growth_rate')"
                      type="number"
                      outlined
                    />
                    <q-btn class="bg-indigo-1" square size="sm" flat dense icon="add" style="border-radius: 0" :aria-label="t('increase')" @click="incGrowthRate" />
                  </div>
                </div>
                <p v-if="!loading && growthNote" class="stage-panel__note">{{ growthNote }}</p>
                <div class="stage-row stage-row--result">
                  <span>{{ t('growth_in_the_next_fair_value') }}</span>
                  <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                  <strong v-else>{{ moneyIn(stock.currency, result.growthValue) }}</strong>
                </div>
              </section>

              <section class="stage-panel">
                <h5 class="stage-panel__title">
                  <a-popover placement="top">
                    <font>
                      {{ t('dcf_terminal') }}
                      <q-icon class="text-grey-7" name="help" />
                    </font>
                    <template #content>{{ t('dcf_terminal_desc') }}</template>
                  </a-popover>
                </h5>
                <div class="stage-row">
                  <span>{{ t('dcf_years') }}</span>
                  <div class="stepper">
                    <q-btn class="bg-indigo-1" square size="sm" flat dense icon="remove" style="border-radius: 0" :aria-label="t('decrease')" @click="decTerminalYears" />
                    <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                    <input v-else v-model="form.yearsOfTerminalGrowth" class="input-section" :aria-label="t('years_of_terminal_growth')" type="number" outlined />
                    <q-btn class="bg-indigo-1" square size="sm" flat dense icon="add" style="border-radius: 0" :aria-label="t('increase')" @click="form.yearsOfTerminalGrowth++" />
                  </div>
                </div>
                <div class="stage-row">
                  <span>{{ t('growth_rate') }}</span>
                  <div class="stepper">
                    <q-btn class="bg-indigo-1" square size="sm" flat dense icon="remove" style="border-radius: 0" :aria-label="t('decrease')" @click="form.terminalGrowthRate--" />
                    <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                    <input v-else v-model="form.terminalGrowthRate" class="input-section" type="number" :aria-label="t('terminal_growth_rate')" outlined />
                    <q-btn class="bg-indigo-1" square size="sm" flat dense icon="add" style="border-radius: 0" :aria-label="t('increase')" @click="form.terminalGrowthRate++" />
                  </div>
                </div>
                <p v-if="!loading" class="stage-panel__note">{{ stageNote }}</p>
                <div class="stage-row stage-row--result">
                  <span>{{ t('terminal_fair_value') }}</span>
                  <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                  <strong v-else>{{ moneyIn(stock.currency, result.terminalValue) }}</strong>
                </div>
              </section>
            </div>
            <q-separator />

            <!-- business predictability -->
            <div class="dcf__row">
              <div class="text-left text-subtitle2">
                <a-popover placement="top">
                  <font>{{ t('business_predictability') }} <q-icon class="text-grey-7" name="help" /></font>
                  <template #content>{{ t('business_predictability_desc') }}</template>
                </a-popover>
              </div>
              <div class="dcf__value">
                <q-skeleton v-if="loading" type="rect" height="15px" width="150px" />
                <q-rating
                  v-else
                  class="dcf__rating"
                  :model-value="stock.predictability"
                  :max="5"
                  color="grey"
                  color-selected="orange"
                  icon="star_border"
                  icon-half="star_half"
                  color-half="orange"
                  icon-selected="star"
                  size="1rem"
                  readonly
                  no-dimming
                />
              </div>
            </div>
            <div v-if="!loading && stock.predictability != null && stock.predictability <= 1" class="dcf__warn">
              <q-icon name="error" size="15px" />
              <span>{{ t('dcf_low_predictability_warning') }}</span>
            </div>
            <q-separator />
            <div v-if="display.converted" class="text-caption faint q-px-sm q-py-xs">
              {{ t('converted_note', { currency: display.currency, native: stock.currency || '' }) }}
            </div>
          </div>

          <sensitivity-panel
            v-if="!loading && sensitivityGrid"
            class="dcf__sens"
            :grid="sensitivityGrid"
            :currency="stock.currency || '¥'"
            :price="result.stockPrice"
          />

          <div class="dcf__evidence">
          <multiple-check-panel
            v-if="!loading"
            class="dcf__mcheck"
            :bases="{ eps: form.eps, freecashflow: firmClaim ? null : form.freecashflow, tbv: result.tbv }"
            :price="result.stockPrice"
            :currency="stock.currency || '¥'"
            :fair-value="result.fairValue"
          />

          <peer-compare-panel
            v-if="!loading && hasPeers"
            class="dcf__peers"
            :symbol="props.symbol"
            :basis-value="dcfBasedOn === 'freecashflow' ? form.freecashflow : form.eps"
            :fair-value="result.fairValue"
            :currency="stock.currency || '¥'"
            @open="openPeer"
          />
          </div>
      </div>
    </q-card>

    <div class="dcf__table">
      <slot name="financial-data" />
    </div>

    <wacc-dialog v-model:visible="waccVisible" v-model:wacc="wacc" :rate="waccRate" @apply="applyWacc" />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useStockStore } from '../store/stock'
import { useDcfStore } from '../store/dcf'
import { useDataStateStore } from '../store/dataState'
import { readManual, writeManual } from '../lib/manual'
import { adoptGrowth } from '../lib/assumptions'
import { buildDefaults, impliedGrowth, marginOfSafety, presentValue, residualIncomeValue, valueBand } from '../lib/dcf'
import { firmFreeCashFlow, suggestedModel, VALUATION_MODELS } from '../lib/valuationModel'
import { clamp, money, percent } from '../lib/format'
import { useMoney } from '../composables/useMoney'
import { codeOf } from '../store/display'
import APopover from './APopover.vue'
import EditableValue from './EditableValue.vue'
import DcfHeader from './dcf/DcfHeader.vue'
import DcfResultBar from './dcf/DcfResultBar.vue'
import ScenarioBar from './dcf/ScenarioBar.vue'
import WaccDialog from './dcf/WaccDialog.vue'
import SensitivityPanel from './SensitivityPanel.vue'
import MultipleCheckPanel from './MultipleCheckPanel.vue'
import PeerComparePanel from './PeerComparePanel.vue'
import { buildSensitivityGrid } from '../lib/sensitivity'
import { peersFor } from '../lib/peers'
import { decodeState, encodeModel, encodeState, isPresetEmpty } from '../lib/permalink'
import { ERP_DEFAULT, buildUpRate } from '../lib/wacc'
import { applyScenario } from '../lib/scenarios'
import { useRoute, useRouter } from 'vue-router'
import { providerLabel, registry } from '../data'
import { pinProvider, pinnedProvider } from '../data/preferences'

const { t } = useI18n()
const $q = useQuasar()
const stockStore = useStockStore()
const dcfStore = useDcfStore()
const sourceStore = useDataStateStore()
const props = defineProps({ symbol: { type: String, default: '' }, preset: { type: Object, default: null } })
const route = useRoute()
const router = useRouter()
const { moneyIn, display } = useMoney()

const emit = defineEmits(['change', 'change-result', 'reload'])

const isLoading = ref(true)
const loading = computed(() => dcfStore.loading)
const stock = computed(() => stockStore.stock || {})
const currencyCode = computed(() => codeOf(stock.value.currency) || stock.value.currency || '')

const financials = computed(() => dcfStore.financials.data)
const indicator = computed(() => dcfStore.indicator.indicator)
const rateSource = computed(() => dcfStore.indicator.source)
const growthNote = computed(() => {
  const key = dcfBasedOn.value === 'eps' ? 'eps' : 'fcf'
  if (stock.value?.growth_refused?.[key] === 'short') return t('growth_refused_note')
  const historicalField = dcfBasedOn.value === 'eps' ? 'earning_growth_10y' : 'cashflow_growth_10y'
  const info = adoptGrowth(stock.value?.[historicalField])
  const adopted = dcfBasedOn.value === 'eps' ? form.growthRate : form.freecashflowGrowthRate
  if (info.reason === 'missing') return t('growth_missing_note')
  const span = stock.value?.growth_window?.[dcfBasedOn.value === 'eps' ? 'eps' : 'fcf']
  const window = span ? t('growth_window', span) : ''
  if (info.reason === 'capped') return t('growth_capped_note', { historical: info.historical, window, cap: info.adopted, adopted })
  return t('growth_adopted_note', { historical: info.historical, window, adopted })
})
const stageNote = computed(() => {
  const years = (Number(form.years) || 0) + (Number(form.yearsOfTerminalGrowth) || 0)
  const discount = Number(form.discountRate)
  const terminal = Number(form.terminalGrowthRate)
  if (Number.isFinite(discount) && Number.isFinite(terminal) && terminal >= discount) return t('stage_rate_note')
  return t('stage_horizon_note', { years })
})
const isManual = computed(() => sourceStore.stateOf(props.symbol) === 'manual')
const finiteOrNull = (value) => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const freecashflow = computed(() => {
  if (isManual.value) return finiteOrNull(stock.value.free_cash_flow_per_share)
  const row = financials.value?.ttm?.at(-1)
  return finiteOrNull(row?.free_cash_flow_per_share)
})
const models = VALUATION_MODELS
const suggested = computed(() => suggestedModel(stock.value))
const firmClaim = computed(() => firmFreeCashFlow(stock.value))
const model = ref('owner')
const residualIncome = computed(() => model.value === 'residual' && dcfBasedOn.value === 'eps')
const basisReady = computed(() => (dcfBasedOn.value === 'eps' ? Number(form.eps) : Number(form.freecashflow)) > 0)

const dcfBasedOn = ref('eps')
const form = reactive({
  eps: null, freecashflow: null, freecashflowGrowthRate: null, years: null,
  growthRate: null, terminalGrowthRate: null, yearsOfTerminalGrowth: null, discountRate: null,
})
const result = reactive({
  tbv: null, stockPrice: null, growthValue: null, terminalValue: null, reverseGrowthRate: null,
  marginOfSafety: null, addToFairValue: false, fairValue: null, fairLow: null, fairHigh: null,
})
const hasPeers = computed(() => peersFor(props.symbol).length > 0)
// Recalculation is announced, but only after typing pauses: a live region that
// fires on every keystroke is noise, not feedback.
const liveSummary = ref('')
let announceTimer = 0
watch([() => result.fairValue, () => result.marginOfSafety], () => {
  window.clearTimeout(announceTimer)
  announceTimer = window.setTimeout(() => {
    liveSummary.value = t('live_result', {
      value: moneyIn(stock.value.currency, result.fairValue),
      margin: percent(result.marginOfSafety),
    })
  }, 300)
})
const openPeer = (symbol) => router.push('/stock/' + symbol + '/dcf')
// The seeded defaults are the yardstick for a share link: only moves travel in it.
const seed = ref(null)

const initData = async () => {
  if (!isManual.value) await dcfStore.loadIndicator()
  const defaults = buildDefaults(isManual.value ? null : indicator.value, stock.value, freecashflow.value)
  seed.value = defaults
  const manual = isManual.value ? readManual(props.symbol) : null
  Object.assign(form, defaults.dcfForm, manual ? {
    eps: manual.eps !== '' ? Number(manual.eps) : defaults.dcfForm.eps,
    freecashflow: manual.freecashflow !== '' ? Number(manual.freecashflow) : defaults.dcfForm.freecashflow,
    growthRate: manual.growthRate !== '' ? Number(manual.growthRate) : defaults.dcfForm.growthRate,
    freecashflowGrowthRate: manual.freecashflowGrowthRate !== '' ? Number(manual.freecashflowGrowthRate) : defaults.dcfForm.freecashflowGrowthRate,
    discountRate: manual.discountRate !== '' ? Number(manual.discountRate) : defaults.dcfForm.discountRate,
    terminalGrowthRate: manual.terminalGrowthRate !== '' ? Number(manual.terminalGrowthRate) : defaults.dcfForm.terminalGrowthRate,
    years: manual.years !== '' ? Number(manual.years) : defaults.dcfForm.years,
    yearsOfTerminalGrowth: manual.yearsOfTerminalGrowth !== '' ? Number(manual.yearsOfTerminalGrowth) : defaults.dcfForm.yearsOfTerminalGrowth,
  } : {})
  Object.assign(result, defaults.dcfResultForm, manual ? {
    tbv: manual.tangibleBook !== '' ? Number(manual.tangibleBook) : defaults.dcfResultForm.tbv,
    stockPrice: manual.price !== '' ? manual.price : defaults.dcfResultForm.stockPrice,
  } : {})
  // A shared link beats both the seed and the manual values: it is the reason
  // the page was opened.
  const preset = decodeState(props.preset || {})
  if (!isManual.value) {
    delete preset.form.eps
    delete preset.form.freecashflow
    delete preset.result.tbv
  }
  model.value = preset.model || suggested.value
  if (!isPresetEmpty(preset)) {
    if (preset.basis && !(preset.basis === 'freecashflow' && firmClaim.value)) dcfBasedOn.value = preset.basis
    Object.assign(form, preset.form)
    Object.assign(result, preset.result)
    if (preset.tbvIn !== undefined) result.addToFairValue = preset.tbvIn
  }
  if (!isManual.value) {
    if (stock.value.ttm_eps == null && stock.value.ttm_eps_nri == null) form.eps = null
    if (freecashflow.value == null) form.freecashflow = null
  }
  activeScenario.value = 'base'
  baseAssumptions.value = null
  calculate()
}

// The router owns the hash, so resolve the route into a path and graft its hash
// onto the current URL — that keeps the deployment base path intact.
const shareUrl = () => {
  const query = encodeState(form, result, dcfBasedOn.value, seed.value || {})
  const modelKey = encodeModel(model.value, suggested.value)
  if (modelKey) query.m = modelKey
  if (!isManual.value) {
    delete query.eps
    delete query.fcf
    delete query.tbv
  }
  const href = router.resolve({ path: route.path, query }).href
  const hash = href.includes('#') ? href.slice(href.indexOf('#')) : '#' + href
  const url = new URL(location.href)
  url.hash = hash
  return url.href
}

const copyShare = async () => {
  const url = shareUrl()
  try {
    await navigator.clipboard.writeText(url)
    $q.notify({ message: t('share_copied'), icon: 'link', color: 'positive', timeout: 1600 })
  } catch {
    $q.notify({ message: t('share_failed'), color: 'negative', timeout: 3000 })
  }
}

const calculate = () => {
  if (form.years < 0) form.years = 0
  if (form.yearsOfTerminalGrowth < 0) form.yearsOfTerminalGrowth = 0
  const base = dcfBasedOn.value === 'eps' ? Number(form.eps) : Number(form.freecashflow)
  const growth = finiteOrNull(dcfBasedOn.value === 'eps' ? form.growthRate : form.freecashflowGrowthRate)
  if (!(base > 0)) {
    result.fairValue = null
    result.fairLow = null
    result.fairHigh = null
    result.growthValue = null
    result.terminalValue = null
    result.marginOfSafety = 'n/a'
    result.reverseGrowthRate = null
    return
  }
  if (growth === null) {
    result.fairValue = null
    result.fairLow = null
    result.fairHigh = null
    result.growthValue = null
    result.terminalValue = null
    result.marginOfSafety = 'n/a'
    result.reverseGrowthRate = residualIncome.value
      ? null
      : impliedGrowth(
        result.tbv, form.years, form.discountRate, base, result.stockPrice,
        form.terminalGrowthRate, result.stockPrice, form.yearsOfTerminalGrowth, result.addToFairValue,
      )
    return
  }
  const band = valueBand({
    residual: residualIncome.value,
    tbv: result.tbv,
    base,
    discountRate: form.discountRate,
    growthRate: growth,
    terminalGrowthRate: form.terminalGrowthRate,
    years: form.years,
    yearsOfTerminalGrowth: form.yearsOfTerminalGrowth,
    addToFairValue: result.addToFairValue,
  })
  result.fairLow = band.low
  result.fairHigh = band.high
  if (residualIncome.value) {
    result.fairValue = residualIncomeValue(result.tbv, base, form.discountRate, growth, form.terminalGrowthRate, form.years)?.fairValue ?? null
    result.growthValue = null
    result.terminalValue = null
    result.marginOfSafety = result.fairValue == null ? 'n/a' : marginOfSafety(result.stockPrice, result.fairValue)
    result.reverseGrowthRate = null
    return
  }
  const computedValues = presentValue(result.tbv, form.years, form.discountRate, growth, base, form.terminalGrowthRate, form.yearsOfTerminalGrowth, result.addToFairValue)
  result.fairValue = computedValues.fairValue
  result.growthValue = computedValues.growthValue
  result.terminalValue = computedValues.terminalValue
  result.marginOfSafety = marginOfSafety(result.stockPrice, result.fairValue)
  result.reverseGrowthRate = impliedGrowth(
    result.tbv, form.years, form.discountRate, base, result.stockPrice,
    form.terminalGrowthRate, result.stockPrice, form.yearsOfTerminalGrowth, result.addToFairValue,
  )
}

// SENS: five by five neighbours of the current rate/growth pair, all through the kernel.
const sensitivityGrid = computed(() => {
  const growthRate = finiteOrNull(dcfBasedOn.value === 'eps' ? form.growthRate : form.freecashflowGrowthRate)
  if (growthRate === null) return null
  return buildSensitivityGrid({
  discountRate: form.discountRate,
  growthRate,
  tbv: result.tbv,
  years: form.years,
  base: dcfBasedOn.value === 'eps' ? form.eps : form.freecashflow,
  terminalGrowthRate: form.terminalGrowthRate,
  yearsOfTerminalGrowth: form.yearsOfTerminalGrowth,
  addToFairValue: result.addToFairValue,
  residualIncome: residualIncome.value,
  })
})

// Pin one provider for this code (empty = automatic order).
const providers = registry.providers.map((provider) => ({ id: provider.id, label: t(providerLabel(provider.id)) }))
const pinnedSource = ref(pinnedProvider(props.symbol))
const pinSource = (id) => {
  pinProvider(props.symbol, id)
  pinnedSource.value = id || null
  emit('reload')
}

// Scenarios: a fixed preset over the three dials, restored from a base snapshot.
const scenarioKeys = ['base', 'bull', 'bear']
const activeScenario = ref('base')
const baseAssumptions = ref(null)
const growthField = () => (dcfBasedOn.value === 'eps' ? 'growthRate' : 'freecashflowGrowthRate')
const snapshotAssumptions = () => ({
  discountRate: Number(form.discountRate) || 0,
  growthRate: finiteOrNull(form[growthField()]),
  terminalGrowthRate: Number(form.terminalGrowthRate) || 0,
  field: growthField(),
})
const setScenario = (key) => {
  if (activeScenario.value === 'base') baseAssumptions.value = snapshotAssumptions()
  activeScenario.value = key
  const next = applyScenario(baseAssumptions.value, key)
  form.discountRate = clamp(next.discountRate, 0, 50)
  form[baseAssumptions.value.field] = next.growthRate
  form.terminalGrowthRate = next.terminalGrowthRate
}
const resetScenario = () => {
  if (baseAssumptions.value) {
    form.discountRate = baseAssumptions.value.discountRate
    form[baseAssumptions.value.field] = baseAssumptions.value.growthRate
    form.terminalGrowthRate = baseAssumptions.value.terminalGrowthRate
  }
  activeScenario.value = 'base'
}

// WACC build-up: fills the discount input; the kernel only ever sees the result.
const waccVisible = ref(false)
const wacc = reactive({ riskFree: 4, erp: ERP_DEFAULT, beta: 1, sizePremium: 0 })
const waccRate = computed(() => buildUpRate(wacc))
const openWacc = () => {
  const rf = Number(indicator.value)
  wacc.riskFree = Number.isFinite(rf) ? Math.round(rf) : Math.max(0, Number(form.discountRate) - 6)
  wacc.erp = ERP_DEFAULT
  wacc.beta = 1
  wacc.sizePremium = 0
  waccVisible.value = true
}
const applyWacc = () => {
  if (waccRate.value === null) return
  form.discountRate = clamp(waccRate.value, 0, 50)
  waccVisible.value = false
}

const incGrowthRate = () => {
  if (dcfBasedOn.value === 'eps') form.growthRate = Number(form.growthRate) + 1
  else form.freecashflowGrowthRate = Number(form.freecashflowGrowthRate) + 1
}
const decGrowthRate = () => {
  if (dcfBasedOn.value === 'eps') form.growthRate = Number(form.growthRate) - 1
  else form.freecashflowGrowthRate = Number(form.freecashflowGrowthRate) - 1
}
// D2: the original accepts any discount rate, so 0 or 80 produce -Infinity or
// nonsense. Bound the input to 0-50; the kernel still sees the bounded number.
const clampDiscount = () => {
  const next = clamp(form.discountRate, 0, 50)
  if (next !== Number(form.discountRate)) form.discountRate = next
}
const decTerminalYears = () => {
  if (form.yearsOfTerminalGrowth > 0) form.yearsOfTerminalGrowth--
  else form.yearsOfTerminalGrowth = 0
}

const resetToDefaults = () => initData()

const persistManual = () => {
  if (!isManual.value || !props.symbol) return
  const existing = readManual(props.symbol) || { symbol: props.symbol }
  writeManual(props.symbol, {
    ...existing,
    price: result.stockPrice ?? '',
    eps: form.eps ?? '',
    freecashflow: form.freecashflow ?? '',
    tangibleBook: result.tbv ?? '',
    growthRate: form.growthRate ?? '',
    freecashflowGrowthRate: form.freecashflowGrowthRate ?? '',
    discountRate: form.discountRate ?? '',
    terminalGrowthRate: form.terminalGrowthRate ?? '',
    years: form.years ?? '',
    yearsOfTerminalGrowth: form.yearsOfTerminalGrowth ?? '',
  })
}

watch(() => ({ ...form }), () => {
  if (form.years < 0) form.years = 0
  calculate()
  persistManual()
}, { deep: true })
watch(model, () => {
  activeScenario.value = 'base'
  baseAssumptions.value = null
  calculate()
})
watch(firmClaim, (blocked) => {
  if (blocked && dcfBasedOn.value === 'freecashflow') dcfBasedOn.value = 'eps'
})
watch(dcfBasedOn, () => {
  activeScenario.value = 'base'
  baseAssumptions.value = null
  calculate()
})
watch(() => [result.stockPrice, result.tbv, result.addToFairValue], () => {
  calculate()
  persistManual()
})
watch(() => [props.symbol, result.stockPrice], ([symbol, price]) => dcfStore.setWorkingPrice(symbol, price))
watch(() => dcfStore.workingPrice, (shared) => {
  if (shared.symbol === props.symbol && shared.value !== result.stockPrice) result.stockPrice = shared.value
})
onBeforeUnmount(() => dcfStore.releaseWorkingPrice(props.symbol))
watch(() => result.fairValue, () => {
  emit('change-result', result.reverseGrowthRate, dcfBasedOn.value)
})
watch(() => props.symbol, () => {
  inited.value = false
})

// The stock payload arrives after the route resolves, and the calculator mounts
// first, so seeding has to wait for it instead of reading an empty object.
const inited = ref(false)
const hasStock = computed(() => Boolean(stock.value && (stock.value.stockid || stock.value.symbol)))

const boot = async () => {
  if (inited.value || !hasStock.value) return
  if (display.converted && !display.asOf) display.loadRates()
  inited.value = true
  isLoading.value = true
  await initData()
  isLoading.value = false
}

onMounted(boot)
// The page unmounts the calculator while a symbol change loads, so one boot per
// instance is enough; this also covers a payload landing after mount.
watch(hasStock, (value) => { if (value) boot() })
</script>
