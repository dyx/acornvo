import licenseChecker from 'license-checker'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const out = resolve('build/licenses.json')
mkdirSync(resolve('build'), { recursive: true })

licenseChecker.init({ start: '.', production: true }, (err, packages) => {
  if (err) {
    console.error('license-checker failed:', err)
    process.exit(1)
  }
  const list = Object.entries(packages).map(([id, info]) => ({
    id,
    license: info.licenses,
    repository: info.repository ?? null,
    publisher: info.publisher ?? null
  }))
  writeFileSync(out, JSON.stringify(list, null, 2))
  console.log(`[generate-licenses] wrote ${list.length} entries to ${out}`)
})
