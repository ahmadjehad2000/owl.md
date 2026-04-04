// src/main/db/migrations/003_pinned.ts
import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>
  if (!cols.some(c => c.name === 'pinned')) {
    db.prepare('ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0').run()
  }
}
