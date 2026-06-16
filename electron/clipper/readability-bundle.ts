// @ts-ignore: Vite ?raw import is not typed
import raw from '@mozilla/readability/Readability.js?raw'

/**
 * Marker we install on `window` after injection so a second call to
 * `extract()` on the same WebContents skips re-injection. Exported because
 * extract.ts references it.
 */
export const READABILITY_INJECT_MARKER = '__acornvo_readability_injected__'

let cached: string | null = null

function loadSource(): string {
  if (cached !== null) return cached
  cached = `;(function(){
  if (window['${READABILITY_INJECT_MARKER}'] && typeof window.Readability === 'function') return;
  ${raw}
  if (typeof Readability !== 'function') {
    throw new Error('Readability constructor not found after bundle evaluation');
  }
  window.Readability = Readability;
  window['${READABILITY_INJECT_MARKER}'] = true;
})();`
  return cached
}

/**
 * The full JS source to evaluate inside a tab WebContents. After evaluation
 * `window.Readability` is defined and a marker prevents re-evaluation.
 */
export const readabilityBundleSource: string = loadSource()
