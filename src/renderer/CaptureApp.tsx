// src/renderer/CaptureApp.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ipc } from './lib/ipc'
import styles from './CaptureApp.module.css'

export default function CaptureApp(): JSX.Element {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const dismiss = useCallback(() => {
    setText('')
    setStatus('idle')
    window.owl.capture.hide()
  }, [])

  const save = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) { dismiss(); return }
    setStatus('saving')
    try {
      await ipc.notes.appendToDaily(trimmed)
      setStatus('saved')
      setTimeout(() => {
        setText('')
        setStatus('idle')
        window.owl.capture.hide()
      }, 600)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }, [text, dismiss])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); dismiss(); return }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void save(); return }
  }, [dismiss, save])

  const statusMsg = status === 'saving' ? 'Saving…'
    : status === 'saved'  ? '✓ Saved to daily note'
    : status === 'error'  ? 'Failed — no vault open?'
    : null

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.logo}>⚡ Quick Capture</span>
        <span className={styles.hint}>⌘↩ save · Esc dismiss</span>
      </div>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        placeholder="Jot a thought…"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck
      />
      <div className={styles.footer}>
        {statusMsg && (
          <span className={`${styles.status} ${status === 'error' ? styles.statusError : ''}`}>
            {statusMsg}
          </span>
        )}
        <div className={styles.buttons}>
          <button className={styles.dismissBtn} onClick={dismiss}>Dismiss</button>
          <button
            className={styles.saveBtn}
            onClick={() => void save()}
            disabled={status === 'saving'}
          >
            Save to daily
          </button>
        </div>
      </div>
    </div>
  )
}
