<template>
  <span class="a-popover" @mouseenter="open = true" @mouseleave="open = false" @click="toggle">
    <slot />
    <q-menu
      v-model="open"
      :anchor="anchor"
      self="bottom middle"
      :offset="[0, 8]"
      class="a-popover__card"
      :style="{ maxWidth: maxWidth }"
    >
      <div class="q-pa-sm text-body2"><slot name="content" /></div>
    </q-menu>
  </span>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ placement: { type: String, default: 'top' }, maxWidth: { type: String, default: '400px' } })
const open = ref(false)
const anchor = computed(() => (props.placement === 'top' ? 'bottom middle' : 'top middle'))
// A radio or button inside the trigger must receive the click. Toggling the
// menu from that same click opens a layer over the control, so the choice never lands.
const toggle = (event) => {
  if (event.target.closest('input, button, a, .q-radio, .q-checkbox, [role="radio"], [role="checkbox"]')) return
  open.value = !open.value
}
</script>

<style scoped>
.a-popover { display: inline-flex; align-items: center; }
.a-popover__card { max-width: 400px; }
</style>
