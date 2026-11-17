<template>
  <dcf-calculator
    :key="presetKey"
    :symbol="symbol"
    :preset="preset"
    @reload="emit('reload')"
  />
</template>

<script setup>
import DcfCalculator from '../DcfCalculator.vue'

defineProps({
  symbol: { type: String, required: true },
  preset: { type: Object, default: null },
  presetKey: { type: String, default: '' },
})
const emit = defineEmits(['reload'])
</script>
