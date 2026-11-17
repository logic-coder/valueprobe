// Composition root: which sources exist, in what order, for this build.
//
// VITE_API_MODE=fixture  -> bundled snapshots only (offline demos, E2E)
// VITE_US_SOURCE -> auto | hybrid | edgar | eastmoney
import { ProviderRegistry } from './registry'
import { snapshot } from './providers/snapshot'
import { eastmoney } from './providers/eastmoney'
import { edgar } from './providers/edgar'
import { fixture } from './providers/fixture'

export const mode = import.meta.env.VITE_API_MODE || 'live'
export const usSource = import.meta.env.VITE_US_SOURCE || 'auto'

function providersFor () {
  if (mode === 'fixture') return [fixture]
  // VITE_SNAPSHOT=off drops the committed files while debugging a live feed.
  const snapshots = import.meta.env.VITE_SNAPSHOT === 'off' ? [] : [snapshot]
  // A published build (direct transport, or any non-dev build) reads only the
  // files generated on your machine. The browser never calls a quote host.
  const published = (import.meta.env.VITE_TRANSPORT || (import.meta.env.DEV ? 'proxy' : 'direct')) === 'direct'
  if (published) return snapshots
  switch (usSource) {
    case 'hybrid': return [eastmoney, edgar, ...snapshots]
    case 'edgar': return [edgar, eastmoney, ...snapshots]
    case 'eastmoney': return [eastmoney, ...snapshots]
    default: return [eastmoney, edgar, ...snapshots]
  }
}

const PROVIDER_LABELS = {
  snapshot: 'provider_snapshot',
  eastmoney: 'provider_eastmoney',
  edgar: 'provider_edgar',
  fixture: 'provider_fixture',
}

/** Human label for a provider id, so banners never show raw ids. */
export const providerLabel = (id) => PROVIDER_LABELS[id] || id

export const registry = new ProviderRegistry({ providers: providersFor() })
