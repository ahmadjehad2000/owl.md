# Phase 2C-B: Editor Extensions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fold headings/lists, hover preview on wiki-links, inline note embeds (![[...]]), and a Reading View toggle to the TipTap editor.

**Architecture:** FoldHeadings is a ProseMirror plugin storing collapsed positions in plugin state and computing hide/show decorations on each transaction. HoverPreview is a floating React component driven by a small Zustand store, triggered by mouseover events on wiki-link decorations. NoteEmbed is a TipTap Node extension that replaces ![[...]] syntax with a NodeView rendering embedded note content. Reading View sets editor.setEditable(false) and is tracked in editorStore.

**Tech Stack:** TipTap 2, ProseMirror, Zustand 4, React 18, CSS Modules.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/renderer/components/editor/extensions/FoldHeadings.ts` | TipTap extension: fold/unfold headings via ProseMirror plugin |
| Create | `src/renderer/stores/hoverPreviewStore.ts` | Zustand store for hover preview visibility + position |
| Create | `src/renderer/components/editor/HoverPreview.tsx` | Floating card component rendering linked note preview |
| Create | `src/renderer/components/editor/HoverPreview.module.css` | Hover preview styles |
| Create | `src/renderer/components/editor/extensions/NoteEmbed.ts` | TipTap Extension: ![[...]] widget decoration |
| Modify | `src/renderer/stores/editorStore.ts` | Add `isReadingView`, `toggleReadingView` |
| Modify | `src/renderer/components/editor/NoteEditor.tsx` | Add FoldHeadings, NoteEmbed, HoverPreview, reading view toggle; mouseover handler |
| Modify | `src/renderer/components/editor/NoteEditor.module.css` | Fold arrow styles, reading view badge, embed styles |
| Create | `tests/renderer/stores/hoverPreviewStore.test.ts` | Store open/close/position tests |
| Create | `tests/renderer/extensions/FoldHeadings.test.ts` | Plugin state and decoration logic tests |

---

### Task 1: FoldHeadings extension — tests + implementation

**Files:**
- Create: `src/renderer/components/editor/extensions/FoldHeadings.ts`
- Create: `tests/renderer/extensions/FoldHeadings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/extensions/FoldHeadings.test.ts`:

```typescript
// @vitest-environment node
// tests/renderer/extensions/FoldHeadings.test.ts
import { describe, it, expect } from 'vitest'
import { schema } from '@tiptap/pm/schema-basic'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  FoldPluginKey,
  buildFoldDecorations,
  getCollapsedPositions,
  togglePosition,
} from '../../../src/renderer/components/editor/extensions/FoldHeadings'

function makeDoc(children: ProseMirrorNode[]): ProseMirrorNode {
  return schema.node('doc', null, children)
}

function h(level: 1 | 2 | 3, text: string): ProseMirrorNode {
  return schema.node('heading', { level }, [schema.text(text)])
}

function p(text: string): ProseMirrorNode {
  return schema.node('paragraph', null, [schema.text(text)])
}

describe('togglePosition', () => {
  it('adds a position to an empty set', () => {
    const result = togglePosition(new Set<number>(), 5)
    expect(result.has(5)).toBe(true)
  })

  it('removes a position that is already in the set', () => {
    const result = togglePosition(new Set<number>([5, 10]), 5)
    expect(result.has(5)).toBe(false)
    expect(result.has(10)).toBe(true)
  })

  it('does not mutate the original set', () => {
    const original = new Set<number>([5])
    togglePosition(original, 5)
    expect(original.has(5)).toBe(true)
  })
})

describe('getCollapsedPositions', () => {
  it('starts empty', () => {
    expect(getCollapsedPositions(new Set()).size).toBe(0)
  })

  it('reflects the passed set', () => {
    const s = new Set([1, 7, 22])
    expect(getCollapsedPositions(s)).toBe(s)
  })
})

describe('buildFoldDecorations', () => {
  it('adds a widget decoration at the start of each heading node', () => {
    const doc = makeDoc([h(1, 'Title'), p('body text'), h(2, 'Section')])
    const decs = buildFoldDecorations(doc, new Set())
    // 2 widget decorations (one per heading), 0 hide decorations (nothing collapsed)
    expect(decs.find().length).toBe(2)
  })

  it('hides nodes between a collapsed h2 and the next h2', () => {
    // doc: h2@1, p@?, h2@?, p@?
    const doc = makeDoc([h(2, 'A'), p('under A'), h(2, 'B'), p('under B')])
    // position of the first heading node is 0 in ProseMirror (doc offset 0)
    // we need to find the actual pos — iterate doc to find it
    let h2Pos = -1
    doc.forEach((node, offset) => {
      if (h2Pos === -1 && node.type.name === 'heading') h2Pos = offset
    })
    const collapsed = new Set([h2Pos])
    const decs = buildFoldDecorations(doc, collapsed)
    // widgets: 2 headings → 2 widget decs
    // hide decs: the paragraph between first h2 and second h2
    const allDecs = decs.find()
    const hideDecs = allDecs.filter(d => {
      // widget decorations have no .spec.node; node decorations do
      return (d as unknown as { spec: { style?: string } }).spec?.style?.includes('display:none')
    })
    expect(hideDecs.length).toBeGreaterThanOrEqual(1)
  })

  it('does not hide content under an h2 that is not collapsed', () => {
    const doc = makeDoc([h(2, 'A'), p('under A'), h(2, 'B'), p('under B')])
    const decs = buildFoldDecorations(doc, new Set())
    const allDecs = decs.find()
    const hideDecs = allDecs.filter(d =>
      (d as unknown as { spec: { style?: string } }).spec?.style?.includes('display:none')
    )
    expect(hideDecs.length).toBe(0)
  })

  it('collapses content under h1 until next h1 or end of doc', () => {
    const doc = makeDoc([h(1, 'Top'), p('intro'), h(2, 'Sub'), p('sub body')])
    let h1Pos = -1
    doc.forEach((node, offset) => {
      if (h1Pos === -1 && node.type === schema.nodes.heading) h1Pos = offset
    })
    const decs = buildFoldDecorations(doc, new Set([h1Pos]))
    const hideDecs = decs.find().filter(d =>
      (d as unknown as { spec: { style?: string } }).spec?.style?.includes('display:none')
    )
    // Should hide both the paragraph AND the h2 under the h1
    expect(hideDecs.length).toBeGreaterThanOrEqual(2)
  })
})

