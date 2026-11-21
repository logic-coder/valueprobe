#!/usr/bin/env node
// Pre-upload browser gate: run the small upload spec against the dist Pages is
// about to receive, served by vite preview under /valueprobe/. No rebuild — the
// deploy workflow runs npm run build first and calls this afterwards.
//
//   npm run test:e2e:upload
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const playwright = resolve(root, 'node_modules/@playwright/test/cli.js')

const child = spawn(process.execPath, [playwright, 'test', 'tests/e2e/upload-gate.spec.js', '--reporter=line'], {
  cwd: root,
  stdio: 'inherit',
  // PW_BASE mounts the preview server; PW_DIST serves dist/ without rebuilding.
  env: { ...process.env, PW_BASE: '1', PW_DIST: '1' },
})
child.on('error', (error) => {
  console.error('[upload-gate] ' + error.message)
  process.exit(1)
})
child.on('close', (code) => process.exit(code ?? 1))
