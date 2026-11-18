<template>
  <div class="row items-center">
    <h3 class="text-body1 text-bold">{{ t('assumptions') }}</h3>
    <q-space />
    <span class="faint dcf__head-hint">{{ t('assumptions_hint') }}</span>
    <div>
      <q-btn flat dense class="dcf__share-btn" icon="link" :aria-label="t('share_link')" @click="emit('share')">
        <q-tooltip>{{ t('share_link') }}</q-tooltip>
      </q-btn>
      <q-btn flat class="text-primary" icon-right="more_vert" :aria-label="t('actions')">
        <q-menu fit auto-close>
          <q-list style="min-width: 100px">
            <q-item clickable @click="emit('reset')">
              <q-item-section>{{ t('set_to_default_dcf') }}</q-item-section>
            </q-item>
            <q-separator />
            <q-item-label header class="text-caption">{{ t('pin_source') }}</q-item-label>
            <q-item clickable @click="emit('pin', '')">
              <q-item-section>{{ t('auto_source') }}</q-item-section>
              <q-item-section side v-if="!pinnedSource"><q-icon name="check" size="16px" /></q-item-section>
            </q-item>
            <q-item v-for="provider in providers" :key="provider.id" clickable @click="emit('pin', provider.id)">
              <q-item-section>{{ provider.label }}</q-item-section>
              <q-item-section side v-if="pinnedSource === provider.id"><q-icon name="check" size="16px" /></q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  providers: { type: Array, default: () => [] },
  pinnedSource: { type: String, default: '' },
})
const emit = defineEmits(['share', 'reset', 'pin'])
const { t } = useI18n()
</script>
