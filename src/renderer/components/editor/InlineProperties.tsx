// src/renderer/components/editor/InlineProperties.tsx
import React, { useState } from 'react'
import type { Frontmatter, FrontmatterValue } from '../../lib/markdown'
import styles from './InlineProperties.module.css'

function parseValue(raw: string): FrontmatterValue {
  const t = raw.trim()
  if (t.includes(',')) return t.split(',').map(s => s.trim()).filter(Boolean)
  if (t === 'true')  return true
  if (t === 'false') return false
  const n = Number(t)
  if (!Number.isNaN(n) && t !== '') return n
  return t
}

function displayValue(v: FrontmatterValue): string {
  return Array.isArray(v) ? v.join(', ') : String(v)
}

interface Props {
  frontmatter: Frontmatter
  onChange:    (next: Frontmatter) => void
}

export function InlineProperties({ frontmatter, onChange }: Props): JSX.Element {
  const [open, setOpen]     = useState(false)
  const [newKey, setNewKey] = useState('')

  const keyCount = Object.keys(frontmatter).length

  const update = (key: string, raw: string): void =>
    onChange({ ...frontmatter, [key]: parseValue(raw) })

  const remove = (key: string): void => {
    const next = { ...frontmatter }
    delete next[key]
    onChange(next)
  }

  const addKey = (): void => {
    const k = newKey.trim()
    if (!k || Object.hasOwn(frontmatter, k)) return
    onChange({ ...frontmatter, [k]: '' })
    setNewKey('')
  }

  return (
    <div className={styles.root}>
      <button className={styles.toggle} onClick={() => setOpen(o => !o)} aria-label="properties">
        <span className={styles.toggleIcon}>{open ? '▼' : '▶'}</span>
        <span className={styles.toggleLabel}>Properties</span>
        {keyCount > 0 && <span className={styles.badge}>{keyCount}</span>}
      </button>

      {open && (
        <div className={styles.table}>
          {Object.entries(frontmatter).map(([key, value]) => (
            <div key={key} className={styles.row}>
              <span className={styles.key}>{key}</span>
              <input
                className={styles.value}
                defaultValue={displayValue(value)}
                onChange={e => update(key, e.currentTarget.value)}
                onBlur={e => update(key, e.currentTarget.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
              <button className={styles.remove} onClick={() => remove(key)} title="Remove">×</button>
            </div>
          ))}
          <div className={styles.addRow}>
            <input
              className={styles.newKey}
              placeholder="Add property…"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addKey() }}
            />
            <button className={styles.addBtn} onClick={addKey}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}
