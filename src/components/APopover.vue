<template>
  <span class="a-popover" @mouseenter="open = true" @click="toggle">
    <slot />
    <q-menu
      v-model="open"
      hover
      :anchor="anchor"
      :self="self"
      :offset="[0, 8]"
      class="a-popover__card"
      :max-width="maxWidth || undefined"
    >
      <slot name="content" />
    </q-menu>
  </span>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ placement: { type: String, default: 'top' }, maxWidth: { type: String, default: '' } })
const open = ref(false)
const above = computed(() => !String(props.placement).startsWith('bottom'))
// Anchor an edge to an edge. Pairing two "middle" origins makes Quasar's
// CSS anchor path set left and right to 0, which stretches the card across
// the column and drops it on top of the icon.
const anchor = computed(() => (above.value ? 'top left' : 'bottom left'))
const self = computed(() => (above.value ? 'bottom left' : 'top left'))
// A radio or button inside the trigger must receive the click. Toggling the
// menu from that same click opens a layer over the control, so the choice never lands.
const toggle = (event) => {
  if (event.target.closest('input, button, a, .q-radio, .q-checkbox, [role="radio"], [role="checkbox"]')) return
  open.value = !open.value
}
</script>

<style scoped>
.a-popover { display: inline-flex; align-items: center; cursor: help; }
</style>
