// Write public/data/intrinsic/v1.json and public/data/manifest.json from the
// committed snapshots, then fail loudly on any problem the build found.
//   npm run intrinsic
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ARTIFACT_PATH, MANIFEST_PATH, buildArtifacts } from './lib/policy-artifact.mjs'

const root = process.cwd()
const { artifact, manifest, problems } = buildArtifacts({ root })

if (problems.length) throw new Error(problems.join('\n'))
for (const path of [ARTIFACT_PATH, MANIFEST_PATH]) mkdirSync(dirname(resolve(root, path)), { recursive: true })
writeFileSync(resolve(root, ARTIFACT_PATH), JSON.stringify(artifact, null, 2) + '\n')
writeFileSync(resolve(root, MANIFEST_PATH), JSON.stringify(manifest, null, 2) + '\n')

const coverage = artifact.coverage
console.log('intrinsic ' + artifact.policyVersion + ' -> ' + ARTIFACT_PATH)
console.log('  universe ' + artifact.universe.declared + ' declared / ' + artifact.universe.snapshots + ' snapshots / ' + artifact.universe.missing.length + ' missing')
console.log('  values ' + coverage.valued + ' / refused ' + coverage.refused + '  reasons ' + JSON.stringify(coverage.reasons) + '  warnings ' + JSON.stringify(coverage.warnings))
console.log('  rates ' + JSON.stringify(artifact.rates))
console.log('ok   artifacts written')
