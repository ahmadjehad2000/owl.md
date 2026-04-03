# Phase 2A: Editor Extensions & Rich UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add callout blocks, slash command menu, YAML frontmatter (with properties panel + outline sidebar), and a ⌘K command palette to give owl.md a power-user editing experience.

**Architecture:** Each editor feature is a self-contained TipTap extension added to `NoteEditor`. Frontmatter is stripped from raw markdown before TipTap sees it and re-injected on save — TipTap only ever edits the body. The right sidebar gains a three-tab design (Links / Outline / Properties) driven by a new `rightPanelStore`. The command palette is a separate modal like the existing `SearchModal`.

**Tech Stack:** TipTap 2 + @tiptap/suggestion (slash commands), ReactNodeViewRenderer (callout blocks), Zustand 4, CSS Modules. No schema changes.

**Phase 2 split** — this is Plan 2A. Remaining plans:
- **2B** — Tabs, drag-and-drop note hierarchy, keyboard shortcuts
- **2C** — Templates, daily notes, tags browser, saved searches
- **2D** — Graph view (React Flow)

---

## File Map

| Status | File | Purpose |
|--------|------|---------|
| Create | `src/renderer/components/editor/extensions/Callout.ts` | TipTap Node — callout block schema + insertCallout command |
| Create | `src/renderer/components/editor/CalloutView.tsx` | React node view for callout (header icon + editable content) |
| Create | `src/renderer/components/editor/CalloutView.module.css` | Per-type colour variants (info/warning/tip/danger) |
| Create | `src/renderer/components/editor/extensions/SlashCommand.ts` | TipTap Extension using @tiptap/suggestion; exports `getSlashItems` |
| Create | `src/renderer/components/editor/SlashMenu.tsx` | Floating command list; keyboard-navigable |
| Create | `src/renderer/components/editor/SlashMenu.module.css` | Slash menu styles |
| Modify | `src/renderer/components/editor/NoteEditor.tsx` | Add Callout + SlashCommand to extensions array; emit headings on update |
| Modify | `src/renderer/lib/markdown.ts` | Append `parseFrontmatter`, `serializeFrontmatter`, `extractHeadings` |
| Modify | `src/renderer/stores/editorStore.ts` | Add `frontmatter` field; strip/re-inject around TipTap |
| Create | `src/renderer/stores/rightPanelStore.ts` | Active tab ('backlinks'\|'outline'\|'properties') + headings array |
| Modify | `src/renderer/components/layout/RightSidebar.tsx` | Replace single backlinks view with three-tab UI |
| Modify | `src/renderer/components/layout/RightSidebar.module.css` | Add tab bar + body styles |
| Create | `src/renderer/components/layout/OutlinePanel.tsx` | Heading list; click scrolls editor to heading |
| Create | `src/renderer/components/layout/OutlinePanel.module.css` | Outline panel styles |
| Create | `src/renderer/components/layout/PropertiesPanel.tsx` | Frontmatter key-value editor |
| Create | `src/renderer/components/layout/PropertiesPanel.module.css` | Properties panel styles |
| Create | `src/renderer/stores/commandPaletteStore.ts` | isOpen state for ⌘K palette |
| Create | `src/renderer/components/command/CommandPalette.tsx` | ⌘K modal — fuzzy-filter notes + New Note action |
| Create | `src/renderer/components/command/CommandPalette.module.css` | Command palette styles |
| Modify | `src/renderer/components/layout/AppShell.tsx` | Add ⌘K handler; render `<CommandPalette />` |
| Modify | `src/renderer/components/layout/MenuBar.tsx` | Add "Command Palette Ctrl+K" to File menu |
| Create | `tests/renderer/extensions/Callout.test.ts` | Unit tests for Callout extension config |
| Create | `tests/renderer/extensions/SlashCommand.test.ts` | Unit tests for `getSlashItems` filter |
| Create | `tests/renderer/lib/frontmatter.test.ts` | Tests for `parseFrontmatter` + `serializeFrontmatter` |
| Create | `tests/renderer/lib/outline.test.ts` | Tests for `extractHeadings` |

---

### Task 1: Callout block TipTap extension

**Files:**
- Create: `src/renderer/components/editor/extensions/Callout.ts`
- Create: `src/renderer/components/editor/CalloutView.tsx`
- Create: `src/renderer/components/editor/CalloutView.module.css`
- Test: `tests/renderer/extensions/Callout.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/extensions/Callout.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { Callout } from '../../../src/renderer/components/editor/extensions/Callout'

describe('Callout extension', () => {
  it('has name "callout"', () => {
    expect(Callout.name).toBe('callout')
  })

  it('is a block group node', () => {
    expect(Callout.config.group).toBe('block')
  })

  it('has a type attribute defaulting to "info"', () => {
    const attrs = Callout.config.addAttributes?.call(Callout) as Record<string, { default: string }>
    expect(attrs.type.default).toBe('info')
  })
})
```

- [ ] **Step 2: Run test — confirm fail**

Run: `npx vitest run tests/renderer/extensions/Callout.test.ts`
Expected: FAIL — `Cannot find module '../../../src/renderer/components/editor/extensions/Callout'`

- [ ] **Step 3: Create `src/renderer/components/editor/extensions/Callout.ts`**

```typescript
// src/renderer/components/editor/extensions/Callout.ts
import { Node, mergeAttributes } from '@tiptap/core'
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
        parseHTML: el => (el.getAttribute('data-callout-type') ?? 'info') as CalloutType,
        renderHTML: attrs => ({ 'data-callout-type': attrs.type }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-callout': '' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      insertCallout:
        (type: CalloutType) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { type },
            content: [{ type: 'paragraph' }],
          }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})
```

