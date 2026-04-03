// src/renderer/components/search/SearchResults.tsx
// Note: excerpt HTML is generated server-side by SQLite FTS5 snippet() function,
// containing only <mark> tags around matched text. Content is not user-supplied HTML.
import React from 'react'
import type { SearchResult } from '@shared/types/Note'
import styles from './SearchModal.module.css'

interface Props {
  results: SearchResult[]
  onSelect: (r: SearchResult) => void
}

export function SearchResults({ results, onSelect }: Props): JSX.Element {
  if (results.length === 0) return <div className={styles.empty}>No results</div>

  return (
    <>
      {results.map(r => (
        <button key={r.id} className={styles.result} onClick={() => onSelect(r)}>
          <div className={styles.resultTitle}>{r.title}</div>
          <div className={styles.resultPath}>{r.path}</div>
          {r.excerpt && (
            <div
              className={styles.resultExcerpt}
              dangerouslySetInnerHTML={{ __html: r.excerpt }}
            />
          )}
        </button>
      ))}
    </>
  )
}
