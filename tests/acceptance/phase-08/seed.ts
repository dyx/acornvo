import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

export interface SeedFile {
  rel: string
  body: string
  title?: string
  rating?: number
}

export const DEFAULT_SEED_FILES: SeedFile[] = [
  { rel: 'notes/attention.md', title: 'attention', body: 'Hello attention is all you need.' },
  { rel: 'notes/attn2.md', title: 'attention 2', body: 'Different attention paper.' },
  { rel: 'notes/attn3.md', title: 'attention is all you need', body: 'foo bar baz' },
  { rel: 'cn/zhuyili.md', title: '注意力机制综述', body: '注意力机制研究是一个重要方向。' },
  { rel: 'cn/zhuyili2.md', title: '注意力', body: '只讨论注意力。' },
  { rel: 'cn/jizhi.md', title: '机制', body: '只讨论机制。' },
  { rel: 'cn/zhuyi.md', title: '注意事项', body: '注意安全。' },
  { rel: 'misc/empty.md', title: 'empty', body: '' },
  { rel: 'misc/htmlbody.md', title: 'html', body: '<script>alert(1)</script> 注意力 ok' }
]

export function makeSeedGrove(files: SeedFile[] = DEFAULT_SEED_FILES): string {
  const grove = mkdtempSync(join(tmpdir(), 'acornvo-accept-'))
  for (const f of files) {
    const dir = join(grove, f.rel.split('/').slice(0, -1).join('/'))
    mkdirSync(dir, { recursive: true })
    const abs = join(grove, f.rel)
    const fmLines: string[] = ['---']
    if (f.title) fmLines.push(`title: ${JSON.stringify(f.title)}`)
    if (f.rating !== undefined) fmLines.push(`rating: ${f.rating}`)
    fmLines.push('---', '')
    writeFileSync(abs, fmLines.join('\n') + '\n' + f.body, 'utf8')
  }
  return grove
}
