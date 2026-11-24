#!/usr/bin/env node
// Pre-upload browser gate: run the small upload spec against the dist Pages is
// about to receive, served by vite preview under /valueprobe/.
//
// The dist must be the one the sources describe. CI builds a few steps earlier in
// the same job; a hand-run after an edit has no such step, and testing yesterday's
// bytes reports failures that no longer exist. Rebuild when dist is missing or
// older than the newest source, otherwise reuse it.
//
//   npm run test:e2e:upload
import { spawn, spawnSync } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const playwright = resolve(root, 'node_modules/@playwright/test/cli.js')

const newest = async (path) => {
  const info = await stat(path).catch(() => null)
  if (!info) return 0
  if (!info.isDirectory()) return info.mtimeMs
  const entries = await readdir(path)
  const times = await Promise.all(entries.map((name) => newest(resolve(path, name))))
  return Math.max(info.mtimeMs, ...times)
}

const dist = resolve(root, 'dist/index.html')
const distTime = await stat(dist).then((info) => info.mtimeMs).catch(() => 0)
const sourceTime = Math.max(...(await Promise.all(['src', 'public', 'index.html', 'vite.config.js'].map((path) => newest(resolve(root, path))))))
if (!distTime || distTime < sourceTime) {
  console.log('[upload-gate] dist is missing or older than the source; rebuilding the sub-path build')
  const build = spawnSync(process.execPath, [resolve(root, 'scripts/build-base.mjs')], { cwd: root, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status || 1)
}

const child = spawn(process.execPath, [playwright, 'test', 'tests/e2e/upload-gate.spec.js', '--reporter=line'], {
  cwd: root,
  stdio: 'inherit',
  // PW_BASE mounts the preview server; PW_DIST serves the dist that was just checked.
  env: { ...process.env, PW_BASE: '1', PW_DIST: '1' },
})
child.on('error', (error) => {
  console.error('[upload-gate] ' + error.message)
  process.exit(1)
})
child.on('close', (code) => process.exit(code ?? 1))
