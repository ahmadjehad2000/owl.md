// src/renderer/components/ui/ContextMenu.tsx
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ContextMenu.module.css'

export type ContextMenuItem = {
  label: string
  icon?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
  submenu?: ContextMenuEntry[]
}

export type ContextMenuSeparator = { separator: true }

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

interface ContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  items: ContextMenuEntry[]
  onClose: () => void
}

function isSep(e: ContextMenuEntry): e is ContextMenuSeparator {
  return 'separator' in e
}

export function ContextMenu({ isOpen, position, items, onClose }: ContextMenuProps): JSX.Element | null {
  const [stack, setStack] = useState<ContextMenuEntry[][]>([])

  // Reset drill-down stack whenever the menu opens with new items
  useEffect(() => {
    if (isOpen) setStack([])
  }, [isOpen, items])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (stack.length > 0) { setStack(s => s.slice(0, -1)); return }
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose, stack])

  if (!isOpen) return null

  const currentItems = stack.length > 0 ? stack[stack.length - 1] : items

  // Clamp to viewport
  const x = Math.min(position.x, window.innerWidth  - 200)
  const y = Math.min(position.y, window.innerHeight - 300)

  const handleItemClick = (item: ContextMenuItem): void => {
    if (item.disabled) return
    if (item.submenu) {
      setStack(s => [...s, item.submenu!])
      return
    }
    item.onClick?.()
    onClose()
  }

  return createPortal(
    <>
      <div
        className={styles.overlay}
        onMouseDown={onClose}
        onContextMenu={e => { e.preventDefault(); onClose() }}
      />
      <div
        className={styles.menu}
        style={{ left: x, top: y }}
        onMouseDown={e => e.stopPropagation()}
      >
        {stack.length > 0 && (
          <>
            <button
              className={`${styles.item} ${styles.backItem}`}
              onClick={() => setStack(s => s.slice(0, -1))}
            >
              <span className={styles.itemLabel}>← Back</span>
            </button>
            <div className={styles.separator} />
          </>
        )}
        {currentItems.map((entry, i) =>
          isSep(entry)
            ? <div key={i} className={styles.separator} />
            : (
              <button
                key={i}
                className={`${styles.item} ${entry.danger ? styles.danger : ''}`}
                onClick={() => handleItemClick(entry)}
                disabled={entry.disabled}
              >
                {entry.icon && <span className={styles.itemIcon}>{entry.icon}</span>}
                <span className={styles.itemLabel}>{entry.label}</span>
                {entry.shortcut && <span className={styles.itemShortcut}>{entry.shortcut}</span>}
                {entry.submenu  && <span className={styles.itemArrow}>▶</span>}
              </button>
            )
        )}
      </div>
    </>,
    document.body
  )
}
