// src/renderer/components/editor/FindBar.tsx
import React, { useEffect, useRef, useState } from 'react'
import styles from './FindBar.module.css'

interface Props {
  editor: import('@tiptap/react').Editor | null
  onClose: () => void
}

export function FindBar({ editor, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!editor) return
    editor.commands.setSearchTerm(query)
  }, [query, editor])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { handleClose(); return }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editor?.commands.nextSearchResult() }
      if (e.key === 'Enter' && e.shiftKey)  { e.preventDefault(); editor?.commands.previousSearchResult() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, onClose])

  const handleClose = (): void => {
    editor?.commands.setSearchTerm('')
    onClose()
  }

  const resultCount: number = (editor?.storage['searchHighlight']?.resultCount) ?? 0

  return (
    <div className={styles.bar}>
      <input
        ref={inputRef}
        className={styles.input}
        placeholder="Find in note…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        spellCheck={false}
      />
      <span className={styles.count}>
        {query
          ? resultCount === 0
            ? 'No matches'
            : `${resultCount} match${resultCount !== 1 ? 'es' : ''}`
          : ''}
      </span>
      <button className={styles.navBtn} onClick={() => editor?.commands.previousSearchResult()} title="Previous (Shift+Enter)">↑</button>
      <button className={styles.navBtn} onClick={() => editor?.commands.nextSearchResult()}     title="Next (Enter)">↓</button>
      <button className={styles.closeBtn} onClick={handleClose} title="Close (Esc)">×</button>
    </div>
  )
}
