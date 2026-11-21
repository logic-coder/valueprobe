<template>
  <div class="dcf__scenario">
    <span class="dcf__scenario-label">{{ t('scenario') }}</span>
    <div class="dcf__scenario-btns">
      <q-btn
        v-for="key in keys"
        :key="key"
        dense
        flat
        size="sm"
        padding="xs md"
        :class="{ 'is-active': active === key }"
        :label="t('scenario_' + key)"
        @click="emit(key === 'base' ? 'reset' : 'pick', key)"
      />
    </div>
    <span v-if="active === 'custom'" class="dcf__scenario-custom">{{ t('scenario_custom') }}</span>
    <span class="faint dcf__scenario-note">{{ t('scenario_note') }}</span>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  keys: { type: Array, required: true },
  active: { type: String, default: 'base' },
})
const emit = defineEmits(['pick', 'reset'])
const { t } = useI18n()
</script>
