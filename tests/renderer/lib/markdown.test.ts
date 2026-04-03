// tests/renderer/lib/markdown.test.ts
import { describe, it, expect } from 'vitest'
import { extractTitle, extractWikiLinks, folderFromPath } from '../../../src/renderer/lib/markdown'

describe('extractTitle', () => {
  it('returns text of first h1', () => {
    expect(extractTitle('# Hello World\n\nSome text')).toBe('Hello World')
  })
  it('returns filename fallback when no h1', () => {
    expect(extractTitle('Just text', 'Research/my-note.md')).toBe('my-note')
  })
  it('returns empty string when no h1 and no path given', () => {
    expect(extractTitle('no heading')).toBe('')
  })
})

describe('extractWikiLinks', () => {
  it('extracts [[simple links]]', () => {
    expect(extractWikiLinks('See [[Note A]] for details')).toEqual(['Note A'])
  })
  it('extracts [[link|alias]] — returns target not alias', () => {
    expect(extractWikiLinks('See [[Note A|alias]]')).toEqual(['Note A'])
  })
  it('extracts multiple unique links', () => {
    expect(extractWikiLinks('[[A]] and [[B]] and [[A]] again')).toEqual(['A', 'B'])
  })
  it('returns empty array when no links', () => {
    expect(extractWikiLinks('plain text')).toEqual([])
  })
})

describe('folderFromPath', () => {
  it('returns folder for nested path', () => {
    expect(folderFromPath('Research/papers/note.md')).toBe('Research/papers')
  })
  it('returns empty string for root-level note', () => {
    expect(folderFromPath('note.md')).toBe('')
  })
})
