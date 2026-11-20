import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { legalMessages } from '../../src/i18n/legal-messages'
import { REASON_CODES, WARNING_CODES } from '../../src/lib/reasons'

// The published value always travels with its caveats. This test keeps the legal
// copy complete in both locales (vue-i18n silently falls back when a key is
// missing), keeps the banned self-labels out of every disclosure (with the one
// deliberate product-title exception below), and keeps the README gate chain in
// step with package.json so the documented gates are the ones CI runs.
const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const locales = ['zh-hans', 'en-us']
const banned = ['官方', 'official', '公允价', 'fair value']
// The product title is the one intentional exception: ValueProbe now names its
// published number "ValueProbe 公允价 / ValueProbe fair value". Every disclaimer
// and disclosure string stays on the banned-word guard.
const titleKeys = new Set(['official_title'])

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
          if (titleKeys.has(key)) continue
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
    expect(pkg.scripts.refresh).toBe('npm run snapshot && npm run verify:data')
  })
})

describe('free-cash-flow basis note', () => {
  const sources = [
    'src/i18n/zh-Hans.json',
    'src/i18n/en-US.json',
    'docs/CALCULATION.md',
  ]

  it('does not promise a drill-down that the page does not implement', () => {
    for (const path of sources) {
      const text = read(path).toLowerCase()
      expect(text, path).not.toContain('点开查看')
      expect(text, path).not.toContain('you can inspect it')
    }
  })

  it('gates the invest warning on the free-cash-flow basis', () => {
    const source = read('src/components/DcfCalculator.vue')
    const note = source.slice(source.indexOf('data-testid="fcf-basis-note"') - 400, source.indexOf('data-testid="fcf-basis-note"'))
    expect(note).toContain("dcfBasedOn === 'freecashflow'")
    expect(note).not.toContain('name="warning"')
  })
})

describe('single price editor', () => {
  it('keeps the header as the only editable price on the stock page', () => {
    const source = read('src/components/DcfCalculator.vue')
    const form = source.slice(source.indexOf('<div class="line-height-2 dcf__form">'))
    expect(form).not.toContain('v-model="result.stockPrice"')
    expect(form).toContain('data-testid="price-echo"')
    expect(form).toContain('headerPriceHint')
  })

  it('uses distinct labels for snapshot date and publish date', () => {
    expect(legalMessages['zh-hans'].official_context).toContain('发布日')
    expect(legalMessages['en-us'].official_context).toContain('published')
    expect(read('src/i18n/zh-Hans.json')).toContain('"banner_published": "季度快照 · 采集日 {asOf}"')
    expect(read('src/i18n/en-US.json')).toContain('"banner_published": "Quarterly snapshot · captured {asOf}"')
  })

  it('does not repeat the read-only fundamentals note inside the calculator', () => {
    expect(read('src/components/DcfCalculator.vue')).not.toContain('fundamentals_readonly')
    expect(read('src/i18n/zh-Hans.json')).not.toContain('fundamentals_readonly')
    expect(read('src/i18n/en-US.json')).not.toContain('fundamentals_readonly')
  })
})
