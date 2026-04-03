// src/renderer/components/editor/SlashMenu.tsx
import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { SlashItem } from './extensions/SlashCommand'
import styles from './SlashMenu.module.css'

interface SlashMenuProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
  clientRect?: (() => DOMRect | null) | null
}

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  function SlashMenu({ items, command, clientRect }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => { setSelectedIndex(0) }, [items])

    const selectItem = useCallback(
      (index: number) => { const item = items[index]; if (item) command(item) },
      [items, command],
    )

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent): boolean {
        if (event.key === 'ArrowUp') {
          setSelectedIndex(i => (i - 1 + items.length) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex(i => (i + 1) % items.length)
          return true
        }
        if (event.key === 'Enter') { selectItem(selectedIndex); return true }
        return false
      },
    }), [selectItem, selectedIndex, items])

    const MENU_MAX_HEIGHT = 320
    const rect = clientRect?.()
    const style: React.CSSProperties = rect
      ? rect.bottom + 4 + MENU_MAX_HEIGHT > window.innerHeight
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left }
        : { position: 'fixed', top: rect.bottom + 4, left: rect.left }
      : { display: 'none' }

    if (!items.length) return null

    return (
      <div className={styles.menu} style={style}>
        {items.map((item, i) => (
          <button
            key={item.title}
            className={`${styles.item} ${i === selectedIndex ? styles.selected : ''}`}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => selectItem(i)}
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.text}>
              <span className={styles.title}>{item.title}</span>
              <span className={styles.desc}>{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    )
  },
)
