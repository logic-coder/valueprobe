#!/usr/bin/env node
// Build (or preview) the app the way GitHub Pages serves it: from the project
// sub-path /valueprobe/ and with the direct transport baked in, so the browser
// talks to the provider origin instead of a dev proxy that a static host does
// not have.
//
// Cross-platform on purpose: the Vite env is set on the child process here, so
// Windows does not need cross-env and CI does not need a shell prefix.
//
//   node scripts/build-base.mjs            # vite build -> dist/
//   node scripts/build-base.mjs --preview  # vite preview on the preview port (scripts/lib/ports.mjs)
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PREVIEW_PORT } from './lib/ports.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const serve = process.argv.includes('--preview')
const vite = resolve(root, 'node_modules/vite/bin/vite.js')

// Deliberately fixed, not inherited: this script IS the base build.
const env = { ...process.env, VITE_BASE: '/valueprobe/', VITE_TRANSPORT: 'direct' }
const args = serve ? [vite, 'preview', '--port', String(PREVIEW_PORT), '--strictPort'] : [vite, 'build']

console.log('[base] ' + (serve ? 'preview' : 'build') + ' with VITE_BASE=' + env.VITE_BASE + ' VITE_TRANSPORT=' + env.VITE_TRANSPORT)

const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' })
child.on('error', (error) => {
  console.error('[base] could not start vite: ' + error.message)
  process.exit(1)
})
child.on('close', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
