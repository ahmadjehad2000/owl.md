// src/main/db/migrations/004_aliases.ts
import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>
  if (!cols.some(c => c.name === 'aliases')) {
    db.prepare("ALTER TABLE notes ADD COLUMN aliases TEXT NOT NULL DEFAULT ''").run()
  }
}
