<template>
  <div ref="root" class="lazy-chart">
    <component :is="chart" v-if="show" v-bind="$attrs" />
  </div>
</template>

<script setup>
// ECharts is a third of the page chunk; the chart panel is usually below the fold on
// the DCF tab, so the component (and its echarts imports) only mount when it gets near.
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'

defineOptions({ inheritAttrs: false })
const chart = defineAsyncComponent(() => import('./FinancialChart.vue'))
const root = ref(null)
const show = ref(false)
let observer = null

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    show.value = true
    return
  }
  observer = new IntersectionObserver((entries) => {
    // The first callback can fire before layout with a 0x0 rect; wait for a measured one.
    if (!entries.some((entry) => entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0 && entry.isIntersecting)) return
    show.value = true
    observer?.disconnect()
    observer = null
  }, { rootMargin: '300px' })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<style scoped>
.lazy-chart { min-height: 220px; }
</style>
