// src/renderer/components/graph/GraphView.tsx
import React, { useEffect, useRef, useCallback } from 'react'
import { useGraphStore } from '../../stores/graphStore'
import { useTabStore } from '../../stores/tabStore'
import { useEditorStore } from '../../stores/editorStore'
import type { GraphNode, GraphEdge } from '@shared/types/Note'
import styles from './GraphView.module.css'

/* ── Simulation types ── */
interface SimNode {
  id: string
  title: string
  noteType: string
  x: number
  y: number
  vx: number
  vy: number
  edges: number // connection count for sizing
}

/* ── Force simulation parameters ── */
const REPULSION = 800
const ATTRACTION = 0.008
const CENTER_GRAVITY = 0.01
const DAMPING = 0.88
const MIN_VELOCITY = 0.01

/* ── Visual constants ── */
const NODE_BASE_R = 5
const NODE_MAX_R = 18
const LABEL_FONT = '11px -apple-system, BlinkMacSystemFont, sans-serif'
const ZOOM_MIN = 0.15
const ZOOM_MAX = 5

export function GraphView(): JSX.Element | null {
  const isOpen      = useGraphStore(s => s.isOpen)
  const data        = useGraphStore(s => s.data)
  const focusNoteId = useGraphStore(s => s.focusNoteId)
  const close       = useGraphStore(s => s.close)

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const nodesRef    = useRef<SimNode[]>([])
  const edgesRef    = useRef<GraphEdge[]>([])
  const rafRef      = useRef<number>(0)
  const hoveredRef  = useRef<SimNode | null>(null)
  const dragRef     = useRef<SimNode | null>(null)

  // Camera state
  const camRef = useRef({ x: 0, y: 0, zoom: 1 })
  const panRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null)

  /* ── Escape to close ── */
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  /* ── Initialize simulation when data arrives ── */
  useEffect(() => {
    if (!data || !data.nodes.length) return

    const nodeMap = new Map<string, number>()
    data.nodes.forEach((_, i) => nodeMap.set(data.nodes[i].id, i))

    // Count edges per node for sizing
    const edgeCounts = new Map<string, number>()
    for (const e of data.edges) {
      edgeCounts.set(e.source, (edgeCounts.get(e.source) ?? 0) + 1)
      edgeCounts.set(e.target, (edgeCounts.get(e.target) ?? 0) + 1)
    }

    // Spread nodes in a circle initially
    const N = data.nodes.length
    nodesRef.current = data.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / N
      const spread = Math.sqrt(N) * 30
      return {
        id: n.id,
        title: n.title,
        noteType: n.noteType,
        x: Math.cos(angle) * spread + (Math.random() - 0.5) * 20,
        y: Math.sin(angle) * spread + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        edges: edgeCounts.get(n.id) ?? 0,
      }
    })

    // Only keep edges where both endpoints exist
    edgesRef.current = data.edges.filter(
      e => nodeMap.has(e.source) && nodeMap.has(e.target)
    )

    // Center camera on focused note or origin
    if (focusNoteId) {
      const fn = nodesRef.current.find(n => n.id === focusNoteId)
      if (fn) camRef.current = { x: -fn.x, y: -fn.y, zoom: 1.2 }
    } else {
      camRef.current = { x: 0, y: 0, zoom: 1 }
    }
  }, [data, focusNoteId])

  /* ── nodeRadius helper ── */
  const nodeRadius = useCallback((n: SimNode) => {
    return Math.min(NODE_BASE_R + n.edges * 1.5, NODE_MAX_R)
  }, [])

  /* ── Main render loop ── */
  useEffect(() => {
    if (!isOpen || !data) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let running = true

    const tick = () => {
      if (!running) return
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const nodeById = new Map(nodes.map(n => [n.id, n]))

      // ── Physics step ──
      // Repulsion (all pairs — Barnes-Hut would be better for 1000+ nodes)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          let dx = b.x - a.x, dy = b.y - a.y
          let dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist > 300) continue // skip distant pairs
          const force = REPULSION / (dist * dist)
          const fx = (dx / dist) * force, fy = (dy / dist) * force
          a.vx -= fx; a.vy -= fy
          b.vx += fx; b.vy += fy
        }
      }

      // Attraction along edges
      for (const e of edges) {
        const a = nodeById.get(e.source), b = nodeById.get(e.target)
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = dist * ATTRACTION
        const fx = (dx / dist) * force, fy = (dy / dist) * force
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      }

      // Center gravity
      for (const n of nodes) {
        n.vx -= n.x * CENTER_GRAVITY
        n.vy -= n.y * CENTER_GRAVITY
      }

      // Integrate & damp
      for (const n of nodes) {
        if (n === dragRef.current) { n.vx = 0; n.vy = 0; continue }
        n.vx *= DAMPING; n.vy *= DAMPING
        if (Math.abs(n.vx) < MIN_VELOCITY) n.vx = 0
        if (Math.abs(n.vy) < MIN_VELOCITY) n.vy = 0
        n.x += n.vx; n.y += n.vy
      }

      // ── Render ──
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth, h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const cam = camRef.current
      ctx.save()
      ctx.translate(w / 2 + cam.x * cam.zoom, h / 2 + cam.y * cam.zoom)
      ctx.scale(cam.zoom, cam.zoom)

      // Edges
      ctx.lineWidth = 0.5
      for (const e of edges) {
        const a = nodeById.get(e.source), b = nodeById.get(e.target)
        if (!a || !b) continue
        ctx.strokeStyle = 'rgba(56,182,220,0.15)'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      // Nodes
      for (const n of nodes) {
        const r = nodeRadius(n)
        const isFocused = n.id === focusNoteId
        const isHovered = n === hoveredRef.current

        // Glow for focused/hovered
        if (isFocused || isHovered) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2)
          ctx.fillStyle = isFocused
            ? 'rgba(56,182,220,0.18)'
            : 'rgba(255,255,255,0.08)'
          ctx.fill()
        }

        // Node circle
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        if (isFocused) {
          ctx.fillStyle = 'rgba(56,182,220,0.9)'
        } else if (n.noteType === 'daily') {
          ctx.fillStyle = 'rgba(168,130,255,0.75)'
        } else {
          ctx.fillStyle = isHovered
            ? 'rgba(255,255,255,0.7)'
            : 'rgba(255,255,255,0.45)'
        }
        ctx.fill()

        // Label (only show if zoomed in enough or hovered/focused)
        if (cam.zoom > 0.5 || isFocused || isHovered) {
          ctx.font = LABEL_FONT
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = isFocused
            ? 'rgba(56,182,220,0.95)'
            : isHovered
              ? 'rgba(255,255,255,0.9)'
              : 'rgba(255,255,255,0.5)'
          const maxLen = 24
          const label = n.title.length > maxLen ? n.title.slice(0, maxLen) + '...' : n.title
          ctx.fillText(label, n.x, n.y + r + 4)
        }
      }

      ctx.restore()

      // Stats
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${nodes.length} notes  ${edges.length} links`, 16, 16)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [isOpen, data, focusNoteId, nodeRadius])

  /* ── Hit-test helper ── */
  const hitTest = useCallback((cx: number, cy: number): SimNode | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const cam = camRef.current
    const w = canvas.clientWidth, h = canvas.clientHeight
    // Screen → world coords
    const wx = (cx - w / 2) / cam.zoom - cam.x
    const wy = (cy - h / 2) / cam.zoom - cam.y
    for (const n of nodesRef.current) {
      const r = Math.min(NODE_BASE_R + n.edges * 1.5, NODE_MAX_R) + 4
      const dx = wx - n.x, dy = wy - n.y
      if (dx * dx + dy * dy < r * r) return n
    }
    return null
  }, [])

  /* ── Mouse handlers ── */
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    const hit = hitTest(cx, cy)
    if (hit) {
      dragRef.current = hit
    } else {
      const cam = camRef.current
      panRef.current = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }
    }
  }, [hitTest])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top

    if (dragRef.current) {
      const cam = camRef.current
      const w = canvasRef.current!.clientWidth, h = canvasRef.current!.clientHeight
      dragRef.current.x = (cx - w / 2) / cam.zoom - cam.x
      dragRef.current.y = (cy - h / 2) / cam.zoom - cam.y
      dragRef.current.vx = 0
      dragRef.current.vy = 0
      return
    }

    if (panRef.current) {
      const cam = camRef.current
      cam.x = panRef.current.cx + (e.clientX - panRef.current.sx) / cam.zoom
      cam.y = panRef.current.cy + (e.clientY - panRef.current.sy) / cam.zoom
      return
    }

    hoveredRef.current = hitTest(cx, cy)
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hoveredRef.current ? 'pointer' : 'grab'
    }
  }, [hitTest])

  const onMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null
      return
    }
    panRef.current = null
  }, [])

  const onClick = useCallback((e: React.MouseEvent) => {
    // Only navigate on clean click (not after drag)
    if (panRef.current || dragRef.current) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    const hit = hitTest(cx, cy)
    if (hit) {
      const { isDirty, save } = useEditorStore.getState()
      if (isDirty) save()
      useTabStore.getState().openTab(hit.id, hit.title)
      close()
    }
  }, [hitTest, close])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const cam = camRef.current
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom * factor))
  }, [])

  // Double-click to reset camera
  const onDoubleClick = useCallback(() => {
    camRef.current = { x: 0, y: 0, zoom: 1 }
  }, [])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Graph View</span>
          <span className={styles.headerHint}>scroll to zoom / drag to pan / click node to open / double-click to reset</span>
          <button className={styles.closeBtn} onClick={close} title="Close">x</button>
        </div>
        <div className={styles.canvasWrap}>
          {!data && <div className={styles.loading}>Loading graph...</div>}
          {data && data.nodes.length === 0 && (
            <div className={styles.empty}>No notes yet. Create some notes and link them with [[wiki-links]].</div>
          )}
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onWheel={onWheel}
          />
        </div>
      </div>
    </div>
  )
}
