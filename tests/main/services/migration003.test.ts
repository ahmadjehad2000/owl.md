// tests/main/services/migration003.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('migration 003 — pinned column', () => {
  let tmpDir: string
  let db: DatabaseService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-m003-'))
    db = new DatabaseService(tmpDir)
    db.open()
  })
  afterEach(() => { db.close(); rmSync(tmpDir, { recursive: true, force: true }) })

  it('notes table has a pinned column defaulting to 0', () => {
    const cols = db.get().prepare('PRAGMA table_info(notes)').all() as Array<{ name: string; dflt_value: string }>
    const col = cols.find(c => c.name === 'pinned')
    expect(col).toBeDefined()
    expect(col!.dflt_value).toBe('0')
  })

  it('can set pinned = 1 on a note', () => {
    db.get().prepare(`INSERT INTO notes (id,path,title,content_hash,created_at,updated_at,folder_path,note_type,order_index)
      VALUES ('n1','a.md','A','',1,1,'','note',0)`).run()
    db.get().prepare('UPDATE notes SET pinned = 1 WHERE id = ?').run('n1')
    const row = db.get().prepare('SELECT pinned FROM notes WHERE id = ?').get('n1') as { pinned: number }
    expect(row.pinned).toBe(1)
  })
})
