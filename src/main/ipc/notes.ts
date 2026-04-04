// src/main/ipc/notes.ts
import { ipcMain } from 'electron'
import { dirname, basename } from 'path'
import type { Note, NoteContent } from '@shared/types/Note'
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
    db().prepare('SELECT * FROM notes ORDER BY updated_at DESC').all() as Note[]
  )

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
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : basename(note.path, '.md')
    const folderPath = dirname(note.path) === '.' ? '' : dirname(note.path)
    const raw = note as unknown as Record<string, unknown>
    const noteType = (raw.note_type ?? raw.noteType ?? 'note') as Note['noteType']
    services.index().indexNote({ id, path: note.path, title, markdown, folderPath, noteType })
    services.index().syncFTS(id, title, markdown)
    services.index().resolveLinks()
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
  })

  ipcMain.handle('notes:create', (_e, title: string, folderPath: string): NoteContent => {
    const id = crypto.randomUUID()
    const fileName = `${title.replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '-')}.md`
    const notePath = folderPath ? `${folderPath}/${fileName}` : fileName
    const markdown = `# ${title}\n\n`
    services.vault().writeNote(notePath, markdown)
    services.index().indexNote({ id, path: notePath, title, markdown, folderPath, noteType: 'note' })
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
    services.vault().deleteNote(note.path)
    services.index().removeNote(id)
  })

  ipcMain.handle('notes:getBacklinks', (_e, id: string) =>
    services.index().getBacklinks(id)
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
    const raw = note as unknown as Record<string, unknown>
    const noteType = (raw.note_type ?? raw.noteType ?? 'note') as Note['noteType']
    if (noteType === 'folder') {
      // Folders have no markdown file — just update the DB title
      db().prepare('UPDATE notes SET title = ?, updated_at = ? WHERE id = ?')
        .run(newTitle, Date.now(), id)
      return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
    }
    const markdown = services.vault().readNote(note.path)
    const updated = markdown.match(/^#\s+.+$/m)
      ? markdown.replace(/^#\s+.+$/m, `# ${newTitle}`)
      : `# ${newTitle}\n\n${markdown}`
    services.vault().writeNote(note.path, updated)
    const folderPath = dirname(note.path) === '.' ? '' : dirname(note.path)
    services.index().indexNote({ id, path: note.path, title: newTitle, markdown: updated, folderPath, noteType })
    services.index().syncFTS(id, newTitle, updated)
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
}
