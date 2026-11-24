<template>
  <div class="dcf" data-testid="dcf">
    <q-card flat class="dcf__card panel">
      <div>
          <div class="dcf__strip-col">
          <div v-if="!resultLoading && publicationNotice" class="dcf__official-note" data-testid="official-unavailable">
            {{ publicationNotice }}
            <button v-if="industryTrialOnly && !trialActive && basisReady" type="button" class="wl__tool" @click="markAssumptionsEdited">
              {{ t('valuation_start_trial') }}
            </button>
          </div>
          <dcf-result-bar
            :loading="resultLoading"
            :stock="stock"
            :result="headline"
            :live-summary="liveSummary"
            :basis-line="showPublished ? basisLine : ''"
            :show-implied="!residualIncome"
            :official="showPublished"
            :official-context="officialContext"
            :trial-context="trialContext"
            :unavailable="!trialActive && !showPublished"
            :margin-label="marginLabel"
            :reverse-state="reverseState"
            :cash="showPublished ? policyEntry?.cash : null"
          />
          <button class="dcf__jump" type="button" :disabled="resultLoading" @click="focusAssumptions">
            {{ t('adjust_assumptions') }}
          </button>
          <margin-stress v-if="!resultLoading && stressRows" :rows="stressRows" :bank="policyEntry.inputs.model === 'residual'"
            :quote="moneyIn(stock.currency, stressQuote)" :custom="assumptionsEdited" :currency="stock.currency || '¥'"
            :expectation="priceExpectation" />
          <policy-provenance
            v-if="!resultLoading && policyEntry && !isManual"
            :entry="policyEntry"
            :currency="stock.currency || '¥'"
            :earnings-label="earningsDateLabel"
            :quote-label="quoteDateLabel"
            :show-explanation="showPublished"
          />
          </div>

        <q-card-section ref="assumptionsHead" class="dcf__head">
          <dcf-header
            :providers="providers"
            :pinned-source="pinnedSource || ''"
            @reset="resetToDefaults"
            @pin="pinSource"
          />
        </q-card-section>

          <div class="line-height-2 dcf__form">
            <div class="dcf__row">
              <span>{{ t(baseField === 'eps' ? 'earnings_per_share' : 'cash_per_share') }}</span>
              <span v-if="baseField === 'eps' && stock.eps_period === 'FY'" class="faint">{{ t('eps_period_fy') }}</span>
              <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
              <div v-else class="dcf__value">
                <editable-value v-model="form[baseField]" :display="money(stock.currency, form[baseField])"
                  :native="currencyCode" :label="t(baseField === 'eps' ? 'earnings_per_share' : 'cash_per_share')" :currency="currencyCode" />
              </div>
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
              </div>
            </div>
            <div v-if="!loading && rateNote" class="dcf__rate-note" data-testid="discount-currency-note">
              <q-icon name="info" size="14px" />
              {{ t(rateNote) }}
            </div>
            <div v-if="!loading && !basisReady" class="dcf__rate-note">{{ t('basis_unavailable') }}</div>
            <q-separator />

            <div class="dcf__row">
              <span>{{ t('initial_growth') }}</span>
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
            <q-separator />

            <scenario-bar :keys="scenarioKeys" :active="activeScenario" @pick="setScenario" @reset="resetScenario" />
            <div v-if="!loading && stock.predictability != null && stock.predictability <= 1" class="dcf__warn">
              <q-icon name="error" size="15px" />
              <span>{{ t('dcf_low_predictability_warning') }}</span>
            </div>
            <q-separator />
            <details class="dcf__advanced" data-testid="advanced-assumptions">
              <summary>{{ t('advanced_assumptions') }}</summary>
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
                <span v-if="classificationHint" class="dcf__scenario-note dcf__model-note">{{ classificationHint }}</span>
              </div>
              <!-- earnings basis -->
              <div class="dcf__row basis-row" role="radiogroup" :aria-label="t('earnings_basis')">
                <span class="basis-option">
                  <label class="basis-option__choice">
                    <q-radio v-model="dcfBasedOn" dense val="eps" :aria-label="t('eps')" />
                    {{ t('eps') }}
                    <span v-if="stock.eps_period === 'FY'" class="faint">{{ t('eps_period_fy') }}</span>
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
              </div>
              <div
                v-if="!loading && stock.cashflow_basis && (stock.cashflow_basis !== 'invest' || dcfBasedOn === 'freecashflow')"
                class="dcf__rate-note"
                data-testid="fcf-basis-note"
              >
                <q-icon v-if="stock.cashflow_basis === 'invest'" name="info" size="16px" />
                {{ stock.cashflow_basis === 'ocf' ? t('fcf_basis_ocf') : stock.cashflow_basis === 'none' ? t('fcf_basis_none') : stock.cashflow_basis === 'fcff' ? t('fcf_basis_fcff') : stock.cashflow_basis === 'invest' ? t('fcf_basis_invest') : t('fcf_basis_equity') }}
              </div>
              <div v-if="!loading && residualIncome" class="dcf__rate-note" data-testid="residual-income-note">{{ t('residual_income_note') }}</div>
              <q-separator />

              <!-- stock price: the header is the only editor; this line only echoes it -->
              <div class="dcf__row dcf__price-echo">
                <div class="text-left">{{ t('stock_price') }}</div>
                <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                <div v-else class="dcf__value" data-testid="price-echo">
                  {{ money(stock.currency, result.stockPrice) }}
                </div>
              </div>
              <div v-if="!loading && headerPriceHint" class="dcf__price-hint">{{ headerPriceHint }}</div>
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
                  <editable-value v-if="isManual" v-model="result.tbv" :display="money(stock.currency, result.tbv)" :native="currencyCode" :converted="convertedIn(stock.currency, result.tbv)" :label="t('book')" :currency="currencyCode" />
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
                    <strong v-else>{{ moneyIn(stock.currency, result.finiteTerminalValue) }}</strong>
                  </div>
                  <div v-if="!loading && result.continuationValue != null" class="stage-row stage-row--result">
                    <span>{{ t('continuation_value') }}</span>
                    <strong>{{ moneyIn(stock.currency, result.continuationValue) }}</strong>
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
              <q-btn flat dense size="sm" class="dcf__wacc-btn" icon="functions" :label="t('wacc')" :aria-label="t('wacc')" @click="openWacc" />
            </details>
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
            :long-run="residualIncome ? null : form.eps"
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
import { computed, reactive, ref, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useStockStore } from '../store/stock'
import { useDcfStore } from '../store/dcf'
import { usePolicyStore } from '../store/policy'
import { useDataStateStore } from '../store/dataState'
import { readManual, writeManual } from '../lib/manual'
import { adoptGrowth, officialGrowth } from '../lib/assumptions'
import { buildDefaults, impliedGrowth, marginOfSafety, presentValue, residualIncomeValue, valueBand } from '../lib/dcf'
import { REASON } from '../lib/reasons'
import { marginStress as calculateMarginStress } from '../lib/marginStress'
import MarginStress from './dcf/MarginStress.vue'
import { firmFreeCashFlow, suggestedModel, VALUATION_MODELS } from '../lib/valuationModel'
import { clamp, money, percent } from '../lib/format'
import { useMoney } from '../composables/useMoney'
import { codeOf } from '../store/display'
import { rateForCurrency, reportingCurrency } from '../lib/riskFree'
import { quoteDateStatus } from '../lib/policy'
import APopover from './APopover.vue'
import EditableValue from './EditableValue.vue'
import PolicyProvenance from './dcf/PolicyProvenance.vue'
import DcfHeader from './dcf/DcfHeader.vue'
import DcfResultBar from './dcf/DcfResultBar.vue'
import ScenarioBar from './dcf/ScenarioBar.vue'
import WaccDialog from './dcf/WaccDialog.vue'
import SensitivityPanel from './SensitivityPanel.vue'
import MultipleCheckPanel from './MultipleCheckPanel.vue'
import PeerComparePanel from './PeerComparePanel.vue'
import { buildSensitivityGrid } from '../lib/sensitivity'
import { peersFor } from '../lib/peers'
import { ERP_DEFAULT, buildUpRate } from '../lib/wacc'
import { applyScenario } from '../lib/scenarios'
import { useRouter } from 'vue-router'
import { providerLabel, registry } from '../data'
import { pinProvider, pinnedProvider } from '../data/preferences'

