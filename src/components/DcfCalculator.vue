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
            @archive="archiveCurrent"
            @export="exportReport"
            @history="archiveVisible = true"
          />

          <div class="line-height-2 dcf__form">
            <scenario-bar :keys="scenarioKeys" :active="activeScenario" @pick="setScenario" @reset="resetScenario" />
            <!-- stock price -->
            <div class="row bg-indigo-1 q-px-sm q-py-xs items-center text-subtitle2 dcf__row">
              <div class="text-left">{{ t('stock_price') }}</div>
              <q-space />
              <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
              <div v-else class="button-font-weight text-center">
                {{ money(stock.currency, result.stockPrice) }}&nbsp;&nbsp;
                <q-icon class="text-grey-7" name="edit" />
                <q-popup-edit v-model="result.stockPrice" buttons>
                  <q-input v-model.number="result.stockPrice" type="number" dense autofocus />
                </q-popup-edit>
              </div>
            </div>
            <q-separator />

            <!-- earnings basis -->
            <div class="row text-caption q-px-sm q-py-xs basis-row" role="radiogroup" :aria-label="t('earnings_basis')">
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
                  <q-radio v-model="dcfBasedOn" dense val="freecashflow" :aria-label="t('total_freecashflow')" />
                  {{ t('total_freecashflow') }}
                </label>
                <a-popover placement="top">
                  <q-icon class="text-grey-7" name="help" />
                  <template #content>{{ t('total_freecashflow_desc') }}</template>
                </a-popover>
              </span>
              <q-space />
              <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
              <div v-else-if="dcfBasedOn === 'eps'" class="line-height-2 text-right">
                {{ money(stock.currency, form.eps) }}&nbsp;&nbsp;
                <template v-if="isManual">
                  <q-icon class="text-grey-7" name="edit" />
                  <q-popup-edit v-model="form.eps" buttons>
                    <q-input v-model.number="form.eps" type="number" dense autofocus />
                  </q-popup-edit>
                </template>
              </div>
              <div v-else class="line-height-2 text-right">
                <font>
                  {{ money(stock.currency, form.freecashflow) }}&nbsp;&nbsp;
                  <template v-if="isManual">
                    <q-icon class="text-grey-7" name="edit" />
                    <q-popup-edit v-model="form.freecashflow" buttons>
                      <q-input v-model.number="form.freecashflow" type="number" dense autofocus />
                    </q-popup-edit>
                  </template>
                </font>
              </div>
            </div>
            <div v-if="!loading && stock.cashflow_basis" class="dcf__rate-note">
              {{ stock.cashflow_basis === 'ocf' ? t('fcf_basis_ocf') : stock.cashflow_basis === 'fcff' ? t('fcf_basis_fcff') : t('fcf_basis_equity') }}
            </div>
            <q-separator />

            <div class="dcf__rate-note">
              <q-icon name="info" size="14px" />
              {{ t('fundamentals_readonly') }}
            </div>
            <q-separator />

            <!-- discount rate -->
            <div class="row text-caption q-px-sm q-py-xs">
              <div class="line-height-2 text-left text-subtitle2">
                <a-popover placement="top">
                  <font>{{ t('discount_rate') }} <q-icon class="text-grey-7" name="help" /></font>
                  <template #content>{{ t('discount_rate_desc') }}</template>
                </a-popover>
              </div>
              <q-space />
              <q-btn class="bg-indigo-1" square size="sm" flat dense icon="remove" style="border-radius: 0" :aria-label="t('decrease')" @click="form.discountRate--" />
              <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
              <input v-else v-model="form.discountRate" class="input-section" data-testid="field-discount" :aria-label="t('discount_rate')" outlined @change="clampDiscount" />
              <q-btn class="bg-indigo-1" square size="sm" flat dense icon="add" style="border-radius: 0" :aria-label="t('increase')" @click="form.discountRate++" />
              <q-btn flat dense size="sm" class="dcf__wacc-btn" icon="functions" :label="t('wacc')" :aria-label="t('wacc')" @click="openWacc" />
            </div>
            <div v-if="!loading" class="dcf__rate-note">
              <q-icon name="info" size="14px" />
              {{ rateSource === 'cache' ? t('rate_cached_note') : rateSource === 'live' ? t('rate_live_note') : t('rate_bundled_note') }}
            </div>
            <div v-if="!loading && result.reverseGrowthRate == null" class="dcf__rate-note">{{ t('reverse_unavailable') }}</div>
            <div v-else-if="!loading" class="dcf__rate-note" data-testid="reverse-growth">
              {{ t('rdcf_growth') }} {{ percent(result.reverseGrowthRate) }}
            </div>
            <q-separator />

            <!-- tangible book value -->
            <div class="row line-height-2 q-px-sm q-py-xs text-subtitle2">
              <div class="text-left">
                <a-popover placement="top">
                  <font>
                    {{ t('book') }}
                    <q-icon class="text-grey-7" name="help" />
                  </font>
                  <template #content>{{ t('book_desc') }}</template>
                </a-popover>
              </div>
              <label class="dcf__toggle">
                <q-checkbox v-model="result.addToFairValue" size="xs" :aria-label="t('add_to_fair_value')" />
                {{ t('add_to_fair_value') }}
              </label>
              <div v-if="result.addToFairValue" class="dcf__rate-note">{{ t('tbv_double_count_note') }}</div>
              <q-space />
              <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
              <div v-else class="text-right">
                {{ moneyIn(stock.currency, result.tbv) }}&nbsp;&nbsp;
                <template v-if="isManual">
                  <q-icon class="text-grey-7" name="edit" />
                  <q-popup-edit v-model="result.tbv" buttons>
                    <q-input v-model.number="result.tbv" type="number" dense autofocus />
                  </q-popup-edit>
                </template>
              </div>
            </div>
            <q-separator />

            <div class="row text-center text-caption">
              <!-- fast growth window -->
              <div class="col-6 line-height-2">
                <div class="q-mr-xs q-px-sm q-py-xs stage-panel">
                  <a-popover placement="top">
                    <font>
                      <h5 class="text-subtitle2 text-bold">
                        {{ t('dcf_growth_in_the_next') }}
                        <q-icon class="text-grey-7" name="help" />
                      </h5>
                    </font>
                    <template #content>{{ t('dcf_growth_in_the_next_desc') }}</template>
                  </a-popover>
                  <div class="row q-pt-xs items-center">
                    <div class="text-left col-4 text-subtitle2">{{ t('dcf_years') }}</div>
                    <div>
                      <q-btn class="bg-indigo-1" square size="sm" flat dense icon="remove" style="border-radius: 0" :aria-label="t('decrease')" @click="form.years > 0 ? form.years-- : (form.years = 0)" />
                      <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                      <input v-else v-model="form.years" class="input-section" data-testid="field-growth-years" :aria-label="t('growth_year_in_the_next')" type="number" outlined />
                      <q-btn class="bg-indigo-1" square size="sm" flat dense icon="add" style="border-radius: 0" :aria-label="t('increase')" @click="form.years++" />
                    </div>
                  </div>
                </div>
                <q-separator />
                <div class="row q-pt-xs items-center">
                  <div class="text-left col-4 text-subtitle2">{{ t('growth_rate') }}</div>
                  <div>
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
                <div v-if="!loading && growthNote" class="dcf__rate-note">{{ growthNote }}</div>
                <q-separator />
                <div class="q-pt-xs row">
                  <div class="text-subtitle2 text-left">{{ t('growth_in_the_next_fair_value') }}</div>
                  <q-space />
                  <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                  <div v-else class="text-subtitle2 text-bold">
                    {{ moneyIn(stock.currency, result.growthValue) }}
                  </div>
                </div>
              </div>

              <!-- terminal value window -->
              <div class="col-6 line-height-2">
                <div class="q-ml-xs q-px-sm q-py-xs stage-panel">
                  <a-popover placement="top">
                    <font>
                      <h5 class="text-subtitle2 text-bold">
                        {{ t('dcf_terminal') }}
                        <q-icon class="text-grey-7" name="help" />
                      </h5>
                    </font>
                    <template #content>{{ t('dcf_terminal_desc') }}</template>
                  </a-popover>
                  <div class="row q-pt-xs items-center">
                    <div class="text-left col-4 text-subtitle2">{{ t('dcf_years') }}</div>
                    <div>
                      <q-btn class="bg-indigo-1" square size="sm" flat dense icon="remove" style="border-radius: 0" :aria-label="t('decrease')" @click="decTerminalYears" />
                      <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                      <input v-else v-model="form.yearsOfTerminalGrowth" class="input-section" :aria-label="t('years_of_terminal_growth')" type="number" outlined />
                      <q-btn class="bg-indigo-1" square size="sm" flat dense icon="add" style="border-radius: 0" :aria-label="t('increase')" @click="form.yearsOfTerminalGrowth++" />
                    </div>
                  </div>
                  <q-separator />
                  <div class="row q-pt-xs items-center">
                    <div class="text-left col-4 text-subtitle2">{{ t('growth_rate') }}</div>
                    <div>
                      <q-btn class="bg-indigo-1 vertical-top" square size="sm" flat dense icon="remove" style="border-radius: 0" :aria-label="t('decrease')" @click="form.terminalGrowthRate--" />
                      <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                      <input v-else v-model="form.terminalGrowthRate" class="input-section" type="number" :aria-label="t('terminal_growth_rate')" outlined />
                      <q-btn class="bg-indigo-1 vertical-top" square size="sm" flat dense icon="add" style="border-radius: 0" :aria-label="t('increase')" @click="form.terminalGrowthRate++" />
                    </div>
                  </div>
                  <div v-if="!loading" class="dcf__rate-note">{{ stageNote }}</div>
                  <q-separator />
                  <div class="row q-pt-xs">
                    <div class="text-subtitle2 text-left">{{ t('terminal_fair_value') }}</div>
                    <q-space />
                    <q-skeleton v-if="loading" type="rect" height="15px" width="50px" />
                    <div v-else class="text-subtitle2 text-bold">
                      {{ moneyIn(stock.currency, result.terminalValue) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <q-separator />

            <!-- business predictability -->
            <div class="row text-caption q-px-sm q-py-xs">
              <div class="col-6 text-left text-subtitle2">
                <a-popover placement="top">
                  <font>{{ t('business_predictability') }} <q-icon class="text-grey-7" name="help" /></font>
                  <template #content>{{ t('business_predictability_desc') }}</template>
                </a-popover>
              </div>
              <div class="col-6 text-center">
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
            <div v-if="!loading && stock.predictability <= 1" class="dcf__warn">
              <q-icon name="error" size="15px" />
              <span>{{ t('dcf_low_predictability_warning') }}</span>
            </div>
            <q-separator />
            <div v-if="display.converted" class="text-caption faint q-px-sm q-py-xs">
              {{ t('converted_note', { currency: display.currency, native: stock.currency || '' }) }}
            </div>
            <div class="row items-center q-py-xs text-caption q-gutter-sm dcf__actions">
              <q-btn flat dense size="sm" color="primary" icon="bookmark_add" :label="t('record_this_valuation')" @click="archiveCurrent" />
              <q-input
                v-model.number="archiveShares"
                class="archive-shares"
                dense
                outlined
                type="number"
                :min="0"
                :label="t('shares')"
                style="width: 104px"
              />
              <q-space />
              <q-btn flat dense size="sm" class="dcf__export" color="grey-7" icon="download" :label="t('export_report')" @click="exportReport" />
              <q-btn flat dense size="sm" color="grey-7" icon="history" :label="t('valuation_history')" @click="archiveVisible = true" />
            </div>
          </div>

          <sensitivity-panel
            v-if="!loading"
            class="dcf__sens"
            :grid="sensitivityGrid"
            :currency="stock.currency || '¥'"
            :price="result.stockPrice"
          />

          <div class="dcf__evidence">
          <multiple-check-panel
            v-if="!loading"
            class="dcf__mcheck"
            :bases="{ eps: form.eps, freecashflow: form.freecashflow, tbv: result.tbv }"
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
            @rows="onPeerRows"
          />
          </div>
      </div>
    </q-card>

    <div class="dcf__table">
      <slot name="financial-data" />
    </div>

    <valuation-record-panel
      v-model="archiveVisible"
      :symbol="props.symbol"
      :native-currency="stock.currency || '¥'"
      :tick="archiveTick"
      @changed="archiveTick += 1"
    />

    <wacc-dialog v-model:visible="waccVisible" v-model:wacc="wacc" :rate="waccRate" @apply="applyWacc" />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useStockStore } from '../store/stock'
import { useDcfStore } from '../store/dcf'
import { useDataStateStore } from '../store/dataState'
import { readManual, writeManual } from '../lib/manual'
import { pushValuation } from '../lib/archive'
import ValuationRecordPanel from './ValuationRecordPanel.vue'
import { adoptGrowth } from '../lib/assumptions'
import { buildDefaults, impliedGrowth, marginOfSafety, presentValue } from '../lib/dcf'
import { clamp, money, percent } from '../lib/format'
import { useMoney } from '../composables/useMoney'
import APopover from './APopover.vue'
import DcfHeader from './dcf/DcfHeader.vue'
import DcfResultBar from './dcf/DcfResultBar.vue'
import ScenarioBar from './dcf/ScenarioBar.vue'
import WaccDialog from './dcf/WaccDialog.vue'
import SensitivityPanel from './SensitivityPanel.vue'
import MultipleCheckPanel from './MultipleCheckPanel.vue'
import PeerComparePanel from './PeerComparePanel.vue'
import { buildSensitivityGrid } from '../lib/sensitivity'
import { peersFor } from '../lib/peers'
import { buildReport, reportFilename } from '../lib/report'
import { decodeState, encodeState, isPresetEmpty } from '../lib/permalink'
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

const financials = computed(() => dcfStore.financials.data)
const indicator = computed(() => dcfStore.indicator.indicator)
const rateSource = computed(() => dcfStore.indicator.source)
const growthNote = computed(() => {
  const historicalField = dcfBasedOn.value === 'eps' ? 'earning_growth_10y' : 'cashflow_growth_10y'
  const info = adoptGrowth(stock.value?.[historicalField])
  const adopted = dcfBasedOn.value === 'eps' ? form.growthRate : form.freecashflowGrowthRate
  if (info.reason === 'missing') return t('growth_missing_note', { adopted })
  return t('growth_adopted_note', { historical: info.historical, adopted })
})
const stageNote = computed(() => {
  const years = (Number(form.years) || 0) + (Number(form.yearsOfTerminalGrowth) || 0)
  const discount = Number(form.discountRate)
  const terminal = Number(form.terminalGrowthRate)
  if (Number.isFinite(discount) && Number.isFinite(terminal) && terminal >= discount) return t('stage_rate_note')
  return t('stage_horizon_note', { years })
})
const isManual = computed(() => sourceStore.stateOf(props.symbol) === 'manual')
const freecashflow = computed(() => {
  if (isManual.value) return Number(stock.value.free_cash_flow_per_share) || 0
  const ttm = financials.value?.ttm
  return ttm && ttm.length ? ttm[ttm.length - 1].free_cash_flow_per_share : 0
})

const dcfBasedOn = ref('eps')
const form = reactive({
  eps: null, freecashflow: null, freecashflowGrowthRate: null, years: null,
  growthRate: null, terminalGrowthRate: null, yearsOfTerminalGrowth: null, discountRate: null,
})
const result = reactive({
  tbv: null, stockPrice: null, growthValue: null, terminalValue: null, reverseGrowthRate: null,
  marginOfSafety: null, addToFairValue: false, fairValue: null,
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
const peerRows = ref([])
const peerMedian = ref(null)
const onPeerRows = (payload) => {
  peerRows.value = payload.rows
  peerMedian.value = payload
}

// The report is a snapshot of what is on screen; it never re-runs the kernel.
const exportReport = () => {
  const meta = sourceStore.metaOf(props.symbol)
  const peers = rowList(peerRows.value, peerMedian.value)
  const text = buildReport({
    symbol: props.symbol,
    company: stock.value.company,
    currency: stock.value.currency || '¥',
    price: result.stockPrice,
    basis: dcfBasedOn.value,
    form,
    result,
    grid: sensitivityGrid.value,
    peers,
    meta: { source: (meta.providers || []).join(' + '), asOf: meta.asOf || '' },
  })
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = reportFilename(props.symbol)
  link.click()
  URL.revokeObjectURL(url)
  $q.notify({ message: t('export_done'), icon: 'download', color: 'positive', timeout: 1600 })
}

// Markdown wants the median as a property of the list, not a second argument.
const rowList = (rows, figure) => {
  const list = rows.slice()
  if (figure) {
    list.medianPe = figure.medianPe
    list.implied = figure.implied
  }
  return list
}
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
  if (!isPresetEmpty(preset)) {
    if (preset.basis) dcfBasedOn.value = preset.basis
    Object.assign(form, preset.form)
    Object.assign(result, preset.result)
    if (preset.tbvIn !== undefined) result.addToFairValue = preset.tbvIn
  }
  calculate()
}

// The router owns the hash, so resolve the route into a path and graft its hash
// onto the current URL — that keeps the deployment base path intact.
const shareUrl = () => {
  const query = encodeState(form, result, dcfBasedOn.value, seed.value || {})
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
  const computedValues = dcfBasedOn.value === 'eps'
    ? presentValue(result.tbv, form.years, form.discountRate, form.growthRate, form.eps, form.terminalGrowthRate, form.yearsOfTerminalGrowth, result.addToFairValue)
    : presentValue(result.tbv, form.years, form.discountRate, form.freecashflowGrowthRate, form.freecashflow, form.terminalGrowthRate, form.yearsOfTerminalGrowth, result.addToFairValue)
  result.fairValue = computedValues.fairValue
  result.growthValue = computedValues.growthValue
  result.terminalValue = computedValues.terminalValue
  result.marginOfSafety = marginOfSafety(result.stockPrice, result.fairValue)
  const args = [
    result.tbv, form.years, form.discountRate,
    dcfBasedOn.value === 'eps' ? form.eps : form.freecashflow,
    result.stockPrice, form.terminalGrowthRate, result.stockPrice,
    form.yearsOfTerminalGrowth, result.addToFairValue,
  ]
  const implied = impliedGrowth(...args)
  result.reverseGrowthRate = implied
}

// SENS: five by five neighbours of the current rate/growth pair, all through the kernel.
const sensitivityGrid = computed(() => buildSensitivityGrid({
  discountRate: form.discountRate,
  growthRate: dcfBasedOn.value === 'eps' ? form.growthRate : form.freecashflowGrowthRate,
  tbv: result.tbv,
  years: form.years,
  base: dcfBasedOn.value === 'eps' ? form.eps : form.freecashflow,
  terminalGrowthRate: form.terminalGrowthRate,
  yearsOfTerminalGrowth: form.yearsOfTerminalGrowth,
  addToFairValue: result.addToFairValue,
}))

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
  growthRate: Number(form[growthField()]) || 0,
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

const archiveVisible = ref(false)
const archiveTick = ref(0)
const archiveShares = ref(0)
const archiveCurrent = () => {
  pushValuation(props.symbol, {
    basis: dcfBasedOn.value,
    shares: Number(archiveShares.value) || 0,
    stockPrice: result.stockPrice,
    fairValue: result.fairValue,
    marginOfSafety: result.marginOfSafety,
    eps: form.eps,
    freecashflow: form.freecashflow,
    growthRate: form.growthRate,
    freecashflowGrowthRate: form.freecashflowGrowthRate,
    discountRate: form.discountRate,
    tbv: result.tbv,
  })
  archiveTick.value += 1
  $q.notify({ message: t('valuation_recorded') })
  archiveVisible.value = true
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
}, { deep: true })
watch(() => ({ ...result }), () => {
  calculate()
  emit('change-result', result.reverseGrowthRate, dcfBasedOn.value)
  persistManual()
}, { deep: true })
watch(dcfBasedOn, () => calculate())
watch(() => props.symbol, () => {
  inited.value = false
  archiveTick.value += 1
  archiveShares.value = 0
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