- [ ] **Step 4: Create `src/renderer/components/editor/CalloutView.tsx`**

```tsx
// src/renderer/components/editor/CalloutView.tsx
import React from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type { CalloutType } from './extensions/Callout'
import styles from './CalloutView.module.css'

const ICONS: Record<CalloutType, string> = {
  info:    'ℹ',
  warning: '⚠',
  tip:     '💡',
  danger:  '🚫',
}

const LABELS: Record<CalloutType, string> = {
  info:    'Info',
  warning: 'Warning',
  tip:     'Tip',
  danger:  'Danger',
}

export function CalloutView({ node }: NodeViewProps): JSX.Element {
  const type = node.attrs.type as CalloutType
  return (
    <NodeViewWrapper>
      <div className={`${styles.callout} ${styles[type]}`} data-callout={type}>
        <div className={styles.header} contentEditable={false}>
          <span className={styles.icon}>{ICONS[type]}</span>
          <span className={styles.label}>{LABELS[type]}</span>
        </div>
        <NodeViewContent className={styles.content} />
      </div>
    </NodeViewWrapper>
  )
}
```

- [ ] **Step 5: Create `src/renderer/components/editor/CalloutView.module.css`**

```css
/* src/renderer/components/editor/CalloutView.module.css */

.callout {
  border-radius: 6px;
  border-left: 3px solid;
  margin: 12px 0;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  user-select: none;
}

.icon { font-style: normal; line-height: 1; }

.content { padding: 8px 12px; font-size: 14px; }

.info    { background: rgba(56,182,220,0.07); border-color: rgba(56,182,220,0.55); }
.info .header    { background: rgba(56,182,220,0.1);  color: rgba(56,182,220,0.9);  }

.warning { background: rgba(255,190,60,0.06);  border-color: rgba(255,190,60,0.55);  }
.warning .header { background: rgba(255,190,60,0.09); color: rgba(255,190,60,0.9);  }

.tip     { background: rgba(60,200,140,0.06);  border-color: rgba(60,200,140,0.55);  }
.tip .header     { background: rgba(60,200,140,0.09); color: rgba(60,200,140,0.9);  }

.danger  { background: rgba(220,70,70,0.06);   border-color: rgba(220,70,70,0.55);   }
.danger .header  { background: rgba(220,70,70,0.09);  color: rgba(220,70,70,0.9);   }
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `npx vitest run tests/renderer/extensions/Callout.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/editor/extensions/Callout.ts \
        src/renderer/components/editor/CalloutView.tsx \
        src/renderer/components/editor/CalloutView.module.css \
        tests/renderer/extensions/Callout.test.ts
git commit -m "feat: callout block extension (info/warning/tip/danger)"
```

---

### Task 2: Slash command menu

**Files:**
- Create: `src/renderer/components/editor/extensions/SlashCommand.ts`
- Create: `src/renderer/components/editor/SlashMenu.tsx`
- Create: `src/renderer/components/editor/SlashMenu.module.css`
- Modify: `src/renderer/components/editor/NoteEditor.tsx`
- Test: `tests/renderer/extensions/SlashCommand.test.ts`

- [ ] **Step 1: Install @tiptap/suggestion**

```bash
npm install @tiptap/suggestion
```

Expected: package added to node_modules

- [ ] **Step 2: Write failing test**

```typescript
// tests/renderer/extensions/SlashCommand.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getSlashItems } from '../../../src/renderer/components/editor/extensions/SlashCommand'

