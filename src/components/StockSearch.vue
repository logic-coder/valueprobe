<template>
  <div class="symbol-search" data-testid="symbol-input" @focusout="onFocusOut">
    <q-input
      ref="input"
      v-model="query"
      dense
      borderless
      clearable
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="shown && suggestions.length > 0"
      :aria-controls="shown && suggestions.length ? 'stock-search-results' : undefined"
      :aria-activedescendant="shown && active >= 0 ? optionId(active) : undefined"
      :placeholder="t('search_for_your_stocks')"
      :aria-label="t('search_for_stock')"
      @focus="onFocus"
      @click="shown = true"
      @keydown="onKey"
    >
      <template #append>
        <button class="symbol-search__submit" type="button" :aria-label="t('search_for_stock')" @click="submit">
          <q-icon name="search" aria-hidden="true" />
        </button>
      </template>
    </q-input>

    <div v-if="shown" class="symbol-search__panel">
      <ul v-if="suggestions.length" id="stock-search-results" role="listbox" :aria-label="t('stock_search_results')">
        <li v-for="(stock, index) in suggestions" :id="optionId(index)" :key="stock.symbol"
          role="option" tabindex="-1" :aria-selected="index === active"
          @mousedown.prevent @click="openStock(stock.symbol)">
          <span class="symbol-search__name">{{ stock.name }}</span>
          <span class="symbol-search__code">{{ stock.symbol.split(':').reverse().join(' · ') }}</span>
        </li>
      </ul>
      <p v-if="message || !suggestions.length" role="status" class="symbol-search__status">
        {{ t(message || (loading ? 'stock_search_loading' : catalog ? 'stock_search_missing' : 'stock_search_unavailable')) }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCatalog } from '../api/catalog'
import { normalizeSearch, resolveSearch, searchStocks } from '../lib/symbolInput'

const emit = defineEmits(['select'])
const { t } = useI18n()
const examples = [
  { symbol: 'SHSE:601398', name: '工商银行' },
  { symbol: 'HKSE:00700', name: '腾讯控股' },
  { symbol: 'HKSE:00941', name: '中国移动' },
  { symbol: 'NASDAQ:AAPL', name: '苹果' },
]
const input = ref(null)
const query = ref('')
const catalog = ref(null)
const loading = ref(false)
const shown = ref(false)
const active = ref(-1)
const message = ref('')
const needle = computed(() => normalizeSearch(query.value))
const matches = computed(() => searchStocks(catalog.value ?? examples, needle.value))
const suggestions = computed(() => needle.value ? matches.value.slice(0, 10).map(result => result.stock) : examples)
const optionId = index => 'stock-search-result-' + index

async function loadCatalog () {
  if (catalog.value) return
  loading.value = true
  const rows = await getCatalog()
  if (rows) catalog.value = rows
  loading.value = false
}

function onFocus () {
  shown.value = true
  loadCatalog()
}

function close () {
  shown.value = false
  active.value = -1
  message.value = ''
}

function onFocusOut (event) {
  if (!event.currentTarget.contains(event.relatedTarget)) close()
}

function openStock (symbol) {
  query.value = ''
  close()
  input.value?.blur()
  emit('select', symbol)
}

async function submit () {
  shown.value = true
  if (!needle.value) {
    input.value?.focus()
    return
  }
  if (active.value >= 0 && suggestions.value[active.value]) {
    openStock(suggestions.value[active.value].symbol)
    return
  }
  const submitted = needle.value
  if (!catalog.value) await loadCatalog()
  if (needle.value !== submitted || !shown.value) return
  const result = resolveSearch(matches.value, submitted)
  if (result.symbol) openStock(result.symbol)
  else if (result.ambiguous) message.value = 'stock_search_choose'
  else if (result.invalid) message.value = 'symbol_format_hint'
  else if (catalog.value) message.value = 'stock_search_missing'
  else message.value = 'stock_search_unavailable'
}

function onKey (event) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Escape' && shown.value) {
    event.preventDefault()
    close()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    submit()
  } else if (['ArrowDown', 'ArrowUp'].includes(event.key) && suggestions.value.length) {
    event.preventDefault()
    shown.value = true
    const count = suggestions.value.length
    const move = event.key === 'ArrowDown' ? 1 : -1
    active.value = active.value === -1 && move < 0 ? count - 1 : (active.value + move + count) % count
  }
}

watch(query, () => {
  active.value = -1
  message.value = ''
  shown.value = true
}, { flush: 'sync' })
watch(catalog, () => { active.value = -1 })
watch(active, index => {
  if (index >= 0) document.getElementById(optionId(index))?.scrollIntoView({ block: 'nearest' })
}, { flush: 'post' })

defineExpose({ focus: () => input.value?.focus() })
onMounted(loadCatalog)
</script>
