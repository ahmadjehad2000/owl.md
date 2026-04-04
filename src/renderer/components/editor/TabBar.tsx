// src/renderer/components/editor/TabBar.tsx
import React, { useRef, useState } from 'react'
import { useTabStore } from '../../stores/tabStore'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import { ipc } from '../../lib/ipc'
import styles from './TabBar.module.css'

export function TabBar(): JSX.Element {
  const tabs         = useTabStore(s => s.tabs)
  const activeTabId  = useTabStore(s => s.activeTabId)
  const activateTab  = useTabStore(s => s.activateTab)
  const closeTab     = useTabStore(s => s.closeTab)
  const openTab      = useTabStore(s => s.openTab)
  const reorderTabs  = useTabStore(s => s.reorderTabs)
  const loadNotes    = useVaultStore(s => s.loadNotes)

  const dragTabId   = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const handleNew = async (): Promise<void> => {
    const title = `Untitled ${new Date().toLocaleDateString()}`
    const { note } = await ipc.notes.create(title, '')
    await loadNotes()
    openTab(note.id, note.title)
  }

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabList}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            draggable
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''} ${dragOverId === tab.id && dragTabId.current !== tab.id ? styles.tabDragOver : ''}`}
            onClick={() => activateTab(tab.id)}
            onDragStart={e => { dragTabId.current = tab.id; e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={e => { e.preventDefault(); setDragOverId(tab.id) }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={e => {
              e.preventDefault()
              if (dragTabId.current && dragTabId.current !== tab.id) {
                reorderTabs(dragTabId.current, tab.id)
              }
              dragTabId.current = null
              setDragOverId(null)
            }}
            onDragEnd={() => { dragTabId.current = null; setDragOverId(null) }}
          >
            <span className={styles.tabTitle}>{tab.title}</span>
            {tab.isDirty && <span className={styles.tabDirty}>●</span>}
            <span
              className={styles.tabClose}
              role="button"
              onClick={async e => {
                e.stopPropagation()
                const t = useTabStore.getState().tabs.find(x => x.id === tab.id)
                if (t?.isDirty) await useEditorStore.getState().save()
                closeTab(tab.id)
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      <button className={styles.tabNew} onClick={handleNew} title="New note">+</button>
    </div>
  )
}
