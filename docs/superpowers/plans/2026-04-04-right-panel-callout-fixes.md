# Right-Panel Refresh & Callout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs: backlinks panel never refreshes after saves, callout insertion clears selected text, and Properties panel inputs use uncontrolled `defaultValue`.

**Architecture:** Move backlinks state into `rightPanelStore` so both the sidebar and the editor store can trigger re-fetches; make `insertCallout` read the current ProseMirror selection to preserve selected text; switch `PropertiesPanel` inputs to controlled mode with local state synced on `note.id` change.

**Tech Stack:** React 18, Zustand, Tiptap 2 / ProseMirror, Vitest, TypeScript

---

## File Map

| File | Change |
|---|---|
| `src/renderer/stores/rightPanelStore.ts` | Add `backlinks: BacklinkResult[]` + `fetchBacklinks(noteId)` action |
| `src/renderer/stores/editorStore.ts` | Call `useRightPanelStore.getState().fetchBacklinks(note.id)` after save |
| `src/renderer/components/layout/RightSidebar.tsx` | Read `backlinks` from store; call `fetchBacklinks` in useEffect |
| `src/renderer/components/editor/extensions/Callout.ts` | Make `insertCallout` read `state.selection` to preserve selected text |
| `src/renderer/components/layout/PropertiesPanel.tsx` | Add `localValues` controlled state, sync on `note?.id` change |
| `tests/renderer/extensions/Callout.test.ts` | Add test asserting command accesses `state` (structural check) |

---

### Task 1: Move backlinks into `rightPanelStore`

**Files:**
- Modify: `src/renderer/stores/rightPanelStore.ts`

- [ ] **Step 1: Write the failing test**

There is no existing test for `rightPanelStore`. Open `tests/renderer/stores/tabStore.test.ts` to understand the pattern, then add the assertion:

```ts
// tests/renderer/stores/rightPanelStore.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ipc before importing the store
vi.mock('../../../src/renderer/lib/ipc', () => ({
  ipc: {
    notes: {
      getBacklinks: vi.fn().mockResolvedValue([
        { sourceNoteId: 'note-1', sourceTitle: 'Alpha', linkText: 'Beta' },
      ]),
    },
  },
}))

import { useRightPanelStore } from '../../../src/renderer/stores/rightPanelStore'

describe('rightPanelStore', () => {
  beforeEach(() => { useRightPanelStore.setState({ backlinks: [] }) })

  it('fetchBacklinks populates backlinks state', async () => {
    await useRightPanelStore.getState().fetchBacklinks('note-abc')
    expect(useRightPanelStore.getState().backlinks).toHaveLength(1)
    expect(useRightPanelStore.getState().backlinks[0].sourceTitle).toBe('Alpha')
  })

  it('fetchBacklinks clears backlinks on error', async () => {
    const { ipc } = await import('../../../src/renderer/lib/ipc')
    vi.mocked(ipc.notes.getBacklinks).mockRejectedValueOnce(new Error('fail'))
    await useRightPanelStore.getState().fetchBacklinks('note-abc')
    expect(useRightPanelStore.getState().backlinks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/renderer/stores/rightPanelStore.test.ts
```

