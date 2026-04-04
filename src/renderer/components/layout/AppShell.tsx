// src/renderer/components/layout/AppShell.tsx
import React, { useEffect, useCallback } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
import { useTabStore } from '../../stores/tabStore'
import { useEditorStore } from '../../stores/editorStore'
import { MenuBar } from './MenuBar'
import { CommandPalette } from '../command/CommandPalette'
import { VaultManagerModal } from '../vault/VaultManagerModal'
import styles from './AppShell.module.css'

interface AppShellProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  rightPanel: React.ReactNode
}

export function AppShell({ sidebar, children, rightPanel }: AppShellProps): JSX.Element {
  const openSearch    = useSearchStore(s => s.open)
  const openPalette   = useCommandPaletteStore(s => s.open)
  const openedConfigs = useVaultStore(s => s.openedConfigs)
  const activateVault = useVaultStore(s => s.activateVault)
  const closeVault    = useVaultStore(s => s.closeVault)
  const activeConfig  = useVaultStore(s => s.config)

  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === 'f') { e.preventDefault(); openSearch() }
    if (mod && e.key === 'k') { e.preventDefault(); openPalette() }
    if (mod && e.key === 'w') {
      e.preventDefault()
      const { activeTabId, tabs, closeTab } = useTabStore.getState()
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId)
        if (tab?.isDirty) await useEditorStore.getState().save()
        closeTab(activeTabId)
      }
    }
    if (mod && e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        useTabStore.getState().prevTab()
      } else {
        useTabStore.getState().nextTab()
      }
    }
  }, [openSearch, openPalette])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={styles.root}>
      <div className={styles.titlebar}>
        <div className={styles.titlebarLeft}>
          <div className={styles.titlebarDot} />
          {openedConfigs.length > 1
            ? (
              <div className={styles.vaultSwitcher}>
                {openedConfigs.map(v => (
                  <div
                    key={v.path}
                    className={`${styles.vaultTab} ${v.path === activeConfig?.path ? styles.vaultTabActive : ''}`}
                  >
                    <button
                      className={styles.vaultTabName}
                      onClick={() => activateVault(v.path)}
                    >
                      {v.name}
                    </button>
                    <button
                      className={styles.vaultTabClose}
                      onClick={e => { e.stopPropagation(); void closeVault(v.path) }}
                      title="Close vault"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )
            : <span className={styles.titleName}>{activeConfig?.name ?? 'owl.md'}</span>
          }
        </div>
        <div className={styles.titlebarCenter} />
        <div className={styles.titlebarRight}>
          <button className={styles.searchShortcut} onClick={openSearch}>⌘F</button>
        </div>
      </div>
      <MenuBar />
      <div className={styles.body}>
        <div className={styles.sidebarLeft}>{sidebar}</div>
        <div className={styles.editorArea}>{children}</div>
        <div className={styles.sidebarRight}>{rightPanel}</div>
      </div>
      <CommandPalette />
      <VaultManagerModal />
    </div>
  )
}
