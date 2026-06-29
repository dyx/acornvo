import type { WebContents } from 'electron'
import type { ExtractResult } from '@shared/clipper-types'
import { readabilityBundleSource } from './readability-bundle'

export interface ExtractorDeps {
  /** Per-call timeout for both injection and parse. */
  timeoutMs: number
}

export interface Extractor {
  extract(webContents: WebContents): Promise<ExtractResult>
}

/**
 * The snippet evaluated inside the tab. Calls `Readability(...).parse()`.
 * When `parse()` returns null we fall back to document.body.innerHTML directly
 * within the snippet.
 */
const PARSE_SNIPPET = `
(function(){
  try {
    if (typeof Readability !== 'function') {
      return { ok: false, error: 'no_readability' };
    }
    const docClone = document.cloneNode(true);
    
    // Pre-process lazy-loaded images (WeChat, Zhihu, etc.)
    const images = docClone.getElementsByTagName('img');
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const realSrc = img.getAttribute('data-src') || 
                      img.getAttribute('data-original') || 
                      img.getAttribute('data-actualsrc') ||
                      img.getAttribute('data-lazy-src');
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    }

    const reader = new Readability(docClone);
    const article = reader.parse();
    if (article) {
      return {
        ok: true,
        degraded: false,
        title: article.title || document.title || '',
        byline: article.byline || '',
        content: article.content || '',
        textContent: article.textContent || '',
        length: article.length || 0,
        excerpt: article.excerpt || '',
        siteName: article.siteName || '',
        lang: article.lang || document.documentElement.lang || '',
        publishedTime: article.publishedTime || '',
        url: location.href
      };
    }
    // Fallback: Readability could not extract an article. Capture full body.
    const bodyHtml = document.body ? document.body.innerHTML : '';
    if (!bodyHtml) {
      return { ok: false, error: 'no_article_no_body' };
    }
    const text = (document.body && document.body.innerText) ? document.body.innerText : '';
    return {
      ok: true,
      degraded: true,
      title: document.title || '',
      byline: '',
      content: bodyHtml,
      textContent: text,
      length: text.length,
      excerpt: text.slice(0, 160),
      siteName: '',
      lang: document.documentElement.lang || '',
      publishedTime: '',
      url: location.href
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
})();
`

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | { __timeout: true }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ __timeout: true } as const), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve({ __timeout: true } as const)
      }
    )
  })
}

export function createExtractor(deps: ExtractorDeps): Extractor {
  return {
    async extract(webContents) {
      if (webContents.isDestroyed()) {
        return { ok: false, error: 'E_EXTRACT_EMPTY' }
      }

      const injected = await withTimeout(
        webContents.executeJavaScript(readabilityBundleSource, true),
        deps.timeoutMs
      )
      if (typeof injected === 'object' && injected !== null && '__timeout' in injected) {
        return { ok: false, error: 'E_EXTRACT_TIMEOUT' }
      }
      if (webContents.isDestroyed()) {
        return { ok: false, error: 'E_EXTRACT_EMPTY' }
      }

      const parsed = await withTimeout(
        webContents.executeJavaScript(PARSE_SNIPPET, true),
        deps.timeoutMs
      )
      if (typeof parsed === 'object' && parsed !== null && '__timeout' in parsed) {
        return { ok: false, error: 'E_EXTRACT_TIMEOUT' }
      }

      const r = parsed as { ok?: boolean; error?: string; [k: string]: unknown }
      if (!r || r.ok !== true) {
        return { ok: false, error: 'E_EXTRACT_EMPTY' }
      }

      return {
        ok: true,
        degraded: r.degraded === true ? true : undefined,
        title: (r.title as string) || undefined,
        byline: (r.byline as string) || undefined,
        content: (r.content as string) || undefined,
        textContent: (r.textContent as string) || undefined,
        length: (r.length as number) || undefined,
        excerpt: (r.excerpt as string) || undefined,
        siteName: (r.siteName as string) || undefined,
        lang: (r.lang as string) || undefined,
        publishedTime: (r.publishedTime as string) || undefined,
        url: (r.url as string) || undefined
      }
    }
  }
}

// --- singleton convenience ---
let singleton: Extractor | null = null
export function getExtractor(): Extractor {
  if (!singleton) singleton = createExtractor({ timeoutMs: 30000 })
  return singleton
}
