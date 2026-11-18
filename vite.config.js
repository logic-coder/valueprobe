import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const here = fileURLToPath(new URL('.', import.meta.url))
// Pages answers unknown paths with 404.html; the app is hash-routed, so the shell is
// all a stale or hand-typed deep link needs.
const pagesFallback = () => ({
  name: 'pages-404-fallback',
  apply: 'build',
  closeBundle () {
    const out = resolve(here, 'dist')
    copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'))
  },
})

// Canonical/OG URLs need an absolute origin on a static host; VITE_SITE_URL carries it
// from the deploy workflow, and the base path is a working fallback for local/forks.
const siteUrl = () => ({
  name: 'site-url',
  // Pre: the default build-html pass decodeURI()s hrefs, which trips over an
  // invalid percent token. Plain __SITE_URL__ is inert until this replaces it.
  transformIndexHtml: {
    order: 'pre',
    handler (html) {
      const url = (process.env.VITE_SITE_URL || process.env.VITE_BASE || '/').replace(/\/?$/, '/')
      return html.split('__SITE_URL__').join(url)
    },
  },
})

const EDGAR_UA = 'valueprobe/1.0 (open-source research; contact: logic159@163.com)'
// Keys are anchored. Vite keeps the first prefix that matches, and a short key
// is a prefix of a longer one: `/sec` was swallowing `/secdata`, so companyfacts
// landed on www.sec.gov and came back as a Drupal 404. The same trap sits on
// `/em` (`/emhis`, `/emf10`, `/emdc`) and `/fx` (`/fxer`).
const proxy = {
  '^/secdata/': {
    target: 'https://data.sec.gov',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/secdata/, ''),
    headers: { 'User-Agent': EDGAR_UA, 'Accept-Encoding': 'gzip, deflate' },
  },
  '^/sec/': {
    target: 'https://www.sec.gov',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/sec/, ''),
    headers: { 'User-Agent': EDGAR_UA, 'Accept-Encoding': 'gzip, deflate' },
  },
  '^/emhis/': {
    target: 'https://push2his.eastmoney.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/emhis/, ''),
    headers: { 'User-Agent': EDGAR_UA },
  },
  '^/emf10/': {
    target: 'https://emweb.securities.eastmoney.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/emf10/, ''),
    headers: { 'User-Agent': EDGAR_UA, Referer: 'https://emweb.securities.eastmoney.com/' },
  },
  '^/emdcweb/': {
    target: 'https://datacenter-web.eastmoney.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/emdcweb/, ''),
    headers: { 'User-Agent': EDGAR_UA, Referer: 'https://data.eastmoney.com/' },
  },
  '^/emdc/': {
    target: 'https://datacenter.eastmoney.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/emdc/, ''),
    headers: { 'User-Agent': EDGAR_UA, Referer: 'https://emweb.securities.eastmoney.com/' },
  },
  '^/em/': {
    target: 'https://push2.eastmoney.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/em/, ''),
    headers: { 'User-Agent': EDGAR_UA },
  },
  '^/fxer/': {
    target: 'https://open.er-api.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/fxer/, ''),
    headers: { 'User-Agent': EDGAR_UA },
  },
  '^/fx/': {
    target: 'https://api.frankfurter.dev',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/fx/, ''),
    headers: { 'User-Agent': EDGAR_UA },
  },
}

export default defineConfig({
  // GitHub Pages project sites live under /<repo>/; VITE_BASE carries that.
  base: process.env.VITE_BASE || '/',
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'font' } } }), pagesFallback(), siteUrl()],
  esbuild: false,
  server: { host: '127.0.0.1', port: 5173, proxy },
  preview: { host: '127.0.0.1', port: 4173, proxy },
  build: {
    target: 'esnext',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        // Charts and the component kit are stable vendors; keep them out of the page chunk.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return
          if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
          if (id.includes('quasar')) return 'quasar'
        },
      },
    },
  },
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.js'] },
})