describe('getSlashItems', () => {
  it('returns all items when query is empty', () => {
    expect(getSlashItems('').length).toBeGreaterThan(8)
  })

  it('filters items by query case-insensitively', () => {
    const items = getSlashItems('head')
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(i =>
      i.title.toLowerCase().includes('head') ||
      i.description.toLowerCase().includes('head'),
    )).toBe(true)
  })

  it('returns callout items when querying "callout"', () => {
    const items = getSlashItems('callout')
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(i =>
      i.title.toLowerCase().includes('callout') ||
      i.description.toLowerCase().includes('callout'),
    )).toBe(true)
  })

  it('returns empty array for unknown query', () => {
    expect(getSlashItems('xyznonexistent')).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run — confirm fail**

Run: `npx vitest run tests/renderer/extensions/SlashCommand.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 4: Create `src/renderer/components/editor/extensions/SlashCommand.ts`**

```typescript
// src/renderer/components/editor/extensions/SlashCommand.ts
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import type { Editor, Range } from '@tiptap/core'
import type { CalloutType } from './Callout'
import { SlashMenu } from '../SlashMenu'
import type { SlashMenuHandle } from '../SlashMenu'

export interface SlashItem {
  title: string
  description: string
  icon: string
  command: (opts: { editor: Editor; range: Range }) => void
}

export function getSlashItems(query: string): SlashItem[] {
  const all: SlashItem[] = [
    {
      title: 'Heading 1', description: 'Large section heading', icon: 'H1',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      title: 'Heading 2', description: 'Medium section heading', icon: 'H2',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      title: 'Heading 3', description: 'Small section heading', icon: 'H3',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
    },
    {
      title: 'Bullet List', description: 'Unordered list', icon: '•',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: 'Numbered List', description: 'Ordered list', icon: '1.',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: 'Code Block', description: 'Syntax-highlighted code', icon: '</>',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCodeBlock().run(),
    },
    {
      title: 'Blockquote', description: 'Indented quote', icon: '"',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setBlockquote().run(),
    },
    {
      title: 'Divider', description: 'Horizontal rule', icon: '—',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      title: 'Callout Info', description: 'Callout block — informational', icon: 'ℹ',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertCallout('info' as CalloutType).run(),
    },
    {
      title: 'Callout Warning', description: 'Callout block — warning', icon: '⚠',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertCallout('warning' as CalloutType).run(),
    },
    {
      title: 'Callout Tip', description: 'Callout block — tip', icon: '💡',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertCallout('tip' as CalloutType).run(),
    },
    {
      title: 'Callout Danger', description: 'Callout block — danger', icon: '🚫',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertCallout('danger' as CalloutType).run(),
    },
  ]

  if (!query) return all
  const q = query.toLowerCase()
  return all.filter(
    item =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q),
  )
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,

        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range })
        },

        items: ({ query }: { query: string }) => getSlashItems(query),

        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle> | null = null

          return {
            onStart: (props: object) => {
              renderer = new ReactRenderer<SlashMenuHandle>(SlashMenu, {
                props,
                editor: this.editor,
              })
              document.body.appendChild(renderer.element)
            },
            onUpdate: (props: object) => {
              renderer?.updateProps(props)
            },
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
              if (!renderer?.ref) return false
              return renderer.ref.onKeyDown(event)
            },
            onExit: () => {
              renderer?.element.remove()
              renderer?.destroy()
              renderer = null
            },
          }
        },
      }),
    ]
  },
})
```

- [ ] **Step 5: Create `src/renderer/components/editor/SlashMenu.tsx`**

```tsx
// src/renderer/components/editor/SlashMenu.tsx
import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { SlashItem } from './extensions/SlashCommand'
import styles from './SlashMenu.module.css'

interface SlashMenuProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
  clientRect?: (() => DOMRect | null) | null
}

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  function SlashMenu({ items, command, clientRect }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => { setSelectedIndex(0) }, [items])

    const selectItem = useCallback(
      (index: number) => { const item = items[index]; if (item) command(item) },
      [items, command],
    )

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent): boolean {
        if (event.key === 'ArrowUp') {
          setSelectedIndex(i => (i - 1 + items.length) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex(i => (i + 1) % items.length)
          return true
        }
        if (event.key === 'Enter') { selectItem(selectedIndex); return true }
        return false
      },
    }))

    const rect = clientRect?.()
    const style: React.CSSProperties = rect
      ? { position: 'fixed', top: rect.bottom + 4, left: rect.left }
      : { display: 'none' }

    if (!items.length) return null

    return (
      <div className={styles.menu} style={style}>
        {items.map((item, i) => (
          <button
            key={item.title}
            className={`${styles.item} ${i === selectedIndex ? styles.selected : ''}`}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => selectItem(i)}
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.text}>
              <span className={styles.title}>{item.title}</span>
              <span className={styles.desc}>{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    )
  },
)
```

- [ ] **Step 6: Create `src/renderer/components/editor/SlashMenu.module.css`**

```css
/* src/renderer/components/editor/SlashMenu.module.css */

.menu {
  z-index: 200;
  min-width: 260px;
  max-height: 320px;
  overflow-y: auto;
  background: #0d1828;
  border: 1px solid rgba(56,182,220,0.18);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.55);
  padding: 4px;
  animation: dropIn 0.1s ease;
}

@keyframes dropIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.1s;
}

.item.selected,
.item:hover { background: rgba(56,182,220,0.1); }

.icon {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.06);
  border-radius: 5px;
  font-size: 12px; font-weight: 700;
  color: rgba(56,182,220,0.8);
  flex-shrink: 0;
}

.text { display: flex; flex-direction: column; gap: 1px; }
.title { font-size: 13px; color: rgba(255,255,255,0.8); font-weight: 500; }
.desc  { font-size: 11px; color: rgba(255,255,255,0.3); }
```

- [ ] **Step 7: Add Callout + SlashCommand to NoteEditor**

The current `extensions` array in `src/renderer/components/editor/NoteEditor.tsx` (line 23–28) is:
```typescript
extensions: [
  StarterKit,
  WikiLink,
  Placeholder.configure({ placeholder: 'Start writing…' }),
  Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
],
```

Add two imports at the top of the file (after line 8, `import { WikiLink }`):
```typescript
import { Callout } from './extensions/Callout'
import { SlashCommand } from './extensions/SlashCommand'
```

Replace the extensions array with:
```typescript
extensions: [
  StarterKit,
  WikiLink,
  Placeholder.configure({ placeholder: 'Start writing…' }),
  Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
  Callout,
  SlashCommand,
],
```

- [ ] **Step 8: Run all tests**

Run: `npx vitest run`
Expected: all tests PASS (including 4 new SlashCommand tests)

- [ ] **Step 9: Build — confirm no TypeScript errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 10: Commit**

```bash
git add src/renderer/components/editor/extensions/SlashCommand.ts \
        src/renderer/components/editor/SlashMenu.tsx \
        src/renderer/components/editor/SlashMenu.module.css \
        src/renderer/components/editor/NoteEditor.tsx \
        tests/renderer/extensions/SlashCommand.test.ts \
        package.json package-lock.json
