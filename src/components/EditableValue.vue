<template>
  <button type="button" class="edit-value" :aria-label="t('edit_value_label', { label, value: display })">
    <span class="edit-value__text">{{ display }}</span>
    <q-icon class="edit-value__icon" name="edit" />
    <q-popup-edit v-slot="scope" :model-value="modelValue" buttons :label-set="t('apply')" :label-cancel="t('cancel')" @update:model-value="emit('update:modelValue', $event)">
      <q-input
        v-model.number="scope.value"
        type="number"
        dense
        autofocus
        :label="t('edit_value_input', { label, currency })"
        @keyup.enter="scope.set"
      />
    </q-popup-edit>
  </button>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  modelValue: { type: [Number, String], default: null },
  display: { type: String, default: '' },
  label: { type: String, required: true },
  currency: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
</script>
