// src/renderer/components/search/SearchModal.tsx
import React, { useEffect, useRef } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useTabStore } from '../../stores/tabStore'
import { SearchResults } from './SearchResults'
import type { SearchResult } from '@shared/types/Note'
import styles from './SearchModal.module.css'

export function SearchModal(): JSX.Element | null {
  const isOpen = useSearchStore(s => s.isOpen)
  const query = useSearchStore(s => s.query)
  const results = useSearchStore(s => s.results)
  const isLoading = useSearchStore(s => s.isLoading)
  const setQuery = useSearchStore(s => s.setQuery)
  const close = useSearchStore(s => s.close)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 0)
  }, [isOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const selectResult = (r: SearchResult): void => {
    useTabStore.getState().openTab(r.id, r.title)
    close()
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div className={styles.modal}>
        <div className={styles.inputWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search notes…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className={styles.results}>
          {!query && <div className={styles.empty}>Type to search across all notes</div>}
          {query && isLoading && <div className={styles.empty}>Searching…</div>}
          {query && !isLoading && <SearchResults results={results} onSelect={selectResult} />}
        </div>
      </div>
    </div>
  )
}
