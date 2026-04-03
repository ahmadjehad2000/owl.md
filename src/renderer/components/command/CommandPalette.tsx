// src/renderer/components/command/CommandPalette.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useTabStore } from '../../stores/tabStore'
import { ipc } from '../../lib/ipc'
import styles from './CommandPalette.module.css'

interface PaletteItem {
  id: string
  label: string
  description?: string
  action(): void
}

export function CommandPalette(): JSX.Element | null {
  const isOpen = useCommandPaletteStore(s => s.isOpen)
  const close  = useCommandPaletteStore(s => s.close)
  const notes  = useVaultStore(s => s.notes)
  const loadNotes   = useVaultStore(s => s.loadNotes)

  const [query, setQuery]       = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  const q = query.toLowerCase()

  const noteItems: PaletteItem[] = notes
    .filter(n => !q || n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
    .slice(0, 20)
    .map(n => ({
      id: n.id,
      label: n.title,
      description: n.path,
      action: () => { useTabStore.getState().openTab(n.id, n.title); close() },
    }))

  const actionItems: PaletteItem[] = !q
    ? [{
        id: '__new__',
        label: 'New Note',
        description: 'Create a blank note',
        action: async () => {
          const { note } = await ipc.notes.create('Untitled', '')
          await loadNotes()
          useTabStore.getState().openTab(note.id, note.title)
          close()
        },
      }]
    : []

  const items: PaletteItem[] = [...actionItems, ...noteItems]

  const run = useCallback((item: PaletteItem) => item.action(), [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, items.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (items[selected]) run(items[selected]) }
    if (e.key === 'Escape')    { e.preventDefault(); close() }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onMouseDown={close}>
      <div className={styles.palette} onMouseDown={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Search notes or type a command…"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(0) }}
          onKeyDown={onKeyDown}
        />
        <div className={styles.list}>
          {items.length === 0
            ? <div className={styles.empty}>No results</div>
            : items.map((item, i) => (
                <button
                  key={item.id}
                  className={`${styles.item} ${i === selected ? styles.selected : ''}`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => run(item)}
                >
                  <span className={styles.label}>{item.label}</span>
                  {item.description && <span className={styles.desc}>{item.description}</span>}
                </button>
              ))
          }
        </div>
      </div>
    </div>
  )
}
