import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// A product string is only worth keeping if a screen can render it. Matching key
// sets between the two locales say nothing about that, so this file checks both:
// every key is present in both files, and every key is referenced from the render
// surface. Copy nobody renders still gets reviewed, translated and re-edited; the
// moment it drifts it also hides that it is gone.
const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const locales = ['zh-Hans', 'en-US']
const messages = Object.fromEntries(locales.map((name) => [name, JSON.parse(read('src/i18n/' + name + '.json'))]))

const surface = (() => {
  const files = [read('index.html')]
  const walk = (dir) => {
    for (const name of readdirSync(resolve(root, dir))) {
      const path = dir + '/' + name
      if (statSync(resolve(root, path)).isDirectory()) walk(path)
      else if (/\.(js|mjs|vue)$/.test(name) && !path.includes('/i18n/')) files.push(read(path))
    }
  }
  walk('src')
  return files.join('\n')
})()

// A name built at the call site (`t('warning_' + code)`) never appears literally;
// those prefixes are the contract that makes such a family valid.
const dynamicPrefixes = [
  ...[...surface.matchAll(/`([a-zA-Z0-9_]+)\$\{/g)].map((match) => match[1]),
  ...[...surface.matchAll(/'([a-zA-Z0-9_]+)'\s*\+/g)].map((match) => match[1]),
  ...[...surface.matchAll(/"([a-zA-Z0-9_]+)"\s*\+/g)].map((match) => match[1]),
]

describe('product locale files', () => {
  it('carry exactly the same keys in both locales', () => {
    expect(Object.keys(messages['en-US']).sort()).toEqual(Object.keys(messages['zh-Hans']).sort())
  })

  it('hold a non-empty string for every key', () => {
    for (const name of locales) {
      for (const [key, value] of Object.entries(messages[name])) {
        expect(typeof value, name + ' ' + key).toBe('string')
        expect(value.length, name + ' ' + key).toBeGreaterThan(0)
      }
    }
  })

  it('is referenced from the render surface', () => {
    const unused = Object.keys(messages['zh-Hans']).filter((key) =>
      !surface.includes(key) && !dynamicPrefixes.some((prefix) => key.startsWith(prefix)))
    expect(unused).toEqual([])
  })
})
