import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
  {
    path: '/stock/:symbol/dcf',
    name: 'stock-dcf',
    component: () => import('./pages/StockDcfPage.vue'),
  },
  {
    path: '/stock/:symbol/:tab',
    redirect: (to) => ({
      name: 'stock-dcf',
      params: { symbol: to.params.symbol },
      query: to.query,
    }),
  },
  { path: '/watchlist', name: 'watchlist', component: () => import('./pages/WatchlistPage.vue') },
  { path: '/compare', name: 'compare', component: () => import('./pages/ComparePage.vue') },
  { path: '/about', name: 'about', component: () => import('./pages/AboutPage.vue') },
  { path: '/method', name: 'method', component: () => import('./pages/MethodPage.vue') },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./pages/StockNotFoundPage.vue'),
  },
]

// Hash history: GitHub Pages (and a plain file:// open) need no rewrite rules.
export default createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    // Tab switches share one page component; only jump to top for a new symbol/page.
    if (to.path.split('/').slice(0, 3).join('/') === from.path.split('/').slice(0, 3).join('/')) return {}
    return { top: 0 }
  },
})