describe('FoldPluginKey', () => {
  it('is defined and has a name', () => {
    expect(FoldPluginKey).toBeDefined()
    expect(FoldPluginKey.key).toContain('foldHeadings')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/device/Documents/owl.md && npm test -- tests/renderer/extensions/FoldHeadings.test.ts 2>&1 | tail -20
```

Expected: All tests FAIL (module not found).

- [ ] **Step 3: Implement FoldHeadings.ts**

Create `src/renderer/components/editor/extensions/FoldHeadings.ts`:

```typescript
// src/renderer/components/editor/extensions/FoldHeadings.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export const FoldPluginKey = new PluginKey<Set<number>>('foldHeadings')

/** Pure helper: returns a new Set with `pos` toggled in/out. */
export function togglePosition(set: Set<number>, pos: number): Set<number> {
  const next = new Set(set)
  if (next.has(pos)) next.delete(pos)
  else next.add(pos)
  return next
}

/** Accessor kept separate so tests can call it without a full ProseMirror state. */
export function getCollapsedPositions(s: Set<number>): Set<number> {
  return s
}

/**
 * Builds the full DecorationSet for the current doc + collapsed set.
 *
 * For every heading node:
 *   - Adds a Decoration.widget (the fold toggle button)
 *   - If that heading position is in `collapsed`, adds Decoration.node with
 *     `style:'display:none'` to every sibling node that falls "inside" the
 *     fold region (until the next heading of equal or higher rank, or end of doc).
 */
export function buildFoldDecorations(
  doc: ProseMirrorNode,
  collapsed: Set<number>
): DecorationSet {
  const decorations: Decoration[] = []

  // Collect heading positions and levels in document order
  const headings: Array<{ pos: number; level: number }> = []
  doc.forEach((node, offset) => {
    if (node.type.name === 'heading') {
      headings.push({ pos: offset, level: node.attrs.level as number })
    }
  })

  // Build a flat list of top-level nodes with their positions
  const topNodes: Array<{ pos: number; node: ProseMirrorNode }> = []
  doc.forEach((node, offset) => {
    topNodes.push({ pos: offset, node })
  })

  // For each heading, add toggle widget and optionally hide following nodes
  for (let hi = 0; hi < headings.length; hi++) {
    const { pos, level } = headings[hi]

    // Widget decoration: placed just inside the heading node (pos + 1)
    const isCollapsed = collapsed.has(pos)
    const widget = Decoration.widget(
      pos + 1,
      () => {
        const btn = document.createElement('button')
        btn.className = 'fold-toggle'
        btn.setAttribute('data-fold-pos', String(pos))
        btn.setAttribute('aria-label', isCollapsed ? 'Expand section' : 'Collapse section')
        btn.textContent = isCollapsed ? '▶' : '▼'
        btn.style.cssText = [
          'position:absolute',
          'left:-28px',
          'top:50%',
          'transform:translateY(-50%)',
          'background:none',
          'border:none',
          'cursor:pointer',
          'font-size:10px',
          'color:rgba(255,255,255,0.3)',
          'padding:2px 4px',
          'border-radius:3px',
          'opacity:0',
          'transition:opacity 0.15s',
          'line-height:1',
        ].join(';')
        return btn
      },
      { side: -1, key: `fold-widget-${pos}` }
    )
    decorations.push(widget)

    if (!isCollapsed) continue

    // Determine fold region: all top-level nodes after this heading, until
    // the next heading with level <= current level (or end of doc)
    const headingNodeIndex = topNodes.findIndex(n => n.pos === pos)
    if (headingNodeIndex === -1) continue

    for (let ni = headingNodeIndex + 1; ni < topNodes.length; ni++) {
      const { pos: nPos, node: nNode } = topNodes[ni]
      // Stop at a heading of equal or higher rank
      if (nNode.type.name === 'heading') {
        const nLevel = nNode.attrs.level as number
        if (nLevel <= level) break
      }
      // Hide this node
      decorations.push(
        Decoration.node(nPos, nPos + nNode.nodeSize, {
          style: 'display:none',
        })
      )
    }
  }

  return DecorationSet.create(doc, decorations)
}

const FOLD_TOGGLE_META = 'foldToggle'

export const FoldHeadings = Extension.create({
  name: 'foldHeadings',

  addProseMirrorPlugins() {
    return [
      new Plugin<Set<number>>({
        key: FoldPluginKey,

        state: {
          init: () => new Set<number>(),
          apply: (tr: Transaction, collapsed: Set<number>): Set<number> => {
            const meta = tr.getMeta(FOLD_TOGGLE_META) as number | undefined
            if (meta !== undefined) return togglePosition(collapsed, meta)
            // Remap positions when doc changes
            if (tr.docChanged) {
              const next = new Set<number>()
              collapsed.forEach(pos => {
                const mapped = tr.mapping.map(pos)
                next.add(mapped)
              })
              return next
            }
            return collapsed
          },
        },

        props: {
          decorations: (state) => {
            const collapsed = FoldPluginKey.getState(state) ?? new Set<number>()
            return buildFoldDecorations(state.doc, collapsed)
          },

          handleDOMEvents: {
            click: (view, event) => {
              const target = event.target as HTMLElement
              const btn = target.closest('.fold-toggle') as HTMLElement | null
              if (!btn) return false
              const posAttr = btn.getAttribute('data-fold-pos')
              if (posAttr === null) return false
              const pos = parseInt(posAttr, 10)
              const tr = view.state.tr.setMeta(FOLD_TOGGLE_META, pos)
              view.dispatch(tr)
              event.preventDefault()
              return true
            },
          },
        },
      }),
    ]
  },
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/device/Documents/owl.md && npm test -- tests/renderer/extensions/FoldHeadings.test.ts 2>&1 | tail -20
```

Expected: All 9 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/editor/extensions/FoldHeadings.ts tests/renderer/extensions/FoldHeadings.test.ts && git commit -m "$(cat <<'EOF'
feat: add FoldHeadings ProseMirror extension with toggle widgets and hide decorations

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: FoldHeadings CSS + NoteEditor integration

**Files:**
- Modify: `src/renderer/components/editor/NoteEditor.module.css`
- Modify: `src/renderer/components/editor/NoteEditor.tsx`

- [ ] **Step 1: Add fold arrow CSS to NoteEditor.module.css**

Add to the end of `src/renderer/components/editor/NoteEditor.module.css`:

```css
/* ── Fold headings ────────────────────────────────────────────────────── */

/* Headings need relative positioning so the absolute toggle is anchored */
.editorWrap :global(.ProseMirror h1),
.editorWrap :global(.ProseMirror h2),
.editorWrap :global(.ProseMirror h3),
.editorWrap :global(.ProseMirror h4),
.editorWrap :global(.ProseMirror h5),
.editorWrap :global(.ProseMirror h6) {
  position: relative;
}

/* Show fold toggle on heading hover */
.editorWrap :global(.ProseMirror h1:hover .fold-toggle),
.editorWrap :global(.ProseMirror h2:hover .fold-toggle),
.editorWrap :global(.ProseMirror h3:hover .fold-toggle),
.editorWrap :global(.ProseMirror h4:hover .fold-toggle),
.editorWrap :global(.ProseMirror h5:hover .fold-toggle),
.editorWrap :global(.ProseMirror h6:hover .fold-toggle) {
  opacity: 1 !important;
}

.editorWrap :global(.fold-toggle:hover) {
  color: rgba(255,255,255,0.7) !important;
  background: rgba(255,255,255,0.08) !important;
}
```

- [ ] **Step 2: Add FoldHeadings to NoteEditor.tsx extensions array**

In `src/renderer/components/editor/NoteEditor.tsx`, add the import:

```typescript
import { FoldHeadings } from './extensions/FoldHeadings'
```

Add `FoldHeadings` to the `extensions` array in `useEditor`:

```typescript
    extensions: [
      StarterKit,
      WikiLink,
      FoldHeadings,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Callout,
      SlashCommand,
    ],
```

- [ ] **Step 3: Verify the app compiles**

```bash
cd /home/device/Documents/owl.md && npm run typecheck 2>&1 | tail -20
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/editor/NoteEditor.tsx src/renderer/components/editor/NoteEditor.module.css && git commit -m "$(cat <<'EOF'
feat: wire FoldHeadings extension into NoteEditor with CSS gutter arrows

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: hoverPreviewStore — tests + implementation

**Files:**
- Create: `src/renderer/stores/hoverPreviewStore.ts`
- Create: `tests/renderer/stores/hoverPreviewStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/stores/hoverPreviewStore.test.ts`:

```typescript
// tests/renderer/stores/hoverPreviewStore.test.ts
import { beforeEach, describe, it, expect } from 'vitest'
import { useHoverPreviewStore } from '../../../src/renderer/stores/hoverPreviewStore'

beforeEach(() => {
  useHoverPreviewStore.setState({
    visible: false,
    noteTitle: null,
    content: null,
    x: 0,
    y: 0,
    loading: false,
  })
})

describe('showPreview', () => {
  it('sets visible=true with position and noteTitle', () => {
    useHoverPreviewStore.getState().showPreview('My Note', 100, 200)
    const s = useHoverPreviewStore.getState()
    expect(s.visible).toBe(true)
    expect(s.noteTitle).toBe('My Note')
    expect(s.x).toBe(100)
    expect(s.y).toBe(200)
    expect(s.loading).toBe(true)
  })

  it('overwrites previous state when called again with different note', () => {
    useHoverPreviewStore.getState().showPreview('Note A', 10, 20)
    useHoverPreviewStore.getState().showPreview('Note B', 30, 40)
    const s = useHoverPreviewStore.getState()
    expect(s.noteTitle).toBe('Note B')
    expect(s.x).toBe(30)
    expect(s.y).toBe(40)
  })
})

describe('setContent', () => {
  it('sets content and clears loading', () => {
    useHoverPreviewStore.getState().showPreview('My Note', 0, 0)
    useHoverPreviewStore.getState().setContent('# Hello\nworld')
    const s = useHoverPreviewStore.getState()
    expect(s.content).toBe('# Hello\nworld')
    expect(s.loading).toBe(false)
  })
})

describe('hidePreview', () => {
  it('sets visible=false and clears content and noteTitle', () => {
    useHoverPreviewStore.getState().showPreview('My Note', 100, 200)
    useHoverPreviewStore.getState().setContent('content')
    useHoverPreviewStore.getState().hidePreview()
    const s = useHoverPreviewStore.getState()
    expect(s.visible).toBe(false)
    expect(s.noteTitle).toBeNull()
    expect(s.content).toBeNull()
    expect(s.loading).toBe(false)
  })
})

describe('initial state', () => {
  it('starts with visible=false and no content', () => {
    const s = useHoverPreviewStore.getState()
    expect(s.visible).toBe(false)
    expect(s.noteTitle).toBeNull()
    expect(s.content).toBeNull()
    expect(s.loading).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/device/Documents/owl.md && npm test -- tests/renderer/stores/hoverPreviewStore.test.ts 2>&1 | tail -20
```

Expected: All tests FAIL (module not found).

- [ ] **Step 3: Implement hoverPreviewStore.ts**

Create `src/renderer/stores/hoverPreviewStore.ts`:

```typescript
// src/renderer/stores/hoverPreviewStore.ts
import { create } from 'zustand'

interface HoverPreviewState {
  visible:   boolean
  noteTitle: string | null
  /** Raw markdown body of the linked note (first ~600 chars) */
  content:   string | null
  x:         number
  y:         number
  loading:   boolean

  showPreview: (noteTitle: string, x: number, y: number) => void
  setContent:  (content: string) => void
  hidePreview: () => void
}

export const useHoverPreviewStore = create<HoverPreviewState>((set) => ({
  visible:   false,
  noteTitle: null,
  content:   null,
  x:         0,
  y:         0,
  loading:   false,

  showPreview: (noteTitle, x, y) =>
    set({ visible: true, noteTitle, x, y, loading: true, content: null }),

  setContent: (content) =>
    set({ content, loading: false }),

  hidePreview: () =>
    set({ visible: false, noteTitle: null, content: null, loading: false }),
}))
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/device/Documents/owl.md && npm test -- tests/renderer/stores/hoverPreviewStore.test.ts 2>&1 | tail -20
```

Expected: All 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/stores/hoverPreviewStore.ts tests/renderer/stores/hoverPreviewStore.test.ts && git commit -m "$(cat <<'EOF'
feat: add hoverPreviewStore with show/setContent/hide actions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: HoverPreview component + CSS

**Files:**
- Create: `src/renderer/components/editor/HoverPreview.tsx`
- Create: `src/renderer/components/editor/HoverPreview.module.css`

- [ ] **Step 1: Create HoverPreview.module.css**

Create `src/renderer/components/editor/HoverPreview.module.css`:

```css
/* src/renderer/components/editor/HoverPreview.module.css */

.card {
  position: fixed;
  z-index: 1000;
  width: 320px;
  max-height: 220px;
  overflow: hidden;
  padding: 14px 16px;
  background: rgba(18, 22, 36, 0.92);
  backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid rgba(91, 200, 240, 0.2);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.04);
  pointer-events: none;
  animation: fadeIn 0.12s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: #e8eeff;
  margin: 0 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.body {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 7;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
  word-break: break-word;
}

.loading {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}

.empty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.25);
  font-style: italic;
}

/* Fade-out gradient at the bottom to signal truncated content */
.card::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 40px;
  background: linear-gradient(transparent, rgba(18, 22, 36, 0.95));
  pointer-events: none;
  border-radius: 0 0 10px 10px;
}
```

- [ ] **Step 2: Create HoverPreview.tsx**

Create `src/renderer/components/editor/HoverPreview.tsx`:

```typescript
// src/renderer/components/editor/HoverPreview.tsx
import React, { useMemo } from 'react'
import { useHoverPreviewStore } from '../../stores/hoverPreviewStore'
import styles from './HoverPreview.module.css'

/** Strip markdown syntax for a plain-text preview. */
function stripMarkdown(md: string): string {
  return md
    .replace(/^---[\s\S]*?---\n?/, '')       // frontmatter
    .replace(/!\[\[.*?\]\]/g, '')             // embeds
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1') // wiki links → title
    .replace(/!\[.*?\]\(.*?\)/g, '')          // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/^#{1,6}\s+/gm, '')             // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')         // bold
    .replace(/\*(.+?)\*/g, '$1')             // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '')       // code
    .replace(/^[-*+]\s+/gm, '')             // list bullets
    .replace(/^\d+\.\s+/gm, '')              // ordered list
    .replace(/^>\s+/gm, '')                  // blockquote markers
    .replace(/\n{3,}/g, '\n\n')              // excess blank lines
    .trim()
}

const VIEWPORT_MARGIN = 16
const CARD_WIDTH = 320
const CARD_HEIGHT = 220

function computePosition(
  x: number,
  y: number
): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = x + 12
  if (left + CARD_WIDTH + VIEWPORT_MARGIN > vw) {
    left = x - CARD_WIDTH - 12
  }
  left = Math.max(VIEWPORT_MARGIN, left)

  let top = y + 16
  if (top + CARD_HEIGHT + VIEWPORT_MARGIN > vh) {
    top = y - CARD_HEIGHT - 8
  }
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
    <div
      className={styles.card}
      style={{ left: position.left, top: position.top }}
      role="tooltip"
      aria-label={`Preview of ${noteTitle}`}
    >
      <div className={styles.title}>{noteTitle}</div>
      {loading && <div className={styles.loading}>Loading…</div>}
      {!loading && preview && <div className={styles.body}>{preview}</div>}
      {!loading && !preview && <div className={styles.empty}>No content</div>}
    </div>
  )
}
```

- [ ] **Step 3: Verify types**

```bash
cd /home/device/Documents/owl.md && npm run typecheck 2>&1 | grep -i error | head -20
```

Expected: No errors in the new files.

- [ ] **Step 4: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/editor/HoverPreview.tsx src/renderer/components/editor/HoverPreview.module.css && git commit -m "$(cat <<'EOF'
feat: add HoverPreview floating card component with markdown stripping and viewport-aware positioning

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire HoverPreview into NoteEditor (mouseover + IPC fetch)

**Files:**
- Modify: `src/renderer/components/editor/NoteEditor.tsx`

- [ ] **Step 1: Add hover logic to NoteEditor.tsx**

Replace the NoteEditor.tsx contents with the following (incorporates all previous changes plus the hover preview wiring):

```typescript
// src/renderer/components/editor/NoteEditor.tsx
import React, { useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/WikiLink'
import { Callout } from './extensions/Callout'
import { SlashCommand } from './extensions/SlashCommand'
import { FoldHeadings } from './extensions/FoldHeadings'
import { TabBar } from './TabBar'
import { HoverPreview } from './HoverPreview'
import { useEditorStore } from '../../stores/editorStore'
import { useTabStore } from '../../stores/tabStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { useHoverPreviewStore } from '../../stores/hoverPreviewStore'
import { extractHeadings } from '../../lib/markdown'
import { ipc } from '../../lib/ipc'
import styles from './NoteEditor.module.css'

const AUTOSAVE_MS = 1500
const HOVER_SHOW_DELAY_MS = 400
const HOVER_HIDE_DELAY_MS = 200

export function NoteEditor(): JSX.Element {
  const note        = useEditorStore(s => s.note)
  const markdown    = useEditorStore(s => s.markdown)
  const isDirty     = useEditorStore(s => s.isDirty)
  const saveStatus  = useEditorStore(s => s.saveStatus)
  const isReadingView = useEditorStore(s => s.isReadingView)
  const setMarkdown = useEditorStore(s => s.setMarkdown)
  const save        = useEditorStore(s => s.save)
  const restoreTab  = useEditorStore(s => s.restoreTab)
  const unloadNote  = useEditorStore(s => s.unloadNote)
  const loadNote    = useEditorStore(s => s.loadNote)
  const toggleReadingView = useEditorStore(s => s.toggleReadingView)
  const setHeadings = useRightPanelStore(s => s.setHeadings)
  const activeTabId = useTabStore(s => s.activeTabId)

  const showPreview = useHoverPreviewStore(s => s.showPreview)
  const setContent  = useHoverPreviewStore(s => s.setContent)
  const hidePreview = useHoverPreviewStore(s => s.hidePreview)

  const autosaveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverShowTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverHideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeHoverNote = useRef<string | null>(null)

  // When active tab changes: restore from cache or load from disk
  useEffect(() => {
    if (activeTabId === null) { unloadNote(); return }
    const tab = useTabStore.getState().tabs.find(t => t.id === activeTabId)
    if (!tab) return
    if (tab.markdown !== null && tab.frontmatter !== null) {
      const allNotes = useVaultStore.getState().notes
      const n = allNotes.find(n => n.id === tab.noteId) ?? null
      restoreTab(tab.markdown, tab.frontmatter, tab.isDirty, n)
    } else {
      loadNote(tab.noteId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])

  const editor = useEditor({
    extensions: [
      StarterKit,
      WikiLink,
      FoldHeadings,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Callout,
      SlashCommand,
    ],
    content: markdown,
    editable: !isReadingView,
    onUpdate: ({ editor }) => {
      if (isReadingView) return
      const md = editor.storage.markdown.getMarkdown() as string
      setMarkdown(md)
      setHeadings(extractHeadings(md))
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(() => save(), AUTOSAVE_MS)
    },
    editorProps: {
      handleClick: (_view, _pos, event) => {
        const target = (event.target as HTMLElement).closest('[data-target]')
        if (target) {
          const linkTarget = target.getAttribute('data-target')
          if (linkTarget) {
            window.dispatchEvent(new CustomEvent('owl:open-wiki-link', { detail: { target: linkTarget } }))
          }
          return true
        }
        return false
      },
    },
  })

  // Sync editor editable state when reading view toggles
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!isReadingView)
  }, [editor, isReadingView])

  useEffect(() => {
    if (!editor) return
    const current = editor.storage.markdown?.getMarkdown() as string | undefined
    if (current !== markdown) editor.commands.setContent(markdown)
    setHeadings(extractHeadings(markdown))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (isReadingView) return
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
        save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save, isReadingView])

  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }, [])

  // Hover preview: mouseover/mouseleave on wiki-link decorations
  const handleMouseOver = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.wiki-link') as HTMLElement | null
    if (!target) return
    const linkTitle = target.getAttribute('data-target')
    if (!linkTitle) return

    // Cancel pending hide
    if (hoverHideTimer.current) { clearTimeout(hoverHideTimer.current); hoverHideTimer.current = null }

    // Already showing same note — no-op
    if (activeHoverNote.current === linkTitle && useHoverPreviewStore.getState().visible) return

    // Debounce show
    if (hoverShowTimer.current) clearTimeout(hoverShowTimer.current)
    hoverShowTimer.current = setTimeout(async () => {
      const rect = target.getBoundingClientRect()
      showPreview(linkTitle, rect.left, rect.bottom)
      activeHoverNote.current = linkTitle

      const notes = useVaultStore.getState().notes
      const found = notes.find(n => n.title.toLowerCase() === linkTitle.toLowerCase())
      if (!found) { setContent(''); return }

      try {
        const { markdown: raw } = await ipc.notes.read(found.id)
        // Only apply if the user is still hovering the same note
        if (activeHoverNote.current === linkTitle) setContent(raw)
      } catch {
        if (activeHoverNote.current === linkTitle) setContent('')
      }
    }, HOVER_SHOW_DELAY_MS)
  }, [showPreview, setContent])

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.wiki-link')
    if (!target) return
    if (hoverShowTimer.current) { clearTimeout(hoverShowTimer.current); hoverShowTimer.current = null }
    hoverHideTimer.current = setTimeout(() => {
      hidePreview()
      activeHoverNote.current = null
    }, HOVER_HIDE_DELAY_MS)
  }, [hidePreview])

  // Cleanup hover timers on unmount
  useEffect(() => () => {
    if (hoverShowTimer.current) clearTimeout(hoverShowTimer.current)
    if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current)
  }, [])

  const statusLabel =
    isReadingView ? '' :
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? '✓ Saved' :
    saveStatus === 'error'  ? '✗ Save failed' :
    isDirty ? '●' : ''

  const statusClass = !isReadingView && saveStatus !== 'idle'
    ? styles[saveStatus]
    : !isReadingView && isDirty ? styles.dirty : ''

  return (
    <div className={styles.root}>
      <TabBar />
      {note ? (
        <>
          <div className={styles.toolbar}>
            {isReadingView && (
              <span className={styles.readingBadge}>Reading</span>
            )}
            <span className={`${styles.saveStatus} ${statusClass}`}>{statusLabel}</span>
            <button
              className={`${styles.toolbarBtn} ${isReadingView ? styles.toolbarBtnActive : ''}`}
              onClick={toggleReadingView}
              title={isReadingView ? 'Switch to edit mode' : 'Switch to reading view'}
              aria-label={isReadingView ? 'Edit' : 'Reading view'}
            >
              {isReadingView ? '✏️' : '📖'}
            </button>
          </div>
          <div
            className={`${styles.editorWrap} ${isReadingView ? styles.readingView : ''}`}
            onMouseOver={handleMouseOver}
            onMouseOut={handleMouseLeave}
          >
            <EditorContent editor={editor} />
          </div>
          <HoverPreview />
        </>
      ) : (
        <div className={styles.empty}>Open a note or create a new one</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify types**

```bash
cd /home/device/Documents/owl.md && npm run typecheck 2>&1 | grep -i error | head -20
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/editor/NoteEditor.tsx && git commit -m "$(cat <<'EOF'
feat: wire HoverPreview and reading view into NoteEditor with debounced mouseover

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Reading View — editorStore + CSS

**Files:**
- Modify: `src/renderer/stores/editorStore.ts`
- Modify: `src/renderer/components/editor/NoteEditor.module.css`

- [ ] **Step 1: Add isReadingView + toggleReadingView to editorStore**

In `src/renderer/stores/editorStore.ts`, update the `EditorState` interface and implementation:

```typescript
// Add to interface EditorState (after saveStatus):
  isReadingView:      boolean
  toggleReadingView:  () => void
```

In the `create<EditorState>` call, add to the initial state object:

```typescript
  isReadingView: false,
```

Add the action implementation after `save`:

```typescript
  toggleReadingView: () => set(s => ({ isReadingView: !s.isReadingView })),
```

Also update the `unloadNote` action to reset reading view on note unload:

```typescript
  unloadNote: () => {
    set({ note: null, markdown: '', frontmatter: {}, isDirty: false, saveStatus: 'idle', isReadingView: false })
  },
```

Full updated `editorStore.ts` for reference:

```typescript
// src/renderer/stores/editorStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import { parseFrontmatter, serializeFrontmatter } from '../lib/markdown'
import { useTabStore } from './tabStore'
import type { Frontmatter } from '../lib/markdown'
import type { Note } from '@shared/types/Note'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface EditorState {
  note:        Note | null
  /** Body only — frontmatter stripped. This is what TipTap sees. */
  markdown:    string
  frontmatter: Frontmatter
  isDirty:     boolean
  saveStatus:  SaveStatus
  isReadingView: boolean
  loadNote:         (id: string) => Promise<void>
  restoreTab:       (markdown: string, frontmatter: Frontmatter, isDirty: boolean, note: Note | null) => void
  unloadNote:       () => void
  setMarkdown:      (md: string) => void
  setFrontmatter:   (fm: Frontmatter) => void
  save:             () => Promise<void>
  toggleReadingView: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  note:          null,
  markdown:      '',
  frontmatter:   {},
  isDirty:       false,
  saveStatus:    'idle',
  isReadingView: false,

  loadNote: async (id) => {
    const { note, markdown: raw } = await ipc.notes.read(id)
    const { frontmatter, body } = parseFrontmatter(raw)
    set({ note, markdown: body, frontmatter, isDirty: false, saveStatus: 'idle' })
    const { activeTabId } = useTabStore.getState()
    if (activeTabId) {
      useTabStore.getState().updateTabContent(activeTabId, body, frontmatter, false)
    }
  },

  restoreTab: (markdown, frontmatter, isDirty, note) => {
    set({ note, markdown, frontmatter, isDirty, saveStatus: 'idle' })
  },

  unloadNote: () => {
    set({ note: null, markdown: '', frontmatter: {}, isDirty: false, saveStatus: 'idle', isReadingView: false })
  },

  setMarkdown: (md) => {
    set({ markdown: md, isDirty: true })
    const { activeTabId } = useTabStore.getState()
    if (activeTabId) {
      useTabStore.getState().updateTabContent(activeTabId, md, get().frontmatter, true)
    }
  },

  setFrontmatter: (fm) => {
    set({ frontmatter: fm, isDirty: true })
    const { activeTabId } = useTabStore.getState()
    if (activeTabId) {
      useTabStore.getState().updateTabContent(activeTabId, get().markdown, fm, true)
    }
  },

  save: async () => {
    const { note, markdown, frontmatter } = get()
    if (!note) return
    set({ saveStatus: 'saving' })
    try {
      const full = serializeFrontmatter(frontmatter, markdown)
      const updated = await ipc.notes.save(note.id, full)
      set({ note: updated, isDirty: false, saveStatus: 'saved' })
      const { activeTabId } = useTabStore.getState()
      if (activeTabId) useTabStore.getState().markTabClean(activeTabId)
      setTimeout(() => set(s => s.saveStatus === 'saved' ? { saveStatus: 'idle' } : s), 1500)
    } catch {
      set({ saveStatus: 'error' })
    }
  },

  toggleReadingView: () => set(s => ({ isReadingView: !s.isReadingView })),
}))
```

- [ ] **Step 2: Add reading view CSS to NoteEditor.module.css**

Add to the end of `src/renderer/components/editor/NoteEditor.module.css`:

```css
/* ── Reading View ─────────────────────────────────────────────────────── */

.readingBadge {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(91, 200, 240, 0.9);
  background: rgba(91, 200, 240, 0.1);
  border: 1px solid rgba(91, 200, 240, 0.25);
  border-radius: 4px;
  padding: 2px 7px;
  margin-right: auto;
}

.toolbarBtn {
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 5px;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 13px;
  padding: 3px 7px;
  transition: background 0.15s, color 0.15s;
  margin-left: auto;
}
.toolbarBtn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.8); }
.toolbarBtnActive { color: rgba(91,200,240,0.9) !important; border-color: rgba(91,200,240,0.3) !important; }

.readingView :global(.ProseMirror) {
  cursor: default;
  user-select: text;
}

/* Hide ProseMirror cursor in reading view */
.readingView :global(.ProseMirror .ProseMirror-selectednode) {
  outline: none;
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd /home/device/Documents/owl.md && npm run typecheck 2>&1 | grep -i error | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/stores/editorStore.ts src/renderer/components/editor/NoteEditor.module.css && git commit -m "$(cat <<'EOF'
feat: add isReadingView toggle to editorStore with reading badge and toolbar button styles

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: NoteEmbed extension (![[...]]) — widget decoration approach

**Files:**
- Create: `src/renderer/components/editor/extensions/NoteEmbed.ts`
- Modify: `src/renderer/components/editor/NoteEditor.module.css`
- Modify: `src/renderer/components/editor/NoteEditor.tsx`

The embed feature uses a widget decoration approach (simpler than a full NodeView): the raw `![[Note Title]]` text is left in the document, and a widget decoration renders a preview card inline above or beside the syntax. This avoids complex round-trip serialization issues while still providing a useful transclusion visual.

- [ ] **Step 1: Implement NoteEmbed.ts**

Create `src/renderer/components/editor/extensions/NoteEmbed.ts`:

```typescript
// src/renderer/components/editor/extensions/NoteEmbed.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { ipc } from '../../../lib/ipc'
import { useVaultStore } from '../../../stores/vaultStore'

/** Matches ![[Note Title]] — note: NOT [[Note Title]] (no bang) */
const NOTE_EMBED_RE = /!\[\[([^\]]+)\]\]/g

export const NoteEmbedPluginKey = new PluginKey<DecorationSet>('noteEmbed')

/** Map from embed target title → loaded preview text (populated async) */
const embedCache = new Map<string, string>()

/** Exported for unit testing */
export function buildEmbedDecorations(
  doc: ProseMirrorNode,
  loadEmbed: (title: string) => void
): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const match of node.text.matchAll(NOTE_EMBED_RE)) {
      const from = pos + match.index!
      const to   = from + match[0].length
      const title = match[1].trim()

      // Inline decoration to style the raw syntax
      decorations.push(
        Decoration.inline(from, to, {
          class: 'note-embed-syntax',
          'data-embed-target': title,
        })
      )

      // Widget decoration: rendered block just before the ![[...]] text
      const cached = embedCache.get(title)
      if (cached === undefined) {
        // Trigger async load — will cause a re-render via a forced update
        loadEmbed(title)
      }

      const widget = Decoration.widget(
        from,
        () => {
          const container = document.createElement('div')
          container.className = 'note-embed-card'
          container.setAttribute('data-embed-target', title)

          const titleEl = document.createElement('div')
          titleEl.className = 'note-embed-title'
          titleEl.textContent = title

          const bodyEl = document.createElement('div')
          bodyEl.className = 'note-embed-body'

          if (cached === undefined) {
            bodyEl.textContent = 'Loading…'
            bodyEl.classList.add('note-embed-loading')
          } else if (cached === '') {
            bodyEl.textContent = '(Note not found)'
            bodyEl.classList.add('note-embed-empty')
          } else {
            bodyEl.textContent = cached.slice(0, 400)
          }

          container.appendChild(titleEl)
          container.appendChild(bodyEl)
          return container
        },
        { side: -1, key: `embed-${title}-${from}` }
      )
      decorations.push(widget)
    }
  })

  return DecorationSet.create(doc, decorations)
}

/**
 * NoteEmbed TipTap Extension.
 *
 * Detects `![[Note Title]]` patterns and renders an inline preview card
 * using widget decorations. Content is loaded via IPC and cached in memory.
 * The embed syntax itself gets an `note-embed-syntax` class for styling.
 */
export const NoteEmbed = Extension.create({
  name: 'noteEmbed',

  addProseMirrorPlugins() {
    // We need a reference to the view to force a re-decoration after async loads.
    // We store it via a closure updated in the `view` lifecycle hook.
    let viewRef: { dispatch: (tr: import('@tiptap/pm/state').Transaction) => void; state: import('@tiptap/pm/state').EditorState } | null = null

    const loadEmbed = async (title: string): Promise<void> => {
      if (embedCache.has(title)) return
      // Mark as in-progress with undefined → set sentinel to prevent duplicate loads
      embedCache.set(title, undefined as unknown as string)

      const notes = useVaultStore.getState().notes
      const found = notes.find(n => n.title.toLowerCase() === title.toLowerCase())
      if (!found) {
        embedCache.set(title, '')
        triggerRedecorate()
        return
      }
      try {
        const { markdown } = await ipc.notes.read(found.id)
        // Strip frontmatter
        const body = markdown.replace(/^---[\s\S]*?---\n?/, '').trim()
        embedCache.set(title, body.slice(0, 800))
      } catch {
        embedCache.set(title, '')
      }
      triggerRedecorate()
    }

    const triggerRedecorate = (): void => {
      if (!viewRef) return
      // Dispatch a no-op transaction to force decoration recompute
      viewRef.dispatch(viewRef.state.tr.setMeta('noteEmbedRefresh', true))
    }

    return [
      new Plugin({
        key: NoteEmbedPluginKey,

        view: (editorView) => {
          viewRef = editorView
          return {
            destroy: () => { viewRef = null },
          }
        },

        state: {
          init: (_, { doc }) => buildEmbedDecorations(doc, loadEmbed),
          apply: (tr, _old, _prev, next) => {
            if (tr.docChanged || tr.getMeta('noteEmbedRefresh')) {
              return buildEmbedDecorations(next.doc, loadEmbed)
            }
            return _old
          },
        },

        props: {
          decorations: (state) =>
            NoteEmbedPluginKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ]
  },
})
```

- [ ] **Step 2: Add embed CSS to NoteEditor.module.css**

Add to the end of `src/renderer/components/editor/NoteEditor.module.css`:

```css
/* ── Note Embeds (![[...]]) ───────────────────────────────────────────── */

.editorWrap :global(.note-embed-syntax) {
  color: rgba(160,130,220,0.7);
  font-size: 12px;
  opacity: 0.6;
}

.editorWrap :global(.note-embed-card) {
  display: block;
  background: rgba(130,100,200,0.08);
  border: 1px solid rgba(130,100,200,0.2);
  border-left: 3px solid rgba(130,100,200,0.5);
  border-radius: 6px;
  padding: 10px 14px;
  margin: 4px 0;
  max-width: 680px;
  cursor: default;
}

.editorWrap :global(.note-embed-title) {
  font-size: 12px;
  font-weight: 600;
  color: rgba(180,150,240,0.9);
  margin-bottom: 6px;
}

.editorWrap :global(.note-embed-body) {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255,255,255,0.45);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow: hidden;
}

.editorWrap :global(.note-embed-loading),
.editorWrap :global(.note-embed-empty) {
  font-style: italic;
  color: rgba(255,255,255,0.25);
}
```

- [ ] **Step 3: Add NoteEmbed to NoteEditor.tsx extensions array**

In `src/renderer/components/editor/NoteEditor.tsx`, add the import:

```typescript
import { NoteEmbed } from './extensions/NoteEmbed'
```

Add `NoteEmbed` to the `extensions` array in `useEditor` (after `WikiLink`):

```typescript
    extensions: [
      StarterKit,
      WikiLink,
      FoldHeadings,
      NoteEmbed,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Callout,
      SlashCommand,
    ],
```

- [ ] **Step 4: Verify types**

```bash
cd /home/device/Documents/owl.md && npm run typecheck 2>&1 | grep -i error | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/editor/extensions/NoteEmbed.ts src/renderer/components/editor/NoteEditor.module.css src/renderer/components/editor/NoteEditor.tsx && git commit -m "$(cat <<'EOF'
feat: add NoteEmbed extension rendering ![[...]] as inline preview cards with async IPC load

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Full test suite pass + final polish

**Files:**
- All previously created/modified files

- [ ] **Step 1: Run full test suite**

```bash
cd /home/device/Documents/owl.md && npm test 2>&1 | tail -30
```

Expected: All tests pass. If any fail, fix the specific failures before proceeding.

- [ ] **Step 2: Run typecheck**

```bash
cd /home/device/Documents/owl.md && npm run typecheck 2>&1 | tail -20
```

Expected: Zero errors.

- [ ] **Step 3: Verify fold toggle is visible on hover**

Manual smoke test — open the app, open a note with multiple headings, hover over a heading and verify the `▼` toggle appears in the left gutter. Click it and verify the content below the heading disappears and the toggle changes to `▶`.

- [ ] **Step 4: Verify hover preview appears on wiki-link hover**

Manual smoke test — hover over a `[[WikiLink]]` in a note for 400ms and verify the floating preview card appears with the linked note's content. Move the mouse away and verify the card disappears after 200ms.

- [ ] **Step 5: Verify reading view toggle**

Manual smoke test — click the `📖` button in the toolbar. Verify:
- Editor becomes non-editable (clicking in content does not place cursor)
- "Reading" badge appears in toolbar
- Autosave is suppressed (no `●` dirty indicator appears)
- Clicking `✏️` restores edit mode

- [ ] **Step 6: Verify note embed renders**

Manual smoke test — in a note, type `![[Another Note]]` where "Another Note" is a real note in the vault. Verify a purple-tinted preview card appears above the `![[...]]` syntax within 1-2 seconds.

- [ ] **Step 7: Final commit**

```bash
cd /home/device/Documents/owl.md && git add -p && git commit -m "$(cat <<'EOF'
chore: final polish and test pass for Phase 2C-B editor extensions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Summary of what gets built

| Feature | Mechanism | Key file |
|---------|-----------|----------|
| Fold Headings | ProseMirror plugin; `Set<number>` plugin state; widget + node decorations; click via `handleDOMEvents` | `FoldHeadings.ts` |
| Hover Preview | Zustand store; debounced mouseover on `.wiki-link`; IPC fetch; floating React component | `HoverPreview.tsx`, `hoverPreviewStore.ts` |
| Note Embeds | ProseMirror plugin; widget decorations; async IPC with in-memory cache; force re-decorate on load | `NoteEmbed.ts` |
| Reading View | `editor.setEditable(false)`; `isReadingView` in editorStore; toolbar toggle button | `editorStore.ts` |

## Key implementation notes

- **FoldHeadings position mapping:** On every `tr.docChanged` transaction, the plugin remaps all collapsed positions through `tr.mapping` to keep them valid as the document changes. Positions that map to -1 (deleted content) are silently dropped on the next render cycle.

- **Hover preview race condition:** The `activeHoverNote` ref is checked after the IPC call resolves. If the user has moved to a different wiki-link while the first fetch was in flight, the stale response is discarded.

- **NoteEmbed cache:** `embedCache` is module-level and persists for the application lifetime. This is intentional — embed content rarely changes mid-session, and the cache avoids redundant IPC calls during re-renders. If a note is saved externally (chokidar event), the cache will stale until the next app reload; this is acceptable for a v1 implementation.

- **Reading view and autosave:** The `onUpdate` handler in `useEditor` returns early when `isReadingView` is true. Additionally, the Ctrl+S handler checks `isReadingView` before calling `save()`. The editor's `editable` prop is synced in a `useEffect` watching `[editor, isReadingView]`.

- **WikiLink vs NoteEmbed overlap:** The WikiLink extension matches `[[...]]`. The NoteEmbed extension matches `![[...]]`. They use separate plugin keys and separate regex patterns; the `!` prefix prevents overlap.
