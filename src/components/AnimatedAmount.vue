<template>
  <span class="animated-amount">{{ text }}</span>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { isNum } from '../lib/format'

const props = defineProps({
  value: { type: [Number, String], default: null },
  format: { type: Function, required: true },
})

const text = ref('')
let frame = 0
let displayed = null

const reduced = () => typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const paint = (value) => {
  text.value = props.format(value)
}

const stop = () => {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
}

const settle = (value) => {
  stop()
  displayed = isNum(value) ? Number(value) : null
  paint(displayed === null ? value : displayed)
}

// Later edits ease from the number on screen. The first figure, and any
// non-numeric state, appear immediately so a reader never sees a climb from zero.
const run = (start, end) => {
  stop()
  const duration = 420
  const began = performance.now()
  const step = (now) => {
    const t = Math.min(1, (now - began) / duration)
    const eased = 1 - (1 - t) ** 3
    displayed = start + (end - start) * eased
    paint(displayed)
    if (t < 1) frame = requestAnimationFrame(step)
    else {
      frame = 0
      displayed = end
      paint(end)
    }
  }
  frame = requestAnimationFrame(step)
}

watch(() => props.value, (next, prev) => {
  const nextNum = Number(next)
  const prevNum = Number(prev)
  if (!isNum(next) || !isNum(prev) || reduced()) {
    settle(next)
    return
  }
  run(displayed ?? prevNum, nextNum)
}, { immediate: true })

onBeforeUnmount(stop)
</script>

<style scoped>
.animated-amount { font-variant-numeric: tabular-nums; }
</style>
