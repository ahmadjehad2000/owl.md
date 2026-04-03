// src/renderer/App.tsx
import React, { useState, useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { RightSidebar } from './components/layout/RightSidebar'
import { NoteEditor } from './components/editor/NoteEditor'
import { SearchModal } from './components/search/SearchModal'
import { useVaultStore } from './stores/vaultStore'
import { useEditorStore } from './stores/editorStore'
import styles from './App.module.css'

type AppState = 'loading' | 'gate' | 'ready'

export default function App(): JSX.Element {
  const config = useVaultStore(s => s.config)
  const openVault = useVaultStore(s => s.openVault)
  const createVault = useVaultStore(s => s.createVault)
  const notes = useVaultStore(s => s.notes)
  const setOpenNote = useVaultStore(s => s.setOpenNote)
  const loadNote = useEditorStore(s => s.loadNote)
  const [appState, setAppState] = useState<AppState>('loading')
  const [error, setError] = useState<string | null>(null)

  // Brief loading phase on first mount — lets Electron finish initializing
  useEffect(() => {
    const t = setTimeout(() => setAppState(config ? 'ready' : 'gate'), 800)
    return () => clearTimeout(t)
  }, [])

  // If vault is opened while loading, skip directly to ready
  useEffect(() => {
    if (config && appState !== 'loading') setAppState('ready')
  }, [config])

  // Navigate to a note when a [[wiki link]] is clicked
  useEffect(() => {
    const handler = (e: Event): void => {
      const { target } = (e as CustomEvent<{ target: string }>).detail
      const linked = notes.find(n => n.title === target)
      if (linked) { setOpenNote(linked.id); loadNote(linked.id) }
    }
    window.addEventListener('owl:open-wiki-link', handler)
    return () => window.removeEventListener('owl:open-wiki-link', handler)
  }, [notes, setOpenNote, loadNote])

  const handleOpen = async (): Promise<void> => {
    try {
      setError(null)
      const path = window.prompt('Enter vault path:')
      if (!path) return
      await openVault(path)
      setAppState('ready')
    } catch (e) { setError((e as Error).message) }
  }

  const handleCreate = async (): Promise<void> => {
    try {
      setError(null)
      const path = window.prompt('New vault path:')
      if (!path) return
      const name = window.prompt('Vault name:') ?? 'My Vault'
      await createVault(path, name)
      setAppState('ready')
    } catch (e) { setError((e as Error).message) }
  }

  if (appState === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingLogo}>owl.md</div>
        <div className={styles.loadingBar}>
          <div className={styles.loadingBarFill} />
        </div>
        <div className={styles.loadingMsg}>initializing…</div>
      </div>
    )
  }

  if (appState === 'gate') {
    return (
      <div className={styles.vaultGate}>
        <div className={styles.logo}>owl.md</div>
        <div className={styles.tagline}>local-first knowledge workspace</div>
        <div className={styles.buttonGroup}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleOpen}>Open Vault</button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={handleCreate}>Create Vault</button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    )
  }

  return (
    <>
      <AppShell sidebar={<LeftSidebar />} rightPanel={<RightSidebar />}>
        <NoteEditor />
      </AppShell>
      <SearchModal />
    </>
  )
}
