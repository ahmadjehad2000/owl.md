// tests/main/services/DatabaseService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('DatabaseService', () => {
  let tmpDir: string
  let db: DatabaseService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-test-'))
    db = new DatabaseService(tmpDir)
    db.open()
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .owl/db.sqlite on open', () => {
    expect(existsSync(join(tmpDir, '.owl', 'db.sqlite'))).toBe(true)
  })

  it('creates notes table', () => {
    const row = db.get().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'"
    ).get()
    expect(row).toBeTruthy()
  })

  it('creates notes_fts virtual table', () => {
    const row = db.get().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'"
    ).get()
    expect(row).toBeTruthy()
  })

  it('creates links, tags, blocks tables', () => {
    for (const table of ['links', 'tags', 'blocks']) {
      const row = db.get().prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
      ).get()
      expect(row, `${table} table missing`).toBeTruthy()
    }
  })

  it('records schema_version after all migrations', () => {
    const row = db.get().prepare('SELECT version FROM schema_version').get() as { version: number }
    expect(row.version).toBe(5)
  })

  it('is idempotent — reopening does not throw', () => {
    db.close()
    const db2 = new DatabaseService(tmpDir)
    expect(() => { db2.open(); db2.close() }).not.toThrow()
  })

  it('adds order_index column via migration 002', () => {
    const cols = db.get()
      .prepare('PRAGMA table_info(notes)')
      .all() as Array<{ name: string }>
    expect(cols.some(c => c.name === 'order_index')).toBe(true)
  })

  it('records correct schema_version after all migrations', () => {
    const row = db.get()
      .prepare('SELECT version FROM schema_version')
      .get() as { version: number }
    expect(row.version).toBe(5)
  })

  it('can store a folder note (note_type = folder)', () => {
    const d = db.get()
    const now = Date.now()
    d.prepare(`
      INSERT INTO notes (id, path, title, content_hash, created_at, updated_at,
                         parent_id, folder_path, note_type, order_index)
      VALUES ('f1', '', 'Research', '', ?, ?, NULL, '', 'folder', 0)
    `).run(now, now)
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get('f1') as Record<string, unknown>
    expect(row.note_type).toBe('folder')
    expect(row.path).toBe('')
  })

  it('can move a note into a parent folder', () => {
    const d = db.get()
    const now = Date.now()
    d.prepare(`INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, parent_id, folder_path, note_type, order_index) VALUES ('f2', '', 'Folder', '', ?, ?, NULL, '', 'folder', 0)`).run(now, now)
    d.prepare(`INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, parent_id, folder_path, note_type, order_index) VALUES ('n2', 'n.md', 'Note', 'h', ?, ?, NULL, '', 'note', 0)`).run(now, now)
    d.prepare('UPDATE notes SET parent_id = ?, order_index = ? WHERE id = ?').run('f2', 1, 'n2')
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get('n2') as Record<string, unknown>
    expect(row.parent_id).toBe('f2')
    expect(row.order_index).toBe(1)
  })

  it('can move a note back to root (parent_id = null)', () => {
    const d = db.get()
    const now = Date.now()
    d.prepare(`INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, parent_id, folder_path, note_type, order_index) VALUES ('f3', '', 'Folder', '', ?, ?, NULL, '', 'folder', 0)`).run(now, now)
    d.prepare(`INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, parent_id, folder_path, note_type, order_index) VALUES ('n3', 'n3.md', 'Note3', 'h', ?, ?, 'f3', '', 'note', 0)`).run(now, now)
    d.prepare('UPDATE notes SET parent_id = NULL, order_index = 0 WHERE id = ?').run('n3')
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get('n3') as Record<string, unknown>
    expect(row.parent_id).toBeNull()
  })
})
