import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { legalMessages } from '../../src/i18n/legal-messages'
import { REASON_CODES, WARNING_CODES } from '../../src/lib/reasons'

// The published value always travels with its caveats. This test keeps the legal
// copy complete in both locales (vue-i18n silently falls back when a key is
// missing), keeps the banned self-labels out, and keeps the README gate chain in
// step with package.json so the documented gates are the ones CI runs.
const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const locales = ['zh-hans', 'en-us']
const banned = ['官方', 'official', '公允价', 'fair value']

describe('legal messages', () => {
  it('ships both locales with exactly the same key set', () => {
    expect(Object.keys(legalMessages).sort()).toEqual(['en-us', 'zh-hans'])
    const zh = Object.keys(legalMessages['zh-hans']).sort()
    const en = Object.keys(legalMessages['en-us']).sort()
    expect(en).toEqual(zh)
    expect(zh.length).toBeGreaterThan(40)
  })

  it('translates every reason and warning code', () => {
    for (const locale of locales) {
      for (const code of REASON_CODES) {
        expect(legalMessages[locale]['reason_' + code], locale + ' reason_' + code).toBeTruthy()
      }
      for (const code of WARNING_CODES) {
        expect(legalMessages[locale]['warning_' + code], locale + ' warning_' + code).toBeTruthy()
      }
    }
  })

  it('never labels the product as official, 公允价 or fair value', () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(legalMessages[locale])) {
        expect(typeof value, locale + ' ' + key).toBe('string')
        expect(value.length, locale + ' ' + key).toBeGreaterThan(0)
        for (const word of banned) {
          expect(value.toLowerCase()).not.toContain(word.toLowerCase())
        }
      }
    }
  })

  it('uses the frozen product names', () => {
    expect(legalMessages['zh-hans'].method_term_intrinsic).toBe('内在价值')
    expect(legalMessages['zh-hans'].method_term_policy).toBe('公开口径')
    expect(legalMessages['en-us'].method_term_intrinsic).toBe('Intrinsic value')
    expect(legalMessages['en-us'].method_term_policy).toBe('Public policy')
    expect(legalMessages['zh-hans'].disc_estimate).toContain('非投资建议')
    expect(legalMessages['en-us'].disc_estimate.toLowerCase()).toContain('not investment advice')
  })
})

describe('README gates', () => {
  it('documents the same verify chain as package.json', () => {
    const pkg = JSON.parse(read('package.json'))
    const steps = [...pkg.scripts.verify.matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1])
    expect(steps).toEqual(['lint', 'test', 'test:real', 'verify:data', 'smoke:pages'])
    const readme = read('README.md')
    expect(readme).toContain(steps.join(' → '))
    let cursor = -1
    for (const step of steps) {
      const at = readme.indexOf(step, cursor + 1)
      expect(at, step).toBeGreaterThan(cursor)
      cursor = at
    }
  })

  it('documents the refresh scripts that exist in package.json', () => {
    const pkg = JSON.parse(read('package.json'))
    const readme = read('README.md')
    for (const name of ['snapshot', 'intrinsic', 'verify:data', 'refresh']) {
      expect(pkg.scripts[name], name).toBeTruthy()
      expect(readme, name).toContain('npm run ' + name)
    }
    expect(pkg.scripts.refresh).toBe('npm run snapshot && npm run intrinsic && npm run verify:data')
  })
})
