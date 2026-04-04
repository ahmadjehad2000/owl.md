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

  indexNote(params: IndexNoteParams): boolean {
    const { id, path, title, markdown, folderPath, noteType } = params
    const hash = createHash('sha256').update(markdown).digest('hex')

    const existing = this.db.prepare(
      'SELECT content_hash, path, title, folder_path, note_type FROM notes WHERE id = ?'
    ).get(id) as { content_hash: string; path: string; title: string; folder_path: string; note_type: string } | undefined

    if (existing && existing.content_hash === hash && existing.path === path
        && existing.title === title && existing.folder_path === folderPath
        && existing.note_type === noteType) {
      return false
    }

    const now = Date.now()
    const aliases = IndexService.extractAliasesFromFrontmatter(markdown).join(', ')

    this.db.prepare(`
      INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, folder_path, note_type, aliases)
      VALUES (@id, @path, @title, @hash, @now, @now, @folderPath, @noteType, @aliases)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path, title = excluded.title,
        content_hash = excluded.content_hash, updated_at = excluded.updated_at,
        folder_path = excluded.folder_path, note_type = excluded.note_type,
        aliases = excluded.aliases
    `).run({ id, path, title, hash, now, folderPath, noteType, aliases })

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

    // Sync alias index table
    this.db.prepare('DELETE FROM note_aliases WHERE note_id = ?').run(id)
    for (const alias of IndexService.extractAliasesFromFrontmatter(markdown)) {
      this.db.prepare('INSERT INTO note_aliases (note_id, alias) VALUES (?, ?)').run(id, alias)
    }

    return true
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
      let target = this.db.prepare(
        "SELECT id FROM notes WHERE title = ? AND note_type != 'folder'"
      ).get(link.link_text) as { id: string } | undefined

      // Alias fallback — O(1) lookup via index table
      if (!target) {
        const aliasRow = this.db.prepare(
          "SELECT note_id FROM note_aliases WHERE alias = ?"
        ).get(link.link_text) as { note_id: string } | undefined
        if (aliasRow) target = { id: aliasRow.note_id }
      }

      if (target) {
        this.db.prepare('UPDATE links SET target_note_id = ?, is_resolved = 1 WHERE rowid = ?')
          .run(target.id, link.rowid)
      }
    }
  }

  /** Resolve links only for a single source note */
  resolveLinksForNote(sourceNoteId: string): void {
    const unresolved = this.db.prepare(
      'SELECT rowid, link_text FROM links WHERE source_note_id = ? AND is_resolved = 0'
    ).all(sourceNoteId) as Array<{ rowid: number; link_text: string }>

    for (const link of unresolved) {
      let target = this.db.prepare(
        "SELECT id FROM notes WHERE title = ? AND note_type != 'folder'"
      ).get(link.link_text) as { id: string } | undefined

      if (!target) {
        const aliasRow = this.db.prepare(
          "SELECT note_id FROM note_aliases WHERE alias = ?"
        ).get(link.link_text) as { note_id: string } | undefined
        if (aliasRow) target = { id: aliasRow.note_id }
      }

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

  static extractAliasesFromFrontmatter(markdown: string): string[] {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!match) return []
    const yaml = match[1]
    for (const line of yaml.split('\n')) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const key = line.slice(0, colon).trim()
      if (key !== 'aliases') continue
      const raw = line.slice(colon + 1).trim()
      if (raw.startsWith('[') && raw.endsWith(']')) {
        return raw.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      }
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    }
    return []
  }
}
