import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// One place for the two things every locale-aware display needs: the Intl code and
// the list separator. Chinese and English only; unknown locales count as English.
export function useLocale () {
  const { locale } = useI18n()
  const isZh = computed(() => String(locale.value).startsWith('zh'))
  const localeCode = computed(() => (isZh.value ? 'zh-CN' : 'en-US'))
  const listSeparator = computed(() => (isZh.value ? '、' : ', '))
  const clauseSeparator = computed(() => (isZh.value ? '，' : '; '))
  const pick = (zh, en) => (isZh.value ? zh : (en || zh))
  return { isZh, localeCode, listSeparator, clauseSeparator, pick }
}
