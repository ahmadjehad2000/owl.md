// src/renderer/App.tsx
import React, { useState, useEffect, useRef } from 'react'
import { AppShell } from './components/layout/AppShell'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { RightSidebar } from './components/layout/RightSidebar'
import { NoteEditor } from './components/editor/NoteEditor'
import { SearchModal } from './components/search/SearchModal'
import { GraphView } from './components/graph/GraphView'
import { useVaultStore } from './stores/vaultStore'
import { useTabStore } from './stores/tabStore'
import { useEditorStore } from './stores/editorStore'
import { useSearchStore } from './stores/searchStore'
import { useCommandPaletteStore } from './stores/commandPaletteStore'
import { useGraphStore } from './stores/graphStore'
import { useSplitStore } from './stores/splitStore'
import { ipc } from './lib/ipc'
import styles from './App.module.css'
import type { VaultConfig } from '@shared/types/Note'

type Screen =
  | 'init'        // checking for last-opened vault
  | 'welcome'     // main welcome (no vault yet)
  | 'create'      // create vault — name input
  | 'loading'     // vault opening / creating
  | 'vault-list'  // pick from known vaults
  | 'ready'       // main app

const LOADING_MESSAGES = [
  'Sharpening your pencils…',
  'Teaching your notes to stay organized…',
  'Convincing folders to behave…',
  'Dusting off your ideas…',
  'Feeding the owl…',
  'Arranging your thoughts…',
  'Brewing your first idea…',
  'Waking up the index…',
]

