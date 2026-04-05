// src/renderer/components/canvas/CanvasCard.tsx
import React, { useRef, useCallback, useState } from 'react'
import type { CanvasCardData } from '@shared/types/Note'
import styles from './CanvasCard.module.css'

const MIN_W = 140
const MIN_H = 80

interface Props {
  card: CanvasCardData
  isSelected: boolean
  isConnecting: boolean
  zoom: number
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onResize: (w: number, h: number) => void
  onUpdateText: (text: string) => void
  onDelete: () => void
  onConnectStart: () => void
  onOpenNote: (noteId: string, title: string) => void
}

export function CanvasCard({
  card, isSelected, isConnecting, zoom,
  onSelect, onMove, onResize, onUpdateText, onDelete, onConnectStart, onOpenNote,
}: Props): JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const resizeRef = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null)

  // ── Drag to move ──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(`.${styles.connectHandle}`)) return
    if ((e.target as HTMLElement).closest(`.${styles.resizeHandle}`)) return
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
    e.stopPropagation()
    onSelect()
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: card.x, oy: card.y }

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = (ev.clientX - dragRef.current.sx) / zoom
      const dy = (ev.clientY - dragRef.current.sy) / zoom
      onMove(dragRef.current.ox + dx, dragRef.current.oy + dy)
    }
    const onMouseUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [card.x, card.y, zoom, onSelect, onMove])

  // ── Resize handle ──
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    resizeRef.current = { sx: e.clientX, sy: e.clientY, ow: card.w, oh: card.h }

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const dw = (ev.clientX - resizeRef.current.sx) / zoom
      const dh = (ev.clientY - resizeRef.current.sy) / zoom
      onResize(
        Math.max(MIN_W, resizeRef.current.ow + dw),
        Math.max(MIN_H, resizeRef.current.oh + dh),
      )
    }
    const onMouseUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [card.w, card.h, zoom, onResize])

  // ── Connect handle ──
  const onConnectMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onConnectStart()
  }, [onConnectStart])

  // ── Text editing ──
  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (card.type === 'text') setIsEditing(true)
    if (card.type === 'note' && card.noteId && card.noteTitle) {
      onOpenNote(card.noteId, card.noteTitle)
    }
  }, [card, onOpenNote])

  return (
    <div
      className={`${styles.card} ${isSelected ? styles.selected : ''} ${isConnecting ? styles.connectTarget : ''}`}
      data-card-id={card.id}
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.h,
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      {/* Card header */}
      <div className={styles.header}>
        <span className={styles.headerIcon}>
          {card.type === 'note' ? '🔗' : '📝'}
        </span>
        <span className={styles.headerTitle}>
          {card.type === 'note' ? card.noteTitle : 'Text'}
        </span>
        {isSelected && (
          <button className={styles.deleteBtn} onClick={e => { e.stopPropagation(); onDelete() }}>
            x
          </button>
        )}
      </div>

      {/* Card body */}
      <div className={styles.body}>
        {card.type === 'text' && (
          isEditing ? (
            <textarea
              autoFocus
              className={styles.textArea}
              defaultValue={card.text ?? ''}
              onBlur={e => { onUpdateText(e.target.value); setIsEditing(false) }}
              onKeyDown={e => {
                if (e.key === 'Escape') { onUpdateText((e.target as HTMLTextAreaElement).value); setIsEditing(false) }
              }}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            />
          ) : (
            <div className={styles.textPreview}>
              {card.text || 'Double-click to edit...'}
            </div>
          )
        )}
        {card.type === 'note' && (
          <div className={styles.notePreview}>
            Double-click to open note
          </div>
        )}
      </div>

      {/* Connect handle (right edge) */}
      <div
        className={styles.connectHandle}
        onMouseDown={onConnectMouseDown}
        title="Drag to connect"
      />

      {/* Resize handle (bottom-right corner) */}
      <div
        className={styles.resizeHandle}
        onMouseDown={onResizeMouseDown}
      />
    </div>
  )
}
