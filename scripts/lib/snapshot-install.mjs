import { cp, readFile, readdir, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { snapshotFiles } from './policy-artifact.mjs'
import { atomicWrite, readOptionalJson } from './snapshot-transport.mjs'
import { POLICY_VERSION } from '../../src/lib/policy.js'

// Files the installer must carry over beside the snapshots. Frozen earlier
  // artifacts stay where they are: they never change, so listing one only makes the
  // list drift (v1 was listed, v2 never was).
  const releaseFiles = ['catalog.json', 'rates.json', 'intrinsic/' + POLICY_VERSION + '.json', 'manifest.json', 'publish.json']
const journalPath = backup => resolve(backup, 'install.json')
const filePattern = /^[A-Z]{2,}-[A-Z0-9.^-]+\.json$/
const validName = name => filePattern.test(name) || releaseFiles.includes(name)

async function copyChanged (names, from, to, write = atomicWrite) {
  for (const name of names) {
    const bytes = await readFile(resolve(from, name)).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!bytes) continue
    const path = resolve(to, name)
    const old = await readFile(path).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!old?.equals(bytes)) await write(path, bytes)
  }
}

async function removeIfPresent (path) {
  await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error })
}

export async function recoverInstall (live, backup) {
  const journal = await readOptionalJson(journalPath(backup))
  if (!journal) return false
  if (!Array.isArray(journal.added) || journal.added.some(name => !validName(name))) {
    throw new Error('Invalid snapshot install journal')
  }
  const oldNames = snapshotFiles(process.cwd(), backup)
  const oldSet = new Set(oldNames)
  await copyChanged([...oldNames, ...releaseFiles], backup, live)
  for (const name of journal.added) {
    if (!oldSet.has(name)) await removeIfPresent(resolve(live, name))
  }
  await removeIfPresent(journalPath(backup))
  return true
}

export async function installSnapshots (staged, live, backup, run, write = atomicWrite) {
  const names = snapshotFiles(process.cwd(), staged)
  const oldNames = snapshotFiles(process.cwd(), live)
  const current = new Set(names)
  const previous = new Set(oldNames)
  const releaseAdded = []
  for (const name of releaseFiles) {
    const exists = await readFile(resolve(live, name)).then(() => true).catch(error => {
      if (error.code === 'ENOENT') return false
      throw error
    })
    if (!exists) releaseAdded.push(name)
  }
  const backupFiles = await readdir(backup).catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (backupFiles?.length) {
    await cp(backup, resolve(run, 'previous'), { recursive: true, errorOnExist: true, force: false })
    for (const name of snapshotFiles(process.cwd(), backup)) {
      if (!previous.has(name)) await removeIfPresent(resolve(backup, name))
    }
  }
  await copyChanged([...oldNames, ...releaseFiles], live, backup)
  const added = [...names.filter(name => !previous.has(name)), ...releaseAdded]
  // All recovery inputs must be written before changing the published directory.
  await atomicWrite(journalPath(backup), JSON.stringify({ added }))
  try {
    await copyChanged([...names, ...releaseFiles], staged, live, write)
    for (const name of oldNames) {
      if (!current.has(name)) await removeIfPresent(resolve(live, name))
    }
    await removeIfPresent(journalPath(backup))
  } catch (error) {
    await recoverInstall(live, backup)
    throw error
  }
}
