<template>
  <div class="method" data-testid="method">
    <h1 class="method__title">{{ t('method_title') }}</h1>
    <p class="muted">{{ t('method_lead') }}</p>
    <p class="method__version muted">{{ t('policy_version_line', { version: summary.version }) }}</p>

    <section class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_what_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_what_body') }}</p>
        <p>{{ t('history_meaning') }}</p>
        <details><summary>{{ t('history_data_files') }}</summary>
          <p><a :href="researchBase + 'dia-2015.json'">{{ t('history_download') }}</a>
            · <a :href="researchBase + 'sector-holdout-2015.json'">{{ t('history_holdout') }}</a>
            · <a :href="researchBase + 'shareholder-claims.json'">{{ t('history_claims') }}</a>
            · <a :href="researchBase + 'cash-path-2006-2015.json'">{{ t('history_cash_data') }}</a></p>
        </details>
      </div>
    </section>

    <section class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_policy_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_policy_body') }}</p>
        <table class="method__table">
          <thead>
            <tr>
              <th scope="col">{{ t('method_item') }}</th>
              <th scope="col">{{ t('method_value') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in parameterRows" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td>
                <p v-for="line in row.values" :key="line" class="method__line">{{ line }}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_glossary_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_glossary_intro') }}</p>
        <table class="method__table">
          <thead>
            <tr>
              <th scope="col">{{ t('method_item') }}</th>
              <th scope="col">{{ t('method_meaning') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in glossaryRows" :key="row.term">
              <th scope="row">{{ row.term }}</th>
              <td>{{ row.desc }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_refuse_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_refuse_body') }}</p>
        <table class="method__table">
          <thead>
            <tr>
              <th scope="col">{{ t('method_meaning') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in reasonRows" :key="row.code">
              <td>{{ row.meaning }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_warn_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_warn_body') }}</p>
        <table class="method__table">
          <thead>
            <tr>
              <th scope="col">{{ t('method_meaning') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in warningRows" :key="row.code">
              <td>{{ row.meaning }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_data_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_data_body', { fundamentalsDays: summary.staleness.fundamentalsDays, ratesDays: summary.staleness.ratesDays }) }}</p>
        <div v-if="artifact" class="method__release">
          <h3 class="method__subtitle">{{ t('method_current_title') }}</h3>
          <p class="method__line">{{ t('method_generated_line', { generatedAt: artifact.generatedAt, version: artifact.policyVersion }) }}</p>
          <p class="method__line">{{ t('method_coverage_line', { valued: artifact.coverage.valued, refused: artifact.coverage.refused, total: artifact.universe.declared }) }}</p>
          <template v-if="reasonCounts.length">
            <h3 class="method__subtitle">{{ t('policy_refused_title') }}</h3>
            <p v-for="row in reasonCounts" :key="'reason-' + row.code" class="method__line">
              {{ t('reason_' + row.code) }} · {{ t('method_count', { count: row.count }) }}
            </p>
          </template>
          <template v-if="warningCounts.length">
            <h3 class="method__subtitle">{{ t('policy_warnings_title') }}</h3>
            <p v-for="row in warningCounts" :key="'warning-' + row.code" class="method__line">
              {{ t('warning_' + row.code) }} · {{ t('method_count', { count: row.count }) }}
            </p>
          </template>
          <h3 class="method__subtitle">{{ t('method_rates_title') }}</h3>
          <p class="method__line">{{ t('policy_as_of', { asOf: artifact.rates?.asOf || '' }) }}</p>
          <p v-for="row in rateRows" :key="row.code" class="method__line">
            {{ t('method_rate_line', { code: row.code, value: row.row.value, asOf: row.row.asOf, source: row.source }) }}
          </p>
        </div>
        <p v-else-if="loadFailed" class="muted">{{ t('method_artifact_unavailable') }}</p>
      </div>
    </section>

    <section v-if="crossRows.length" class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_cross_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_cross_lead') }}</p>
        <table class="method__table">
          <thead>
            <tr>
              <th scope="col">{{ t('method_cross_pair') }}</th>
              <th scope="col">{{ t('method_cross_eps') }}</th>
              <th scope="col">{{ t('method_cross_growth') }}</th>
              <th scope="col">{{ t('method_cross_book') }}</th>
              <th scope="col">{{ t('method_cross_rate') }}</th>
              <th scope="col">{{ t('method_cross_value') }}</th>
              <th scope="col">{{ t('method_cross_status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in crossRows" :key="row.id">
              <th scope="row">{{ row.a }}<br>{{ row.h }}</th>
              <td>{{ fmtPct(row.bridge.eps.diffPct) }}</td>
              <td>{{ fmtPp(row.bridge.growth.diffPp) }}</td>
              <td>{{ fmtPct(row.bridge.book.diffPct) }}</td>
              <td>{{ fmtPp(row.bridge.discountRate.diffPp) }}</td>
              <td>{{ fmtPct(row.valueDiffPct) }}</td>
              <td>
                <span>{{ t('method_cross_' + row.status.replace('-', '_')) }}</span>
                <span v-if="row.reasons.length" class="faint">{{ row.reasons.map((code) => t('method_cross_reason_' + code)).join(' · ') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="faint">{{ t('method_cross_note') }}</p>
      </div>
    </section>

    <section class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_repro_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_repro_body') }}</p>
        <p><a :href="dataBase + 'intrinsic/v2.json'">{{ t('method_download') }}</a>
          · <a :href="REPO_URL + '/blob/main/docs/POLICY.md'" target="_blank" rel="noreferrer">{{ t('method_repro_link') }}</a></p>
      </div>
    </section>

    <section class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_limit_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_limit_body') }}</p>
      </div>
    </section>

    <section class="panel method__block">
      <div class="panel__head"><span class="panel__title">{{ t('method_legal_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('method_legal_body') }}</p>
        <p class="muted">{{ t('disc_estimate') }}</p>
      </div>
    </section>

    <p><a href="#/">{{ t('method_back') }}</a></p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPolicyArtifact } from '../api/policy'
import { POLICY_V1, policySummary } from '../lib/policy'
import { REASON_CODES, WARNING_CODES } from '../lib/reasons'
import { REPO_URL } from '../config/site'

const researchBase = import.meta.env.BASE_URL + 'research/'
const dataBase = import.meta.env.BASE_URL + 'data/'

const { t } = useI18n()
// Values are read from the policy module, never copied into this component: a
// policy bump changes the tables without touching the page.
const summary = policySummary()
const bandSpread = POLICY_V1.band.discountSpread

const parameterRows = computed(() => [
  {
    label: t('method_models'),
    values: [t('method_rule_models', { owner: t('model_owner'), residual: t('model_residual') })],
  },
  {
    label: t('method_growth'),
    values: [t('method_rule_growth', { window: summary.growth.windowYears, cap: summary.growth.cap })],
  },
  {
    label: t('method_discount'),
    values: [
      t('method_rule_discount', { spread: summary.discount.spread }),
      t('method_rule_currency'),
      t('method_rule_hkd', { proxy: summary.discount.hkdProxy }),
      t('method_rule_fallback', { fallback: summary.discount.fallback }),
      t('method_rule_clamp', { min: summary.discount.min, max: summary.discount.max }),
    ],
  },
  {
    label: t('method_horizon'),
    values: [t('method_rule_horizon', {
      years: summary.horizon.years,
      terminalYears: summary.horizon.yearsOfTerminalGrowth,
      terminalGrowth: summary.horizon.terminalGrowthRate,
    })],
  },
  { label: t('method_band'), values: [t('method_rule_band', { spread: bandSpread })] },
  { label: t('method_price'), values: [t('method_rule_price', { days: summary.price.marginWarningDays })] },
])

const glossaryKeys = ['intrinsic', 'margin', 'discount', 'terminal', 'residual', 'policy', 'coverage', 'snapshot', 'scenario', 'published']
const glossaryRows = computed(() => glossaryKeys.map((key) => ({
  term: t('method_term_' + key),
  desc: t('method_desc_' + key),
})))

const reasonRows = computed(() => REASON_CODES.map((code) => ({ code, meaning: t('reason_' + code) })))
const warningRows = computed(() => WARNING_CODES.map((code) => ({ code, meaning: t('warning_' + code) })))

// Summary metadata comes from the same release as the individual values.
const artifact = ref(null)
const loadFailed = ref(false)
onMounted(async () => {
  artifact.value = await getPolicyArtifact()
  loadFailed.value = !artifact.value
})

const countRows = (rows) => Object.entries(rows || {}).map(([code, count]) => ({ code, count }))
const reasonCounts = computed(() => countRows(artifact.value?.coverage?.reasons))
const warningCounts = computed(() => countRows(artifact.value?.coverage?.warnings))
const crossRows = computed(() => artifact.value?.crossListing || [])
const fmtPct = (value) => value == null ? 'n/a' : (value > 0 ? '+' : '') + value.toFixed(2) + '%'
const fmtPp = (value) => value == null ? 'n/a' : (value > 0 ? '+' : '') + value.toFixed(2) + ' pp'
const rateRows = computed(() => ['CNY', 'USD', 'HKD']
  .map((code) => {
    const row = artifact.value?.rates?.[code]
    if (!row) return null
    const source = row.proxy ? t('method_rate_proxy') : t('method_rate_snapshot')
    return { code, row, source }
  })
  .filter(Boolean))
</script>

<style scoped>
.method { max-width: 720px; margin: 28px auto 60px; display: grid; gap: 16px; }
.method__title { font-size: 24px; }
.method__version { margin-top: -8px; }
.method__block { overflow: hidden; }
.method__line { margin: 0 0 4px; }
.method__line:last-child { margin-bottom: 0; }
.method .panel__body > p:last-child { margin-bottom: 0; }

.method__table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
.method__table th, .method__table td { padding: 6px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--border, #e5e7eb); }
.method__table thead th { font-weight: 600; color: var(--text-muted, #555); }
.method__subtitle { margin: 14px 0 4px; font-size: 13.5px; }
</style>
