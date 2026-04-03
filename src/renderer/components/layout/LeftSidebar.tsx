// src/renderer/components/layout/LeftSidebar.tsx
import React, { useCallback } from 'react'
import { useVaultStore } from '../../stores/vaultStore'
import { useTabStore } from '../../stores/tabStore'
import { ipc } from '../../lib/ipc'
import styles from './LeftSidebar.module.css'
import type { Note } from '@shared/types/Note'

export function LeftSidebar(): JSX.Element {
  const notes        = useVaultStore(s => s.notes)
  const loadNotes    = useVaultStore(s => s.loadNotes)
  const createFolder = useVaultStore(s => s.createFolder)
  const openTab      = useTabStore(s => s.openTab)
  const tabs         = useTabStore(s => s.tabs)
  const activeTabId  = useTabStore(s => s.activeTabId)

  const activeNoteId = tabs.find(t => t.id === activeTabId)?.noteId ?? null

  const openNote = useCallback((note: Note) => {
    openTab(note.id, note.title)
  }, [openTab])

  const createNote = useCallback(async () => {
    const title = `Untitled ${new Date().toLocaleDateString()}`
    const { note } = await ipc.notes.create(title, '')
    await loadNotes()
    openTab(note.id, note.title)
  }, [loadNotes, openTab])

  const handleNewFolder = useCallback(async () => {
    const name = `New Parent Knowledge Base ${Date.now().toString().slice(-4)}`
    await createFolder(name)
  }, [createFolder])

  const folders   = notes.filter(n => n.noteType === 'folder').sort((a, b) => a.orderIndex - b.orderIndex)
  const rootNotes = notes.filter(n => n.noteType !== 'folder' && !n.parentId).sort((a, b) => a.orderIndex - b.orderIndex)

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <span>All Notes</span>
        <div className={styles.headerActions}>
          <button className={styles.addButton} onClick={createNote} title="Child Knowledge Base">+</button>
          <button className={styles.addButton} onClick={handleNewFolder} title="New Parent Knowledge Base">📁</button>
        </div>
      </div>
      <div className={styles.noteList}>
        {folders.map(folder => {
          const children = notes
            .filter(n => n.noteType !== 'folder' && n.parentId === folder.id)
            .sort((a, b) => a.orderIndex - b.orderIndex)
          return (
            <FolderRow key={folder.id} folder={folder}>
              {children.map(n => (
                <NoteRow key={n.id} note={n} active={n.id === activeNoteId} indent onClick={() => openNote(n)} />
              ))}
            </FolderRow>
          )
        })}
        {rootNotes.map(n => (
          <NoteRow key={n.id} note={n} active={n.id === activeNoteId} indent={false} onClick={() => openNote(n)} />
        ))}
      </div>
    </div>
  )
}

function FolderRow({ folder, children }: { folder: Note; children: React.ReactNode }): JSX.Element {
  const [expanded, setExpanded] = React.useState(true)
  return (
    <div className={styles.folderGroup}>
      <button className={styles.folderRow} onClick={() => setExpanded(e => !e)}>
        <span className={styles.folderArrow}>{expanded ? '▼' : '▶'}</span>
        <span className={styles.folderIcon}>📁</span>
        <span className={styles.title}>{folder.title}</span>
      </button>
      {expanded && <div className={styles.folderChildren}>{children}</div>}
    </div>
  )
}

function NoteRow({ note, active, indent, onClick }: {
  note: Note; active: boolean; indent: boolean; onClick: () => void
}): JSX.Element {
  return (
    <button
      className={`${styles.noteItem} ${active ? styles.active : ''} ${indent ? styles.indented : ''}`}
      onClick={onClick}
    >
      <span className={styles.icon}>📄</span>
      <span className={styles.title}>{note.title}</span>
    </button>
  )
}
