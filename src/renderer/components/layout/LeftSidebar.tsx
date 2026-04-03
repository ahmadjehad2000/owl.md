// src/renderer/components/layout/LeftSidebar.tsx
import React, { useCallback } from 'react'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '../../stores/editorStore'
import { ipc } from '../../lib/ipc'
import styles from './LeftSidebar.module.css'
import type { Note } from '@shared/types/Note'

export function LeftSidebar(): JSX.Element {
  const notes = useVaultStore(s => s.notes)
  const openNoteId = useVaultStore(s => s.openNoteId)
  const pinnedIds = useVaultStore(s => s.pinnedIds)
  const recentIds = useVaultStore(s => s.recentIds)
  const setOpenNote = useVaultStore(s => s.setOpenNote)
  const loadNotes = useVaultStore(s => s.loadNotes)
  const loadNote = useEditorStore(s => s.loadNote)

  const openNote = useCallback((id: string) => {
    setOpenNote(id)
    loadNote(id)
  }, [setOpenNote, loadNote])

  const createNote = useCallback(async () => {
    const title = `Untitled ${new Date().toLocaleDateString()}`
    const { note } = await ipc.notes.create(title, '')
    await loadNotes()
    openNote(note.id)
  }, [loadNotes, openNote])

  const pinned = pinnedIds.map(id => notes.find(n => n.id === id)).filter(Boolean) as Note[]
  const recent = recentIds.map(id => notes.find(n => n.id === id)).filter(Boolean).slice(0, 5) as Note[]
  const all = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className={styles.root}>
      {pinned.length > 0 && (
        <>
          <div className={styles.section}>Pinned</div>
          {pinned.map(n => <NoteRow key={n.id} note={n} active={n.id === openNoteId} icon="⭐" onClick={() => openNote(n.id)} />)}
          <div className={styles.divider} />
        </>
      )}
      {recent.length > 0 && (
        <>
          <div className={styles.section}>Recent</div>
          {recent.map(n => <NoteRow key={n.id} note={n} active={n.id === openNoteId} icon="🕐" onClick={() => openNote(n.id)} />)}
          <div className={styles.divider} />
        </>
      )}
      <div className={styles.section}>
        All Notes
        <button className={styles.addButton} onClick={createNote} title="New note">+</button>
      </div>
      <div className={styles.noteList}>
        {all.map(n => <NoteRow key={n.id} note={n} active={n.id === openNoteId} icon="📄" onClick={() => openNote(n.id)} />)}
      </div>
    </div>
  )
}

function NoteRow({ note, active, icon, onClick }: { note: Note; active: boolean; icon: string; onClick: () => void }): JSX.Element {
  return (
    <button className={`${styles.noteItem} ${active ? styles.active : ''}`} onClick={onClick}>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.title}>{note.title}</span>
    </button>
  )
}
