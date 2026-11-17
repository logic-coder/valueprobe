<template>
  <section class="panel">
    <div class="panel__head">
      <span class="panel__title">{{ t('per_share_table') }}</span>
      <q-checkbox v-model="csvExtras" dense class="fin__extras" :label="t('csv_extras')" />
      <q-btn flat dense size="sm" class="fin__export" color="grey-7" icon="download" :label="t('export_csv')" @click="emit('export')" />
      <span class="faint">{{ t('click_row_hint') }}</span>
    </div>
    <financial-data :reverse="reverse" :type="type" @change="emit('change', $event)" />
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import FinancialData from '../FinancialData.vue'

defineProps({
  type: { type: String, default: 'eps' },
  reverse: { type: String, default: '...' },
})
const csvExtras = defineModel('csvExtras', { type: Boolean, default: true })
const emit = defineEmits(['export', 'change'])
const { t } = useI18n()
</script>
