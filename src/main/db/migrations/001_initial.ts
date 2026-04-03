// src/main/db/migrations/001_initial.ts
import type Database from 'better-sqlite3'
import {
  CREATE_NOTES, CREATE_LINKS, CREATE_TAGS, CREATE_BLOCKS,
  CREATE_NOTES_FTS, CREATE_FTS_TRIGGERS, INDEXES,
} from '../schema'

export function up(db: Database.Database): void {
  db.exec(CREATE_NOTES)
  db.exec(CREATE_LINKS)
  db.exec(CREATE_TAGS)
  db.exec(CREATE_BLOCKS)
  db.exec(CREATE_NOTES_FTS)
  db.exec(CREATE_FTS_TRIGGERS)
  db.exec(INDEXES)
}
