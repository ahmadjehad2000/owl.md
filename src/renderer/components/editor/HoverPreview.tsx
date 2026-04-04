// src/renderer/components/editor/HoverPreview.tsx
import React, { useMemo } from 'react'
import { useHoverPreviewStore } from '../../stores/hoverPreviewStore'
import styles from './HoverPreview.module.css'

function stripMarkdown(md: string): string {
  return md
    .replace(/^---[\s\S]*?---\n?/, '')
    .replace(/!\[\[.*?\]\]/g, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const VIEWPORT_MARGIN = 16
const CARD_W = 320
const CARD_H = 220

function computePosition(x: number, y: number): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = x + 12
  if (left + CARD_W + VIEWPORT_MARGIN > vw) left = x - CARD_W - 12
  left = Math.max(VIEWPORT_MARGIN, left)
  let top = y + 16
  if (top + CARD_H + VIEWPORT_MARGIN > vh) top = y - CARD_H - 8
  top = Math.max(VIEWPORT_MARGIN, top)
  return { left, top }
}

export function HoverPreview(): JSX.Element | null {
  const visible   = useHoverPreviewStore(s => s.visible)
  const noteTitle = useHoverPreviewStore(s => s.noteTitle)
  const content   = useHoverPreviewStore(s => s.content)
  const loading   = useHoverPreviewStore(s => s.loading)
  const x         = useHoverPreviewStore(s => s.x)
  const y         = useHoverPreviewStore(s => s.y)

  const position = useMemo(() => computePosition(x, y), [x, y])
  const preview  = useMemo(() => (content ? stripMarkdown(content).slice(0, 600) : null), [content])

  if (!visible || !noteTitle) return null

  return (
    <div className={styles.card} style={{ left: position.left, top: position.top }} role="tooltip">
      <div className={styles.title}>{noteTitle}</div>
      {loading && <div className={styles.loading}>Loading…</div>}
      {!loading && preview  && <div className={styles.body}>{preview}</div>}
      {!loading && !preview && <div className={styles.empty}>No content</div>}
    </div>
  )
}
