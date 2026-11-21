import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The pre-upload gate only runs in CI, so pin its wiring here.
const workflow = readFileSync('.github/workflows/pages.yml', 'utf8').replace(/\r\n/g, '\n')
const spec = readFileSync('tests/e2e/upload-gate.spec.js', 'utf8')

describe('pre-upload browser gate', () => {
  it('runs before the Pages artifact upload and only off pull requests', () => {
    const gate = workflow.indexOf('npm run test:e2e:upload')
    const upload = workflow.indexOf('upload-pages-artifact')
    expect(gate).toBeGreaterThan(-1)
    expect(upload).toBeGreaterThan(gate)
    expect(workflow).toMatch(/name: Pre-upload browser gate[^]*?if: github\.event_name != 'pull_request'[^]*?npm run test:e2e:upload/)
    expect(workflow).toMatch(/Upload Pages artifact\n +if: github\.event_name != 'pull_request'/)
  })

  it('keeps the full browser drills on pull requests', () => {
    expect(workflow).toMatch(/npm run test:e2e\n/)
    expect(workflow).toContain('PW_BASE=1 npm run test:e2e:base')
    expect(workflow).toContain('npm run rehearse:pages')
  })

  it('reads the expected published value from the build artifact', () => {
    expect(spec).toContain("'data/valuation/meta.json'")
    expect(spec).not.toContain('11.86')
    expect(spec).toContain("getByTestId('dcf-fair-value')")
  })
})
