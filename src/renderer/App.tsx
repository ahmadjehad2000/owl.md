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

// Pre-computed particle data — stable across renders, no JS randomness needed
const PARTICLES: React.CSSProperties[] = [
  { left: '6%',  bottom: '-10px', width: '3px', height: '3px', animationDelay: '0s',   animationDuration: '9s'  },
  { left: '14%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '1.3s', animationDuration: '7s'  },
  { left: '23%', bottom: '-10px', width: '4px', height: '4px', animationDelay: '3.1s', animationDuration: '11s' },
  { left: '31%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '0.7s', animationDuration: '8s'  },
  { left: '42%', bottom: '-10px', width: '3px', height: '3px', animationDelay: '5.2s', animationDuration: '10s' },
  { left: '51%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '2.4s', animationDuration: '7.5s'},
  { left: '59%', bottom: '-10px', width: '4px', height: '4px', animationDelay: '4.0s', animationDuration: '12s' },
  { left: '67%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '1.8s', animationDuration: '8.5s'},
  { left: '74%', bottom: '-10px', width: '3px', height: '3px', animationDelay: '6.5s', animationDuration: '9.5s'},
  { left: '82%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '0.4s', animationDuration: '7s'  },
  { left: '89%', bottom: '-10px', width: '3px', height: '3px', animationDelay: '3.8s', animationDuration: '11s' },
  { left: '95%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '2.0s', animationDuration: '8s'  },
]

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
        {/* Animated background — only on this welcome screen */}
        <div className={styles.bgScene} aria-hidden="true">
          <div className={styles.orb1} />
          <div className={styles.orb2} />
          <div className={styles.orb3} />
          <div className={styles.orb4} />
          <div className={styles.sweep} />
          {PARTICLES.map((style, i) => (
            <div key={i} className={styles.particle} style={style} />
          ))}
        </div>

        {/* Content above background */}
        <div className={styles.gateContent}>
          <div className={styles.logoWrap}>
            <div className={styles.logoHalo} />
            <div className={styles.logo}>owl.md</div>
          </div>
          <div className={styles.tagline}>a knowledge workspace</div>
          <div className={styles.buttonGroup}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleOpen}>Open Vault</button>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={handleCreate}>Create Vault</button>
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </div>
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
