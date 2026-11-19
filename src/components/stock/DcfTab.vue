<template>
  <dcf-calculator :symbol="symbol" @reload="emit('reload')" />
</template>

<script setup>
import DcfCalculator from '../DcfCalculator.vue'

defineProps({
  symbol: { type: String, required: true },
})
const emit = defineEmits(['reload'])
</script>
