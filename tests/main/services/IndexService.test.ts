// tests/main/services/IndexService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { IndexService } from '../../../src/main/services/IndexService'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('IndexService', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let index: IndexService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-index-'))
    dbService = new DatabaseService(tmpDir)
    dbService.open()
    index = new IndexService(dbService.get())
  })

  afterEach(() => {
    dbService.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('indexNote inserts a row into notes', () => {
    index.indexNote({ id: 'abc123', path: 'hello.md', title: 'Hello World',
      markdown: '# Hello World\n\nSome content', folderPath: '', noteType: 'note' })
    const row = dbService.get().prepare('SELECT * FROM notes WHERE id = ?').get('abc123') as any
    expect(row.title).toBe('Hello World')
  })

  it('indexNote is idempotent — updating same id changes title', () => {
    index.indexNote({ id: 'n1', path: 'a.md', title: 'Old', markdown: 'old', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'n1', path: 'a.md', title: 'New', markdown: 'new', folderPath: '', noteType: 'note' })
    const row = dbService.get().prepare('SELECT title FROM notes WHERE id = ?').get('n1') as any
    expect(row.title).toBe('New')
  })

  it('extractLinks returns [[target]] links from markdown', () => {
    expect(IndexService.extractLinks('See [[Note A]] and [[Note B|alias]]')).toEqual(['Note A', 'Note B'])
  })

  it('extractTags returns #tags from markdown', () => {
    const tags = IndexService.extractTags('Hello #world and #foo-bar')
    expect(tags).toContain('world')
    expect(tags).toContain('foo-bar')
  })

  it('resolveLinks connects source to target by title', () => {
    index.indexNote({ id: 'src', path: 'source.md', title: 'Source',
      markdown: 'Links to [[Target]]', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'tgt', path: 'target.md', title: 'Target',
      markdown: '# Target', folderPath: '', noteType: 'note' })
    index.resolveLinks()
    const backlinks = index.getBacklinks('tgt')
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0].sourceNoteId).toBe('src')
  })

  it('searchFTS returns notes matching query', () => {
    index.indexNote({ id: 'q1', path: 'quantum.md', title: 'Quantum Mechanics',
      markdown: '# Quantum Mechanics\n\nWave function collapse', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'q2', path: 'cooking.md', title: 'Cooking Tips',
      markdown: '# Cooking Tips\n\nHow to boil water', folderPath: '', noteType: 'note' })
    index.syncFTS('q1', 'Quantum Mechanics', 'Wave function collapse')
    index.syncFTS('q2', 'Cooking Tips', 'How to boil water')
    const results = index.searchFTS('quantum')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('q1')
  })

  it('removeNote deletes note and cascades to links/tags', () => {
    index.indexNote({ id: 'del', path: 'del.md', title: 'Delete Me', markdown: '#del', folderPath: '', noteType: 'note' })
    index.removeNote('del')
    const row = dbService.get().prepare('SELECT id FROM notes WHERE id = ?').get('del')
    expect(row).toBeUndefined()
  })

  it('resolveLinksForNote only resolves links from the given source', () => {
    index.indexNote({ id: 'src1', path: 's1.md', title: 'Source 1',
      markdown: 'Links to [[Target A]]', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'src2', path: 's2.md', title: 'Source 2',
      markdown: 'Links to [[Target B]]', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'tgtA', path: 'ta.md', title: 'Target A',
      markdown: '# A', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'tgtB', path: 'tb.md', title: 'Target B',
      markdown: '# B', folderPath: '', noteType: 'note' })

    // Only resolve for src1
    index.resolveLinksForNote('src1')

    const blA = index.getBacklinks('tgtA')
    expect(blA).toHaveLength(1)

    // src2's link should still be unresolved
    const blB = index.getBacklinks('tgtB')
    expect(blB).toHaveLength(0)
  })

  it('resolveLinks (full scan) still works for vault open', () => {
    index.indexNote({ id: 'src', path: 's.md', title: 'Source',
      markdown: 'Links to [[Target]]', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'tgt', path: 't.md', title: 'Target',
      markdown: '# Target', folderPath: '', noteType: 'note' })
    index.resolveLinks()
    const bl = index.getBacklinks('tgt')
    expect(bl).toHaveLength(1)
  })
})
