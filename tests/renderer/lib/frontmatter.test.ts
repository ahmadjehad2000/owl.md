// tests/renderer/lib/frontmatter.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseFrontmatter, serializeFrontmatter } from '../../../src/renderer/lib/markdown'

describe('parseFrontmatter', () => {
  it('returns empty frontmatter and full body when no --- block', () => {
    const { frontmatter, body } = parseFrontmatter('# Hello\nworld')
    expect(frontmatter).toEqual({})
    expect(body).toBe('# Hello\nworld')
  })

  it('parses string, number, boolean, and array values', () => {
    const md = '---\ntitle: My Note\ncount: 42\ndraft: true\ntags: [a, b, c]\n---\n# Body'
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter.title).toBe('My Note')
    expect(frontmatter.count).toBe(42)
    expect(frontmatter.draft).toBe(true)
    expect(frontmatter.tags).toEqual(['a', 'b', 'c'])
    expect(body).toBe('# Body')
  })

  it('strips surrounding whitespace from values', () => {
    const { frontmatter } = parseFrontmatter('---\ntitle:  Spaced  \n---\n')
    expect(frontmatter.title).toBe('Spaced')
  })

  it('returns empty body string when no content after ---', () => {
    const { body } = parseFrontmatter('---\ntitle: x\n---\n')
    expect(body).toBe('')
  })

  it('preserves leading-zero strings and non-standard numerics as strings', () => {
    const { frontmatter } = parseFrontmatter('---\nid: 007\nhex: 0xff\n---\n')
    expect(frontmatter.id).toBe('007')
    expect(frontmatter.hex).toBe('0xff')
  })
})

describe('serializeFrontmatter', () => {
  it('returns body unchanged when frontmatter is empty', () => {
    expect(serializeFrontmatter({}, '# Body')).toBe('# Body')
  })

  it('prepends --- block when frontmatter has keys', () => {
    const result = serializeFrontmatter({ title: 'Test', count: 3 }, '# Body')
    expect(result.startsWith('---\n')).toBe(true)
    expect(result).toContain('title: Test')
    expect(result).toContain('count: 3')
    expect(result).toContain('\n---\n# Body')
  })

  it('serializes arrays as [a, b, c]', () => {
    expect(serializeFrontmatter({ tags: ['x', 'y'] }, '')).toContain('tags: [x, y]')
  })

  it('round-trips: parse → serialize preserves body', () => {
    const original = '---\ntitle: Test\ntags: [a, b]\n---\n# Hello'
    const { frontmatter, body } = parseFrontmatter(original)
    const roundtripped = serializeFrontmatter(frontmatter, body)
    expect(parseFrontmatter(roundtripped).body).toBe(body)
  })
})
