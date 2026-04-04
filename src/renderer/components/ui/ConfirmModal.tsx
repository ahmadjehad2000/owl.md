// src/renderer/components/ui/ConfirmModal.tsx
import React, { useEffect, useRef } from 'react'
import styles from './ConfirmModal.module.css'

interface Props {
  isOpen:    boolean
  title:     string
  message:   string
  confirmLabel?: string
  onConfirm: () => void
  onCancel:  () => void
}

export function ConfirmModal({ isOpen, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: Props): JSX.Element | null {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus cancel button when opened (safer default)
  useEffect(() => {
    if (isOpen) setTimeout(() => cancelRef.current?.focus(), 30)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onMouseDown={onCancel}>
      <div className={styles.modal} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.icon}>⚠</div>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button ref={cancelRef} className={styles.btnCancel} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.btnDanger} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
