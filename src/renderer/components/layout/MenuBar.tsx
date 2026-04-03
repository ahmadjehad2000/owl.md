// src/renderer/components/layout/MenuBar.tsx
import React, { useState, useRef, useEffect } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
import styles from './MenuBar.module.css'

type MenuAction = { label: string; shortcut?: string; action: () => void }
type Separator  = { separator: true }
type MenuEntry  = MenuAction | Separator

interface MenuDef { label: string; items: MenuEntry[] }

function isSep(e: MenuEntry): e is Separator { return 'separator' in e }

export function MenuBar(): JSX.Element {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const openSearch = useSearchStore(s => s.open)
  const openPalette = useCommandPaletteStore(s => s.open)
  const barRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside the bar
  useEffect(() => {
    if (!openMenu) return
    const handler = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const toggle = (label: string) => setOpenMenu(prev => prev === label ? null : label)

  const run = (action: () => void) => { action(); setOpenMenu(null) }

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Note', shortcut: 'Ctrl+N', action: () => window.dispatchEvent(new CustomEvent('owl:new-note')) },
        { label: 'Command Palette', shortcut: 'Ctrl+K', action: () => { openPalette(); setOpenMenu(null) } },
        { separator: true },
        { label: 'Quit', action: () => window.close() },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          action: () => document.activeElement?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
          ),
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl+Shift+Z',
          action: () => document.activeElement?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }),
          ),
        },
        { separator: true },
        { label: 'Cut',        shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
        { label: 'Copy',       shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
        { label: 'Paste',      shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => document.execCommand('selectAll') },
        { separator: true },
        { label: 'Find', shortcut: 'Ctrl+F', action: () => openSearch() },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'About owl.md', action: () => alert('owl.md v0.1.0\nLocal-first knowledge workspace') },
      ],
    },
  ]

  return (
    <div className={styles.menuBar} ref={barRef}>
      {menus.map(menu => (
        <div key={menu.label} className={styles.menuRoot}>
          <button
            className={`${styles.menuTrigger} ${openMenu === menu.label ? styles.menuTriggerActive : ''}`}
            onClick={() => toggle(menu.label)}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && (
            <div className={styles.dropdown}>
              {menu.items.map((item, i) =>
                isSep(item)
                  ? <div key={i} className={styles.separator} />
                  : (
                    <button
                      key={i}
                      className={styles.dropdownItem}
                      onClick={() => run(item.action)}
                    >
                      <span className={styles.itemLabel}>{item.label}</span>
                      {item.shortcut && <span className={styles.itemShortcut}>{item.shortcut}</span>}
                    </button>
                  ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