const { t } = useI18n()
const stockStore = useStockStore()
const dcfStore = useDcfStore()
const policyStore = usePolicyStore()
const sourceStore = useDataStateStore()
const props = defineProps({ symbol: { type: String, default: '' } })
const router = useRouter()
const { moneyIn, convertedIn, display } = useMoney()

const emit = defineEmits(['change', 'change-result', 'reload'])

const isLoading = ref(true)
const loading = computed(() => dcfStore.loading)
const resultLoading = computed(() => isLoading.value || loading.value)
const stock = computed(() => stockStore.stock || {
  symbol: props.symbol,
  currency: policyEntry.value?.inputs.currency,
})
const currencyCode = computed(() => codeOf(stock.value.currency) || stock.value.currency || '')

const financials = computed(() => dcfStore.financials.data)
const selectedRate = computed(() => rateForCurrency(dcfStore.rates.byCurrency, reportingCurrency(stock.value) || stock.value.currency))
const indicator = computed(() => selectedRate.value.value)
const rateNote = computed(() => {
  const info = selectedRate.value
  if (!info.value || info.source === 'fallback') return 'discount_fallback_note'
  if (info.source === 'usd_proxy') return 'discount_hkd_proxy_note'
  if (info.source === 'bundled' || info.source === 'snapshot') return 'rate_bundled_note'
  return null
})
const growthNote = computed(() => {
  const key = dcfBasedOn.value === 'eps' ? 'eps' : 'fcf'
  if (stock.value?.growth_refused?.[key] === 'short') return t('growth_refused_note')
  const span = stock.value?.growth_window?.[dcfBasedOn.value === 'eps' ? 'eps' : 'fcf']
  const window = span ? t('growth_window', span) : ''
  if (dcfBasedOn.value === 'eps') {
    const latest = Number(stock.value?.ttm_eps_nri ?? stock.value?.ttm_eps)
    const base = Number.isFinite(stock.value?.earnings_base) ? stock.value.earnings_base : latest
    const official = officialGrowth({
      growth10: stock.value?.earning_growth_10y,
      growth5: stock.value?.earning_growth_5y,
      hasPositiveBase: base > 0 && Number.isFinite(latest),
    })
    const adopted = form.growthRate
    if (official.reason === 'missing') return t('growth_missing_note')
    if (official.reason === 'zeroed') {
      const historical = official.historical10 ?? official.historical5
      return t('growth_zeroed_note', { historical, window, adopted })
    }
    if (official.reason === 'no-window') return t('growth_no_window_note', { adopted })
    if (official.reason === 'capped') {
      return t('growth_capped_note', { historical: official.historical10 ?? official.historical5, window, cap: official.cap, adopted })
    }
    return t('growth_adopted_note', { historical: official.historical10 ?? official.historical5, window, adopted })
  }
  const info = adoptGrowth(stock.value?.cashflow_growth_10y)
  const adopted = form.freecashflowGrowthRate
  if (info.reason === 'missing') return t('growth_missing_note')
  if (info.reason === 'capped') return t('growth_capped_note', { historical: info.historical, window, cap: info.adopted, adopted })
  return t('growth_adopted_note', { historical: info.historical, window, adopted })
})
const stageNote = computed(() => {
  const years = (Number(form.years) || 0) + (Number(form.yearsOfTerminalGrowth) || 0)
  const discount = Number(form.discountRate)
  const terminal = Number(form.terminalGrowthRate)
  const effective = result.effectiveTerminalGrowth
  if (Number.isFinite(discount) && Number.isFinite(terminal) && Number.isFinite(effective) && terminal - effective > 0.005) {
    return t('stage_cap_note', { effective: effective.toFixed(2) })
  }
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
const classificationHint = computed(() => {
  const record = stock.value
  if (!record) return ''
  if (record.industry) return t('industry_' + record.industry)
  return record.classification_basis === 'columns' ? t('classification_columns') : ''
})
const firmClaim = computed(() => firmFreeCashFlow(stock.value))
const model = ref('owner')
const policyEntry = computed(() => policyStore.entryOf(props.symbol))
const industryTrialOnly = computed(() => policyEntry.value?.reasons.includes(REASON.INDUSTRY_MODEL_PENDING))
const assumptionsEdited = ref(false)
const trialActive = computed(() => isManual.value || assumptionsEdited.value)
const showPublished = computed(() => !trialActive.value && policyEntry.value?.status === 'ok')
const defaultPrice = ref('')
const quoteEdited = computed(() => finiteOrNull(result.stockPrice) !== finiteOrNull(defaultPrice.value))
let seeding = false
const officialContext = computed(() => {
  const artifact = policyStore.metadataOf(props.symbol)
  const version = artifact?.policyVersion || ''
  const asOf = artifact?.generatedAt || ''
  return t('official_context', { version, asOf })
})
// The three assumptions that actually move the headline, stated on the result
// itself instead of hiding behind help icons. Readers should not need to open a
// popover to know what the published number is built from.
const basisLine = computed(() => {
  const i = policyEntry.value?.inputs
  if (!i || !Number.isFinite(Number(i.growth))) return ''
  return t('basis_line', {
    base: moneyIn(stock.value.currency, i.eps),
    growth: percent(i.growth),
    rate: percent(i.discountRate),
  })
})
const trialContext = computed(() => policyEntry.value && !isManual.value
  ? t('official_trial_context', { version: policyStore.metadataOf(props.symbol)?.policyVersion || '' })
  : t('valuation_trial_context'))
const officialReason = computed(() => (policyEntry.value?.reasons || []).map((code) => t('reason_' + code)).join('、') || t('policy_refused_title'))
const publicationNotice = computed(() => {
  if (isManual.value) return ''
  if (policyStore.errorOf(props.symbol)) return t('official_load_failed')
  if (!policyEntry.value) return t('official_outside')
  return policyEntry.value.status === 'ok' ? '' : t('official_unavailable', { reason: officialReason.value })
})
const priceStatus = computed(() => quoteDateStatus(policyEntry.value?.price, policyEntry.value?.priceDate))
const marginLabel = computed(() => {
  if (quoteEdited.value && !isManual.value && Number(result.stockPrice) > 0) return 'valuation_custom_margin'
  if (!quoteEdited.value && showPublished.value && ['historical', 'unknown'].includes(priceStatus.value)) return 'valuation_snapshot_margin'
  return 'margin_of_safety'
})
const earningsDateLabel = computed(() => {
  const entry = policyEntry.value
  if (!entry?.earningsDate) return t('valuation_earnings_unknown')
  return t(entry.earningsPeriod === 'FY' ? 'valuation_earnings_fy' : 'valuation_earnings_ttm', { date: entry.earningsDate })
})
const quoteDateLabel = computed(() => {
  const entry = policyEntry.value
  if (quoteEdited.value) return t(Number(result.stockPrice) > 0 ? 'valuation_custom_quote' : 'quote_missing')
  if (priceStatus.value === 'missing' || priceStatus.value === 'unknown') return t('quote_' + priceStatus.value)
  return t(priceStatus.value === 'historical' ? 'valuation_quote_historical' : 'valuation_quote_dated', { date: entry.priceDate })
})
const headerPriceHint = computed(() => t('price_edit_here'))
const residualIncome = computed(() => model.value === 'residual' && dcfBasedOn.value === 'eps')
const basisReady = computed(() => (dcfBasedOn.value === 'eps' ? Number(form.eps) : Number(form.freecashflow)) > 0)
const reverseState = computed(() => {
  if (!showPublished.value && !trialActive.value) return 'reverse_not_started'
  if (!basisReady.value || !(Number(result.stockPrice) > 0) || !(Number(form.years) > 0) ||
    finiteOrNull(form.discountRate) === null || finiteOrNull(form.terminalGrowthRate) === null) return 'reverse_missing_inputs'
  return headline.value.reverseGrowthRate == null ? 'reverse_no_solution' : ''
})
const assumptionsHead = ref(null)
const focusAssumptions = () => {
  const section = assumptionsHead.value?.$el
  section?.scrollIntoView({ block: 'start' })
  section?.querySelector('h3')?.focus({ preventScroll: true })
}

const dcfBasedOn = ref('eps')
const baseField = computed(() => dcfBasedOn.value === 'eps' ? 'eps' : 'freecashflow')
const form = reactive({
  eps: null, freecashflow: null, freecashflowGrowthRate: null, years: null,
  growthRate: null, terminalGrowthRate: null, yearsOfTerminalGrowth: null, discountRate: null,
})
const result = reactive({
  tbv: null, stockPrice: null, growthValue: null, terminalValue: null, finiteTerminalValue: null, continuationValue: null, reverseGrowthRate: null,
  marginOfSafety: null, addToFairValue: false, fairValue: null, fairLow: null, fairHigh: null,
})
const headline = computed(() => {
  if (showPublished.value) {
    const entry = policyEntry.value
    return {
      ...result,
      fairValue: entry.value,
      marginOfSafety: quoteEdited.value ? marginOfSafety(result.stockPrice, entry.value) : entry.marginOfSafety,
      fairLow: entry.band?.low ?? null,
      fairHigh: entry.band?.high ?? null,
    }
  }
  if (trialActive.value) return result
  return { fairValue: null, marginOfSafety: null, fairLow: null, fairHigh: null, reverseGrowthRate: null }
})
const stressQuote = computed(() => result.stockPrice)
const stressRows = computed(() => isManual.value
  ? null
  : calculateMarginStress(policyEntry.value, stressQuote.value))
const priceExpectation = computed(() => {
  const inputs = policyEntry.value?.inputs
  if (assumptionsEdited.value || !inputs || !(stressQuote.value > 0)) return ''
  if (inputs.model === 'residual' && inputs.tangibleBook > 0) {
    return t('stress_book', { multiple: (Number(stressQuote.value) / inputs.tangibleBook).toFixed(2) })
  }
  if (inputs.model !== 'owner' || headline.value.reverseGrowthRate == null) return ''
  return t('stress_implied', { growth: percent(headline.value.reverseGrowthRate), terminal: percent(inputs.terminalGrowthRate), years: inputs.years })
})
const hasPeers = computed(() => peersFor(props.symbol).length > 0)
// Recalculation is announced, but only after typing pauses: a live region that
// fires on every keystroke is noise, not feedback.
const liveSummary = ref('')
let announceTimer = 0
watch([() => headline.value.fairValue, () => headline.value.marginOfSafety], () => {
  window.clearTimeout(announceTimer)
  announceTimer = window.setTimeout(() => {
    liveSummary.value = t('live_result', {
      value: moneyIn(stock.value.currency, headline.value.fairValue),
      margin: percent(headline.value.marginOfSafety),
    })
  }, 300)
})
const openPeer = (symbol) => router.push('/stock/' + symbol + '/dcf')
const initData = async () => {
  seeding = true
  if (!isManual.value) await dcfStore.loadRates()
  const defaults = buildDefaults(isManual.value ? null : indicator.value, stock.value, freecashflow.value)
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
  // The published policy is the default source of truth for the headline. Its
  // frozen inputs seed a local calculation; edits below change only this page's
  // state and never write back to POLICY_V1 or the committed artifact.
  const published = isManual.value ? null : policyEntry.value
  if (published?.inputs) {
    const input = published.inputs
    model.value = input.model === 'residual' ? 'residual' : 'owner'
    dcfBasedOn.value = input.basis === 'freecashflow' ? 'freecashflow' : 'eps'
    form.eps = finiteOrNull(input.eps)
    form.growthRate = input.growth == null ? null : Number(input.growth)
    form.discountRate = Number(input.discountRate)
    form.terminalGrowthRate = Number(input.terminalGrowthRate)
    form.years = Number(input.years)
    form.yearsOfTerminalGrowth = Number(input.yearsOfTerminalGrowth)
    result.tbv = finiteOrNull(input.tangibleBook)
    result.addToFairValue = Boolean(input.addToFairValue)
    // Value and margin are a published pair at the artifact's own price/date.
    // Seeding the price too keeps the default headline internally coherent;
    // editing it later recomputes only this page's margin.
    result.stockPrice = published.price == null ? '' : String(published.price)
  } else {
    model.value = suggested.value
  }
  defaultPrice.value = result.stockPrice
  assumptionsEdited.value = false
  // The calculator always seeds from the public policy. The pasted-link preset
  // was removed together with the share surface (DEVIATIONS D37).
  if (!isManual.value) {
    if (freecashflow.value == null) form.freecashflow = null
  }
  activeScenario.value = 'base'
  calculate()
  await nextTick()
  baseAssumptions.value = snapshotAssumptions()
  seeding = false
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
    result.finiteTerminalValue = null
    result.continuationValue = null
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
    result.finiteTerminalValue = null
    result.continuationValue = null
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
    result.finiteTerminalValue = null
    result.continuationValue = null
    result.marginOfSafety = result.fairValue == null ? 'n/a' : marginOfSafety(result.stockPrice, result.fairValue)
    result.reverseGrowthRate = null
    return
  }
  const computedValues = presentValue(result.tbv, form.years, form.discountRate, growth, base, form.terminalGrowthRate, form.yearsOfTerminalGrowth, result.addToFairValue)
  result.fairValue = computedValues.fairValue
  result.growthValue = computedValues.growthValue
  result.terminalValue = computedValues.terminalValue
  result.finiteTerminalValue = computedValues.finiteTerminalValue
  result.continuationValue = computedValues.continuationValue
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
// Assignments made by a preset must not look like a manual edit: the watcher
// below only clears the highlight once this flag is down.
const applyingScenario = ref(false)
const growthField = () => (dcfBasedOn.value === 'eps' ? 'growthRate' : 'freecashflowGrowthRate')
const snapshotAssumptions = () => ({
  discountRate: Number(form.discountRate) || 0,
  growthRate: finiteOrNull(form[growthField()]),
  terminalGrowthRate: Number(form.terminalGrowthRate) || 0,
  field: growthField(),
})
const applyAssumptions = (assumptions) => {
  form.discountRate = assumptions.discountRate
  form[assumptions.field] = assumptions.growthRate
  form.terminalGrowthRate = assumptions.terminalGrowthRate
}
// Every preset is applied to the saved baseline, never to the current values,
// so repeatedly hopping bull -> bear cannot stack the deltas.
const setScenario = async (key) => {
  if (!baseAssumptions.value) baseAssumptions.value = snapshotAssumptions()
  const next = applyScenario(baseAssumptions.value, key)
  activeScenario.value = key
  applyingScenario.value = true
  form.discountRate = clamp(next.discountRate, 0, 50)
  form[baseAssumptions.value.field] = next.growthRate
  form.terminalGrowthRate = next.terminalGrowthRate
  await nextTick()
  applyingScenario.value = false
}
const resetScenario = async () => {
  if (!baseAssumptions.value) return
  applyingScenario.value = true
  applyAssumptions(baseAssumptions.value)
  activeScenario.value = 'base'
  await nextTick()
  applyingScenario.value = false
}
const markScenarioEdited = () => {
  if (!seeding) { activeScenario.value = 'custom' }
}
const rebase = async () => {
  applyingScenario.value = true
  activeScenario.value = 'base'
  baseAssumptions.value = null
  calculate()
  await nextTick()
  baseAssumptions.value = snapshotAssumptions()
  applyingScenario.value = false
}

// WACC build-up: fills the discount input; the kernel only ever sees the result.
const waccVisible = ref(false)
const wacc = reactive({ riskFree: 4, erp: ERP_DEFAULT, beta: 1, sizePremium: 0 })
const waccRate = computed(() => buildUpRate(wacc))
const openWacc = () => {
  const rf = Number(indicator.value)
  wacc.riskFree = Number.isFinite(rf) ? rf : Math.max(0, Number(form.discountRate) - 6)
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

const stepGrowth = (delta) => {
  const field = dcfBasedOn.value === 'eps' ? 'growthRate' : 'freecashflowGrowthRate'
  const current = finiteOrNull(form[field])
  if (current === null) return
  form[field] = current + delta
}
const incGrowthRate = () => stepGrowth(1)
const decGrowthRate = () => stepGrowth(-1)
// D2: the frozen kernel accepts any discount rate, so 0 or 80 produce -Infinity or
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

const markAssumptionsEdited = () => {
  if (seeding) return
  assumptionsEdited.value = true
}

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
  markAssumptionsEdited()
  if (!applyingScenario.value) markScenarioEdited()
}, { deep: true })
watch(model, () => {
  if (!seeding) rebase()
  calculate()
  markAssumptionsEdited()
})
watch(firmClaim, (blocked) => {
  if (blocked && dcfBasedOn.value === 'freecashflow') dcfBasedOn.value = 'eps'
})
watch(dcfBasedOn, () => {
  if (!seeding) rebase()
  calculate()
  markAssumptionsEdited()
})
watch(() => [result.tbv, result.addToFairValue], () => {
  calculate()
  persistManual()
  markAssumptionsEdited()
})
watch(() => result.stockPrice, () => {
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
const hasStock = computed(() => Boolean(stockStore.stock || policyEntry.value))

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

