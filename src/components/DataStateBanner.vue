<template>
  <div v-if="visible" class="data-banner" data-testid="data-banner" :class="bannerClass">
    <q-icon :name="icon" size="18px" />
    <span v-if="state === 'stale'" class="q-ml-sm">
      {{ t('banner_stale', { time: dataTime }) }}<template v-if="asOf"> · {{ t('banner_as_of', { asOf }) }}</template> ·
      <button class="banner-link" :disabled="busy || disabled" @click="$emit('retry')">{{ busy ? t('retrying') : t('retry') }}</button>
      <button class="banner-link" @click="$emit('manual')">{{ t('to_manual') }}</button>
    </span>
    <span v-else-if="state === 'error'" class="q-ml-sm">
      {{ t('banner_error') }} ·
      <button class="banner-link" :disabled="busy || disabled" @click="$emit('retry')">{{ busy ? t('retrying') : t('retry') }}</button>
      <button class="banner-link" @click="$emit('manual')">{{ t('to_manual') }}</button>
    </span>
    <span v-else-if="state === 'manual'" class="q-ml-sm">
      {{ t('banner_manual') }} ·
      <button class="banner-link" @click="$emit('live')">{{ t('to_live') }}</button>
    </span>
    <span v-else-if="published" class="q-ml-sm">{{ t('banner_published', { asOf }) }}</span>
    <span v-else class="q-ml-sm">
      {{ t('banner_fallback', { providers: providerText }) }}<template v-if="asOf"> · {{ t('banner_as_of', { asOf }) }}</template>
      <template v-if="skips.length">（{{ skipText }}）</template>
      ·
      <button class="banner-link" :disabled="busy || disabled" @click="$emit('retry')">{{ busy ? t('retrying') : t('retry_primary') }}</button>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from '../composables/useLocale'

const { t } = useI18n()
const { localeCode, clauseSeparator } = useLocale()
const props = defineProps({
  state: { type: String, default: 'live' },
  dataAt: { type: Number, default: 0 },
  fallback: { type: Boolean, default: false },
  providers: { type: Array, default: () => [] },
  skips: { type: Array, default: () => [] },
  asOf: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
defineEmits(['retry', 'manual', 'live'])

// Stay mounted while a retry is in flight: unmounting on the first successful
// response would pull the button out from under the pointer.
const published = computed(() => props.state === 'live' && !props.fallback && Boolean(props.asOf))
const visible = computed(() => props.busy || props.state !== 'live' || (props.fallback && props.providers.length > 0) || published.value)
const bannerClass = computed(() => {
  if (props.state === 'manual') return 'data-banner--manual'
  if (props.state === 'stale') return 'data-banner--stale'
  if (props.state === 'error') return 'data-banner--error'
  if (published.value) return 'data-banner--published'
  return 'data-banner--fallback'
})
const icon = computed(() => {
  if (props.state === 'manual') return 'edit'
  if (props.state === 'stale') return 'cloud_off'
  if (props.state === 'error') return 'error_outline'
  if (published.value) return 'event'
  return 'alt_route'
})
const stamp = computed(() => localeCode.value)
const dataTime = computed(() => (props.dataAt ? new Date(props.dataAt).toLocaleString(stamp.value, { hour12: false }) : t('banner_unknown_time')))
const providerText = computed(() => props.providers.map((id) => t('provider_' + id)).join(' + '))
const skipText = computed(() => props.skips.map((skip) => t('provider_' + (skip.providerId || '')) + ' ' + t('skip_' + (skip.reason || ''))).join(clauseSeparator.value))
</script>
