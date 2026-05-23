// src/components/browser/dispatchAddress.test.ts
import { describe, it, expect } from 'vitest'
import { dispatchAddress } from './dispatchAddress'

describe('dispatchAddress', () => {
  it('passes through full URLs unchanged', () => {
    expect(dispatchAddress('https://example.com')).toEqual({
      kind: 'url',
      url: 'https://example.com'
    })
    expect(dispatchAddress('http://x.com/path?q=1')).toEqual({
      kind: 'url',
      url: 'http://x.com/path?q=1'
    })
  })

  it('prepends https:// to bare domains', () => {
    expect(dispatchAddress('example.com')).toEqual({
      kind: 'url',
      url: 'https://example.com'
    })
    expect(dispatchAddress('news.ycombinator.com/news')).toEqual({
      kind: 'url',
      url: 'https://news.ycombinator.com/news'
    })
  })

  it('treats input with whitespace as a search query', () => {
    expect(dispatchAddress('attention mechanism')).toEqual({
      kind: 'search',
      url: 'https://www.google.com/search?q=attention%20mechanism'
    })
  })

  it('treats CJK input as a search query', () => {
    expect(dispatchAddress('注意力机制')).toEqual({
      kind: 'search',
      url: 'https://www.google.com/search?q=%E6%B3%A8%E6%84%8F%E5%8A%9B%E6%9C%BA%E5%88%B6'
    })
  })

  it('treats single-word input without dot as a search query', () => {
    expect(dispatchAddress('react')).toEqual({
      kind: 'search',
      url: 'https://www.google.com/search?q=react'
    })
  })

  it('trims surrounding whitespace before dispatching', () => {
    expect(dispatchAddress('   example.com   ')).toEqual({
      kind: 'url',
      url: 'https://example.com'
    })
  })

  it('empty / whitespace-only input → search of empty string', () => {
    expect(dispatchAddress('')).toEqual({
      kind: 'search',
      url: 'https://www.google.com/search?q='
    })
  })

  it('respects the search engine parameter', () => {
    expect(dispatchAddress('react', 'bing')).toEqual({
      kind: 'search',
      url: 'https://www.bing.com/search?q=react'
    })
    expect(dispatchAddress('react', 'duckduckgo')).toEqual({
      kind: 'search',
      url: 'https://duckduckgo.com/?q=react'
    })
    expect(dispatchAddress('react', 'baidu')).toEqual({
      kind: 'search',
      url: 'https://www.baidu.com/s?wd=react'
    })
  })
})
