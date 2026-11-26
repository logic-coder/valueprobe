<template>
  <div v-if="usable" class="dcf__track" :data-testid="testid">
    <div class="dcf__track-bar">
      <div
        v-if="origin != null && offOrigin"
        class="dcf__tick"
        :style="{ left: position(origin) }"
      >
        <div class="dcf__tick-stem" />
        <div class="dcf__tick-label">{{ label }}</div>
      </div>
      <div
        v-if="current != null"
        class="dcf__pip"
        :class="{ 'is-off': offOrigin }"
        :style="{ left: position(current) }"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  current: { type: Number, default: null },
  origin: { type: Number, default: null },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  label: { type: String, default: '' },
  testid: { type: String, default: 'assumption-track' },
})

const usable = computed(() => Number.isFinite(props.min) && Number.isFinite(props.max) && props.max > props.min)
const offOrigin = computed(() => (
  props.current != null && props.origin != null && Number.isFinite(props.current) && Number.isFinite(props.origin)
    && Math.abs(props.current - props.origin) > 1e-9
))
const position = (value) => {
  const span = props.max - props.min
  const pct = ((Number(value) - props.min) / span) * 100
  return Math.min(100, Math.max(0, pct)).toFixed(3) + '%'
}
</script>
