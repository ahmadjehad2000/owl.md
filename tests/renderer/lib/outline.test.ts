// tests/renderer/lib/outline.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { extractHeadings } from '../../../src/renderer/lib/markdown'

describe('extractHeadings', () => {
  it('returns empty array when there are no headings', () => {
    expect(extractHeadings('Just a paragraph.')).toEqual([])
  })

  it('extracts h1, h2, h3 with level, text, and sequential pos', () => {
    const md = '# Top\n## Middle\n### Bottom\nParagraph'
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: 'Top',    pos: 0 },
      { level: 2, text: 'Middle', pos: 1 },
      { level: 3, text: 'Bottom', pos: 2 },
    ])
  })

  it('skips headings inside fenced code blocks', () => {
    const md = '```\n# not a heading\n```\n# Real'
    const headings = extractHeadings(md)
    expect(headings).toHaveLength(1)
    expect(headings[0].text).toBe('Real')
  })

  it('trims trailing whitespace from heading text', () => {
    const { text } = extractHeadings('# Hello   ')[0]
    expect(text).toBe('Hello')
  })
})
