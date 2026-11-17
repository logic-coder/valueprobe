<template>
  <q-dialog v-model="visible">
    <q-card style="min-width: 320px">
      <q-card-section>
        <div class="text-h6">{{ t('wacc') }}</div>
        <div class="text-caption faint q-mb-sm">{{ t('wacc_desc') }}</div>
        <q-input v-model.number="wacc.riskFree" dense outlined type="number" :label="t('risk_free')" class="q-mb-sm" />
        <q-input v-model.number="wacc.erp" dense outlined type="number" :label="t('erp')" class="q-mb-sm" />
        <q-input v-model.number="wacc.beta" dense outlined type="number" :label="t('beta')" class="q-mb-sm" />
        <q-input v-model.number="wacc.sizePremium" dense outlined type="number" :label="t('size_premium')" />
        <div class="row items-center q-mt-md">
          <span class="text-subtitle2">{{ t('wacc_result') }}</span>
          <q-space />
          <span class="text-h6 button-font-weight">{{ rate === null ? 'n/a' : rate + '%' }}</span>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat :label="t('cancel')" @click="visible = false" />
        <q-btn color="primary" unelevated :label="t('apply')" :disable="rate === null" @click="emit('apply')" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const visible = defineModel('visible', { type: Boolean, default: false })
const wacc = defineModel('wacc', { type: Object, required: true })
defineProps({
  rate: { type: Number, default: null },
})
const emit = defineEmits(['apply'])
const { t } = useI18n()
</script>
