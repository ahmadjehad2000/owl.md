// src/main/services/DatabaseService.ts
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { CREATE_SCHEMA_VERSION } from '../db/schema'
import { up as migration001 } from '../db/migrations/001_initial'
import { up as migration002 } from '../db/migrations/002_order_index'
import { up as migration003 } from '../db/migrations/003_pinned'

const MIGRATIONS: Array<(db: Database.Database) => void> = [migration001, migration002, migration003]

export class DatabaseService {
  private _db: Database.Database | null = null

  constructor(private readonly vaultPath: string) {}

  open(): void {
    const owlDir = join(this.vaultPath, '.owl')
    mkdirSync(owlDir, { recursive: true })
    this._db = new Database(join(owlDir, 'db.sqlite'))
    this._db.pragma('journal_mode = WAL')
    this._db.pragma('foreign_keys = ON')
    this.runMigrations()
  }

  close(): void {
    this._db?.close()
    this._db = null
  }

  get(): Database.Database {
    if (!this._db) throw new Error('DatabaseService not open — call open() first')
    return this._db
  }

  private runMigrations(): void {
    const db = this.get()
    db.prepare(CREATE_SCHEMA_VERSION).run()

    const row = db.prepare('SELECT version FROM schema_version').get() as
      | { version: number } | undefined
    const currentVersion = row?.version ?? 0
    let hasRow = row !== undefined

    for (let i = currentVersion; i < MIGRATIONS.length; i++) {
      const capture = hasRow
      const runMigration = db.transaction(() => {
        MIGRATIONS[i](db)
        if (!capture) {
          db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1)
          hasRow = true
        } else {
          db.prepare('UPDATE schema_version SET version = ?').run(i + 1)
        }
      })
      runMigration()
    }
  }
}
