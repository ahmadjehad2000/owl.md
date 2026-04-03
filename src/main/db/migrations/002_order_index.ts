// src/main/db/migrations/002_order_index.ts
import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  // Idempotent: skip if column already exists
  const cols = db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>
  if (!cols.some(c => c.name === 'order_index')) {
    db.prepare('ALTER TABLE notes ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0').run()
  }
}
