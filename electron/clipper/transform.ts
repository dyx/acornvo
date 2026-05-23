import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

let cachedService: TurndownService | null = null

function makeService(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    bulletListMarker: '-',
    linkStyle: 'inlined',
    hr: '---',
    fence: '```'
  })

  td.addRule('fencedCodeWithLanguage', {
    filter: function (node) {
      return (
        node.nodeName === 'PRE' && node.firstChild != null && node.firstChild.nodeName === 'CODE'
      )
    },
    replacement: function (_content, node) {
      const code = (node as HTMLElement).firstChild as HTMLElement
      const cls = code.getAttribute('class') || ''
      const m = /language-([\w+-]+)/.exec(cls)
      const lang = m ? m[1] : ''
      const text = code.textContent || ''
      return '\n\n```' + lang + '\n' + text + '\n```\n\n'
    }
  })

  td.addRule('removeScriptStyleNoscript', {
    filter: ['script', 'style', 'noscript'] as TurndownService.Filter,
    replacement: () => ''
  })
  td.addRule('removeComments', {
    filter: function (node) {
      return node.nodeType === 8 // COMMENT_NODE
    },
    replacement: () => ''
  })

  td.use(gfm)
  return td
}

function getService(): TurndownService {
  if (!cachedService) cachedService = makeService()
  return cachedService
}

const NON_HTTP_SCHEMES = /^(mailto:|tel:|javascript:|data:|#)/i

function absolutiseUrls(html: string, baseUrl: string): string {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return html
  }
  function rewrite(value: string): string {
    if (!value || NON_HTTP_SCHEMES.test(value)) return value
    try {
      return new URL(value, base).href
    } catch {
      return value
    }
  }
  let s = html.replace(/(\shref=")([^"]*)(")/gi, (_m, p1, v, p3) => `${p1}${rewrite(v)}${p3}`)
  s = s.replace(/(\ssrc=")([^"]*)(")/gi, (_m, p1, v, p3) => `${p1}${rewrite(v)}${p3}`)
  return s
}

function stripUnwantedAttributes(html: string): string {
  const PROTECT = '__acornvo_keep_lang__'
  let s = html.replace(/<code\s+class="(language-[\w+-]+)"/gi, (_m, lang) => {
    return `<code ${PROTECT}="${lang}"`
  })
  s = s.replace(/\sclass="[^"]*"/gi, '')
  s = s.replace(/\sid="[^"]*"/gi, '')
  s = s.replace(/\sdata-[a-z0-9-]+="[^"]*"/gi, '')
  s = s.replace(/\sstyle="[^"]*"/gi, '')
  s = s.replace(/\ssrcset="[^"]*"/gi, '')
  s = s.replace(new RegExp(`${PROTECT}="(language-[\\w+-]+)"`, 'gi'), 'class="$1"')
  return s
}

function compactEmptyShells(html: string): string {
  const re = /<(p|span|div)(\s[^>]*)?>(\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi
  let prev: string
  let cur = html
  do {
    prev = cur
    cur = cur.replace(re, '')
  } while (cur !== prev)
  return cur
}

/**
 * Transform an HTML body to Markdown.
 *
 * @param html article HTML (without `<html>` / `<head>` wrappers)
 * @param baseUrl absolute URL of the source page; used to resolve relative
 *   href/src and produce absolute links in the markdown output.
 */
export function transformHtmlToMarkdown(html: string, baseUrl: string): string {
  const absolutised = absolutiseUrls(html, baseUrl)
  const cleaned = stripUnwantedAttributes(absolutised)
  const compact = compactEmptyShells(cleaned)
  return getService().turndown(compact)
}
