// src/renderer/components/layout/RightSidebar.tsx
import React, { useEffect, useMemo } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useTabStore } from '../../stores/tabStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { OutlinePanel } from './OutlinePanel'
import { PropertiesPanel } from './PropertiesPanel'
import { TocPanel } from './TocPanel'
import styles from './RightSidebar.module.css'

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g

const TABS: { id: 'backlinks' | 'outline' | 'toc' | 'properties'; label: string }[] = [
  { id: 'backlinks',  label: 'Links'   },
  { id: 'outline',    label: 'Outline' },
  { id: 'toc',        label: 'TOC'     },
  { id: 'properties', label: 'Props'   },
]

export function RightSidebar(): JSX.Element {
  const note           = useEditorStore(s => s.note)
  const markdown       = useEditorStore(s => s.markdown)
  const saveStatus     = useEditorStore(s => s.saveStatus)
  const notes          = useVaultStore(s => s.notes)
  const activeTab      = useRightPanelStore(s => s.activeTab)
  const setTab         = useRightPanelStore(s => s.setTab)
  const backlinks      = useRightPanelStore(s => s.backlinks)
  const fetchBacklinks = useRightPanelStore(s => s.fetchBacklinks)

  // Outgoing links — derived live from current markdown
  const outgoingLinks = useMemo(() => {
    const titles = [...markdown.matchAll(WIKI_LINK_RE)].map(m => m[1].trim())
    return [...new Set(titles)]
      .map(title => notes.find(n => n.title === title && n.noteType !== 'folder'))
      .filter((n): n is NonNullable<typeof n> => n != null)
  }, [markdown, notes])

  // Fetch backlinks on note change and after each save
  useEffect(() => {
    if (!note) return
    void fetchBacklinks(note.id)
  }, [note?.id, fetchBacklinks])

  useEffect(() => {
    if (saveStatus !== 'saved' || !note) return
    void fetchBacklinks(note.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatus])

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
            {outgoingLinks.length > 0 && (
              <>
                <div className={styles.sectionLabel}>Outgoing</div>
                {outgoingLinks.map(n => (
                  <button key={n.id} className={styles.backlink} onClick={() => open(n.id, n.title)}>
                    <div className={styles.blTitle}>{n.title}</div>
                    <div className={styles.blLink}>→ [[{n.title}]]</div>
                  </button>
                ))}
              </>
            )}
            {backlinks.length > 0 && (
              <>
                <div className={styles.sectionLabel}>Backlinks</div>
                {backlinks.map((bl, i) => (
                  <button key={i} className={styles.backlink} onClick={() => open(bl.sourceNoteId, bl.sourceTitle)}>
                    <div className={styles.blTitle}>{bl.sourceTitle}</div>
                    <div className={styles.blLink}>← [[{bl.linkText}]]</div>
                  </button>
                ))}
              </>
            )}
            {outgoingLinks.length === 0 && backlinks.length === 0 && (
              <div className={styles.empty}>{note ? 'No links yet' : 'Open a note'}</div>
            )}
          </div>
        )}

        {activeTab === 'outline' && <OutlinePanel />}

        {activeTab === 'toc' && <TocPanel />}

        {activeTab === 'properties' && <PropertiesPanel />}
      </div>
    </div>
  )
}
