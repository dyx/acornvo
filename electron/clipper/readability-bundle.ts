import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Marker we install on `window` after injection so a second call to
 * `extract()` on the same WebContents skips re-injection. Exported because
 * extract.ts references it.
 */
export const READABILITY_INJECT_MARKER = '__acornvo_readability_injected__'

/**
 * Locate the Readability UMD source. We use `require.resolve` to find the
 * package root and then pick the file Mozilla publishes for browser use.
 *
 * Mozilla publishes `Readability.js` as a standalone UMD bundle; the package's
 * `main` entry (`index.js`) re-exports it. We prefer the standalone file when
 * present because evaluating it on `window` defines `Readability` as a global.
 */
function locateBundlePath(): string {
  const pkgPath = require.resolve('@mozilla/readability/package.json')
  const root = dirname(pkgPath)
  return join(root, 'Readability.js')
}

let cached: string | null = null

function loadSource(): string {
  if (cached !== null) return cached
  const path = locateBundlePath()
  const raw = readFileSync(path, 'utf8')
  cached = `;(function(){
  if (window['${READABILITY_INJECT_MARKER}']) return;
  ${raw}
  window['${READABILITY_INJECT_MARKER}'] = true;
})();`
  return cached
}

/**
 * The full JS source to evaluate inside a tab WebContents. After evaluation
 * `window.Readability` is defined and a marker prevents re-evaluation.
 */
export const readabilityBundleSource: string = loadSource()
