// src/main/db/migrations/005_trash.sql.ts
import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_aliases (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      alias   TEXT NOT NULL
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_note_aliases_alias ON note_aliases(alias)')

  const cols = db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>
  if (!cols.some(c => c.name === 'deleted_at')) {
    db.exec("ALTER TABLE notes ADD COLUMN deleted_at INTEGER DEFAULT NULL")
  }
}
