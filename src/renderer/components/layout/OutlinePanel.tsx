// src/renderer/components/layout/OutlinePanel.tsx
import React from 'react'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import styles from './OutlinePanel.module.css'

export function OutlinePanel(): JSX.Element {
  const headings = useRightPanelStore(s => s.headings)

  if (!headings.length) {
    return <div className={styles.empty}>No headings in this note</div>
  }

  const scrollTo = (pos: number): void => {
    const selector = '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, ' +
                     '.ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
    const els = document.querySelectorAll(selector)
    els[pos]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={styles.outline}>
      {headings.map((h, i) => (
        <button
          key={i}
          className={styles.item}
          style={{ paddingLeft: 8 + (h.level - 1) * 10 }}
          onClick={() => scrollTo(i)}
        >
          <span className={styles.level}>H{h.level}</span>
          <span className={styles.text}>{h.text}</span>
        </button>
      ))}
    </div>
  )
}
