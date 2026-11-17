import { describe, expect, it } from 'vitest'
import { Transport, toQuery } from '../../src/data/transport'

const provider = { id: 'demo', origin: 'https://api.example.com', corsSafe: false, proxyPath: '/demo' }
const safe = { ...provider, corsSafe: true }
const gateway = 'https://gw.example.com/raw?url={url}'

describe('transport', () => {
  it('passes through the proxy path in proxy mode', () => {
    const t = new Transport({ mode: 'proxy', gateway })
    expect(t.url(provider, '/quote', { secid: '1:601398' })).toBe('/demo/quote?secid=1%3A601398')
  })

  it('calls a CORS-safe host directly with its query', () => {
    const t = new Transport({ mode: 'direct', gateway })
    expect(t.url(safe, '/quote', { a: 1 })).toBe('https://api.example.com/quote?a=1')
  })

  it('folds the target query into the encoded gateway URL', () => {
    const t = new Transport({ mode: 'direct', gateway })
    const url = t.url(provider, '/quote', { secid: '105:AAPL', fields: 'f43,f57' })
    expect(url.startsWith('https://gw.example.com/raw?url=')).toBe(true)
    expect(url).not.toContain('&secid=')
    const inner = decodeURIComponent(url.split('url=')[1])
    expect(inner).toBe('https://api.example.com/quote?secid=105%3AAAPL&fields=f43%2Cf57')
  })

  it('skips a non-CORS host when no gateway is configured', () => {
    const t = new Transport({ mode: 'direct', gateway: '' })
    expect(() => t.url(provider, '/quote')).toThrowError(/CORS 网关/)
  })

  it('drops empty query values and keeps the path bare', () => {
    expect(toQuery({ a: '', b: null, c: 0, d: undefined })).toBe('?c=0')
    const t = new Transport({ mode: 'direct', gateway })
    expect(t.url(safe, '/quote', { a: '' })).toBe('https://api.example.com/quote')
  })
})
