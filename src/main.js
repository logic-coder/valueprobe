import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import {
  Quasar, Notify, Dialog as DialogPlugin,
  QBtn, QCard, QCardActions, QCardSection, QCheckbox, QDialog, QIcon, QInput,
  QItem, QItemLabel, QItemSection, QList, QMarkupTable, QMenu, QPopupEdit,
  QRadio, QRating, QSelect, QSeparator, QSkeleton, QSpace, QSpinnerDots, QTab, QTabs, QTooltip,
} from 'quasar'
import { createI18n } from 'vue-i18n'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/dist/quasar.css'
import App from './App.vue'
import router from './router'
import zhHans from './i18n/zh-Hans.json'
import legalMessages from './i18n/legal-messages'
import { readStored } from './lib/storage'
import enUS from './i18n/en-US.json'
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-600.css'
import '@fontsource/source-serif-4/latin-600.css'
import '@fontsource/source-serif-4/latin-700.css'
import './styles/theme.css'
import './styles/dcf.css'
import './styles/app-shell.css'
import './styles/components.css'

// First visit follows the browser language; an explicit switch is remembered after that.
const fallbackLocale = /^zh/i.test(navigator.language || '') ? 'zh-hans' : 'en-us'
const storedLocale = readStored('fv-locale')
const savedLocale = ['zh-hans', 'en-us'].includes(storedLocale) ? storedLocale : fallbackLocale

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'zh-hans',
  // Legal copy is merged last so one module owns the caveats that travel with a
  // published value; it only adds keys, it never overwrites a product string.
  messages: {
    'zh-hans': { ...zhHans, ...legalMessages['zh-hans'] },
    'en-us': { ...enUS, ...legalMessages['en-us'] },
  },
})

const components = {
  QBtn, QCard, QCardActions, QCardSection, QCheckbox, QDialog, QIcon, QInput,
  QItem, QItemLabel, QItemSection, QList, QMarkupTable, QMenu, QPopupEdit,
  QRadio, QRating, QSelect, QSeparator, QSkeleton, QSpace, QSpinnerDots, QTab, QTabs, QTooltip,
}

const app = createApp(App)
for (const [name, component] of Object.entries(components)) app.component(name, component)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(Quasar, { plugins: { Notify, Dialog: DialogPlugin }, config: {} })

// Quasar sets html[lang] during install. Keep it in sync with the interface locale.
const applyLang = (value) => {
  document.documentElement.lang = value === 'en-us' ? 'en' : 'zh-hans'
}
applyLang(savedLocale)
watch(i18n.global.locale, applyLang)
// Static builds get the offline shell; the dev server keeps its live modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  })
}
// A cached old shell can point at chunk hashes a new deploy already removed. Reload once
// with a marker (and drop it after a successful boot) so a later deploy can recover again.
const STALE_CHUNK_PARAM = '_r'
window.addEventListener('vite:preloadError', () => {
  const url = new URL(window.location.href)
  if (url.searchParams.has(STALE_CHUNK_PARAM)) return
  url.searchParams.set(STALE_CHUNK_PARAM, Date.now().toString(36))
  window.location.replace(url)
})

app.mount('#app')

const loadedWith = new URL(window.location.href)
if (loadedWith.searchParams.has(STALE_CHUNK_PARAM)) {
  loadedWith.searchParams.delete(STALE_CHUNK_PARAM)
  window.history.replaceState(window.history.state, '', loadedWith)
}
