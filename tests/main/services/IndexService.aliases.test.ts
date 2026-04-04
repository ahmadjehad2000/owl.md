// tests/main/services/IndexService.aliases.test.ts
// Note: better-sqlite3 is compiled for Electron — tests that instantiate
// the real DB will fail in Vitest's Node env (ERR_DLOPEN_FAILED).
// This file only tests the pure static method (no DB required).
import { describe, it, expect } from 'vitest'
import { IndexService } from '../../../src/main/services/IndexService'

describe('IndexService.extractAliasesFromFrontmatter', () => {
  it('parses comma-separated string', () => {
    const result = IndexService.extractAliasesFromFrontmatter('---\naliases: al, alpha-doc\n---\n')
    expect(result).toEqual(['al', 'alpha-doc'])
  })

  it('parses YAML inline array', () => {
    const result = IndexService.extractAliasesFromFrontmatter('---\naliases: [al, alpha-doc]\n---\n')
    expect(result).toEqual(['al', 'alpha-doc'])
  })

  it('returns empty for no aliases key', () => {
    const result = IndexService.extractAliasesFromFrontmatter('---\ntitle: Hello\n---\n')
    expect(result).toEqual([])
  })

  it('returns empty for no frontmatter', () => {
    expect(IndexService.extractAliasesFromFrontmatter('just markdown')).toEqual([])
  })
})
