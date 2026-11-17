<template>
  <span>{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({ field: { type: Object, required: true }, stock: { type: Object, default: null } })
const { locale } = useI18n()
const label = computed(() => (locale.value === 'en-us' ? props.field.display_name_en : props.field.display_name))
</script>
