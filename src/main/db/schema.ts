// src/main/db/schema.ts

export const CREATE_SCHEMA_VERSION = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  )
`

export const CREATE_NOTES = `
  CREATE TABLE IF NOT EXISTS notes (
    id           TEXT PRIMARY KEY,
    path         TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    parent_id    TEXT REFERENCES notes(id) ON DELETE SET NULL,
    folder_path  TEXT NOT NULL DEFAULT '',
    note_type    TEXT NOT NULL DEFAULT 'note'
  )
`

export const CREATE_LINKS = `
  CREATE TABLE IF NOT EXISTS links (
    source_note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id  TEXT NOT NULL DEFAULT '',
    source_block_id TEXT,
    link_text       TEXT NOT NULL,
    is_resolved     INTEGER NOT NULL DEFAULT 0
  )
`

export const CREATE_TAGS = `
  CREATE TABLE IF NOT EXISTS tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL
  )
`

export const CREATE_BLOCKS = `
  CREATE TABLE IF NOT EXISTS blocks (
    block_id    TEXT PRIMARY KEY,
    note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    block_type  TEXT NOT NULL,
    content     TEXT NOT NULL,
    order_index INTEGER NOT NULL
  )
`

export const CREATE_NOTES_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    content
  )
`

export const CREATE_FTS_TRIGGERS = `
  CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, '');
  END;
  CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
    DELETE FROM notes_fts WHERE rowid = old.rowid;
  END;
`

export const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_path);
  CREATE INDEX IF NOT EXISTS idx_links_source  ON links(source_note_id);
  CREATE INDEX IF NOT EXISTS idx_links_target  ON links(target_note_id);
  CREATE INDEX IF NOT EXISTS idx_tags_note     ON tags(note_id);
  CREATE INDEX IF NOT EXISTS idx_tags_tag      ON tags(tag);
  CREATE INDEX IF NOT EXISTS idx_blocks_note   ON blocks(note_id);
`
