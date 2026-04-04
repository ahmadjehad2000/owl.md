// src/renderer/components/layout/AppShell.tsx
import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
import { useTabStore } from '../../stores/tabStore'
import { useEditorStore } from '../../stores/editorStore'
import { MenuBar } from './MenuBar'
import { CommandPalette } from '../command/CommandPalette'
import { VaultManagerModal } from '../vault/VaultManagerModal'
import { SettingsModal } from '../settings/SettingsModal'
import styles from './AppShell.module.css'

const MIN_SIDEBAR = 160
const MAX_SIDEBAR = 420
const DEFAULT_LEFT  = 220
const DEFAULT_RIGHT = 240

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

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

  const [leftWidth,  setLeftWidth]  = useState(() => {
    const saved = localStorage.getItem('owl:sidebar-left')
    return saved ? clamp(Number(saved), MIN_SIDEBAR, MAX_SIDEBAR) : DEFAULT_LEFT
  })
  const [rightWidth, setRightWidth] = useState(() => {
    const saved = localStorage.getItem('owl:sidebar-right')
    return saved ? clamp(Number(saved), MIN_SIDEBAR, MAX_SIDEBAR) : DEFAULT_RIGHT
  })

  const draggingRef  = useRef<'left' | 'right' | null>(null)
  const startXRef    = useRef(0)
  const startWRef    = useRef(0)

  const onResizerMouseDown = useCallback((side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = side
    startXRef.current   = e.clientX
    startWRef.current   = side === 'left' ? leftWidth : rightWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [leftWidth, rightWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      const dx = e.clientX - startXRef.current
      if (draggingRef.current === 'left') {
        const w = clamp(startWRef.current + dx, MIN_SIDEBAR, MAX_SIDEBAR)
        setLeftWidth(w)
        localStorage.setItem('owl:sidebar-left', String(w))
      } else {
        const w = clamp(startWRef.current - dx, MIN_SIDEBAR, MAX_SIDEBAR)
        setRightWidth(w)
        localStorage.setItem('owl:sidebar-right', String(w))
      }
    }
    const onUp = (): void => {
      draggingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

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
      if (e.shiftKey) { useTabStore.getState().prevTab() }
      else            { useTabStore.getState().nextTab() }
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
                    <button className={styles.vaultTabName} onClick={() => activateVault(v.path)}>
                      {v.name}
                    </button>
                    <button
                      className={styles.vaultTabClose}
                      onClick={e => { e.stopPropagation(); void closeVault(v.path) }}
                      title="Close bucket"
                    >×</button>
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
        <div className={styles.sidebarLeft} style={{ width: leftWidth }}>
          {sidebar}
        </div>
        <div className={styles.resizer} onMouseDown={onResizerMouseDown('left')} />
        <div className={styles.editorArea}>{children}</div>
        <div className={styles.resizer} onMouseDown={onResizerMouseDown('right')} />
        <div className={styles.sidebarRight} style={{ width: rightWidth }}>
          {rightPanel}
        </div>
      </div>
      <CommandPalette />
      <VaultManagerModal />
      <SettingsModal />
    </div>
  )
}
