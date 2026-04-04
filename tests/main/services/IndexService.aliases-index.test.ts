import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { IndexService } from '../../../src/main/services/IndexService'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('IndexService alias index table', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let index: IndexService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-alias-idx-'))
    dbService = new DatabaseService(tmpDir)
    dbService.open()
    index = new IndexService(dbService.get())
  })

  afterEach(() => {
    dbService.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('indexNote populates note_aliases table from frontmatter', () => {
    index.indexNote({
      id: 'n1', path: 'a.md', title: 'My Note',
      markdown: '---\naliases: [Alt Name, Another]\n---\nContent',
      folderPath: '', noteType: 'note',
    })
    const rows = dbService.get().prepare('SELECT alias FROM note_aliases WHERE note_id = ?').all('n1') as Array<{ alias: string }>
    expect(rows.map(r => r.alias)).toEqual(['Alt Name', 'Another'])
  })

  it('resolveLinksForNote resolves link via alias from index table', () => {
    index.indexNote({
      id: 'src', path: 's.md', title: 'Source',
      markdown: 'See [[Alt Name]]', folderPath: '', noteType: 'note',
    })
    index.indexNote({
      id: 'tgt', path: 't.md', title: 'Target',
      markdown: '---\naliases: [Alt Name]\n---\nContent',
      folderPath: '', noteType: 'note',
    })
    index.resolveLinksForNote('src')
    const bl = index.getBacklinks('tgt')
    expect(bl).toHaveLength(1)
    expect(bl[0].sourceNoteId).toBe('src')
  })

  it('re-indexing note replaces aliases', () => {
    index.indexNote({
      id: 'n1', path: 'a.md', title: 'Note',
      markdown: '---\naliases: [Old Alias]\n---\nContent',
      folderPath: '', noteType: 'note',
    })
    index.indexNote({
      id: 'n1', path: 'a.md', title: 'Note',
      markdown: '---\naliases: [New Alias]\n---\nContent',
      folderPath: '', noteType: 'note',
    })
    const rows = dbService.get().prepare('SELECT alias FROM note_aliases WHERE note_id = ?').all('n1') as Array<{ alias: string }>
    expect(rows.map(r => r.alias)).toEqual(['New Alias'])
  })
})
