#!/usr/bin/env node
// Rehearse both Pages builds: the default one (quarterly snapshot committed as a
// safety net) and VITE_SNAPSHOT=off (live sources only). Each round rebuilds the
// /valueprobe/ bundle, serves it, and runs the static-host specs, so a publication
// that breaks the offline story or the base prefix fails here, not at deploy time.
//
//   node scripts/rehearse-pages.mjs            # both rounds
//   PW_CHANNEL=chrome node scripts/rehearse-pages.mjs
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const playwright = resolve(root, 'node_modules/@playwright/test/cli.js')
const SPECS = ['tests/e2e/base-path.spec.js', 'tests/e2e/static-host.spec.js']

const run = (env) => new Promise((done) => {
  const child = spawn(process.execPath, [playwright, 'test', ...SPECS, '--reporter=line'], { cwd: root, env, stdio: 'inherit' })
  child.on('error', (error) => {
    console.error('[rehearsal] ' + error.message)
    done(1)
  })
  child.on('close', (code) => done(code ?? 1))
})

let failures = 0
for (const snapshot of ['on', 'off']) {
  console.log('\n[rehearsal] VITE_SNAPSHOT=' + snapshot)
  const code = await run({
    ...process.env,
    // PW_BASE adds the preview server; the build inherits VITE_SNAPSHOT from here.
    PW_BASE: '1',
    VITE_SNAPSHOT: snapshot,
    REHEARSAL_SNAPSHOT: snapshot,
  })
  if (code) failures += 1
}

console.log(failures ? '\n[rehearsal] ' + failures + ' round(s) failed' : '\n[rehearsal] both rounds passed')
process.exit(failures ? 1 : 0)
