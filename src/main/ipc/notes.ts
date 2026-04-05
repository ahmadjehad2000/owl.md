// src/main/ipc/notes.ts
import { ipcMain } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname, basename, resolve, relative } from 'path'
import { randomUUID } from 'crypto'
import type { Note, NoteContent, NoteSlim } from '@shared/types/Note'
import type { DatabaseService } from '../services/DatabaseService'
import type { VaultService } from '../services/VaultService'
import type { IndexService } from '../services/IndexService'

export function registerNotesHandlers(services: {
  db: () => DatabaseService
  vault: () => VaultService
  index: () => IndexService
}): void {
  const db = () => services.db().get()

  ipcMain.handle('notes:list', (): Note[] =>
    db().prepare('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC').all() as Note[]
  )

  ipcMain.handle('notes:list-slim', (): NoteSlim[] => {
    return db().prepare(
      `SELECT id, path, title, parent_id, folder_path, note_type, order_index, pinned, deleted_at
       FROM notes WHERE deleted_at IS NULL ORDER BY order_index ASC`
    ).all() as NoteSlim[]
  })

  ipcMain.handle('notes:read', (_e, id: string): NoteContent => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
    if (!note) throw new Error(`Note not found: ${id}`)
    const raw = note as unknown as Record<string, unknown>
    if ((raw.note_type ?? raw.noteType) === 'folder') throw new Error(`Cannot read folder note: ${id}`)
    return { note, markdown: services.vault().readNote(note.path) }
  })

  ipcMain.handle('notes:save', (_e, id: string, markdown: string): Note => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
    if (!note) throw new Error(`Note not found: ${id}`)
    const rawSave = note as unknown as Record<string, unknown>
    if ((rawSave.note_type ?? rawSave.noteType) === 'folder') throw new Error(`Cannot save folder note: ${id}`)
    services.vault().writeNote(note.path, markdown)
    const folderPath = dirname(note.path) === '.' ? '' : dirname(note.path)
    const raw = note as unknown as Record<string, unknown>
    const noteType = (raw.note_type ?? raw.noteType ?? 'note') as Note['noteType']
    // Title is owned by the DB (set via notes:rename); never extract from file content
    const dbTitle = (db().prepare('SELECT title FROM notes WHERE id = ?').get(id) as { title: string }).title
    services.index().indexNote({ id, path: note.path, title: dbTitle, markdown, folderPath, noteType })
    services.index().syncFTS(id, dbTitle, markdown)
    services.index().resolveLinksForNote(id)
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
  })

  ipcMain.handle('notes:create', (_e, title: string, folderPath: string, noteType?: string): NoteContent => {
    if (folderPath) {
      const notesRoot = join(services.vault().getRoot(), 'notes')
      const resolved = resolve(join(notesRoot, folderPath))
      if (relative(notesRoot, resolved).startsWith('..')) {
        throw new Error('Invalid folder path')
      }
    }
    const id = crypto.randomUUID()
    const base = title.replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '-') || 'untitled'
    let fileName = `${base}.md`
    let notePath = folderPath ? `${folderPath}/${fileName}` : fileName
    let counter = 1
    while (services.vault().noteExists(notePath)) {
      fileName = `${base}-${counter}.md`
      notePath = folderPath ? `${folderPath}/${fileName}` : fileName
      counter++
    }
    const type = noteType ?? 'note'
    const markdown = type === 'canvas' ? '{"cards":[],"connections":[]}' : ''
    services.vault().writeNote(notePath, markdown)
    services.index().indexNote({ id, path: notePath, title, markdown, folderPath, noteType: type })
    services.index().syncFTS(id, title, markdown)
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
    return { note, markdown }
  })

  ipcMain.handle('notes:delete', (_e, id: string): void => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined
    if (!note) return
    const rawDel = note as unknown as Record<string, unknown>
    if ((rawDel.note_type ?? rawDel.noteType) === 'folder') {
      services.index().removeNote(id)
      return
    }
    // Remove DB record first so the note disappears from the UI immediately.
    // Then attempt file deletion — if the file is already gone that's fine.
    services.index().removeNote(id)
    try {
      services.vault().deleteNote(note.path)
    } catch {
      // File may already be missing (external deletion, rename, etc.) — not fatal.
    }
  })

  ipcMain.handle('notes:getBacklinks', (_e, id: string) =>
    services.index().getBacklinks(id)
  )

  ipcMain.handle('notes:getGraphData', () =>
    services.index().getGraphData()
  )

  ipcMain.handle('notes:create-folder', (_e, name: string): Note => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const result = db().prepare(
      `SELECT COALESCE(MAX(order_index), -1) as m FROM notes WHERE parent_id IS NULL`
    ).get() as { m: number }
    db().prepare(`
      INSERT INTO notes (id, path, title, content_hash, created_at, updated_at,
                         parent_id, folder_path, note_type, order_index)
      VALUES (?, ?, ?, '', ?, ?, NULL, '', 'folder', ?)
    `).run(id, `__folder__/${id}`, name, now, now, result.m + 1)
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
  })

  ipcMain.handle('notes:move',
    (_e, noteId: string, newParentId: string | null, orderIndex: number): void => {
      db().prepare(
        'UPDATE notes SET parent_id = ?, order_index = ?, updated_at = ? WHERE id = ?'
      ).run(newParentId, orderIndex, Date.now(), noteId)
    }
  )

  ipcMain.handle('notes:rename', (_e, id: string, newTitle: string): Note => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined
    if (!note) throw new Error(`Note not found: ${id}`)
    // Only update the DB title — never touch the markdown file.
    // The persistent title bar owns the title; file content is separate.
    db().prepare('UPDATE notes SET title = ?, updated_at = ? WHERE id = ?')
      .run(newTitle, Date.now(), id)
    // Sync FTS title without changing file content
    const row = db().prepare('SELECT rowid FROM notes WHERE id = ?').get(id) as { rowid: number } | undefined
    if (row) {
      db().prepare('DELETE FROM notes_fts WHERE rowid = ?').run(row.rowid)
      const raw = note as unknown as Record<string, unknown>
      const content = (raw.note_type ?? raw.noteType) !== 'folder'
        ? services.vault().readNote(note.path)
        : ''
      db().prepare('INSERT INTO notes_fts(rowid, title, content) VALUES (?, ?, ?)').run(row.rowid, newTitle, content)
    }
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
  })

  ipcMain.handle('notes:duplicate', (_e, id: string): NoteContent => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined
    if (!note) throw new Error(`Note not found: ${id}`)
    const raw = note as unknown as Record<string, unknown>
    const noteType = (raw.note_type ?? raw.noteType ?? 'note') as Note['noteType']
    if (noteType === 'folder') throw new Error('Cannot duplicate a folder')

    const srcMarkdown = services.vault().readNote(note.path)
    const srcTitle    = (db().prepare('SELECT title FROM notes WHERE id = ?').get(id) as { title: string }).title
    const newTitle    = `${srcTitle} (Copy)`
    const newMarkdown = srcMarkdown.match(/^#\s+.+$/m)
      ? srcMarkdown.replace(/^#\s+.+$/m, `# ${newTitle}`)
      : `# ${newTitle}\n\n${srcMarkdown}`

    const folderPath = (raw.folder_path ?? raw.folderPath ?? '') as string
    const parentId   = (raw.parent_id   ?? raw.parentId   ?? null) as string | null

    const newId      = crypto.randomUUID()
    const fileName   = `${newTitle.replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '-')}.md`
    const newPath    = folderPath ? `${folderPath}/${fileName}` : fileName

    services.vault().writeNote(newPath, newMarkdown)
    services.index().indexNote({ id: newId, path: newPath, title: newTitle, markdown: newMarkdown, folderPath, noteType })
    services.index().syncFTS(newId, newTitle, newMarkdown)

    // Place immediately after source note
    const srcOrder = (db().prepare('SELECT order_index FROM notes WHERE id = ?').get(id) as { order_index: number }).order_index
    db().prepare('UPDATE notes SET order_index = order_index + 1 WHERE parent_id IS ? AND order_index > ?')
      .run(parentId, srcOrder)
    db().prepare('UPDATE notes SET parent_id = ?, order_index = ?, updated_at = ? WHERE id = ?')
      .run(parentId, srcOrder + 1, Date.now(), newId)

    const newNote = db().prepare('SELECT * FROM notes WHERE id = ?').get(newId) as Note
    return { note: newNote, markdown: newMarkdown }
  })

  ipcMain.handle('notes:pin', (_e, id: string, pinned: boolean): Note => {
    db().prepare('UPDATE notes SET pinned = ?, updated_at = ? WHERE id = ?')
      .run(pinned ? 1 : 0, Date.now(), id)
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
  })

  ipcMain.handle('notes:list-tags', (): Array<{ tag: string; count: number }> =>
    db().prepare(
      `SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC`
    ).all() as Array<{ tag: string; count: number }>
  )

  ipcMain.handle('notes:notes-by-tag', (_e, tag: string): Note[] => {
    const ids = (db().prepare('SELECT note_id FROM tags WHERE tag = ?').all(tag) as Array<{ note_id: string }>)
      .map(r => r.note_id)
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return db().prepare(`SELECT * FROM notes WHERE id IN (${placeholders})`).all(...ids) as Note[]
  })

  const todayKey = (): string => {
    const d = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  ipcMain.handle('notes:create-daily', (): NoteContent => {
    const title      = todayKey()
    const folderPath = 'Daily Notes'

    const existing = db().prepare(
      `SELECT * FROM notes WHERE title = ? AND folder_path = ? AND note_type = 'daily'`
    ).get(title, folderPath) as Note | undefined

    if (existing) {
      return { note: existing, markdown: services.vault().readNote(existing.path) }
    }

    const id       = randomUUID()
    const notePath = `${folderPath}/${title}.md`
    const markdown = `# ${title}\n\n`

    services.vault().writeNote(notePath, markdown)
    services.index().indexNote({ id, path: notePath, title, markdown, folderPath, noteType: 'daily' })
    services.index().syncFTS(id, title, markdown)

    const maxRow = db().prepare(
      `SELECT COALESCE(MAX(order_index), -1) as m FROM notes WHERE folder_path = ?`
    ).get(folderPath) as { m: number }
    db().prepare('UPDATE notes SET order_index = ? WHERE id = ?').run(maxRow.m + 1, id)

    return { note: db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note, markdown }
  })

  ipcMain.handle('notes:appendToDaily', (_e, text: string): void => {
    const title      = todayKey()
    const folderPath = 'Daily Notes'

    // Get or create the daily note
    let existing = db().prepare(
      `SELECT * FROM notes WHERE title = ? AND folder_path = ? AND note_type = 'daily'`
    ).get(title, folderPath) as Note | undefined

    if (!existing) {
      const id       = randomUUID()
      const notePath = `${folderPath}/${title}.md`
      const markdown = `# ${title}\n\n`
      try {
        services.vault().writeNote(notePath, markdown)
      } catch (err) {
        throw new Error(`Failed to create daily note: ${(err as Error).message}`)
      }
      services.index().indexNote({ id, path: notePath, title, markdown, folderPath, noteType: 'daily' })
      services.index().syncFTS(id, title, markdown)
      const maxRow = db().prepare(
        `SELECT COALESCE(MAX(order_index), -1) as m FROM notes WHERE folder_path = ?`
      ).get(folderPath) as { m: number }
      db().prepare('UPDATE notes SET order_index = ? WHERE id = ?').run(maxRow.m + 1, id)
      existing = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
    }

    // Append the captured text as a new section
    let current: string
    try {
      current = services.vault().readNote(existing.path)
    } catch (err) {
      throw new Error(`Failed to read daily note: ${(err as Error).message}`)
    }
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    const appended = current.trimEnd() + `\n\n---\n**${time}**\n\n${text.trim()}\n`
    try {
      services.vault().writeNote(existing.path, appended)
    } catch (err) {
      throw new Error(`Failed to write daily note: ${(err as Error).message}`)
    }
    services.index().indexNote({
      id: existing.id, path: existing.path, title,
      markdown: appended, folderPath, noteType: 'daily',
    })
    services.index().syncFTS(existing.id, title, appended)
  })

  ipcMain.handle('notes:save-image', (_e, base64Data: string, ext: string): string => {
    const root    = services.vault().getRoot()
    const imgDir  = join(root, 'attachments', 'images')
    mkdirSync(imgDir, { recursive: true })
    const safeExt  = ext.replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'png'
    const filename = `${randomUUID()}.${safeExt}`
    let buf: Buffer
    try {
      buf = Buffer.from(base64Data, 'base64')
    } catch {
      throw new Error('Invalid image data: could not decode base64')
    }
    writeFileSync(join(imgDir, filename), buf)
    return `attachments/images/${filename}`
  })
}
