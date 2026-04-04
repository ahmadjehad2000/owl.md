import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { IndexService } from '../../../src/main/services/IndexService'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'

describe('IndexService hash-skip', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let index: IndexService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-hash-'))
    dbService = new DatabaseService(tmpDir)
    dbService.open()
    index = new IndexService(dbService.get())
  })

  afterEach(() => {
    dbService.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('indexNote returns true when content changed', () => {
    const result = index.indexNote({
      id: 'n1', path: 'a.md', title: 'A',
      markdown: '# Hello', folderPath: '', noteType: 'note',
    })
    expect(result).toBe(true)
    const row = dbService.get().prepare('SELECT content_hash FROM notes WHERE id = ?').get('n1') as any
    expect(row.content_hash).toBe(createHash('sha256').update('# Hello').digest('hex'))
  })

  it('indexNote returns false when content hash matches (skip)', () => {
    index.indexNote({
      id: 'n1', path: 'a.md', title: 'A',
      markdown: '# Hello', folderPath: '', noteType: 'note',
    })
    const result = index.indexNote({
      id: 'n1', path: 'a.md', title: 'A',
      markdown: '# Hello', folderPath: '', noteType: 'note',
    })
    expect(result).toBe(false)
  })

  it('indexNote returns true when title changed even if hash matches', () => {
    index.indexNote({
      id: 'n1', path: 'a.md', title: 'Old Title',
      markdown: '# Hello', folderPath: '', noteType: 'note',
    })
    const result = index.indexNote({
      id: 'n1', path: 'a.md', title: 'New Title',
      markdown: '# Hello', folderPath: '', noteType: 'note',
    })
    expect(result).toBe(true)
  })

  it('indexNote returns true when path changed even if hash matches', () => {
    index.indexNote({
      id: 'n1', path: 'old.md', title: 'A',
      markdown: '# Hello', folderPath: '', noteType: 'note',
    })
    const result = index.indexNote({
      id: 'n1', path: 'new.md', title: 'A',
      markdown: '# Hello', folderPath: '', noteType: 'note',
    })
    expect(result).toBe(true)
  })
})
