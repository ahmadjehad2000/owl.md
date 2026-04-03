// src/renderer/components/editor/TabBar.tsx
import React from 'react'
import { useTabStore } from '../../stores/tabStore'
import { useVaultStore } from '../../stores/vaultStore'
import { ipc } from '../../lib/ipc'
import styles from './TabBar.module.css'

export function TabBar(): JSX.Element {
  const tabs        = useTabStore(s => s.tabs)
  const activeTabId = useTabStore(s => s.activeTabId)
  const activateTab = useTabStore(s => s.activateTab)
  const closeTab    = useTabStore(s => s.closeTab)
  const openTab     = useTabStore(s => s.openTab)
  const loadNotes   = useVaultStore(s => s.loadNotes)

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
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
            onClick={() => activateTab(tab.id)}
          >
            <span className={styles.tabTitle}>{tab.title}</span>
            {tab.isDirty && <span className={styles.tabDirty}>●</span>}
            <span
              className={styles.tabClose}
              role="button"
              onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
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