git commit -m "feat: slash command menu (/ to insert blocks)"
```

---

### Task 3: YAML frontmatter parsing + editorStore update

**Files:**
- Modify: `src/renderer/lib/markdown.ts`
- Modify: `src/renderer/stores/editorStore.ts`
- Test: `tests/renderer/lib/frontmatter.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/renderer/lib/frontmatter.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseFrontmatter, serializeFrontmatter } from '../../../src/renderer/lib/markdown'

describe('parseFrontmatter', () => {
  it('returns empty frontmatter and full body when no --- block', () => {
    const { frontmatter, body } = parseFrontmatter('# Hello\nworld')
    expect(frontmatter).toEqual({})
    expect(body).toBe('# Hello\nworld')
  })

  it('parses string, number, boolean, and array values', () => {
    const md = '---\ntitle: My Note\ncount: 42\ndraft: true\ntags: [a, b, c]\n---\n# Body'
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter.title).toBe('My Note')
    expect(frontmatter.count).toBe(42)
    expect(frontmatter.draft).toBe(true)
    expect(frontmatter.tags).toEqual(['a', 'b', 'c'])
    expect(body).toBe('# Body')
  })

  it('strips surrounding whitespace from values', () => {
    const { frontmatter } = parseFrontmatter('---\ntitle:  Spaced  \n---\n')
    expect(frontmatter.title).toBe('Spaced')
  })

  it('returns empty body string when no content after ---', () => {
    const { body } = parseFrontmatter('---\ntitle: x\n---\n')
    expect(body).toBe('')
  })
})

describe('serializeFrontmatter', () => {
  it('returns body unchanged when frontmatter is empty', () => {
    expect(serializeFrontmatter({}, '# Body')).toBe('# Body')
  })

  it('prepends --- block when frontmatter has keys', () => {
    const result = serializeFrontmatter({ title: 'Test', count: 3 }, '# Body')
    expect(result.startsWith('---\n')).toBe(true)
    expect(result).toContain('title: Test')
    expect(result).toContain('count: 3')
    expect(result).toContain('\n---\n# Body')
  })

  it('serializes arrays as [a, b, c]', () => {
    expect(serializeFrontmatter({ tags: ['x', 'y'] }, '')).toContain('tags: [x, y]')
  })

  it('round-trips: parse → serialize preserves body', () => {
    const original = '---\ntitle: Test\ntags: [a, b]\n---\n# Hello'
    const { frontmatter, body } = parseFrontmatter(original)
    const roundtripped = serializeFrontmatter(frontmatter, body)
    expect(parseFrontmatter(roundtripped).body).toBe(body)
  })
})
```

- [ ] **Step 2: Run — confirm fail**

Run: `npx vitest run tests/renderer/lib/frontmatter.test.ts`
Expected: FAIL — `parseFrontmatter is not a function`

- [ ] **Step 3: Append to `src/renderer/lib/markdown.ts`**

The current file ends after `folderFromPath` (line 19). Append after it:

```typescript
// ─── Frontmatter ────────────────────────────────────────────────────────────

export type FrontmatterValue = string | number | boolean | string[]
export interface Frontmatter { [key: string]: FrontmatterValue }

export function parseFrontmatter(markdown: string): { frontmatter: Frontmatter; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/)
  if (!match) return { frontmatter: {}, body: markdown }
  return { frontmatter: parseYamlSubset(match[1]), body: match[2] }
}

function parseYamlSubset(yaml: string): Frontmatter {
  const result: Frontmatter = {}
  for (const line of yaml.split('\n')) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    const raw = line.slice(colon + 1).trim()
    if (!key) continue
    result[key] = coerceYamlValue(raw)
  }
  return result
}

function coerceYamlValue(raw: string): FrontmatterValue {
  if (raw.startsWith('[') && raw.endsWith(']'))
    return raw.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
  if (raw === 'true')  return true
  if (raw === 'false') return false
  const n = Number(raw)
  if (!Number.isNaN(n) && raw !== '') return n
  return raw
}

export function serializeFrontmatter(frontmatter: Frontmatter, body: string): string {
  const keys = Object.keys(frontmatter)
  if (keys.length === 0) return body
  const yaml = keys
    .map(k => {
      const v = frontmatter[k]
      return Array.isArray(v) ? `${k}: [${v.join(', ')}]` : `${k}: ${v}`
    })
    .join('\n')
  return `---\n${yaml}\n---\n${body}`
}

// ─── Outline ─────────────────────────────────────────────────────────────────

export interface Heading { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; pos: number }

