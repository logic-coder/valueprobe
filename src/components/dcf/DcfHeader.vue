<template>
  <div class="row items-center">
    <h3 class="text-body1 text-bold">{{ t('assumptions') }}</h3>
    <div class="q-ml-sm">
      <q-btn flat class="bg-indigo-1" :label="templateLabel" icon-right="arrow_drop_down">
        <q-menu fit auto-close>
          <q-list style="min-width: 100px">
            <q-item
              v-for="item in templates"
              :key="item.id"
              clickable
              @click="emit('select', item.id)"
            >
              <q-item-section>{{ item.name }}</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>
    <q-space />
    <span class="faint dcf__head-hint">{{ t('assumptions_hint') }}</span>
    <div>
      <q-btn flat dense class="dcf__share-btn" icon="link" :aria-label="t('share_link')" @click="emit('share')">
        <q-tooltip>{{ t('share_link') }}</q-tooltip>
      </q-btn>
      <q-btn flat class="text-primary" icon-right="more_vert" :aria-label="t('actions')">
        <q-menu fit auto-close>
          <q-list style="min-width: 100px">
            <q-item v-if="hasSelection" clickable @click="emit('action', 'delete')">
              <q-item-section>{{ t('delete_dcf_params') }}</q-item-section>
            </q-item>
            <q-item clickable @click="emit('action', 'save')">
              <q-item-section>{{ t('save_dcf_params') }}</q-item-section>
            </q-item>
            <q-item clickable @click="emit('select', 0)">
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
            <q-separator />
            <q-item clickable :disable="!templates.length" @click="emit('export')">
              <q-item-section>{{ t('export_templates') }}</q-item-section>
            </q-item>
            <q-item clickable @click="fileInput?.click()">
              <q-item-section>{{ t('import_templates') }}</q-item-section>
            </q-item>
            <input ref="fileInput" type="file" accept="application/json,.json" class="hidden-input" @change="onFile" />
          </q-list>
        </q-menu>
      </q-btn>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps({
  templateLabel: { type: String, default: '' },
  templates: { type: Array, default: () => [] },
  providers: { type: Array, default: () => [] },
  pinnedSource: { type: String, default: '' },
  hasSelection: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'share', 'action', 'pin', 'export', 'import'])
const { t } = useI18n()
const fileInput = ref(null)

const onFile = (event) => {
  emit('import', event)
  event.target.value = ''
}
</script>
