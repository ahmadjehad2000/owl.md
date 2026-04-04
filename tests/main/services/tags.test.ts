// tests/main/services/tags.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { IndexService } from '../../../src/main/services/IndexService'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('tags queries', () => {
  let tmpDir: string
  let db: DatabaseService
  let index: IndexService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-tags-'))
    db = new DatabaseService(tmpDir)
    db.open()
    index = new IndexService(db.get())
    index.indexNote({ id: 'n1', path: 'a.md', title: 'A', markdown: 'Hello #physics #exam-prep', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'n2', path: 'b.md', title: 'B', markdown: 'World #physics', folderPath: '', noteType: 'note' })
  })
  afterEach(() => { db.close(); rmSync(tmpDir, { recursive: true, force: true }) })

  it('list-tags groups by tag with correct counts', () => {
    const rows = db.get().prepare(
      `SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC`
    ).all() as Array<{ tag: string; count: number }>
    expect(rows.find(r => r.tag === 'physics')?.count).toBe(2)
    expect(rows.find(r => r.tag === 'exam-prep')?.count).toBe(1)
  })

  it('notes-by-tag returns correct note ids', () => {
    const rows = db.get().prepare(
      `SELECT note_id FROM tags WHERE tag = ?`
    ).all('physics') as Array<{ note_id: string }>
    const ids = rows.map(r => r.note_id)
    expect(ids).toContain('n1')
    expect(ids).toContain('n2')
  })
})
