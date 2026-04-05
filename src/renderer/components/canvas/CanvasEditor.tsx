// src/renderer/components/canvas/CanvasEditor.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useTabStore } from '../../stores/tabStore'
import { useVaultStore } from '../../stores/vaultStore'
import { CanvasCard } from './CanvasCard'
import type { CanvasData, CanvasCardData, CanvasConnection } from '@shared/types/Note'
import styles from './CanvasEditor.module.css'

const ZOOM_MIN = 0.2
const ZOOM_MAX = 3
const DEFAULT_CARD_W = 240
const DEFAULT_CARD_H = 140
const AUTOSAVE_MS = 2000

type ParseResult =
  | { ok: true; data: CanvasData }
  | { ok: false }

function tryParseCanvasData(json: string): ParseResult {
  try {
    const d = JSON.parse(json)
    return {
      ok: true,
      data: {
        cards: Array.isArray(d.cards) ? d.cards : [],
        connections: Array.isArray(d.connections) ? d.connections : [],
      },
    }
  } catch {
    return { ok: false }
  }
}

function cardCenter(c: CanvasCardData): { x: number; y: number } {
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 }
}

export function CanvasEditor(): JSX.Element {
  const markdown    = useEditorStore(s => s.markdown)
  const noteId      = useEditorStore(s => s.note?.id)
  const setMarkdown = useEditorStore(s => s.setMarkdown)
  const save        = useEditorStore(s => s.save)
  const saveStatus  = useEditorStore(s => s.saveStatus)
  const notes       = useVaultStore(s => s.slimNotes)

  const parseResult = tryParseCanvasData(markdown)
  const [parseError, setParseError] = useState(!parseResult.ok)
  const [data, setData] = useState<CanvasData>(() =>
    parseResult.ok ? parseResult.data : { cards: [], connections: [] }
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectMouse, setConnectMouse] = useState<{ x: number; y: number } | null>(null)
  const [addNoteMenu, setAddNoteMenu] = useState<{ x: number; y: number } | null>(null)
  const [noteSearch, setNoteSearch] = useState('')

  // Camera
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const isPanning = useRef(false)
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // Autosave timer
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear autosave timer on unmount
  useEffect(() => {
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current)
    }
  }, [])

  // Sync data → markdown (triggers autosave); blocked while in error state
  const commitData = useCallback((next: CanvasData) => {
    if (parseError) return
    setData(next)
    const json = JSON.stringify(next)
    setMarkdown(json)
    if (autosaveRef.current) clearTimeout(autosaveRef.current)
    autosaveRef.current = setTimeout(() => save(), AUTOSAVE_MS)
  }, [setMarkdown, save, parseError])

  // Reload data from markdown when tab switches
  useEffect(() => {
    const result = tryParseCanvasData(markdown)
    if (result.ok) {
      setData(result.data)
      setParseError(false)
    } else {
      setParseError(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // ── Card CRUD ──
  const addTextCard = useCallback((wx: number, wy: number) => {
    const card: CanvasCardData = {
      id: crypto.randomUUID(),
      type: 'text',
      x: wx - DEFAULT_CARD_W / 2,
      y: wy - DEFAULT_CARD_H / 2,
      w: DEFAULT_CARD_W,
      h: DEFAULT_CARD_H,
      text: '',
    }
    commitData({ ...data, cards: [...data.cards, card] })
    setSelectedId(card.id)
  }, [data, commitData])

  const addNoteCard = useCallback((noteId: string, noteTitle: string, wx: number, wy: number) => {
    const card: CanvasCardData = {
      id: crypto.randomUUID(),
      type: 'note',
      x: wx - DEFAULT_CARD_W / 2,
      y: wy - DEFAULT_CARD_H / 2,
      w: DEFAULT_CARD_W,
      h: DEFAULT_CARD_H,
      noteId,
      noteTitle,
    }
    commitData({ ...data, cards: [...data.cards, card] })
    setSelectedId(card.id)
    setAddNoteMenu(null)
    setNoteSearch('')
  }, [data, commitData])

  const updateCard = useCallback((id: string, patch: Partial<CanvasCardData>) => {
    commitData({
      ...data,
      cards: data.cards.map(c => c.id === id ? { ...c, ...patch } : c),
    })
  }, [data, commitData])

  const deleteCard = useCallback((id: string) => {
    commitData({
      cards: data.cards.filter(c => c.id !== id),
      connections: data.connections.filter(c => c.from !== id && c.to !== id),
    })
    if (selectedId === id) setSelectedId(null)
  }, [data, commitData, selectedId])

  // ── Connections ──
  const addConnection = useCallback((from: string, to: string) => {
    if (from === to) return
    if (data.connections.some(c => c.from === from && c.to === to)) return
    const conn: CanvasConnection = { id: crypto.randomUUID(), from, to }
    commitData({ ...data, connections: [...data.connections, conn] })
  }, [data, commitData])

  const deleteConnection = useCallback((id: string) => {
    commitData({ ...data, connections: data.connections.filter(c => c.id !== id) })
  }, [data, commitData])

  // ── Screen → world coords ──
  const viewportRef = useRef<HTMLDivElement>(null)
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (sx - rect.left - rect.width / 2) / zoom - pan.x,
      y: (sy - rect.top - rect.height / 2) / zoom - pan.y,
    }
  }, [pan, zoom])

  // ── Viewport mouse handlers ──
  const onViewportMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle left-click on the viewport background
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest(`.${styles.card}`)) return
    setSelectedId(null)
    setAddNoteMenu(null)
    isPanning.current = true
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onViewportMouseMove = useCallback((e: React.MouseEvent) => {
    if (connectFrom) {
      const w = screenToWorld(e.clientX, e.clientY)
      setConnectMouse(w)
    }
    if (!isPanning.current) return
    const dx = (e.clientX - panStart.current.mx) / zoom
    const dy = (e.clientY - panStart.current.my) / zoom
    setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy })
  }, [zoom, connectFrom, screenToWorld])

  const onViewportMouseUp = useCallback((e: React.MouseEvent) => {
    isPanning.current = false
    if (connectFrom) {
      // Check if released over a card
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const cardEl = el?.closest(`[data-card-id]`) as HTMLElement | null
      if (cardEl) {
        const targetId = cardEl.dataset.cardId!
        addConnection(connectFrom, targetId)
      }
      setConnectFrom(null)
      setConnectMouse(null)
    }
  }, [connectFrom, addConnection])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.93 : 1.07
    setZoom(z => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor)))
  }, [])

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(`.${styles.card}`)) return
    const w = screenToWorld(e.clientX, e.clientY)
    addTextCard(w.x, w.y)
  }, [screenToWorld, addTextCard])

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(`.${styles.card}`)) return
    e.preventDefault()
    setAddNoteMenu({ x: e.clientX, y: e.clientY })
    setNoteSearch('')
  }, [])

  // Navigate to a linked note
  const openLinkedNote = useCallback((noteId: string, title: string) => {
    useTabStore.getState().openTab(noteId, title)
  }, [])

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only delete if not editing a text input
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        if (selectedId) {
          e.preventDefault()
          deleteCard(selectedId)
        }
      }
      if (e.key === 'Escape') {
        setSelectedId(null)
        setConnectFrom(null)
        setConnectMouse(null)
        setAddNoteMenu(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, deleteCard])

  // Status label
  const statusLabel = saveStatus === 'saving' ? 'Saving...'
    : saveStatus === 'saved' ? 'Saved'
    : saveStatus === 'error' ? 'Error' : ''

  // Filtered notes for the "add note card" menu
  const q = noteSearch.toLowerCase()
  const filteredNotes = notes
    .filter(n => n.noteType !== 'folder' && n.noteType !== 'canvas')
    .filter(n => !q || n.title.toLowerCase().includes(q))
    .slice(0, 12)

  if (parseError) {
    return (
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarLabel}>Canvas</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--color-text-muted)' }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <span>Canvas data is corrupted and cannot be displayed.</span>
          <span style={{ fontSize: 12 }}>The raw file content has been preserved. Edit it manually to recover your data.</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>Canvas</span>
        <span className={styles.toolbarHint}>double-click to add card / right-click to add note / drag edge dot to connect</span>
        <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        {statusLabel && <span className={styles.saveStatus}>{statusLabel}</span>}
      </div>

      {/* Viewport */}
      <div
        ref={viewportRef}
        className={styles.viewport}
        onMouseDown={onViewportMouseDown}
        onMouseMove={onViewportMouseMove}
        onMouseUp={onViewportMouseUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        {/* Transform layer */}
        <div
          className={styles.canvas}
          style={{
            transform: `translate(${pan.x * zoom}px, ${pan.y * zoom}px) scale(${zoom})`,
          }}
        >
          {/* SVG connections */}
          <svg className={styles.connectionLayer}>
            {data.connections.map(conn => {
              const fromCard = data.cards.find(c => c.id === conn.from)
              const toCard = data.cards.find(c => c.id === conn.to)
              if (!fromCard || !toCard) return null
              const a = cardCenter(fromCard)
              const b = cardCenter(toCard)
              return (
                <g key={conn.id}>
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    className={styles.connectionLine}
                  />
                  {/* Invisible thick line for click target */}
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="transparent" strokeWidth={12}
                    style={{ cursor: 'pointer' }}
                    onClick={() => deleteConnection(conn.id)}
                  />
                </g>
              )
            })}

            {/* Drawing connection preview */}
            {connectFrom && connectMouse && (() => {
              const fromCard = data.cards.find(c => c.id === connectFrom)
              if (!fromCard) return null
              const a = cardCenter(fromCard)
              return (
                <line
                  x1={a.x} y1={a.y}
                  x2={connectMouse.x} y2={connectMouse.y}
                  className={styles.connectionPreview}
                />
              )
            })()}
          </svg>

          {/* Cards */}
          {data.cards.map(card => (
            <CanvasCard
              key={card.id}
              card={card}
              isSelected={card.id === selectedId}
              isConnecting={connectFrom !== null}
              zoom={zoom}
              onSelect={() => setSelectedId(card.id)}
              onMove={(x, y) => updateCard(card.id, { x, y })}
              onResize={(w, h) => updateCard(card.id, { w, h })}
              onUpdateText={(text) => updateCard(card.id, { text })}
              onDelete={() => deleteCard(card.id)}
              onConnectStart={() => setConnectFrom(card.id)}
              onOpenNote={openLinkedNote}
            />
          ))}
        </div>

        {/* Grid dots pattern */}
        <div className={styles.gridDots} style={{
          backgroundPosition: `${pan.x * zoom}px ${pan.y * zoom}px`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        }} />

        {/* "Add note card" context menu */}
        {addNoteMenu && (
          <div
            className={styles.addNoteMenu}
            style={{ left: addNoteMenu.x, top: addNoteMenu.y }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className={styles.addNoteHeader}>Add note card</div>
            <input
              autoFocus
              className={styles.addNoteInput}
              placeholder="Search notes..."
              value={noteSearch}
              onChange={e => setNoteSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setAddNoteMenu(null)
              }}
            />
            <div className={styles.addNoteList}>
              {filteredNotes.map(n => (
                <button
                  key={n.id}
                  className={styles.addNoteItem}
                  onClick={() => {
                    const w = screenToWorld(addNoteMenu.x, addNoteMenu.y)
                    addNoteCard(n.id, n.title, w.x, w.y)
                  }}
                >
                  {n.title}
                </button>
              ))}
              {filteredNotes.length === 0 && (
                <div className={styles.addNoteEmpty}>No notes found</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