const PARTICLES: React.CSSProperties[] = [
  { left: '6%',  bottom: '-10px', width: '3px', height: '3px', animationDelay: '0s',    animationDuration: '9s'   },
  { left: '14%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '1.3s',  animationDuration: '7s'   },
  { left: '23%', bottom: '-10px', width: '4px', height: '4px', animationDelay: '3.1s',  animationDuration: '11s'  },
  { left: '31%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '0.7s',  animationDuration: '8s'   },
  { left: '42%', bottom: '-10px', width: '3px', height: '3px', animationDelay: '5.2s',  animationDuration: '10s'  },
  { left: '51%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '2.4s',  animationDuration: '7.5s' },
  { left: '59%', bottom: '-10px', width: '4px', height: '4px', animationDelay: '4.0s',  animationDuration: '12s'  },
  { left: '67%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '1.8s',  animationDuration: '8.5s' },
  { left: '74%', bottom: '-10px', width: '3px', height: '3px', animationDelay: '6.5s',  animationDuration: '9.5s' },
  { left: '82%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '0.4s',  animationDuration: '7s'   },
  { left: '89%', bottom: '-10px', width: '3px', height: '3px', animationDelay: '3.8s',  animationDuration: '11s'  },
  { left: '95%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '2.0s',  animationDuration: '8s'   },
]

function Background(): JSX.Element {
  return (
    <div className={styles.bgScene} aria-hidden="true">
      <div className={styles.orb1} /><div className={styles.orb2} />
      <div className={styles.orb3} /><div className={styles.orb4} />
      <div className={styles.sweep} />
      {PARTICLES.map((style, i) => <div key={i} className={styles.particle} style={style} />)}
    </div>
  )
}

export default function App(): JSX.Element {
  const openVault   = useVaultStore(s => s.openVault)
  const createVault = useVaultStore(s => s.createVault)
  const notes       = useVaultStore(s => s.notes)

  const [screen,      setScreen]      = useState<Screen>('init')
  const [error,       setError]       = useState<string | null>(null)
  const [vaultName,   setVaultName]   = useState('')
  const [msgIndex,    setMsgIndex]    = useState(0)
  const [knownVaults, setKnownVaults] = useState<VaultConfig[]>([])
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Rotate loading message every 600ms
  useEffect(() => {
    if (screen !== 'loading') return
    const id = setInterval(() => setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length), 600)
    return () => clearInterval(id)
  }, [screen])

  // Focus name input when entering create screen
  useEffect(() => {
    if (screen === 'create') setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [screen])

  // On init: check for last-opened vault, auto-open if found
  useEffect(() => {
    ipc.vault.getLast().then(async (lastPath) => {
      if (!lastPath) { setScreen('welcome'); return }
      setMsgIndex(0)
      setScreen('loading')
      const minDelay = new Promise<void>(r => setTimeout(r, 2000))
      try {
        await Promise.all([openVault(lastPath), minDelay])
        setScreen('ready')
      } catch {
        setScreen('welcome')
      }
    }).catch(() => setScreen('welcome'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wiki-link navigation — handles [[Note]], [[Note#Heading]], [[#Heading]], [[https://...]]
  useEffect(() => {
    const handler = async (e: Event): Promise<void> => {
      const { href } = (e as CustomEvent<{ href: string }>).detail

      // External URL → open in default browser
      if (/^https?:\/\//.test(href)) {
        await ipc.shell.openExternal(href)
        return
      }

      // Parse "NoteName#heading" or "#heading"
      const hashIdx  = href.indexOf('#')
      const noteName = (hashIdx === -1 ? href : href.slice(0, hashIdx)).trim()
      const heading  = hashIdx === -1 ? '' : href.slice(hashIdx + 1).trim()

      if (noteName) {
        const linked = notes.find(n => n.title === noteName && n.noteType !== 'folder')
        if (linked) {
          const { isDirty, save } = useEditorStore.getState()
          if (isDirty) await save()
          useTabStore.getState().openTab(linked.id, linked.title)
        }
      }

      if (heading) {
        // Give the editor time to mount if we just switched notes
        const delay = noteName ? 150 : 0
        setTimeout(() => {
          const pm = document.querySelector('.ProseMirror')
          if (!pm) return
          const headings = pm.querySelectorAll('h1, h2, h3, h4, h5, h6')
          for (const h of headings) {
            const text = (h.textContent ?? '').trim()
            if (text === heading || text.toLowerCase().replace(/\s+/g, '-') === heading.toLowerCase().replace(/\s+/g, '-')) {
              h.scrollIntoView({ behavior: 'smooth', block: 'start' })
              return
            }
          }
        }, delay)
      }
    }
    window.addEventListener('owl:open-wiki-link', handler)
    return () => window.removeEventListener('owl:open-wiki-link', handler)
  }, [notes])

  // Global keyboard shortcuts (only active when vault is open)
  useEffect(() => {
    if (screen !== 'ready') return

    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey

      // Cmd+Shift+N — New note
      if (mod && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        const title = `Untitled ${new Date().toLocaleDateString()}`
        ipc.notes.create(title, '').then(async ({ note }) => {
          useVaultStore.getState().loadNotesSlim()
          useTabStore.getState().openTab(note.id, note.title)
        })
        return
      }

      // Cmd+Shift+F — Global search
      if (mod && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault()
        useSearchStore.getState().open()
        return
      }

      // Cmd+W — Close current tab
      if (mod && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        const { activeTabId } = useTabStore.getState()
        if (activeTabId) useTabStore.getState().closeTab(activeTabId)
        return
      }

      // Cmd+K — Command palette toggle
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        const { isOpen, open, close } = useCommandPaletteStore.getState()
        isOpen ? close() : open()
        return
      }

      // Ctrl+Tab — Next tab
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        useTabStore.getState().nextTab()
        return
      }

      // Ctrl+Shift+Tab — Previous tab
      if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        useTabStore.getState().prevTab()
        return
      }

      // Cmd+Shift+\ — Toggle split pane
      if (mod && e.shiftKey && e.key === '|') {
        e.preventDefault()
        const { isSplit, toggle } = useSplitStore.getState()
        const activeTab = useTabStore.getState().tabs.find(
          t => t.id === useTabStore.getState().activeTabId
        )
        toggle(activeTab?.noteId, activeTab?.title)
        return
      }

      // Cmd+G — Graph view
      if (mod && (e.key === 'g' || e.key === 'G') && !e.shiftKey) {
        e.preventDefault()
        const gs = useGraphStore.getState()
        if (gs.isOpen) { gs.close() } else {
          const activeTab = useTabStore.getState().tabs.find(
            t => t.id === useTabStore.getState().activeTabId
          )
          gs.open(activeTab?.noteId ?? null)
        }
        return
      }

      // Cmd+\ — Toggle left sidebar
      if (mod && e.key === '\\') {
        e.preventDefault()
        const sidebar = document.querySelector('[data-sidebar]') as HTMLElement | null
        if (sidebar) {
          sidebar.style.display = sidebar.style.display === 'none' ? '' : 'none'
        }
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [screen])

  const handleCreate = async (): Promise<void> => {
    const name = vaultName.trim()
    if (!name) return
    setError(null)
    setMsgIndex(0)
    setScreen('loading')
    const minDelay = new Promise<void>(r => setTimeout(r, 2000))
    try {
      await Promise.all([createVault(name), minDelay])
      setScreen('ready')
    } catch (e) {
      setError((e as Error).message)
      setScreen('create')
    }
  }

  const handleOpenExisting = async (path: string): Promise<void> => {
    setError(null)
    setMsgIndex(0)
    setScreen('loading')
    const minDelay = new Promise<void>(r => setTimeout(r, 2000))
    try {
      await Promise.all([openVault(path), minDelay])
      setScreen('ready')
    } catch (e) {
      setError((e as Error).message)
      setScreen('vault-list')
    }
  }

  const handleShowVaultList = async (): Promise<void> => {
    setError(null)
    try {
      const vaults = await ipc.vault.listKnown()
      setKnownVaults(vaults)
      setScreen('vault-list')
    } catch {
      setKnownVaults([])
      setScreen('vault-list')
    }
  }

  const safeFolder = vaultName.trim().replace(/[<>:"/\\|?*]/g, '-') || 'my-bucket'

  if (screen === 'init') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingLogo}>owl.md</div>
        <div className={styles.loadingBar}><div className={styles.loadingBarFill} /></div>
        <div className={styles.loadingMsg}>initializing…</div>
      </div>
    )
  }

  if (screen === 'loading') {
    return (
      <div className={`${styles.loadingScreen} ${styles.loadingScreenBg}`}>
        <Background />
        <div className={styles.gateContent}>
          <div className={styles.loadingLogo}>owl.md</div>
          <div className={styles.loadingBar}><div className={styles.loadingBarFill} /></div>
          <div className={styles.loadingMsg}>{LOADING_MESSAGES[msgIndex]}</div>
        </div>
      </div>
    )
  }

  if (screen === 'welcome' || screen === 'create' || screen === 'vault-list') {
    return (
      <div className={styles.vaultGate}>
        <Background />
        <div className={styles.gateContent}>
          <div className={styles.logoWrap}>
            <div className={styles.logoHalo} />
            <div className={styles.logo}>owl.md</div>
          </div>
          <div className={styles.tagline}>a knowledge workspace</div>

          {screen === 'welcome' && (
            <div className={styles.buttonGroup}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setScreen('create')}>
                Create Knowledge Bucket
              </button>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={handleShowVaultList}>
                Open Knowledge Bucket
              </button>
            </div>
          )}

          {screen === 'create' && (
            <div className={styles.createForm}>
              <input
                ref={nameInputRef}
                className={styles.nameInput}
                placeholder="Bucket name…"
                value={vaultName}
                onChange={e => setVaultName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                maxLength={64}
              />
              <div className={styles.nameHint}>
                Stored in Documents/{safeFolder}
              </div>
              <div className={styles.buttonGroup}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={handleCreate}
                  disabled={!vaultName.trim()}
                >
                  Create
                </button>
                <button
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={() => { setVaultName(''); setScreen('welcome') }}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {screen === 'vault-list' && (
            <div className={styles.vaultList}>
              {knownVaults.length === 0
                ? <div className={styles.vaultListEmpty}>No saved Knowledge Buckets yet.</div>
                : knownVaults.map(v => (
                    <button key={v.path} className={styles.vaultCard} onClick={() => handleOpenExisting(v.path)}>
                      <div className={styles.vaultCardName}>{v.name}</div>
                      <div className={styles.vaultCardPath}>{v.path}</div>
                    </button>
                  ))
              }
              <button
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnBack}`}
                onClick={() => setScreen('welcome')}
              >
                ← Back
              </button>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    )
  }

  // screen === 'ready'
  return (
    <>
      <AppShell sidebar={<LeftSidebar />} rightPanel={<RightSidebar />}>
        <NoteEditor />
      </AppShell>
      <SearchModal />
      <GraphView />
    </>
  )
}
