// Write public/data/intrinsic/<version>.json and public/data/manifest.json from the
// committed snapshots, then fail loudly on any problem the build found.
//   npm run intrinsic
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ARTIFACT_PATH, DATA_DIR, MANIFEST_PATH, buildArtifacts } from './lib/policy-artifact.mjs'
import { PUBLISH_PATH, previousRelease, publishState } from './lib/publish-gate.mjs'

const root = process.cwd()
const { artifact, manifest, problems } = buildArtifacts({ root })
const prior = await previousRelease(resolve(root, DATA_DIR))

if (problems.length) throw new Error(problems.join('\n'))
for (const path of [ARTIFACT_PATH, MANIFEST_PATH, PUBLISH_PATH]) mkdirSync(dirname(resolve(root, path)), { recursive: true })
writeFileSync(resolve(root, ARTIFACT_PATH), JSON.stringify(artifact, null, 2) + '\n')
writeFileSync(resolve(root, MANIFEST_PATH), JSON.stringify(manifest, null, 2) + '\n')
const publish = publishState({ status: 'rebuilt', mode: 'intrinsic', scope: 'all', rates: { requested: false },
  generatedAt: artifact.generatedAt, upstreamCheckedAt: prior.publish?.upstreamCheckedAt ?? null, artifact, manifest,
  previousBatch: prior.publish?.batch })
writeFileSync(resolve(root, PUBLISH_PATH), JSON.stringify(publish, null, 2) + '\n')

const coverage = artifact.coverage
console.log('intrinsic ' + artifact.policyVersion + ' -> ' + ARTIFACT_PATH)
console.log('  universe ' + artifact.universe.declared + ' declared / ' + artifact.universe.snapshots + ' snapshots / ' + artifact.universe.missing.length + ' missing')
console.log('  values ' + coverage.valued + ' / refused ' + coverage.refused + '  reasons ' + JSON.stringify(coverage.reasons) + '  warnings ' + JSON.stringify(coverage.warnings))
console.log('  rates ' + JSON.stringify(artifact.rates))
console.log('ok   artifacts written')
