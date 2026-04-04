// src/renderer/components/layout/TocPanel.tsx
import React from 'react'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import styles from './TocPanel.module.css'

export function TocPanel(): JSX.Element {
  const headings = useRightPanelStore(s => s.headings)

  if (!headings.length) {
    return <div className={styles.empty}>No headings in this note</div>
  }

  // Build hierarchical numbers: 1. / 1.1. / 1.2. / 2. etc.
  const counters = [0, 0, 0, 0, 0, 0]
  const labels = headings.map(h => {
    const idx = h.level - 1
    counters[idx]++
    for (let i = idx + 1; i < counters.length; i++) counters[i] = 0
    return counters.slice(0, idx + 1).join('.') + '.'
  })

  const scrollTo = (pos: number): void => {
    const selector = '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, ' +
                     '.ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
    const els = document.querySelectorAll(selector)
    els[pos]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={styles.toc}>
      <div className={styles.header}>Table of Contents</div>
      {headings.map((h, i) => (
        <button
          key={i}
          className={`${styles.item} ${styles[`level${h.level}`]}`}
          onClick={() => scrollTo(i)}
          title={h.text}
        >
          <span className={styles.number}>{labels[i]}</span>
          <span className={styles.text}>{h.text}</span>
        </button>
      ))}
    </div>
  )
}
