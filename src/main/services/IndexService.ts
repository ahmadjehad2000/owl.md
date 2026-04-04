// src/main/services/IndexService.ts
import type Database from 'better-sqlite3'
import { createHash } from 'crypto'
import type { BacklinkResult, SearchResult } from '@shared/types/Note'

interface IndexNoteParams {
  id: string
  path: string
  title: string
  markdown: string
  folderPath: string
  noteType: string
}

export class IndexService {
  constructor(private readonly db: Database.Database) {}

  indexNote(params: IndexNoteParams): void {
    const { id, path, title, markdown, folderPath, noteType } = params
    const hash = createHash('sha256').update(markdown).digest('hex')
    const now = Date.now()

    this.db.prepare(`
      INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, folder_path, note_type)
      VALUES (@id, @path, @title, @hash, @now, @now, @folderPath, @noteType)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path, title = excluded.title,
        content_hash = excluded.content_hash, updated_at = excluded.updated_at,
        folder_path = excluded.folder_path, note_type = excluded.note_type
    `).run({ id, path, title, hash, now, folderPath, noteType })

    this.db.prepare('DELETE FROM tags WHERE note_id = ?').run(id)
    for (const tag of IndexService.extractTags(markdown)) {
      this.db.prepare('INSERT INTO tags (note_id, tag) VALUES (?, ?)').run(id, tag)
    }

    this.db.prepare('DELETE FROM links WHERE source_note_id = ?').run(id)
    for (const target of IndexService.extractLinks(markdown)) {
      this.db.prepare(
        'INSERT INTO links (source_note_id, target_note_id, link_text, is_resolved) VALUES (?, ?, ?, 0)'
      ).run(id, '', target)
    }
  }

  syncFTS(id: string, title: string, content: string): void {
    const row = this.db.prepare('SELECT rowid FROM notes WHERE id = ?').get(id) as
      | { rowid: number } | undefined
    if (!row) return
    this.db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(row.rowid)
    this.db.prepare(
      'INSERT INTO notes_fts(rowid, title, content) VALUES (?, ?, ?)'
    ).run(row.rowid, title, content)
  }

  resolveLinks(): void {
    const unresolved = this.db.prepare(
      'SELECT rowid, source_note_id, link_text FROM links WHERE is_resolved = 0'
    ).all() as Array<{ rowid: number; source_note_id: string; link_text: string }>

    for (const link of unresolved) {
      const target = this.db.prepare(
        "SELECT id FROM notes WHERE title = ? AND note_type != 'folder'"
      ).get(link.link_text) as { id: string } | undefined
      if (target) {
        this.db.prepare('UPDATE links SET target_note_id = ?, is_resolved = 1 WHERE rowid = ?')
          .run(target.id, link.rowid)
      }
    }
  }

  getBacklinks(noteId: string): BacklinkResult[] {
    return this.db.prepare(`
      SELECT l.source_note_id as sourceNoteId, n.title as sourceTitle,
             n.path as sourcePath, l.link_text as linkText
      FROM links l
      JOIN notes n ON l.source_note_id = n.id
      WHERE l.target_note_id = ? AND l.is_resolved = 1
    `).all(noteId) as BacklinkResult[]
  }

  searchFTS(query: string): SearchResult[] {
    try {
      return this.db.prepare(`
        SELECT n.id, n.path, n.title,
               snippet(notes_fts, 1, '<mark>', '</mark>', '…', 10) as excerpt
        FROM notes_fts
        JOIN notes n ON notes_fts.rowid = n.rowid
        WHERE notes_fts MATCH ?
        ORDER BY bm25(notes_fts, 10, 1)
        LIMIT 50
      `).all(query + '*') as SearchResult[]
    } catch {
      return []
    }
  }

  removeNote(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }

  static extractLinks(markdown: string): string[] {
    const matches = [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
    return [...new Set(matches.map(m => m[1].trim()))]
  }

  static extractTags(markdown: string): string[] {
    const matches = [...markdown.matchAll(/(?:^|\s)#([a-zA-Z0-9_-]+)/g)]
    return [...new Set(matches.map(m => m[1]))]
  }
}
