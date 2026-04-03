// src/renderer/components/layout/PropertiesPanel.tsx
import React, { useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import type { Frontmatter, FrontmatterValue } from '../../lib/markdown'
import styles from './PropertiesPanel.module.css'

function displayValue(v: FrontmatterValue): string {
  return Array.isArray(v) ? v.join(', ') : String(v)
}

function parseValue(raw: string): FrontmatterValue {
  const t = raw.trim()
  if (t.includes(',')) return t.split(',').map(s => s.trim()).filter(Boolean)
  if (t === 'true')  return true
  if (t === 'false') return false
  const n = Number(t)
  if (!Number.isNaN(n) && t !== '') return n
  return t
}

export function PropertiesPanel(): JSX.Element {
  const frontmatter    = useEditorStore(s => s.frontmatter)
  const setFrontmatter = useEditorStore(s => s.setFrontmatter)
  const note           = useEditorStore(s => s.note)
  const [newKey, setNewKey] = useState('')

  if (!note) return <div className={styles.empty}>No note open</div>

  const update = (key: string, value: FrontmatterValue): void =>
    setFrontmatter({ ...frontmatter, [key]: value })

  const remove = (key: string): void => {
    const next = { ...frontmatter }
    delete next[key]
    setFrontmatter(next)
  }

  const addKey = (): void => {
    const k = newKey.trim()
    if (!k || Object.hasOwn(frontmatter, k)) return
    setFrontmatter({ ...frontmatter, [k]: '' })
    setNewKey('')
  }

  return (
    <div className={styles.panel} key={note.id}>
      {Object.entries(frontmatter).map(([key, value]) => (
        <div key={key} className={styles.row}>
          <span className={styles.key} title={key}>{key}</span>
          <input
            className={styles.value}
            defaultValue={displayValue(value)}
            onBlur={e => update(key, parseValue(e.currentTarget.value))}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
          <button className={styles.removeBtn} onClick={() => remove(key)} title="Remove">×</button>
        </div>
      ))}

      <div className={styles.addRow}>
        <input
          className={styles.newKeyInput}
          placeholder="Add property…"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addKey() }}
        />
        <button className={styles.addBtn} onClick={addKey}>+</button>
      </div>
    </div>
  )
}
