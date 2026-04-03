// src/renderer/components/layout/RightSidebar.tsx
import React, { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useTabStore } from '../../stores/tabStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { OutlinePanel } from './OutlinePanel'
import { PropertiesPanel } from './PropertiesPanel'
import { ipc } from '../../lib/ipc'
import type { BacklinkResult } from '@shared/types/Note'
import styles from './RightSidebar.module.css'

const TABS: { id: 'backlinks' | 'outline' | 'properties'; label: string }[] = [
  { id: 'backlinks',  label: 'Links'   },
  { id: 'outline',    label: 'Outline' },
  { id: 'properties', label: 'Props'   },
]

export function RightSidebar(): JSX.Element {
  const note       = useEditorStore(s => s.note)
  const activeTab   = useRightPanelStore(s => s.activeTab)
  const setTab      = useRightPanelStore(s => s.setTab)
  const [backlinks, setBacklinks] = useState<BacklinkResult[]>([])

  useEffect(() => {
    if (!note) { setBacklinks([]); return }
    ipc.notes.getBacklinks(note.id).then(setBacklinks).catch(() => setBacklinks([]))
  }, [note?.id])

  const open = (id: string, title: string): void => { useTabStore.getState().openTab(id, title) }

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {activeTab === 'backlinks' && (
          <div className={styles.list}>
            {backlinks.length === 0
              ? <div className={styles.empty}>{note ? 'No backlinks yet' : 'Open a note'}</div>
              : backlinks.map((bl, i) => (
                  <button key={i} className={styles.backlink} onClick={() => open(bl.sourceNoteId, bl.sourceTitle)}>
                    <div className={styles.blTitle}>{bl.sourceTitle}</div>
                    <div className={styles.blLink}>← [[{bl.linkText}]]</div>
                  </button>
                ))
            }
          </div>
        )}

        {activeTab === 'outline' && <OutlinePanel />}

        {activeTab === 'properties' && <PropertiesPanel />}
      </div>
    </div>
  )
}