export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  let inFence = false
  let pos = 0
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence
    if (!inFence) {
      const m = line.match(/^(#{1,6})\s+(.+)/)
      if (m) headings.push({ level: m[1].length as Heading['level'], text: m[2].trim(), pos })
    }
    pos++
  }
  return headings
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/renderer/lib/frontmatter.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Rewrite `src/renderer/stores/editorStore.ts`**

Replace the entire file:

```typescript
// src/renderer/stores/editorStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import { parseFrontmatter, serializeFrontmatter } from '../lib/markdown'
import type { Frontmatter } from '../lib/markdown'
import type { Note } from '@shared/types/Note'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface EditorState {
  note: Note | null
  /** Body only — frontmatter stripped. This is what TipTap sees. */
  markdown: string
  frontmatter: Frontmatter
  isDirty: boolean
  saveStatus: SaveStatus
  loadNote:       (id: string) => Promise<void>
  setMarkdown:    (md: string) => void
  setFrontmatter: (fm: Frontmatter) => void
  save:           () => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  note: null,
  markdown: '',
  frontmatter: {},
  isDirty: false,
  saveStatus: 'idle',

  loadNote: async (id) => {
    const { note, markdown: raw } = await ipc.notes.read(id)
    const { frontmatter, body } = parseFrontmatter(raw)
    set({ note, markdown: body, frontmatter, isDirty: false, saveStatus: 'idle' })
  },

  setMarkdown: (md) => set({ markdown: md, isDirty: true }),

  setFrontmatter: (fm) => set({ frontmatter: fm, isDirty: true }),

  save: async () => {
    const { note, markdown, frontmatter } = get()
    if (!note) return
    set({ saveStatus: 'saving' })
    try {
      const full = serializeFrontmatter(frontmatter, markdown)
      const updated = await ipc.notes.save(note.id, full)
      set({ note: updated, isDirty: false, saveStatus: 'saved' })
      setTimeout(() => set(s => s.saveStatus === 'saved' ? { saveStatus: 'idle' } : s), 1500)
    } catch {
      set({ saveStatus: 'error' })
    }
  },
}))
```

- [ ] **Step 6: Run all tests — all should pass**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 7: Build — confirm no TypeScript errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 8: Commit**

```bash
git add src/renderer/lib/markdown.ts \
        src/renderer/stores/editorStore.ts \
        tests/renderer/lib/frontmatter.test.ts
git commit -m "feat: YAML frontmatter parse/serialize, editorStore frontmatter field, extractHeadings"
```

---

### Task 4: Right sidebar tabs + Outline panel

**Files:**
- Create: `src/renderer/stores/rightPanelStore.ts`
- Create: `src/renderer/components/layout/OutlinePanel.tsx`
- Create: `src/renderer/components/layout/OutlinePanel.module.css`
- Modify: `src/renderer/components/editor/NoteEditor.tsx`
- Modify: `src/renderer/components/layout/RightSidebar.tsx`
- Modify: `src/renderer/components/layout/RightSidebar.module.css`
- Test: `tests/renderer/lib/outline.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/renderer/lib/outline.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { extractHeadings } from '../../../src/renderer/lib/markdown'

describe('extractHeadings', () => {
  it('returns empty array when there are no headings', () => {
    expect(extractHeadings('Just a paragraph.')).toEqual([])
  })

  it('extracts h1, h2, h3 with level, text, and sequential pos', () => {
    const md = '# Top\n## Middle\n### Bottom\nParagraph'
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: 'Top',    pos: 0 },
      { level: 2, text: 'Middle', pos: 1 },
      { level: 3, text: 'Bottom', pos: 2 },
    ])
  })

  it('skips headings inside fenced code blocks', () => {
    const md = '```\n# not a heading\n```\n# Real'
    const headings = extractHeadings(md)
    expect(headings).toHaveLength(1)
    expect(headings[0].text).toBe('Real')
  })

  it('trims trailing whitespace from heading text', () => {
    const { text } = extractHeadings('# Hello   ')[0]
    expect(text).toBe('Hello')
  })
})
```

- [ ] **Step 2: Run — confirm fail**

Run: `npx vitest run tests/renderer/lib/outline.test.ts`
Expected: FAIL — `extractHeadings is not a function` (it was added in Task 3, so if Task 3 is done this will PASS — skip to Step 4 if so)

- [ ] **Step 3: (Skip if Task 3 done) Add `extractHeadings` to `src/renderer/lib/markdown.ts`**

Only needed if Task 3 was not yet completed. `extractHeadings` is defined at the bottom of the appendix in Task 3. If already present, skip this step.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/renderer/lib/outline.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Create `src/renderer/stores/rightPanelStore.ts`**

```typescript
// src/renderer/stores/rightPanelStore.ts
import { create } from 'zustand'
import type { Heading } from '../lib/markdown'

export type RightTab = 'backlinks' | 'outline' | 'properties'

interface RightPanelState {
  activeTab: RightTab
  headings: Heading[]
  setTab:      (tab: RightTab) => void
  setHeadings: (headings: Heading[]) => void
}