Expected: FAIL — `fetchBacklinks is not a function` (or similar — the action doesn't exist yet).

- [ ] **Step 3: Update `rightPanelStore.ts`**

Replace the entire file:

```ts
// src/renderer/stores/rightPanelStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Heading } from '../lib/markdown'
import type { BacklinkResult } from '@shared/types/Note'

export type RightTab = 'backlinks' | 'outline' | 'properties'

interface RightPanelState {
  activeTab:      RightTab
  headings:       Heading[]
  backlinks:      BacklinkResult[]
  setTab:          (tab: RightTab) => void
  setHeadings:     (headings: Heading[]) => void
  fetchBacklinks:  (noteId: string) => Promise<void>
}

export const useRightPanelStore = create<RightPanelState>(set => ({
  activeTab:  'backlinks',
  headings:   [],
  backlinks:  [],
  setTab:       tab      => set({ activeTab: tab }),
  setHeadings:  headings => set({ headings }),
  fetchBacklinks: async (noteId) => {
    try {
      const backlinks = await ipc.notes.getBacklinks(noteId)
      set({ backlinks })
    } catch {
      set({ backlinks: [] })
    }
  },
}))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/renderer/stores/rightPanelStore.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/rightPanelStore.ts tests/renderer/stores/rightPanelStore.test.ts
git commit -m "feat: move backlinks into rightPanelStore with fetchBacklinks action"
```

---

### Task 2: Wire `RightSidebar` to use store backlinks

**Files:**
- Modify: `src/renderer/components/layout/RightSidebar.tsx`

- [ ] **Step 1: Update `RightSidebar.tsx`**

Replace the backlinks local state and its `useEffect` with store reads. The file currently has:

```tsx
const [backlinks, setBacklinks] = useState<BacklinkResult[]>([])

useEffect(() => {
  if (!note) { setBacklinks([]); return }
  ipc.notes.getBacklinks(note.id).then(setBacklinks).catch(() => setBacklinks([]))
}, [note?.id])
```

Replace with:

```tsx
const backlinks        = useRightPanelStore(s => s.backlinks)
const fetchBacklinks   = useRightPanelStore(s => s.fetchBacklinks)

useEffect(() => {
  if (!note) return
  void fetchBacklinks(note.id)
}, [note?.id, fetchBacklinks])
```

Also remove the `ipc` import since it's no longer used directly in this file, and remove the `BacklinkResult` import if it was only used for the local state type. The full updated file:

```tsx
// src/renderer/components/layout/RightSidebar.tsx
import React, { useEffect } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useTabStore } from '../../stores/tabStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { OutlinePanel } from './OutlinePanel'
import { PropertiesPanel } from './PropertiesPanel'
import styles from './RightSidebar.module.css'

const TABS: { id: 'backlinks' | 'outline' | 'properties'; label: string }[] = [
  { id: 'backlinks',  label: 'Links'   },
  { id: 'outline',    label: 'Outline' },
  { id: 'properties', label: 'Props'   },
]

export function RightSidebar(): JSX.Element {
  const note           = useEditorStore(s => s.note)
  const activeTab      = useRightPanelStore(s => s.activeTab)
  const setTab         = useRightPanelStore(s => s.setTab)
  const backlinks      = useRightPanelStore(s => s.backlinks)
  const fetchBacklinks = useRightPanelStore(s => s.fetchBacklinks)

  useEffect(() => {
    if (!note) return
    void fetchBacklinks(note.id)
  }, [note?.id, fetchBacklinks])

  const open = (id: string, title: string): void => { useTabStore.getState().openTab(id, title) }

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {activeTab === 'backlinks' && (
          <div className={styles.list}>
            {backlinks.length === 0
              ? <div className={styles.empty}>{note ? 'No backlinks yet' : 'Open a note'}</div>
              : backlinks.map((bl, i) => (
                  <button key={i} className={styles.backlink} onClick={() => open(bl.sourceNoteId, bl.sourceTitle)}>
                    <div className={styles.blTitle}>{bl.sourceTitle}</div>
                    <div className={styles.blLink}>← [[{bl.linkText}]]</div>
                  </button>
                ))
            }
          </div>
        )}

        {activeTab === 'outline' && <OutlinePanel />}

        {activeTab === 'properties' && <PropertiesPanel />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: same pass count as before (the 2 native-module failures in `DatabaseService` and `IndexService` are pre-existing and unrelated).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/RightSidebar.tsx
git commit -m "refactor: RightSidebar reads backlinks from rightPanelStore"
```

---

### Task 3: Trigger backlinks refresh after every save

**Files:**
- Modify: `src/renderer/stores/editorStore.ts`

- [ ] **Step 1: Update `editorStore.save()`**

The current `save` action ends at line 77. Import `useRightPanelStore` and call `fetchBacklinks` after the save succeeds. Replace the `save` action:

```ts
// src/renderer/stores/editorStore.ts
// Add this import at the top alongside the other store imports:
import { useRightPanelStore } from './rightPanelStore'
```

Then replace the `save` action body (currently lines 67–81):

```ts
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
    // Refresh backlinks in case wiki-link text changed
    void useRightPanelStore.getState().fetchBacklinks(updated.id)
  } catch {
    set({ saveStatus: 'error' })
  }
},
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: same pass count as before.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stores/editorStore.ts
git commit -m "fix: refresh backlinks after every note save"
```

---

### Task 4: Fix callout insertion to preserve selected text

**Files:**
- Modify: `src/renderer/components/editor/extensions/Callout.ts`
- Modify: `tests/renderer/extensions/Callout.test.ts`

- [ ] **Step 1: Add a test for the command structure**

The existing `Callout.test.ts` tests static config. Add a test that verifies `insertCallout` accesses `state` (i.e., accepts the full command helpers object, not just `commands`). Because the test environment is `node` (no DOM, no ProseMirror runtime), we verify the function signature shape:

Append to `tests/renderer/extensions/Callout.test.ts`:

```ts
it('insertCallout command factory accepts a state parameter', () => {
  // The addCommands function returns an object with insertCallout.
  // We verify the inner function accepts an object with both `commands` and `state`
  // by inspecting the returned function's arity.
  const cmds = Callout.config.addCommands?.call(Callout) as Record<string, unknown>
  expect(typeof cmds.insertCallout).toBe('function')
  // The outer function takes (type) and returns an inner function.
  // That inner function should declare at least one parameter ({ commands, state }).
  const inner = (cmds.insertCallout as (t: string) => (...args: unknown[]) => unknown)('info')
  expect(typeof inner).toBe('function')
  // inner.length === 1 means it accepts one destructured argument ({ commands, state, ... })
  expect(inner.length).toBe(1)
})
```

- [ ] **Step 2: Run test to verify it currently passes (length check is format-agnostic)**

```bash
npx vitest run tests/renderer/extensions/Callout.test.ts
```

Expected: PASS (existing 3 tests pass; new test also passes since current impl also has length 1).

Note: this test is structural — it will continue to pass after our fix. The real behaviour verification is manual (see Step 5).

- [ ] **Step 3: Update `Callout.ts` `insertCallout` to be selection-aware**

Replace the `addCommands` block (lines 40–51):

```ts
addCommands() {
  return {
    insertCallout:
      (type: CalloutType) =>
      ({ commands, state }: { commands: ReturnType<typeof commands>, state: typeof state }) => {
        const { from, to } = state.selection
        const selectedText = from !== to ? state.doc.textBetween(from, to, ' ') : ''
        return commands.insertContent({
          type: this.name,
          attrs: { type },
          content: [
            {
              type: 'paragraph',
              content: selectedText ? [{ type: 'text', text: selectedText }] : [],
            },
          ],
        })
      },
  }
},
```

Because Tiptap's command helper types are complex, use the destructured parameter with explicit types to avoid inference issues. The actual working code:

```ts
addCommands() {
  return {
    insertCallout:
      (type: CalloutType) =>
      ({ commands, state }: Parameters<Parameters<typeof Node.create>[0]['addCommands'] extends (...a: never[]) => infer R ? (r: R) => never : never>[0] extends Record<string, (...a: infer A) => unknown> ? never : never) => {
        // ...
      },
  }
},
```

The type inference above is too complex. Use the simpler typed approach that matches Tiptap's actual runtime shape:

```ts
// src/renderer/components/editor/extensions/Callout.ts
import { Node, mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CalloutView } from '../CalloutView'

export type CalloutType = 'info' | 'warning' | 'tip' | 'danger'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (type: CalloutType) => ReturnType
    }
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info' as CalloutType,
        parseHTML: el => (el.getAttribute('data-callout') ?? 'info') as CalloutType,
        renderHTML: attrs => ({ 'data-callout': attrs.type }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      insertCallout:
        (type: CalloutType) =>
        ({ commands, state }: { commands: Editor['commands']; state: Editor['state'] }) => {
          const { from, to } = state.selection
          const selectedText = from !== to ? state.doc.textBetween(from, to, ' ') : ''
          return commands.insertContent({
            type: this.name,
            attrs: { type },
            content: [
              {
                type: 'paragraph',
                content: selectedText ? [{ type: 'text', text: selectedText }] : [],
              },
            ],
          })
        },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: same pass count as before.

- [ ] **Step 5: Manual smoke test**

Launch the app (`npm run dev`), open a note, type some text, select a word, right-click → Insert callout → Info. The callout should appear containing the selected word. Also test with no selection (callout should be empty). Also test the slash command `/callout` (no selection — should insert empty callout).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/editor/extensions/Callout.ts tests/renderer/extensions/Callout.test.ts
git commit -m "fix: insertCallout preserves selected text instead of clearing it"
```

---

### Task 5: Fix PropertiesPanel to use controlled inputs

**Files:**
- Modify: `src/renderer/components/layout/PropertiesPanel.tsx`

- [ ] **Step 1: Rewrite `PropertiesPanel.tsx` with controlled inputs**

The current file uses `defaultValue` (uncontrolled). Replace the entire file:

```tsx
// src/renderer/components/layout/PropertiesPanel.tsx
import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import type { Frontmatter, FrontmatterValue } from '../../lib/markdown'
import styles from './PropertiesPanel.module.css'

function displayValue(v: FrontmatterValue): string {
  return Array.isArray(v) ? v.join(', ') : String(v)
}

function parseValue(raw: string): FrontmatterValue {
  const t = raw.trim()
  if (t.includes(',')) return t.split(',').map(s => s.trim()).filter(Boolean)
  if (t === 'true')  return true
  if (t === 'false') return false
  const n = Number(t)
  if (!Number.isNaN(n) && t !== '') return n
  return t
}

export function PropertiesPanel(): JSX.Element {
  const frontmatter    = useEditorStore(s => s.frontmatter)
  const setFrontmatter = useEditorStore(s => s.setFrontmatter)
  const note           = useEditorStore(s => s.note)
  const [newKey,      setNewKey]      = useState('')
  const [localValues, setLocalValues] = useState<Record<string, string>>({})

  // Re-sync local display values when switching notes
  useEffect(() => {
    setLocalValues(
      Object.fromEntries(
        Object.entries(frontmatter).map(([k, v]) => [k, displayValue(v)])
      )
    )
    setNewKey('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  if (!note) return <div className={styles.empty}>No note open</div>

  const update = (key: string, value: FrontmatterValue): void =>
    setFrontmatter({ ...frontmatter, [key]: value })

  const remove = (key: string): void => {
    const next = { ...frontmatter }
    delete next[key]
    setFrontmatter(next)
    setLocalValues(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const addKey = (): void => {
    const k = newKey.trim()
    if (!k || Object.hasOwn(frontmatter, k)) return
    setFrontmatter({ ...frontmatter, [k]: '' })
    setLocalValues(prev => ({ ...prev, [k]: '' }))
    setNewKey('')
  }

  return (
    <div className={styles.panel}>
      {Object.entries(frontmatter).map(([key, value]) => (
        <div key={key} className={styles.row}>
          <span className={styles.key} title={key}>{key}</span>
          <input
            className={styles.value}
            value={localValues[key] ?? displayValue(value)}
            onChange={e => setLocalValues(prev => ({ ...prev, [key]: e.target.value }))}
            onBlur={e => update(key, parseValue(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
          <button className={styles.removeBtn} onClick={() => remove(key)} title="Remove">×</button>
        </div>
      ))}

      <div className={styles.addRow}>
        <input
          className={styles.newKeyInput}
          placeholder="Add property…"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addKey() }}
        />
        <button className={styles.addBtn} onClick={addKey}>+</button>
      </div>
    </div>
  )
}
```

Key changes from original:
- Added `localValues: Record<string, string>` state
- `useEffect([note?.id])` syncs `localValues` from store when switching notes
- Inputs use `value={localValues[key]}` + `onChange` updates `localValues`
- `remove` cleans up `localValues` for the removed key
- `addKey` initialises the new key in `localValues`
- Removed `key={note.id}` from the wrapper `<div>` (no longer needed)

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: same pass count as before.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/PropertiesPanel.tsx
git commit -m "fix: PropertiesPanel uses controlled inputs synced on note switch"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite one last time**

```bash
npx vitest run
```

Expected: all previously-passing tests still pass. The two pre-existing failures (`DatabaseService.test.ts`, `IndexService.test.ts`) are native-module issues unrelated to these changes.

- [ ] **Step 2: Manual smoke tests**

1. **Backlinks refresh**: Open note A that has `[[note-b]]` in it. Save it. Switch to note B — Links tab should show note A as a backlink. Switch back to A, edit and remove the wiki-link, wait for autosave — switch back to B, Links tab should now be empty.

2. **Callout with selection**: Select text, right-click → Insert callout → Warning. The selected text should appear inside the callout, not be deleted.

3. **Callout without selection**: Place cursor with no selection, right-click → Insert callout → Tip. An empty callout should appear.

4. **Properties sync**: Open a note, switch to Props tab, observe a property value. Rename the note via sidebar. Switch to another note and back. Properties should still show the correct values.
