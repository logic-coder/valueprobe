import { cp, readFile, rename, stat, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { snapshotFiles } from './policy-artifact.mjs'
import { atomicWrite, readOptionalJson } from './snapshot-transport.mjs'

const releaseFiles = ['catalog.json', 'rates.json', 'intrinsic/v1.json', 'manifest.json']
const journalPath = backup => resolve(backup, 'install.json')
const filePattern = /^[A-Z]{2,}-[A-Z0-9.^-]+\.json$/

async function copyChanged (names, from, to, write = atomicWrite) {
  for (const name of names) {
    const bytes = await readFile(resolve(from, name))
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
  if (!Array.isArray(journal.added) || journal.added.some(name => !filePattern.test(name))) {
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
  const previousBackup = await stat(backup).catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (previousBackup) await rename(backup, resolve(run, 'previous'))
  await cp(live, backup, { recursive: true, force: false })
  const added = names.filter(name => !previous.has(name))
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
