import { describe, it, expect } from 'vitest'
import type {
  FileSummary,
  FileFilter,
  Pagination,
  CategoryNode,
  TagCloudItem
} from './file-types'

describe('file-types', () => {
  it('FileSummary has all required fields with correct nullability', () => {
    const s: FileSummary = {
      path: 'notes/a.md',
      title: 'A',
      category: '技术',
      rating: 4,
      clipped_at: '2026-04-27T00:00:00Z',
      site: 'example.com',
      has_summary: true,
      tags: ['x', 'y'],
      is_reviewing: false
    }
    expect(s.path).toBe('notes/a.md')
  })

  it('FileSummary allows nullable fields', () => {
    const s: FileSummary = {
      path: 'notes/b.md',
      title: null,
      category: null,
      rating: null,
      clipped_at: null,
      site: null,
      has_summary: false,
      tags: [],
      is_reviewing: false
    }
    expect(s.tags).toEqual([])
  })

  it('FileFilter all fields optional', () => {
    const f1: FileFilter = {}
    const f2: FileFilter = {
      category: '技术',
      tag: 'attention',
      pathPrefix: 'inbox/',
      rating: { min: 3, max: 5 },
      q: '注意力'
    }
    expect(f1).toBeDefined()
    expect(f2.rating?.min).toBe(3)
  })

  it('Pagination accepts the two orderBy values', () => {
    const p1: Pagination = { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    const p2: Pagination = { limit: 50, offset: 50, orderBy: 'title_asc' }
    expect(p1.orderBy).toBe('clipped_desc')
    expect(p2.orderBy).toBe('title_asc')
  })

  it('CategoryNode is recursive with count', () => {
    const node: CategoryNode = {
      name: '技术',
      count: 3,
      children: [{ name: '深度学习', count: 2, children: [] }]
    }
    expect(node.children[0].name).toBe('深度学习')
  })

  it('TagCloudItem has name + usage_count', () => {
    const t: TagCloudItem = { name: 'attention', usage_count: 12 }
    expect(t.usage_count).toBe(12)
  })
})
