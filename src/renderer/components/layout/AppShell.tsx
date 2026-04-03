// src/renderer/components/layout/AppShell.tsx
import React, { useEffect, useCallback } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useVaultStore } from '../../stores/vaultStore'
import styles from './AppShell.module.css'

interface AppShellProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  rightPanel: React.ReactNode
}

export function AppShell({ sidebar, children, rightPanel }: AppShellProps): JSX.Element {
  const config = useVaultStore(s => s.config)
  const openSearch = useSearchStore(s => s.open)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault()
      openSearch()
    }
  }, [openSearch])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={styles.root}>
      <div className={styles.titlebar}>
        <span className={styles.titleName}>{config?.name ?? 'owl.md'}</span>
        <button className={styles.searchShortcut} onClick={openSearch}>⌘F</button>
      </div>
      <div className={styles.body}>
        <div className={styles.sidebarLeft}>{sidebar}</div>
        <div className={styles.editorArea}>{children}</div>
        <div className={styles.sidebarRight}>{rightPanel}</div>
      </div>
    </div>
  )
}
