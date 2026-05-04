import { describe, it, expect } from 'vitest'
import { transformHtmlToMarkdown } from './transform'

describe('transform — base options', () => {
  it('headings use atx style (#)', () => {
    expect(transformHtmlToMarkdown('<h1>A</h1>', 'https://x/').trim()).toBe('# A')
    expect(transformHtmlToMarkdown('<h3>B</h3>', 'https://x/').trim()).toBe('### B')
  })

  it('strong = ** , em = *', () => {
    expect(transformHtmlToMarkdown('<p><strong>x</strong></p>', 'https://x/').trim()).toBe('**x**')
    expect(transformHtmlToMarkdown('<p><em>y</em></p>', 'https://x/').trim()).toBe('*y*')
  })

  it('bullet list uses - marker', () => {
    const md = transformHtmlToMarkdown('<ul><li>a</li><li>b</li></ul>', 'https://x/')
    // turndown uses triple-space indent after bullet: "-   a"
    expect(md.trim()).toContain('-')
    expect(md.trim()).toContain('a')
    expect(md.trim()).toContain('b')
  })

  it('horizontal rule renders as ---', () => {
    expect(transformHtmlToMarkdown('<hr/>', 'https://x/').trim()).toBe('---')
  })

  it('fenced code block keeps language class', () => {
    const md = transformHtmlToMarkdown(
      '<pre><code class="language-ts">const a = 1;</code></pre>',
      'https://x/'
    )
    expect(md).toContain('```ts')
    expect(md).toContain('const a = 1;')
    expect(md).toContain('```')
  })

  it('GFM tables produce markdown tables', () => {
    const html =
      '<table><thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md).toContain('| h1 | h2 |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| a | b |')
  })

  it('inline links use [text](url) form', () => {
    expect(
      transformHtmlToMarkdown('<a href="https://x.com/y">go</a>', 'https://x.com/').trim()
    ).toBe('[go](https://x.com/y)')
  })

  it('image with alt + title round-trips', () => {
    expect(
      transformHtmlToMarkdown(
        '<img src="https://cdn/x.png" alt="figure" title="t">',
        'https://x/'
      ).trim()
    ).toBe('![figure](https://cdn/x.png "t")')
  })
})

describe('transform — HTML pre-clean', () => {
  it('removes <script>/<style>/<noscript>', () => {
    const html =
      '<script>alert(1)</script><style>p{}</style><noscript>fallback</noscript><p>hello</p>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md.trim()).toBe('hello')
  })

  it('removes HTML comments', () => {
    const html = '<!-- hi --><p>only</p><!-- bye -->'
    expect(transformHtmlToMarkdown(html, 'https://x/').trim()).toBe('only')
  })

  it('strips class / id / data-* / style / srcset from output', () => {
    const html =
      '<p class="x" id="y" data-track="1" style="color:red"><img src="https://cdn/a.png" srcset="https://cdn/a.png 1x" alt="a">hello</p>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md).not.toMatch(/class=/)
    expect(md).not.toMatch(/data-/)
    expect(md).not.toMatch(/srcset/)
    expect(md).toContain('hello')
    expect(md).toContain('![a](https://cdn/a.png)')
  })

  it('keeps href / src / alt / title / language-* class on code', () => {
    const html =
      '<a href="https://x/y" title="t">go</a><pre><code class="language-py">a=1</code></pre>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md).toContain('[go](https://x/y "t")')
    expect(md).toContain('```py')
  })
})

describe('transform — absolute URLs', () => {
  it('rewrites <a href="/x"> to absolute', () => {
    const html = '<a href="/x">go</a>'
    const md = transformHtmlToMarkdown(html, 'https://example.com/a/b')
    expect(md.trim()).toBe('[go](https://example.com/x)')
  })

  it('rewrites <img src="../img.png"> to absolute', () => {
    const html = '<img src="../img.png" alt="i">'
    const md = transformHtmlToMarkdown(html, 'https://example.com/a/b/c')
    expect(md.trim()).toBe('![i](https://example.com/a/img.png)')
  })

  it('keeps absolute URLs unchanged', () => {
    const html = '<a href="https://other.com/x">go</a>'
    const md = transformHtmlToMarkdown(html, 'https://example.com/')
    expect(md.trim()).toBe('[go](https://other.com/x)')
  })

  it('keeps mailto / tel / javascript untouched', () => {
    expect(transformHtmlToMarkdown('<a href="mailto:a@b.c">e</a>', 'https://x/').trim()).toBe(
      '[e](mailto:a@b.c)'
    )
    expect(transformHtmlToMarkdown('<a href="tel:+1-555">t</a>', 'https://x/').trim()).toBe(
      '[t](tel:+1-555)'
    )
  })

  it('skips when baseUrl is invalid', () => {
    const md = transformHtmlToMarkdown('<a href="/x">go</a>', 'not a url')
    expect(md).toContain('/x')
  })
})

describe('transform — empty-shell compaction', () => {
  it('removes empty <p></p>', () => {
    const md = transformHtmlToMarkdown('<p></p><p>hello</p><p>  </p>', 'https://x/')
    expect(md.trim()).toBe('hello')
  })

  it('unwraps <span></span> with whitespace only', () => {
    const md = transformHtmlToMarkdown('<p>a<span>  </span>b</p>', 'https://x/')
    expect(md.trim()).toBe('ab')
  })

  it('removes empty <div></div>', () => {
    const md = transformHtmlToMarkdown('<div>   </div><p>kept</p>', 'https://x/')
    expect(md.trim()).toBe('kept')
  })

  it('does not collapse <p> that contains an image', () => {
    const md = transformHtmlToMarkdown('<p><img src="https://x/y.png" alt="i"></p>', 'https://x/')
    expect(md.trim()).toBe('![i](https://x/y.png)')
  })

  it('does not eat genuine whitespace between words inside non-empty blocks', () => {
    const md = transformHtmlToMarkdown('<p>foo bar baz</p>', 'https://x/')
    expect(md.trim()).toBe('foo bar baz')
  })
})
