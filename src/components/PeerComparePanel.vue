<template>
  <section ref="root" class="peers" data-testid="peers">
    <div class="peers__head">
      <a-popover placement="top">
        <h4 class="peers__title">
          {{ t('peer_compare') }}
          <q-icon class="faint" name="help" size="14px" />
        </h4>
        <template #content>{{ t('peer_compare_hint') }}</template>
      </a-popover>
      <span class="faint">{{ t('peer_compare_note') }}</span>
    </div>

    <table class="peers__table">
      <thead>
        <tr>
          <th scope="col">{{ t('peer_company') }}</th>
          <th scope="col">{{ t('stock_price') }}</th>
          <th scope="col">P/E</th>
          <th scope="col">P/BV</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="4" class="peers__empty">{{ t('loading') }}</td>
        </tr>
        <tr v-else-if="failed">
          <td colspan="4" class="peers__empty">{{ t('peer_unavailable') }}</td>
        </tr>
        <tr v-for="row in rows" v-else :key="row.symbol">
          <th scope="row">
            <button class="peers__link" type="button" @click="emit('open', row.symbol)">{{ row.name }}</button>
          </th>
          <td>{{ row.price === null ? 'n/a' : moneyIn(currency, row.price) }}</td>
          <td>{{ row.pe === null ? 'n/a' : row.pe.toFixed(1) + '×' }}</td>
          <td>{{ row.pb === null ? 'n/a' : row.pb.toFixed(2) + '×' }}</td>
        </tr>
      </tbody>
      <tfoot v-if="!loading && summary.medianPe !== null">
        <tr>
          <th scope="row">{{ t('peer_median') }}</th>
          <td>—</td>
          <td>{{ summary.medianPe.toFixed(1) }}×</td>
          <td>{{ summary.medianPb === null ? 'n/a' : summary.medianPb.toFixed(2) + '×' }}</td>
        </tr>
      </tfoot>
    </table>

    <p v-if="!loading && summary.implied !== null" class="faint peers__verdict">
      {{ t('peer_implied', { price: moneyIn(currency, summary.implied), gap: gapText }) }}
    </p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api'
import { peerRow, peerSummary, peersFor } from '../lib/peers'
import { useMoney } from '../composables/useMoney'
import APopover from './APopover.vue'

const props = defineProps({
  symbol: { type: String, required: true },
  basisValue: { type: [Number, String], default: 0 },
  fairValue: { type: [Number, String], default: 0 },
  currency: { type: String, default: '¥' },
})
const emit = defineEmits(['open', 'rows'])

const { t } = useI18n()
const { moneyIn } = useMoney()

const rows = ref([])
const loading = ref(true)
const failed = ref(false)
const list = computed(() => peersFor(props.symbol))
const root = ref(null)
const requested = new Set()
let observer = null

// Peers barely move between viewings, so a session cache keeps a return visit from
// spending four more requests; an uncached symbol still fetches exactly once.
const cache = new Map()

const apply = (built) => {
  rows.value = built
  failed.value = built.every((row) => row.price === null)
  emit('rows', { rows: built, medianPe: summary.value.medianPe, implied: summary.value.implied })
  loading.value = false
}

// Peers are optional evidence: one dead symbol must not empty the table, so each
// request settles on its own and a blank cell is an honest answer.
const load = async () => {
  if (!list.value.length) return
  const symbol = props.symbol
  if (requested.has(symbol)) return
  requested.add(symbol)
  const saved = cache.get(symbol)
  if (saved) {
    apply(saved)
    return
  }
  loading.value = true
  failed.value = false
  // Peers are a cross-check, not the valuation. A missing file stays blank
  // instead of waiting on a quote host the browser cannot reach.
  const results = await Promise.allSettled(list.value.map((peer) => api.getStock(peer, { snapshotOnly: true })))
  const built = results.map((item, index) => (item.status === 'fulfilled' && item.value
    ? peerRow(item.value, list.value[index])
    : { symbol: list.value[index], name: list.value[index], price: null, pe: null, pb: null }))
  cache.set(symbol, built)
  // A symbol switch while the requests were in flight must not paint the old rows.
  if (props.symbol === symbol) apply(built)
}

const summary = computed(() => peerSummary(rows.value, props.basisValue, props.fairValue))
const gapText = computed(() => {
  const gap = summary.value.gap
  if (gap === null) return 'n/a'
  const pct = (100 * gap).toFixed(1)
  return (gap > 0 ? '+' : '') + pct + '%'
})

// Quoting four peers costs eight requests; on the landing page that is a lot to
// spend before the reader scrolls, so the panel waits until it is near the viewport.
let viewing = false
const start = () => {
  observer?.disconnect()
  observer = null
  load()
}

watch(() => props.symbol, () => {
  requested.clear()
  if (viewing) load()
})
onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    viewing = true
    load()
    return
  }
  const nearViewport = () => {
    const rect = root.value?.getBoundingClientRect()
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return false
    return rect.top < window.innerHeight + 200 && rect.bottom > -200
  }
  let settle = 0
  observer = new IntersectionObserver(() => {
    // Layout below the fold arrives late (the financial table, the chart).
    // A panel that only passes through the margin during that reflow must not
    // spend four quotes. Wait until the position has stayed near the viewport.
    window.clearTimeout(settle)
    settle = window.setTimeout(() => {
      if (!nearViewport()) return
      viewing = true
      start()
    }, 300)
  }, { rootMargin: '200px' })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => { observer?.disconnect() })
</script>
