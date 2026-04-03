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

  it('records schema_version = 1 after migration', () => {
    const row = db.get().prepare('SELECT version FROM schema_version').get() as { version: number }
    expect(row.version).toBe(1)
  })

  it('is idempotent — reopening does not throw', () => {
    db.close()
    const db2 = new DatabaseService(tmpDir)
    expect(() => { db2.open(); db2.close() }).not.toThrow()
  })
})
