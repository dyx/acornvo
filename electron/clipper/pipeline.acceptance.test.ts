import { describe, it, expect } from 'vitest'
import { buildSlug, sha6 } from './slug'
import { transformHtmlToMarkdown } from './transform'

// --- OpenSpec 9.6 — slug rules ---
describe('OpenSpec 9.6 — slug rules', () => {
  it('Chinese title → jieba-segmented words + sha6', () => {
    const slug = buildSlug({ title: '深度学习入门指南', url: 'https://example.com/a' })
    expect(slug).toMatch(/[一-龥]/)
    expect(slug.endsWith('-' + sha6('https://example.com/a'))).toBe(true)
  })

  it('English title → slugify result + sha6', () => {
    const slug = buildSlug({ title: 'Hello World, A Primer!', url: 'https://example.com/b' })
    expect(slug).toBe('hello-world-a-primer-' + sha6('https://example.com/b'))
  })
})

// --- OpenSpec 9.9 — relative link absolutised ---
describe('OpenSpec 9.9 — relative link absolutised', () => {
  it('<a href="/x"> with baseUrl=https://example.com/a/b → absolute', () => {
    const md = transformHtmlToMarkdown('<a href="/x">go</a>', 'https://example.com/a/b')
    expect(md.trim()).toBe('[go](https://example.com/x)')
  })
})

// --- OpenSpec 9.10 — img srcset stripped ---
describe('OpenSpec 9.10 — img srcset stripped', () => {
  it('keeps src + alt, drops srcset', () => {
    const md = transformHtmlToMarkdown(
      '<img src="https://cdn/a.png" srcset="https://cdn/a.png 1x, https://cdn/a@2x.png 2x" alt="A">',
      'https://x/'
    )
    expect(md.trim()).toBe('![A](https://cdn/a.png)')
    expect(md).not.toMatch(/srcset/)
  })
})

// --- OpenSpec 9.11 — fenced code block with language ---
describe('OpenSpec 9.11 — fenced code block with language', () => {
  it('language-ts → ```ts fence', () => {
    const md = transformHtmlToMarkdown(
      '<pre><code class="language-ts">const a = 1;</code></pre>',
      'https://x/'
    )
    expect(md).toContain('```ts')
    expect(md).toContain('const a = 1;')
  })
})

// --- OpenSpec 9.12 — GFM table fidelity ---
describe('OpenSpec 9.12 — GFM table fidelity', () => {
  it('table → pipe-style markdown', () => {
    const html =
      '<table><thead><tr><th>Name</th><th>Score</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></tbody></table>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md).toContain('| Name | Score |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| A | 1 |')
    expect(md).toContain('| B | 2 |')
  })
})
