// src/renderer/components/layout/RightSidebar.tsx
import React, { useEffect } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useTabStore } from '../../stores/tabStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { OutlinePanel } from './OutlinePanel'
import { PropertiesPanel } from './PropertiesPanel'
import { TocPanel } from './TocPanel'
import styles from './RightSidebar.module.css'

const TABS: { id: 'backlinks' | 'outline' | 'toc' | 'properties'; label: string }[] = [
  { id: 'backlinks',  label: 'Links'   },
  { id: 'outline',    label: 'Outline' },
  { id: 'toc',        label: 'TOC'     },
  { id: 'properties', label: 'Props'   },
]

export function RightSidebar(): JSX.Element {
  const note           = useEditorStore(s => s.note)
  const activeTab      = useRightPanelStore(s => s.activeTab)
  const setTab         = useRightPanelStore(s => s.setTab)
  const backlinks      = useRightPanelStore(s => s.backlinks)
  const fetchBacklinks = useRightPanelStore(s => s.fetchBacklinks)

  useEffect(() => {
    if (!note) return
    void fetchBacklinks(note.id)
  }, [note?.id, fetchBacklinks])

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

        {activeTab === 'toc' && <TocPanel />}

        {activeTab === 'properties' && <PropertiesPanel />}
      </div>
    </div>
  )
}
