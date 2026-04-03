// src/renderer/components/vault/VaultManagerModal.tsx
import React, { useState, useEffect, useRef } from 'react'
import { useVaultManagerStore } from '../../stores/vaultManagerStore'
import { useVaultStore } from '../../stores/vaultStore'
import { ipc } from '../../lib/ipc'
import type { VaultConfig } from '@shared/types/Note'
import styles from './VaultManagerModal.module.css'

const LOADING_MESSAGES = [
  'Sharpening your pencils…',
  'Teaching your notes to stay organized…',
  'Convincing folders to behave…',
  'Dusting off your ideas…',
  'Feeding the owl…',
  'Arranging your thoughts…',
]

type ModalScreen = 'input' | 'choice' | 'loading'

export function VaultManagerModal(): JSX.Element | null {
  const isOpen = useVaultManagerStore(s => s.isOpen)
  const mode   = useVaultManagerStore(s => s.mode)
  const hide   = useVaultManagerStore(s => s.hide)

  const openVault    = useVaultStore(s => s.openVault)
  const createVault  = useVaultStore(s => s.createVault)
  const loadSessions = useVaultStore(s => s.loadSessions)

  const [screen,      setScreen]      = useState<ModalScreen>('input')
  const [vaultName,   setVaultName]   = useState('')
  const [knownVaults, setKnownVaults] = useState<VaultConfig[]>([])
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [msgIndex,    setMsgIndex]    = useState(0)
  const [error,       setError]       = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setScreen('input')
      setVaultName('')
      setError(null)
      setPendingPath(null)
      setPendingName(null)
    }
  }, [isOpen])

  // Load vault list when opening in 'open' mode
  useEffect(() => {
    if (isOpen && mode === 'open') {
      ipc.vault.listKnown().then(setKnownVaults).catch(() => setKnownVaults([]))
    }
  }, [isOpen, mode])

  // Focus name input
  useEffect(() => {
    if (isOpen && screen === 'input' && mode === 'create') {
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [isOpen, screen, mode])

  // Rotate loading message
  useEffect(() => {
    if (screen !== 'loading') return
    const id = setInterval(() => setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length), 600)
    return () => clearInterval(id)
  }, [screen])

  const runWithChoice = async (doOpen: () => Promise<void>, replaceOnly: boolean): Promise<void> => {
    setMsgIndex(0)
    setScreen('loading')
    setError(null)
    const minDelay = new Promise<void>(r => setTimeout(r, 2000))
    try {
      await Promise.all([doOpen(), minDelay])
      if (!replaceOnly) await loadSessions()
      hide()
    } catch (e) {
      setError((e as Error).message)
      setScreen('choice')
    }
  }

  const handleCreateSubmit = (): void => {
    const name = vaultName.trim()
    if (!name) return
    setPendingName(name)
    setScreen('choice')
  }

  const handleOpenExisting = (path: string): void => {
    setPendingPath(path)
    setScreen('choice')
  }

  const handleChoiceReplace = (): void => {
    if (mode === 'create' && pendingName) {
      runWithChoice(() => createVault(pendingName), true)
    } else if (pendingPath) {
      runWithChoice(() => openVault(pendingPath), true)
    }
  }

  const handleChoiceBoth = (): void => {
    if (mode === 'create' && pendingName) {
      runWithChoice(() => createVault(pendingName), false)
    } else if (pendingPath) {
      runWithChoice(() => openVault(pendingPath), false)
    }
  }

  if (!isOpen) return null

  const safeFolder  = vaultName.trim().replace(/[<>:"/\\|?*]/g, '-') || 'my-vault'
  const pendingLabel = mode === 'create'
    ? pendingName
    : knownVaults.find(v => v.path === pendingPath)?.name ?? pendingPath

  return (
    <div className={styles.overlay} onMouseDown={hide}>
      <div className={styles.modal} onMouseDown={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={hide}>×</button>

        {screen === 'input' && mode === 'create' && (
          <>
            <h2 className={styles.title}>Create New Vault</h2>
            <input
              ref={nameInputRef}
              className={styles.nameInput}
              placeholder="Vault name…"
              value={vaultName}
              onChange={e => setVaultName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateSubmit() }}
              maxLength={64}
            />
            <div className={styles.hint}>Will be created at Documents/{safeFolder}</div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={handleCreateSubmit} disabled={!vaultName.trim()}>
                Continue
              </button>
              <button className={styles.btnSecondary} onClick={hide}>Cancel</button>
            </div>
          </>
        )}

        {screen === 'input' && mode === 'open' && (
          <>
            <h2 className={styles.title}>Open Vault</h2>
            {knownVaults.length === 0
              ? <div className={styles.empty}>No saved vaults. Create one first.</div>
              : <div className={styles.vaultList}>
                  {knownVaults.map(v => (
                    <button key={v.path} className={styles.vaultCard} onClick={() => handleOpenExisting(v.path)}>
                      <div className={styles.vaultCardName}>{v.name}</div>
                      <div className={styles.vaultCardPath}>{v.path}</div>
                    </button>
                  ))}
                </div>
            }
            {error && <div className={styles.error}>{error}</div>}
            <button className={styles.btnSecondary} onClick={hide} style={{ marginTop: 8 }}>Cancel</button>
          </>
        )}

        {screen === 'choice' && (
          <>
            <h2 className={styles.title}>How would you like to open it?</h2>
            <p className={styles.choiceDesc}>
              <strong>{pendingLabel}</strong>
            </p>
            <div className={styles.choiceButtons}>
              <button className={styles.choiceBtn} onClick={handleChoiceReplace}>
                <span className={styles.choiceBtnTitle}>Replace current vault</span>
                <span className={styles.choiceBtnDesc}>Close the current vault and open this one</span>
              </button>
              <button className={styles.choiceBtn} onClick={handleChoiceBoth}>
                <span className={styles.choiceBtnTitle}>Open alongside</span>
                <span className={styles.choiceBtnDesc}>Keep both vaults accessible via the switcher</span>
              </button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <button className={styles.btnSecondary} onClick={() => setScreen('input')} style={{ marginTop: 8 }}>
              ← Back
            </button>
          </>
        )}

        {screen === 'loading' && (
          <div className={styles.loadingBody}>
            <div className={styles.loadingMsg}>{LOADING_MESSAGES[msgIndex]}</div>
            <div className={styles.loadingBar}><div className={styles.loadingBarFill} /></div>
          </div>
        )}
      </div>
    </div>
  )
}
