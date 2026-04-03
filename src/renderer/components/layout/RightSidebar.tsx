// src/renderer/components/layout/RightSidebar.tsx
import React, { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import { ipc } from '../../lib/ipc'
import type { BacklinkResult } from '@shared/types/Note'
import styles from './RightSidebar.module.css'

export function RightSidebar(): JSX.Element {
  const note = useEditorStore(s => s.note)
  const setOpenNote = useVaultStore(s => s.setOpenNote)
  const loadNote = useEditorStore(s => s.loadNote)
  const [backlinks, setBacklinks] = useState<BacklinkResult[]>([])

  useEffect(() => {
    if (!note) { setBacklinks([]); return }
    ipc.notes.getBacklinks(note.id).then(setBacklinks).catch(() => setBacklinks([]))
  }, [note?.id])

  const open = (id: string): void => { setOpenNote(id); loadNote(id) }

  return (
    <div className={styles.root}>
      <div className={styles.section}>Backlinks {backlinks.length > 0 && `(${backlinks.length})`}</div>
      <div className={styles.list}>
        {backlinks.length === 0
          ? <div className={styles.empty}>{note ? 'No backlinks yet' : 'Open a note to see backlinks'}</div>
          : backlinks.map((bl, i) => (
              <button key={i} className={styles.backlink} onClick={() => open(bl.sourceNoteId)}>
                <div className={styles.blTitle}>{bl.sourceTitle}</div>
                <div className={styles.blLink}>← [[{bl.linkText}]]</div>
              </button>
            ))
        }
      </div>
    </div>
  )
}
