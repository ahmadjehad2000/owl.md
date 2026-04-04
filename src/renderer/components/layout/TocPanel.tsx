// src/renderer/components/layout/TocPanel.tsx
import React, { useEffect, useRef, useState } from 'react'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import styles from './TocPanel.module.css'

export function TocPanel(): JSX.Element {
  const headings = useRightPanelStore(s => s.headings)
  const [activeIdx, setActiveIdx] = useState<number>(0)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Build hierarchical numbers: 1. / 1.1. / 1.2. / 2. etc.
  const counters = [0, 0, 0, 0, 0, 0]
  const labels = headings.map(h => {
    const idx = h.level - 1
    counters[idx]++
    for (let i = idx + 1; i < counters.length; i++) counters[i] = 0
    return counters.slice(0, idx + 1).join('.')
  })

  // Track which heading is in view
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    const selector = '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
    const els = Array.from(document.querySelectorAll(selector))
    if (!els.length) return

    observerRef.current = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = els.indexOf(entry.target as HTMLElement)
            if (idx !== -1) setActiveIdx(idx)
          }
        }
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 }
    )
    els.forEach(el => observerRef.current!.observe(el))
    return () => observerRef.current?.disconnect()
  }, [headings])

  const scrollTo = (pos: number): void => {
    const selector = '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
    const els = document.querySelectorAll(selector)
    els[pos]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveIdx(pos)
  }

  if (!headings.length) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>§</div>
        <div className={styles.emptyText}>No outline yet</div>
        <div className={styles.emptyHint}>Add <code>## Heading</code> to build your outline</div>
      </div>
    )
  }

  return (
    <div className={styles.toc}>
      <div className={styles.header}>Contents</div>
      {headings.map((h, i) => {
        const isActive = i === activeIdx
        const levelClass = styles[`l${h.level}`] ?? ''
        return (
          <button
            key={i}
            className={`${styles.item} ${levelClass} ${isActive ? styles.active : ''}`}
            onClick={() => scrollTo(i)}
            title={h.text}
          >
            <span className={styles.number}>{labels[i]}</span>
            <span className={styles.text}>{h.text}</span>
          </button>
        )
      })}
    </div>
  )
}
