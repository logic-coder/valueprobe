<template>
  <div class="row items-center q-gutter-xs q-mb-xs price-chart-dates">
    <q-btn
      v-for="item in dates"
      :key="item"
      size="sm"
      dense
      flat
      :outline="item === activeKey"
      :color="item === activeKey ? 'primary' : 'grey-8'"
      :label="labelOf(item)"
      @click="changeDate(item)"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RANGE_KEYS, RANGE_LABELS, rangeDate } from '../lib/ranges'

const props = defineProps({
  value: { type: [String, Number, Date], default: '' },
  range: { type: String, default: '' },
  dates: { type: Array, default: () => RANGE_KEYS },
})
const emit = defineEmits(['on-change'])

const labelOf = (key) => RANGE_LABELS[key] || key
const activeKey = computed(() => {
  if (props.range) return props.range
  const current = props.value instanceof Date ? props.value : new Date(props.value || Date.now())
  return RANGE_KEYS.find((key) => {
    const target = new Date(rangeDate(key))
    return current.getFullYear() === target.getFullYear() && current.getMonth() === target.getMonth()
  }) || ''
})
const changeDate = (key) => emit('on-change', { key, value: new Date(rangeDate(key)) })
</script>