export const useRightPanelStore = create<RightPanelState>(set => ({
  activeTab: 'backlinks',
  headings: [],
  setTab:      tab      => set({ activeTab: tab }),
  setHeadings: headings => set({ headings }),
}))
```

- [ ] **Step 6: Update `src/renderer/components/editor/NoteEditor.tsx` to emit headings**

Add two imports after the existing imports (after line 9):
```typescript
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { extractHeadings } from '../../lib/markdown'
```

Inside the `NoteEditor` function body, add this line after `const save = useEditorStore(s => s.save)` (after line 19):
```typescript
const setHeadings = useRightPanelStore(s => s.setHeadings)
```

In the `onUpdate` callback (currently lines 30–34), update it to also call `setHeadings`:
```typescript
onUpdate: ({ editor }) => {
  const md = editor.storage.markdown.getMarkdown() as string
  setMarkdown(md)
  setHeadings(extractHeadings(md))
  if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
  autosaveTimer.current = setTimeout(() => save(), AUTOSAVE_MS)
},
```

Also update the `useEffect` that reacts to `note?.id` changes (currently lines 51–55) to also refresh headings on note switch:
```typescript
useEffect(() => {
  if (!editor) return
  const current = editor.storage.markdown?.getMarkdown() as string | undefined
  if (current !== markdown) editor.commands.setContent(markdown)
  setHeadings(extractHeadings(markdown))
}, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 7: Create `src/renderer/components/layout/OutlinePanel.tsx`**

```tsx
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
```

- [ ] **Step 8: Create `src/renderer/components/layout/OutlinePanel.module.css`**

```css
/* src/renderer/components/layout/OutlinePanel.module.css */

.outline {
  display: flex;
  flex-direction: column;
  padding: 4px;
  overflow-y: auto;
  flex: 1;
}

.empty {
  padding: 16px 12px;
  font-size: 11px;
  color: rgba(255,255,255,0.2);
  font-style: italic;
}

.item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  font-family: inherit;
  transition: background 0.1s;
  min-width: 0;
}

.item:hover { background: rgba(255,255,255,0.05); }

.level {
  font-size: 9px;
  font-weight: 700;
  color: rgba(56,182,220,0.5);
  letter-spacing: 0.06em;
  flex-shrink: 0;
  width: 16px;
  text-align: right;
}

.text {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 9: Rewrite `src/renderer/components/layout/RightSidebar.tsx`**

Replace the entire file:

```tsx
// src/renderer/components/layout/RightSidebar.tsx
import React, { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { OutlinePanel } from './OutlinePanel'
import { ipc } from '../../lib/ipc'
import type { BacklinkResult } from '@shared/types/Note'
import styles from './RightSidebar.module.css'

const TABS: { id: 'backlinks' | 'outline' | 'properties'; label: string }[] = [
  { id: 'backlinks',  label: 'Links'   },
  { id: 'outline',    label: 'Outline' },
  { id: 'properties', label: 'Props'   },
]

export function RightSidebar(): JSX.Element {
  const note       = useEditorStore(s => s.note)
  const setOpenNote = useVaultStore(s => s.setOpenNote)
  const loadNote    = useEditorStore(s => s.loadNote)
  const activeTab   = useRightPanelStore(s => s.activeTab)
  const setTab      = useRightPanelStore(s => s.setTab)
  const [backlinks, setBacklinks] = useState<BacklinkResult[]>([])

  useEffect(() => {
    if (!note) { setBacklinks([]); return }
    ipc.notes.getBacklinks(note.id).then(setBacklinks).catch(() => setBacklinks([]))
  }, [note?.id])

  const open = (id: string): void => { setOpenNote(id); loadNote(id) }

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
                  <button key={i} className={styles.backlink} onClick={() => open(bl.sourceNoteId)}>
                    <div className={styles.blTitle}>{bl.sourceTitle}</div>
                    <div className={styles.blLink}>← [[{bl.linkText}]]</div>
                  </button>
                ))
            }
          </div>
        )}

        {activeTab === 'outline' && <OutlinePanel />}

        {activeTab === 'properties' && (
          <div className={styles.empty}>Properties panel — coming in next task</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 10: Replace `src/renderer/components/layout/RightSidebar.module.css`**

Replace the entire file:

```css
/* src/renderer/components/layout/RightSidebar.module.css */

.root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* ── Tab bar ── */

.tabs {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  padding: 0 2px;
}

.tab {
  flex: 1;
  padding: 8px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.25);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s;
}

.tab:hover { color: rgba(255,255,255,0.55); }

.tabActive {
  color: rgba(56,182,220,0.9);
  border-bottom-color: rgba(56,182,220,0.55);
}

/* ── Tab body ── */

.body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

/* ── Backlinks ── */

.list { flex: 1; overflow-y: auto; padding: 6px 8px; }
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.backlink {
  display: block; padding: 6px 8px; border-radius: 6px; margin: 2px 0;
  background: rgba(255,255,255,0.04); border: none;
  cursor: pointer; transition: background 0.1s;
  text-align: left; width: 100%;
}
.backlink:hover { background: rgba(56,182,220,0.1); }

.blTitle { font-size: 11px; color: rgba(255,255,255,0.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.blLink  { font-size: 10px; color: rgba(56,182,220,0.6); margin-top: 2px; }

.empty { padding: 16px 12px; font-size: 11px; color: rgba(255,255,255,0.2); font-style: italic; }
```

- [ ] **Step 11: Run all tests — all should pass**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 12: Build — confirm no TypeScript errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 13: Commit**

```bash
git add src/renderer/stores/rightPanelStore.ts \
        src/renderer/components/editor/NoteEditor.tsx \
        src/renderer/components/layout/OutlinePanel.tsx \
        src/renderer/components/layout/OutlinePanel.module.css \
        src/renderer/components/layout/RightSidebar.tsx \
        src/renderer/components/layout/RightSidebar.module.css \
        tests/renderer/lib/outline.test.ts
git commit -m "feat: right sidebar tabs (Links/Outline/Props) + outline panel"
```

---

### Task 5: Properties panel

**Files:**
- Create: `src/renderer/components/layout/PropertiesPanel.tsx`
- Create: `src/renderer/components/layout/PropertiesPanel.module.css`
- Modify: `src/renderer/components/layout/RightSidebar.tsx`

No new tests — frontmatter is fully covered in Task 3. This task is pure UI.

- [ ] **Step 1: Create `src/renderer/components/layout/PropertiesPanel.tsx`**

```tsx
// src/renderer/components/layout/PropertiesPanel.tsx
import React, { useState } from 'react'
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
  const [newKey, setNewKey] = useState('')

  if (!note) return <div className={styles.empty}>No note open</div>

  const update = (key: string, value: FrontmatterValue): void =>
    setFrontmatter({ ...frontmatter, [key]: value })

  const remove = (key: string): void => {
    const next = { ...frontmatter }
    delete next[key]
    setFrontmatter(next)
  }

  const addKey = (): void => {
    const k = newKey.trim()
    if (!k || k in frontmatter) return
    setFrontmatter({ ...frontmatter, [k]: '' })
    setNewKey('')
  }

  return (
    <div className={styles.panel}>
      {Object.entries(frontmatter).map(([key, value]) => (
        <div key={key} className={styles.row}>
          <span className={styles.key} title={key}>{key}</span>
          <input
            className={styles.value}
            defaultValue={displayValue(value)}
            onBlur={e => update(key, parseValue(e.currentTarget.value))}
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

- [ ] **Step 2: Create `src/renderer/components/layout/PropertiesPanel.module.css`**

```css
/* src/renderer/components/layout/PropertiesPanel.module.css */

.panel {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
}

.empty {
  padding: 16px 12px;
  font-size: 11px;
  color: rgba(255,255,255,0.2);
  font-style: italic;
}

.row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.key {
  font-size: 10px;
  color: rgba(56,182,220,0.65);
  font-weight: 600;
  letter-spacing: 0.03em;
  width: 58px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  flex: 1;
  font-size: 12px;
  color: rgba(255,255,255,0.7);
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 3px 6px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  min-width: 0;
}

.value:focus { border-color: rgba(56,182,220,0.35); }

.removeBtn {
  font-size: 14px;
  line-height: 1;
  padding: 2px 5px;
  color: rgba(255,255,255,0.2);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 3px;
  font-family: inherit;
  flex-shrink: 0;
  transition: color 0.1s, background 0.1s;
}

.removeBtn:hover { color: rgba(220,80,80,0.7); background: rgba(220,80,80,0.08); }

.addRow {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.newKeyInput {
  flex: 1;
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.04);
  border: 1px dashed rgba(255,255,255,0.1);
  border-radius: 4px;
  padding: 3px 6px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, border-style 0.15s;
}

.newKeyInput:focus { border-color: rgba(56,182,220,0.3); border-style: solid; }

.addBtn {
  padding: 3px 8px;
  font-size: 14px;
  color: rgba(56,182,220,0.7);
  background: rgba(56,182,220,0.08);
  border: 1px solid rgba(56,182,220,0.2);
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.1s;
}

.addBtn:hover { background: rgba(56,182,220,0.15); }
```

- [ ] **Step 3: Wire PropertiesPanel into RightSidebar**

In `src/renderer/components/layout/RightSidebar.tsx`, add the import after the `OutlinePanel` import:
```typescript
import { PropertiesPanel } from './PropertiesPanel'
```

Replace the properties tab placeholder:
```tsx
{/* Replace this: */}
{activeTab === 'properties' && (
  <div className={styles.empty}>Properties panel — coming in next task</div>
)}

{/* With this: */}
{activeTab === 'properties' && <PropertiesPanel />}
```

- [ ] **Step 4: Build — confirm no TypeScript errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/layout/PropertiesPanel.tsx \
        src/renderer/components/layout/PropertiesPanel.module.css \
        src/renderer/components/layout/RightSidebar.tsx
git commit -m "feat: properties panel — YAML frontmatter key-value editor in right sidebar"
```

---

### Task 6: Command palette (⌘K)

**Files:**
- Create: `src/renderer/stores/commandPaletteStore.ts`
- Create: `src/renderer/components/command/CommandPalette.tsx`
- Create: `src/renderer/components/command/CommandPalette.module.css`
- Modify: `src/renderer/components/layout/AppShell.tsx`
- Modify: `src/renderer/components/layout/MenuBar.tsx`

- [ ] **Step 1: Create `src/renderer/stores/commandPaletteStore.ts`**

```typescript
// src/renderer/stores/commandPaletteStore.ts
import { create } from 'zustand'

interface CommandPaletteState {
  isOpen: boolean
  open():  void
  close(): void
}

export const useCommandPaletteStore = create<CommandPaletteState>(set => ({
  isOpen: false,
  open:  () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
```

- [ ] **Step 2: Create the `src/renderer/components/command/` directory**

```bash
mkdir -p src/renderer/components/command
```

- [ ] **Step 3: Create `src/renderer/components/command/CommandPalette.tsx`**

```tsx
// src/renderer/components/command/CommandPalette.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '../../stores/editorStore'
import { ipc } from '../../lib/ipc'
import styles from './CommandPalette.module.css'

interface PaletteItem {
  id: string
  label: string
  description?: string
  action(): void
}

export function CommandPalette(): JSX.Element | null {
  const isOpen = useCommandPaletteStore(s => s.isOpen)
  const close  = useCommandPaletteStore(s => s.close)
  const notes  = useVaultStore(s => s.notes)
  const loadNotes   = useVaultStore(s => s.loadNotes)
  const setOpenNote = useVaultStore(s => s.setOpenNote)
  const loadNote    = useEditorStore(s => s.loadNote)

  const [query, setQuery]       = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  const q = query.toLowerCase()

  const noteItems: PaletteItem[] = notes
    .filter(n => !q || n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
    .slice(0, 20)
    .map(n => ({
      id: n.id,
      label: n.title,
      description: n.path,
      action: () => { setOpenNote(n.id); loadNote(n.id); close() },
    }))

  const actionItems: PaletteItem[] = !q
    ? [{
        id: '__new__',
        label: 'New Note',
        description: 'Create a blank note',
        action: async () => {
          const { note } = await ipc.notes.create('Untitled', '')
          await loadNotes()
          setOpenNote(note.id)
          loadNote(note.id)
          close()
        },
      }]
    : []

  const items: PaletteItem[] = [...actionItems, ...noteItems]

  const run = useCallback((item: PaletteItem) => item.action(), [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, items.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (items[selected]) run(items[selected]) }
    if (e.key === 'Escape')    { e.preventDefault(); close() }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onMouseDown={close}>
      <div className={styles.palette} onMouseDown={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Search notes or type a command…"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(0) }}
          onKeyDown={onKeyDown}
        />
        <div className={styles.list}>
          {items.length === 0
            ? <div className={styles.empty}>No results</div>
            : items.map((item, i) => (
                <button
                  key={item.id}
                  className={`${styles.item} ${i === selected ? styles.selected : ''}`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => run(item)}
                >
                  <span className={styles.label}>{item.label}</span>
                  {item.description && <span className={styles.desc}>{item.description}</span>}
                </button>
              ))
          }
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/renderer/components/command/CommandPalette.module.css`**

```css
/* src/renderer/components/command/CommandPalette.module.css */

.overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: fadeIn 0.1s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.palette {
  width: 560px;
  max-height: 420px;
  background: #0c1624;
  border: 1px solid rgba(56,182,220,0.2);
  border-radius: 10px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.7);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideIn 0.15s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes slideIn {
  from { opacity: 0; transform: scale(0.96) translateY(-8px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
}

.input {
  width: 100%;
  padding: 14px 16px;
  font-size: 15px;
  color: rgba(255,255,255,0.85);
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  outline: none;
  font-family: inherit;
}

.input::placeholder { color: rgba(255,255,255,0.25); }

.list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.empty {
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: rgba(255,255,255,0.2);
}

.item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.1s;
}

.item.selected,
.item:hover { background: rgba(56,182,220,0.1); }

.label {
  font-size: 13px;
  color: rgba(255,255,255,0.8);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desc {
  font-size: 11px;
  color: rgba(255,255,255,0.25);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  max-width: 200px;
}
```

- [ ] **Step 5: Add ⌘K handler to `src/renderer/components/layout/AppShell.tsx`**

The current AppShell imports are at the top of the file. Add two new imports after the existing imports:

```typescript
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
import { CommandPalette } from '../command/CommandPalette'
```

In the component body, add `openPalette` alongside `openSearch` (after line 15):
```typescript
const openPalette = useCommandPaletteStore(s => s.open)
```

Update the `handleKeyDown` callback (currently handles only `f`) to also handle `k`:
```typescript
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); openSearch()  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openPalette() }
}, [openSearch, openPalette])
```

Add `<CommandPalette />` inside the root div, after the closing `</div>` of the `.body` div:

```tsx
return (
  <div className={styles.root}>
    <div className={styles.titlebar}>...</div>
    <MenuBar />
    <div className={styles.body}>...</div>
    <CommandPalette />
  </div>
)
```

- [ ] **Step 6: Add "Command Palette" to MenuBar File menu**

In `src/renderer/components/layout/MenuBar.tsx`, import `useCommandPaletteStore` at the top of the file:

```typescript
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
```

In the component body, add after `openSearch`:
```typescript
const openPalette = useCommandPaletteStore(s => s.open)
```

In the `menus` array, update the File menu items to add Command Palette before the separator:

```typescript
{
  label: 'File',
  items: [
    { label: 'New Note', shortcut: 'Ctrl+N', action: () => window.dispatchEvent(new CustomEvent('owl:new-note')) },
    { label: 'Command Palette', shortcut: 'Ctrl+K', action: () => { openPalette(); setOpenMenu(null) } },
    { separator: true },
    { label: 'Quit', action: () => window.close() },
  ],
},
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 8: Build — confirm no TypeScript errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 9: Commit**

```bash
git add src/renderer/stores/commandPaletteStore.ts \
        src/renderer/components/command/CommandPalette.tsx \
        src/renderer/components/command/CommandPalette.module.css \
        src/renderer/components/layout/AppShell.tsx \
        src/renderer/components/layout/MenuBar.tsx
git commit -m "feat: command palette (⌘K) — fuzzy note search + new note action"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Callout blocks (Task 1)
- ✅ Slash commands (Task 2)
- ✅ Note metadata YAML (Task 3)
- ✅ Outline sidebar (Task 4)
- ✅ Properties panel (Task 5)
- ✅ Command palette ⌘K (Task 6)
- Tabs/split panes → Plan 2B
- Drag-and-drop hierarchy → Plan 2B
- Templates → Plan 2C
- Daily notes → Plan 2C
- Tags + saved searches → Plan 2C
- Graph view → Plan 2D

**Placeholder scan:** No TBDs. All steps contain exact code.

**Type consistency:**
- `CalloutType` defined in `Callout.ts` Task 1; referenced in `SlashCommand.ts` Task 2 ✅
- `Frontmatter`, `FrontmatterValue` defined in `markdown.ts` Task 3; used in `editorStore.ts` Task 3 and `PropertiesPanel.tsx` Task 5 ✅
- `Heading` defined in `markdown.ts` Task 3; used in `rightPanelStore.ts` Task 4 ✅
- `RightTab` defined in `rightPanelStore.ts` Task 4; `RightSidebar.tsx` Task 4 uses its string literals directly ✅
- `setFrontmatter` added in `editorStore.ts` Task 3; called from `PropertiesPanel.tsx` Task 5 ✅
- `PropertiesPanel` imported in `RightSidebar.tsx` Task 5 Step 3; component created in Task 5 Step 1 ✅
- Task 4 RightSidebar renders a placeholder for properties tab — replaced in Task 5 Step 3 ✅
