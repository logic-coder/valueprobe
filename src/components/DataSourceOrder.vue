<template>
  <div class="ds-order">
    <p class="muted">{{ t('ds_order_hint') }}</p>
    <ol class="ds-order__list">
      <li v-for="(id, index) in order" :key="id">
        <span class="ds-order__label">{{ label(id) }}</span>
        <span class="ds-order__hint">{{ hint(id) }}</span>
        <button type="button" :disabled="index === 0" :aria-label="t('ds_order_up')" @click="move(index, -1)">↑</button>
        <button type="button" :disabled="index === order.length - 1" :aria-label="t('ds_order_down')" @click="move(index, 1)">↓</button>
      </li>
    </ol>
    <button type="button" class="ds-order__reset" @click="reset">{{ t('ds_order_reset') }}</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { providerLabel, registry } from '../data'
import { readPreferences, resetPreferences, setOrder } from '../data/preferences'

const CAPABILITY_HINT = {
  eastmoney: 'source_hint_eastmoney',
  edgar: 'source_hint_edgar',
  snapshot: 'source_hint_snapshot',
  fixture: 'source_hint_fixture',
}
const known = registry.providers.map((provider) => provider.id)
const { t } = useI18n()
const label = (id) => t(providerLabel(id))
const hint = (id) => (CAPABILITY_HINT[id] ? t(CAPABILITY_HINT[id]) : '')

const merged = () => {
  const saved = readPreferences().order.filter((id) => known.includes(id))
  return [...new Set([...saved, ...known])]
}
const order = ref(merged())

const move = (index, delta) => {
  const next = order.value.slice()
  const target = index + delta
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  order.value = next
  setOrder(next)
}

const reset = () => {
  resetPreferences()
  order.value = merged()
}
</script>

<style scoped>
.ds-order { display: grid; gap: 10px; }
.ds-order__list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.ds-order__list li { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); }
.ds-order__label { font-weight: 600; }
.ds-order__hint { color: var(--text-faint); font-size: 11.5px; margin-right: auto; }
.ds-order__list button { width: 26px; height: 24px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-muted); cursor: pointer; }
.ds-order__list button:disabled { opacity: 0.4; cursor: default; }
.ds-order__reset { justify-self: start; font-size: 12px; color: var(--text-muted); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
</style>
