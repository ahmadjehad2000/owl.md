// src/renderer/components/editor/WikiLinkMenu.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react'
import type { WikiLinkItem } from './extensions/WikiLinkPicker'
import styles from './WikiLinkMenu.module.css'

interface WikiLinkMenuProps {
  items: WikiLinkItem[]
  command: (item: WikiLinkItem) => void
  clientRect?: (() => DOMRect | null) | null
}

export interface WikiLinkMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

const TYPE_ICON: Record<WikiLinkItem['type'], string> = {
  heading: '#',
  note: '↗',
  url: '🔗',
}

const TYPE_LABEL: Record<WikiLinkItem['type'], string> = {
  heading: 'This note',
  note: 'Note',
  url: 'URL',
}

export const WikiLinkMenu = forwardRef<WikiLinkMenuHandle, WikiLinkMenuProps>(
  function WikiLinkMenu({ items, command, clientRect }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => { setSelectedIndex(0) }, [items])

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index]
        if (item) command(item)
      },
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
        if (event.key === 'Enter') {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }), [selectItem, selectedIndex, items])

    const MENU_MAX_HEIGHT = 340
    const rect = clientRect?.()
    const style: React.CSSProperties = rect
      ? rect.bottom + 8 + MENU_MAX_HEIGHT > window.innerHeight
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left }
        : { position: 'fixed', top: rect.bottom + 4, left: rect.left }
      : { display: 'none' }

    if (!items.length) return null

    // Group by type for section headers
    let lastType: WikiLinkItem['type'] | null = null

    return (
      <div className={styles.menu} style={style}>
        {items.map((item, i) => {
          const showSection = item.type !== lastType
          lastType = item.type
          return (
            <React.Fragment key={`${item.type}-${item.href}`}>
              {showSection && (
                <div className={styles.section}>
                  {item.type === 'heading' ? 'Headings in this note' :
                   item.type === 'note'    ? 'Notes' : 'URL'}
                </div>
              )}
              <button
                className={`${styles.item} ${i === selectedIndex ? styles.selected : ''}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => selectItem(i)}
              >
                <span className={`${styles.icon} ${styles[item.type]}`}>
                  {TYPE_ICON[item.type]}
                </span>
                <span className={styles.text}>
                  <span className={styles.label}>{item.label}</span>
                  <span className={styles.meta}>{TYPE_LABEL[item.type]}</span>
                </span>
              </button>
            </React.Fragment>
          )
        })}
      </div>
    )
  },
)
