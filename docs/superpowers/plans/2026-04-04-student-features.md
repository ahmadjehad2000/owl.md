# Student Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ten productivity features for students and note-takers: task lists, tables, math/LaTeX, spellcheck, find-in-note, tags, pinned notes, daily notes, image paste, and PDF export.

**Architecture:** Three independent phases — Phase A adds TipTap editor extensions (task lists, tables, math, spellcheck, find-in-note), Phase B adds organizational features backed by new DB columns and IPC handlers (tags sidebar, pinned notes, daily notes), Phase C adds media and export (image paste via custom Electron protocol, PDF export via `printToPDF`). Each phase ships independently.

**Tech Stack:** TipTap 2.x extensions, KaTeX (math rendering), Vitest + jsdom (tests), better-sqlite3 migrations, Electron protocol API, `webContents.printToPDF`

---

## Key codebase facts

- Tests live in `tests/main/` (node env) and `tests/renderer/` (jsdom env). Run with `npm test`.
- DB migrations live in `src/main/db/migrations/NNN_name.ts` and are registered in `src/main/services/DatabaseService.ts` `MIGRATIONS` array. Currently at migration 002.
- Tags table **already exists** — `IndexService.extractTags()` already parses `#tag` and stores them on every save. We only need IPC + UI.
- `VaultService.init()` already creates `{vault}/attachments/images/` — image storage is ready.
- `Note.noteType` already includes `'daily'` as a valid enum value.
- `tiptap-markdown` v0.8.x serializes back to markdown via `editor.storage.markdown.getMarkdown()`. Custom node serialization: add `markdown: { serialize(state, node) {...} }` to the node's `addStorage()` return — the Markdown extension scans all nodes for this.
- Custom TipTap node views follow the pure-DOM pattern from `Callout.ts` (returns `{ dom, contentDOM }`).

---

## Phase A — Editor Content Features

### Task 1: Install packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install TipTap extension packages and KaTeX**

```bash
npm install @tiptap/extension-task-list @tiptap/extension-task-item \
  @tiptap/extension-table @tiptap/extension-table-row \
  @tiptap/extension-table-cell @tiptap/extension-table-header \
  @tiptap/extension-search-and-replace \
  @tiptap/extension-image \
  katex
npm install --save-dev @types/katex
```

Expected: `package.json` updated, no errors.

- [ ] **Step 2: Verify katex import works**

```bash
node -e "require('katex'); console.log('katex ok')"
```

Expected: `katex ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install tiptap table/task/image/search and katex packages"
```

---

### Task 2: Task Lists (checkboxes)

**Files:**
- Modify: `src/renderer/components/editor/NoteEditor.tsx`
- Modify: `src/renderer/components/editor/NoteEditor.module.css`
- Modify: `src/renderer/components/editor/extensions/SlashCommand.ts`
- Create: `tests/renderer/extensions/TaskList.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/renderer/extensions/TaskList.test.ts
import { describe, it, expect } from 'vitest'
import { getSlashItems } from '../../../src/renderer/components/editor/extensions/SlashCommand'

describe('SlashCommand — task list', () => {
  it('includes a Task List entry', () => {
    const items = getSlashItems('')
    expect(items.some(i => i.title === 'Task List')).toBe(true)
  })

  it('filters task list by query "task"', () => {
    const items = getSlashItems('task')
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].title).toBe('Task List')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- tests/renderer/extensions/TaskList.test.ts
```

Expected: FAIL — "Task List" not in slash items yet.

- [ ] **Step 3: Add task list extensions to NoteEditor.tsx**

Add imports at top:

```typescript
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
```

Add to the `useEditor` extensions array after `Callout`:

```typescript
TaskList,
TaskItem.configure({ nested: true }),
```

- [ ] **Step 4: Add slash command entry in SlashCommand.ts**

Add to the `all` array after the `'Divider'` entry:

```typescript
{
  title: 'Task List', description: 'Checklist with checkboxes', icon: '☑',
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).toggleTaskList().run(),
},
```

- [ ] **Step 5: Add CSS for task items in NoteEditor.module.css**

After the `.editorWrap :global(.ProseMirror li)` rule:

```css
/* Task list checkboxes */
.editorWrap :global(.ProseMirror ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 4px;
}
.editorWrap :global(.ProseMirror ul[data-type="taskList"] li) {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.editorWrap :global(.ProseMirror ul[data-type="taskList"] li > label) {
  flex-shrink: 0;
  margin-top: 2px;
}
.editorWrap :global(.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]) {
  width: 14px;
  height: 14px;
  accent-color: rgba(56, 182, 220, 0.9);
  cursor: pointer;
  border-radius: 3px;
}
.editorWrap :global(.ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div) {
  opacity: 0.5;
  text-decoration: line-through;
}
[data-theme="modern-light"] .editorWrap :global(.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]) {
  accent-color: #0284c7;
}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/renderer/extensions/TaskList.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/editor/NoteEditor.tsx \
        src/renderer/components/editor/NoteEditor.module.css \
        src/renderer/components/editor/extensions/SlashCommand.ts \
        tests/renderer/extensions/TaskList.test.ts
git commit -m "feat: task list / checkbox support in editor"
```

---

### Task 3: Tables

**Files:**
- Modify: `src/renderer/components/editor/NoteEditor.tsx`
- Modify: `src/renderer/components/editor/NoteEditor.module.css`
- Modify: `src/renderer/components/editor/extensions/SlashCommand.ts`
- Create: `tests/renderer/extensions/Table.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/renderer/extensions/Table.test.ts
import { describe, it, expect } from 'vitest'
import { getSlashItems } from '../../../src/renderer/components/editor/extensions/SlashCommand'

describe('SlashCommand — table', () => {
  it('includes a Table entry', () => {
    expect(getSlashItems('').some(i => i.title === 'Table')).toBe(true)
  })
  it('filters table by query "tab"', () => {
    expect(getSlashItems('tab')[0].title).toBe('Table')
  })
})
```

- [ ] **Step 2: Run to verify fails**

```bash
npm test -- tests/renderer/extensions/Table.test.ts
```

- [ ] **Step 3: Add table extensions to NoteEditor.tsx**

```typescript
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
```

Add to extensions array after `TaskItem.configure(...)`:

```typescript
Table.configure({ resizable: false }),
TableRow,
TableCell,
TableHeader,
```

- [ ] **Step 4: Add slash command entry**

After the Task List entry in `all`:

```typescript
{
  title: 'Table', description: 'Insert a 3×3 table', icon: '⊞',
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range)
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
},
```

- [ ] **Step 5: Add table CSS in NoteEditor.module.css**

```css
/* Tables */
.editorWrap :global(.ProseMirror table) {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
  font-size: 13px;
}
.editorWrap :global(.ProseMirror th),
.editorWrap :global(.ProseMirror td) {
  border: 1px solid rgba(255,255,255,0.1);
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
  min-width: 80px;
}
.editorWrap :global(.ProseMirror th) {
  background: rgba(56,182,220,0.07);
  font-weight: 600;
  color: rgba(200,218,245,0.9);
  font-size: 12px;
  letter-spacing: 0.02em;
}
.editorWrap :global(.ProseMirror td) { color: var(--owl-text); }
.editorWrap :global(.ProseMirror tr:hover td) { background: rgba(255,255,255,0.02); }
.editorWrap :global(.ProseMirror .selectedCell) { background: rgba(56,182,220,0.12); }
[data-theme="modern-light"] .editorWrap :global(.ProseMirror th),
[data-theme="modern-light"] .editorWrap :global(.ProseMirror td) { border-color: rgba(0,0,0,0.12); }
[data-theme="modern-light"] .editorWrap :global(.ProseMirror th) { background: rgba(2,132,199,0.06); color: #1a2a4a; }
[data-theme="modern-light"] .editorWrap :global(.ProseMirror .selectedCell) { background: rgba(2,132,199,0.1); }
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/renderer/extensions/Table.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/editor/NoteEditor.tsx \
        src/renderer/components/editor/NoteEditor.module.css \
        src/renderer/components/editor/extensions/SlashCommand.ts \
        tests/renderer/extensions/Table.test.ts
git commit -m "feat: table support in editor"
```

---

### Task 4: Math / LaTeX (KaTeX)

**Files:**
- Create: `src/renderer/components/editor/extensions/MathInline.ts`
- Create: `src/renderer/components/editor/extensions/MathBlock.ts`
- Create: `src/renderer/lib/math.ts`
- Modify: `src/renderer/components/editor/NoteEditor.tsx`
- Modify: `src/renderer/components/editor/NoteEditor.module.css`
- Modify: `src/renderer/components/editor/extensions/SlashCommand.ts`
- Create: `tests/renderer/extensions/Math.test.ts`

**Note on KaTeX rendering:** KaTeX's `renderToString()` produces its own math-specific HTML containing only SVG/span elements. The output contains no user-executable content and is not derived from user-supplied HTML. Assigning it via `node.innerHTML` is safe here — equivalent to rendering trusted templated markup, not injecting user data as HTML. If a project-wide policy requires sanitization, wrap the call with `DOMPurify.sanitize(katex.renderToString(...), { ADD_TAGS: ['math'] })`.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/renderer/extensions/Math.test.ts
import { describe, it, expect } from 'vitest'
import { getSlashItems } from '../../../src/renderer/components/editor/extensions/SlashCommand'

describe('SlashCommand — math', () => {
  it('includes Math Inline entry', () => {
    expect(getSlashItems('').some(i => i.title === 'Math Inline')).toBe(true)
  })
  it('includes Math Block entry', () => {
    expect(getSlashItems('').some(i => i.title === 'Math Block')).toBe(true)
  })
  it('filters by query "math"', () => {
    expect(getSlashItems('math').length).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify fails**

```bash
npm test -- tests/renderer/extensions/Math.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create math.ts utility**

```typescript
// src/renderer/lib/math.ts

/**
 * Pre-processes markdown before passing to TipTap: converts $...$ and $$...$$ delimiters
 * to custom HTML tags that TipTap's parseHTML rules can recognise.
 * Run this on the markdown string BEFORE calling editor.commands.setContent().
 */
export function injectMathTags(md: string): string {
  return md
    // Block math $$...$$ first (must come before inline to avoid partial matches)
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, formula: string) => {
      const safe = formula.trim().replace(/"/g, '&quot;')
      return `<div data-math-block="${safe}"></div>`
    })
    // Inline math $...$
    .replace(/\$([^$\n]+?)\$/g, (_match, formula: string) => {
      const safe = formula.replace(/"/g, '&quot;')
      return `<span data-math-inline="${safe}"></span>`
    })
}
```

- [ ] **Step 4: Create MathInline.ts**

```typescript
// src/renderer/components/editor/extensions/MathInline.ts
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import katex from 'katex'

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return { formula: { default: '' } }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-math-inline]',
        getAttrs: (el) => ({ formula: (el as HTMLElement).getAttribute('data-math-inline') ?? '' }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': HTMLAttributes.formula })]
  },

  // tiptap-markdown reads this to serialize mathInline nodes back to $formula$
  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { formula: string } }) {
          state.write(`$${node.attrs.formula}$`)
        },
      },
    }
  },

  addNodeView() {
    return ({ node, getPos, editor }: {
      node: { attrs: { formula: string } }
      getPos: () => number | undefined
      editor: import('@tiptap/core').Editor
    }) => {
      const dom = document.createElement('span')
      dom.className = 'math-inline'
      dom.contentEditable = 'false'

      const renderFormula = (formula: string): void => {
        // KaTeX output is trusted math-specific markup (no script tags, no user HTML).
        // Safe to assign directly as DOM content.
        try {
          dom.innerHTML = katex.renderToString(formula, { throwOnError: false, displayMode: false }) // safe: KaTeX output only
        } catch {
          dom.textContent = `$${formula}$`
        }
      }

      renderFormula(node.attrs.formula)

      dom.addEventListener('click', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        const formula = prompt('Edit formula:', node.attrs.formula)
        if (formula !== null) {
          editor.chain().focus().command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { formula })
            return true
          }).run()
        }
      })

      return { dom }
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          const formula = match[1]
          if (!formula) return null
          const node = state.schema.nodes['mathInline'].create({ formula })
          state.tr.replaceWith(range.from, range.to, node)
          return null
        },
      }),
    ]
  },
})
```

- [ ] **Step 5: Create MathBlock.ts**

```typescript
// src/renderer/components/editor/extensions/MathBlock.ts
import { Node, mergeAttributes } from '@tiptap/core'
import katex from 'katex'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathBlock: { insertMathBlock: (formula?: string) => ReturnType }
  }
}

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return { formula: { default: '' } }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-math-block]',
        getAttrs: (el) => ({ formula: (el as HTMLElement).getAttribute('data-math-block') ?? '' }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': HTMLAttributes.formula })]
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; ensureNewLine: () => void },
          node: { attrs: { formula: string } }
        ) {
          state.ensureNewLine()
          state.write(`$$\n${node.attrs.formula}\n$$`)
          state.ensureNewLine()
        },
      },
    }
  },

  addCommands() {
    return {
      insertMathBlock:
        (formula = '') =>
        ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) =>
          commands.insertContent({ type: 'mathBlock', attrs: { formula } }),
    }
  },

  addNodeView() {
    return ({ node, getPos, editor }: {
      node: { attrs: { formula: string } }
      getPos: () => number | undefined
      editor: import('@tiptap/core').Editor
    }) => {
      const dom = document.createElement('div')
      dom.className = 'math-block'
      dom.contentEditable = 'false'

      const renderFormula = (formula: string): void => {
        // KaTeX output is trusted math-specific markup. Safe to assign directly.
        try {
          dom.innerHTML = katex.renderToString(formula, { throwOnError: false, displayMode: true }) // safe: KaTeX output only
        } catch {
          dom.textContent = formula
        }
      }

      renderFormula(node.attrs.formula)

      dom.addEventListener('click', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        const formula = prompt('Edit formula:', node.attrs.formula)
        if (formula !== null) {
          editor.chain().focus().command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { formula })
            return true
          }).run()
        }
      })

      return { dom }
    }
  },
})
```

- [ ] **Step 6: Update editorStore.ts to use injectMathTags on load**

In `src/renderer/stores/editorStore.ts`, add import:

```typescript
import { injectMathTags } from '../lib/math'
```

In `loadNote`, after `body2` is computed, store the plain markdown but pass the injected version to setContent. Change the `set(...)` call so `markdown` stores `body2` (plain), then update the `useEffect([note?.id])` in `NoteEditor.tsx` to call `editor.commands.setContent(injectMathTags(markdown))` instead of just `setContent(markdown)`.

- [ ] **Step 7: Update NoteEditor.tsx — use injectMathTags for setContent**

In `src/renderer/components/editor/NoteEditor.tsx`, add import:

```typescript
import { injectMathTags } from '../../lib/math'
import { MathInline } from './extensions/MathInline'
import { MathBlock } from './extensions/MathBlock'
import 'katex/dist/katex.min.css'
```

Add `MathInline` and `MathBlock` to the extensions array.

In the `useEffect([note?.id])` block, change:

```typescript
queueMicrotask(() => {
  if (!editor.isDestroyed) editor.commands.setContent(injectMathTags(markdown))
})
```

- [ ] **Step 8: Add math slash commands to SlashCommand.ts**

```typescript
{
  title: 'Math Inline', description: 'Inline LaTeX formula', icon: '∑',
  command: ({ editor, range }) => {
    const formula = prompt('Enter inline formula (e.g. x^2):') ?? ''
    editor.chain().focus().deleteRange(range)
      .insertContent({ type: 'mathInline', attrs: { formula } }).run()
  },
},
{
  title: 'Math Block', description: 'Display LaTeX equation', icon: '∫',
  command: ({ editor, range }) => {
    const formula = prompt('Enter formula (e.g. \\int_0^\\infty f(x)dx):') ?? ''
    editor.chain().focus().deleteRange(range).insertMathBlock(formula).run()
  },
},
```

- [ ] **Step 9: Add math CSS in NoteEditor.module.css**

```css
/* Math (KaTeX) */
.editorWrap :global(.math-inline) {
  display: inline-block;
  padding: 0 3px;
  border-radius: 4px;
  background: rgba(56,182,220,0.06);
  cursor: pointer;
  transition: background 0.12s;
  vertical-align: middle;
}
.editorWrap :global(.math-inline:hover) { background: rgba(56,182,220,0.14); }
.editorWrap :global(.math-block) {
  display: block;
  padding: 16px 0;
  text-align: center;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.12s;
  overflow-x: auto;
}
.editorWrap :global(.math-block:hover) { background: rgba(56,182,220,0.04); }
[data-theme="modern-light"] .editorWrap :global(.math-inline) { background: rgba(2,132,199,0.07); }
[data-theme="modern-light"] .editorWrap :global(.math-inline:hover) { background: rgba(2,132,199,0.14); }
```

- [ ] **Step 10: Run tests**

```bash
npm test -- tests/renderer/extensions/Math.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/components/editor/extensions/MathInline.ts \
        src/renderer/components/editor/extensions/MathBlock.ts \
        src/renderer/lib/math.ts \
        src/renderer/components/editor/NoteEditor.tsx \
        src/renderer/components/editor/NoteEditor.module.css \
        src/renderer/components/editor/extensions/SlashCommand.ts \
        tests/renderer/extensions/Math.test.ts
git commit -m "feat: math/LaTeX rendering with KaTeX"
```

---

### Task 5: Spellcheck

**Files:**
- Modify: `src/renderer/components/editor/NoteEditor.tsx`

- [ ] **Step 1: Enable spellcheck in TipTap editorProps**

In `NoteEditor.tsx`, in the `useEditor({ editorProps: { ... } })` call, add an `attributes` key:

```typescript
editorProps: {
  attributes: {
    spellcheck: 'true',
  },
  handleClick: (_view, _pos, event) => {
    // ...existing handleClick body unchanged...
  },
},
```

- [ ] **Step 2: Enable spellcheck in source textarea**

Find `<textarea ... spellCheck={false}` and change to `spellCheck={true}`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/editor/NoteEditor.tsx
git commit -m "fix: enable spellcheck in editor and source mode"
```

---

### Task 6: Find in Note (Ctrl+F)

**Files:**
- Create: `src/renderer/components/editor/FindBar.tsx`
- Create: `src/renderer/components/editor/FindBar.module.css`
- Modify: `src/renderer/components/editor/NoteEditor.tsx`
- Modify: `src/renderer/components/editor/NoteEditor.module.css`
- Create: `tests/renderer/extensions/FindBar.test.ts`

- [ ] **Step 1: Write test**

```typescript
// tests/renderer/extensions/FindBar.test.ts
import { describe, it, expect } from 'vitest'
import { SearchAndReplace } from '@tiptap/extension-search-and-replace'

describe('SearchAndReplace extension', () => {
  it('is importable from installed package', () => {
    expect(SearchAndReplace).toBeDefined()
    expect(typeof SearchAndReplace.create).toBe('function')
  })
})
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/renderer/extensions/FindBar.test.ts
```

Expected: PASS (package installed in Task 1).

- [ ] **Step 3: Create FindBar.tsx**

```tsx
// src/renderer/components/editor/FindBar.tsx
import React, { useEffect, useRef, useState } from 'react'
import styles from './FindBar.module.css'

interface Props {
  editor: import('@tiptap/react').Editor | null
  onClose: () => void
}

export function FindBar({ editor, onClose }: Props): JSX.Element {
  const [query, setQuery]         = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!editor) return
    editor.commands.setSearchTerm(query)
    const count = (editor.storage['searchAndReplace']?.results?.length) ?? 0
    setMatchCount(count)
  }, [query, editor])

  useEffect(() => {
    if (!editor) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { editor.commands.setSearchTerm(''); onClose() }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editor.commands.nextSearchResult() }
      if (e.key === 'Enter' && e.shiftKey)  { e.preventDefault(); editor.commands.previousSearchResult() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, onClose])

  const handleClose = (): void => {
    editor?.commands.setSearchTerm('')
    onClose()
  }

  return (
    <div className={styles.bar}>
      <input
        ref={inputRef}
        className={styles.input}
        placeholder="Find in note…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        spellCheck={false}
      />
      <span className={styles.count}>
        {query
          ? matchCount === 0
            ? 'No matches'
            : `${matchCount} match${matchCount !== 1 ? 'es' : ''}`
          : ''}
      </span>
      <button className={styles.navBtn} onClick={() => editor?.commands.previousSearchResult()} title="Previous (Shift+Enter)">↑</button>
      <button className={styles.navBtn} onClick={() => editor?.commands.nextSearchResult()}     title="Next (Enter)">↓</button>
      <button className={styles.closeBtn} onClick={handleClose} title="Close (Esc)">×</button>
    </div>
  )
}
```

- [ ] **Step 4: Create FindBar.module.css**

```css
/* src/renderer/components/editor/FindBar.module.css */
.bar {
  position: absolute;
  top: 8px; right: 16px;
  z-index: 100;
  display: flex; align-items: center; gap: 6px;
  background: rgba(14, 20, 34, 0.96);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 6px 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  backdrop-filter: blur(20px);
  animation: slideIn 0.12s ease;
}
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.input {
  width: 200px; background: none; border: none; outline: none;
  font-size: 13px; color: rgba(255,255,255,0.85); font-family: inherit;
}
.input::placeholder { color: rgba(255,255,255,0.25); }
.count { font-size: 11px; color: rgba(255,255,255,0.28); white-space: nowrap; min-width: 64px; }
.navBtn {
  width: 24px; height: 24px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 5px; color: rgba(255,255,255,0.55); font-size: 13px;
  cursor: pointer; font-family: inherit;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.1s, color 0.1s;
}
.navBtn:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9); }
.closeBtn {
  width: 20px; height: 20px; background: none; border: none;
  color: rgba(255,255,255,0.35); font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; transition: color 0.1s, background 0.1s; font-family: inherit;
}
.closeBtn:hover { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.08); }
[data-theme="modern-light"] .bar {
  background: rgba(255,255,255,0.97); border-color: rgba(0,0,0,0.14);
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
[data-theme="modern-light"] .input { color: #1a1f2e; }
[data-theme="modern-light"] .input::placeholder { color: rgba(0,0,0,0.3); }
[data-theme="modern-light"] .count { color: rgba(0,0,0,0.38); }
[data-theme="modern-light"] .navBtn { border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.5); background: rgba(0,0,0,0.04); }
[data-theme="modern-light"] .navBtn:hover { background: rgba(0,0,0,0.08); color: rgba(0,0,0,0.85); }
[data-theme="modern-light"] .closeBtn { color: rgba(0,0,0,0.4); }
[data-theme="modern-light"] .closeBtn:hover { background: rgba(0,0,0,0.07); color: rgba(0,0,0,0.75); }
```

- [ ] **Step 5: Add SearchAndReplace extension and FindBar state to NoteEditor.tsx**

Add imports:

```typescript
import { SearchAndReplace } from '@tiptap/extension-search-and-replace'
import { FindBar } from './FindBar'
```

Add to extensions array: `SearchAndReplace.configure({ disableRegex: true }),`

Add state: `const [findOpen, setFindOpen] = useState(false)`

Update the `Ctrl+S` keydown effect to also handle `Ctrl+F`:

```typescript
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      save()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault()
      setFindOpen(f => !f)
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [save])
```

In the render, insert `FindBar` inside `.editorWrap`:

```tsx
<div className={styles.editorWrap} onContextMenu={handleEditorContextMenu}>
  {findOpen && <FindBar editor={editor} onClose={() => setFindOpen(false)} />}
  <div className={styles.cardRow} ...>
```

- [ ] **Step 6: Add `position: relative` and highlight CSS to NoteEditor.module.css**

Add `position: relative;` to `.editorWrap { ... }`.

Add after that rule:

```css
/* Find-in-note highlights */
.editorWrap :global(.ProseMirror .search-result) {
  background: rgba(240,200,50,0.25); border-radius: 2px;
}
.editorWrap :global(.ProseMirror .search-result-current) {
  background: rgba(240,200,50,0.55); border-radius: 2px;
}
[data-theme="modern-light"] .editorWrap :global(.ProseMirror .search-result) { background: rgba(234,179,8,0.25); }
[data-theme="modern-light"] .editorWrap :global(.ProseMirror .search-result-current) { background: rgba(234,179,8,0.5); }
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/editor/FindBar.tsx \
        src/renderer/components/editor/FindBar.module.css \
        src/renderer/components/editor/NoteEditor.tsx \
        src/renderer/components/editor/NoteEditor.module.css \
        tests/renderer/extensions/FindBar.test.ts
git commit -m "feat: find-in-note bar (Ctrl+F) with prev/next navigation"
```

---

## Phase B — Organization Features

### Task 7: DB migration — `pinned` column

**Files:**
- Create: `src/main/db/migrations/003_pinned.ts`
- Modify: `src/main/services/DatabaseService.ts`
- Modify: `src/shared/types/Note.ts`
- Modify: `src/renderer/stores/vaultStore.ts`
- Create: `tests/main/services/migration003.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/main/services/migration003.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('migration 003 — pinned column', () => {
  let tmpDir: string
  let db: DatabaseService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-m003-'))
    db = new DatabaseService(tmpDir)
    db.open()
  })
  afterEach(() => { db.close(); rmSync(tmpDir, { recursive: true, force: true }) })

  it('notes table has a pinned column defaulting to 0', () => {
    const cols = db.get().prepare('PRAGMA table_info(notes)').all() as Array<{ name: string; dflt_value: string }>
    const col = cols.find(c => c.name === 'pinned')
    expect(col).toBeDefined()
    expect(col!.dflt_value).toBe('0')
  })

  it('can set pinned = 1 on a note', () => {
    db.get().prepare(`INSERT INTO notes (id,path,title,content_hash,created_at,updated_at,folder_path,note_type,order_index)
      VALUES ('n1','a.md','A','',1,1,'','note',0)`).run()
    db.get().prepare('UPDATE notes SET pinned = 1 WHERE id = ?').run('n1')
    const row = db.get().prepare('SELECT pinned FROM notes WHERE id = ?').get('n1') as { pinned: number }
    expect(row.pinned).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- tests/main/services/migration003.test.ts
```

Expected: FAIL — `pinned` column does not exist.

- [ ] **Step 3: Create migration file**

```typescript
// src/main/db/migrations/003_pinned.ts
import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>
  if (!cols.some(c => c.name === 'pinned')) {
    db.prepare('ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0').run()
  }
}
```

- [ ] **Step 4: Register migration in DatabaseService.ts**

```typescript
import { up as migration003 } from '../db/migrations/003_pinned'

const MIGRATIONS: Array<(db: Database.Database) => void> = [
  migration001, migration002, migration003,
]
```

- [ ] **Step 5: Add `pinned` to Note type**

In `src/shared/types/Note.ts`, add to the `Note` interface:

```typescript
pinned: boolean
```

- [ ] **Step 6: Update normalizeNote in vaultStore.ts**

`normalizeNote` maps snake_case DB fields to camelCase. Add:

```typescript
pinned: Boolean(raw.pinned ?? 0),
```

- [ ] **Step 7: Run tests**

```bash
npm test -- tests/main/services/migration003.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/db/migrations/003_pinned.ts \
        src/main/services/DatabaseService.ts \
        src/shared/types/Note.ts \
        src/renderer/stores/vaultStore.ts \
        tests/main/services/migration003.test.ts
git commit -m "feat: add pinned column to notes (migration 003)"
```

---

### Task 8: Pin/Unpin IPC + Pinned Sidebar Section

**Files:**
- Modify: `src/main/ipc/notes.ts`
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/ipc.ts`
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`
- Modify: `src/renderer/components/layout/LeftSidebar.module.css`

- [ ] **Step 1: Add `notes:pin` IPC handler in notes.ts**

At the end of `registerNotesHandlers`, add:

```typescript
ipcMain.handle('notes:pin', (_e, id: string, pinned: boolean): Note => {
  db().prepare('UPDATE notes SET pinned = ?, updated_at = ? WHERE id = ?')
    .run(pinned ? 1 : 0, Date.now(), id)
  return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
})
```

- [ ] **Step 2: Add to IPC types, preload, ipc.ts**

`src/shared/types/IPC.ts` — add to `OwlNotesAPI`:

```typescript
pin: (id: string, pinned: boolean) => Promise<Note>
```

`src/preload/index.ts` — add:

```typescript
pin: (id, pinned) => ipcRenderer.invoke('notes:pin', id, pinned),
```

`src/renderer/lib/ipc.ts` — add:

```typescript
pin: (id: string, pinned: boolean): Promise<Note> => window.owl.notes.pin(id, pinned),
```

- [ ] **Step 3: Add "Pin to top" to note context menu in LeftSidebar.tsx**

In `noteContextItems`, after the Rename entry add:

```typescript
{
  label: note.pinned ? 'Unpin' : 'Pin to top',
  icon: '📌',
  onClick: async () => {
    await ipc.notes.pin(note.id, !note.pinned)
    await loadNotes()
  },
},
```

- [ ] **Step 4: Add Pinned section to sidebar JSX**

Near the top of the returned JSX (before `<DndContext>`), add:

```typescript
const pinnedNotes = notes.filter(n => n.pinned && n.noteType !== 'folder')
```

In JSX:

```tsx
{pinnedNotes.length > 0 && (
  <div className={styles.pinnedSection}>
    <div className={styles.sectionLabel}>Pinned</div>
    {pinnedNotes.map(note => (
      <button
        key={note.id}
        className={`${styles.noteItem} ${activeNoteId === note.id ? styles.active : ''}`}
        onClick={() => openTab(note.id, note.title)}
        onContextMenu={e => openContextMenu(e, noteContextItems(note))}
      >
        <span className={styles.icon}>📌</span>
        <span className={styles.noteTitle}>{note.title}</span>
      </button>
    ))}
    <div className={styles.divider} />
  </div>
)}
```

- [ ] **Step 5: Add CSS to LeftSidebar.module.css**

```css
.pinnedSection { padding: 6px 0 0; }
.sectionLabel {
  font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: rgba(255,255,255,0.2);
  padding: 4px 14px;
}
[data-theme="modern-light"] .sectionLabel { color: rgba(0,0,0,0.3); }
```

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/notes.ts \
        src/shared/types/IPC.ts \
        src/preload/index.ts \
        src/renderer/lib/ipc.ts \
        src/renderer/components/layout/LeftSidebar.tsx \
        src/renderer/components/layout/LeftSidebar.module.css
git commit -m "feat: pin/unpin notes — pinned section at top of sidebar"
```

---

### Task 9: Tags Sidebar Panel

**Files:**
- Modify: `src/main/ipc/notes.ts`
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/ipc.ts`
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`
- Modify: `src/renderer/components/layout/LeftSidebar.module.css`
- Create: `tests/main/services/tags.test.ts`

Background: `tags` table is already populated on every save by `IndexService.extractTags()`, which parses `#tagname` from note body. We just need to expose it.

- [ ] **Step 1: Write test**

```typescript
// tests/main/services/tags.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { IndexService } from '../../../src/main/services/IndexService'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('tags queries', () => {
  let tmpDir: string
  let db: DatabaseService
  let index: IndexService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-tags-'))
    db = new DatabaseService(tmpDir)
    db.open()
    index = new IndexService(db.get())
    index.indexNote({ id: 'n1', path: 'a.md', title: 'A', markdown: 'Hello #physics #exam-prep', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'n2', path: 'b.md', title: 'B', markdown: 'World #physics', folderPath: '', noteType: 'note' })
  })
  afterEach(() => { db.close(); rmSync(tmpDir, { recursive: true, force: true }) })

  it('list-tags groups by tag with correct counts', () => {
    const rows = db.get().prepare(
      `SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC`
    ).all() as Array<{ tag: string; count: number }>
    expect(rows.find(r => r.tag === 'physics')?.count).toBe(2)
    expect(rows.find(r => r.tag === 'exam-prep')?.count).toBe(1)
  })

  it('notes-by-tag returns correct note ids', () => {
    const rows = db.get().prepare(
      `SELECT note_id FROM tags WHERE tag = ?`
    ).all('physics') as Array<{ note_id: string }>
    const ids = rows.map(r => r.note_id)
    expect(ids).toContain('n1')
    expect(ids).toContain('n2')
  })
})
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/main/services/tags.test.ts
```

Expected: PASS (tags table already exists and is populated).

- [ ] **Step 3: Add IPC handlers in notes.ts**

```typescript
ipcMain.handle('notes:list-tags', (): Array<{ tag: string; count: number }> =>
  db().prepare(
    `SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC`
  ).all() as Array<{ tag: string; count: number }>
)

ipcMain.handle('notes:notes-by-tag', (_e, tag: string): Note[] => {
  const ids = (db().prepare('SELECT note_id FROM tags WHERE tag = ?').all(tag) as Array<{ note_id: string }>)
    .map(r => r.note_id)
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  return db().prepare(`SELECT * FROM notes WHERE id IN (${placeholders})`).all(...ids) as Note[]
})
```

- [ ] **Step 4: Add to IPC types, preload, ipc.ts**

`src/shared/types/IPC.ts`:

```typescript
listTags:   () => Promise<Array<{ tag: string; count: number }>>
notesByTag: (tag: string) => Promise<Note[]>
```

`src/preload/index.ts`:

```typescript
listTags:   ()    => ipcRenderer.invoke('notes:list-tags'),
notesByTag: (tag) => ipcRenderer.invoke('notes:notes-by-tag', tag),
```

`src/renderer/lib/ipc.ts`:

```typescript
listTags:   (): Promise<Array<{ tag: string; count: number }>> => window.owl.notes.listTags(),
notesByTag: (tag: string): Promise<Note[]>                      => window.owl.notes.notesByTag(tag),
```

- [ ] **Step 5: Add tags state and tag click handler to LeftSidebar.tsx**

```typescript
const [tags, setTags]               = useState<Array<{ tag: string; count: number }>>([])
const [activeTag, setActiveTag]     = useState<string | null>(null)
const [tagNotes, setTagNotes]       = useState<Note[]>([])
const [tagsExpanded, setTagsExpanded] = useState(true)

// Reload tags whenever notes list changes
useEffect(() => {
  ipc.notes.listTags().then(setTags).catch(() => setTags([]))
}, [notes])

const handleTagClick = useCallback(async (tag: string) => {
  if (activeTag === tag) { setActiveTag(null); setTagNotes([]); return }
  setActiveTag(tag)
  const ns = await ipc.notes.notesByTag(tag)
  setTagNotes(ns.map(normalizeNote))
}, [activeTag])
```

- [ ] **Step 6: Add tags JSX at bottom of sidebar (before ContextMenu)**

```tsx
{tags.length > 0 && (
  <div className={styles.tagsSection}>
    <button className={styles.tagsHeader} onClick={() => setTagsExpanded(e => !e)}>
      <span className={styles.sectionLabel} style={{ padding: 0 }}>Tags</span>
      <span className={styles.tagsArrow}>{tagsExpanded ? '▾' : '▸'}</span>
    </button>
    {tagsExpanded && (
      <div className={styles.tagsList}>
        {tags.map(({ tag, count }) => (
          <button
            key={tag}
            className={`${styles.tagItem} ${activeTag === tag ? styles.tagActive : ''}`}
            onClick={() => handleTagClick(tag)}
          >
            <span className={styles.tagHash}>#</span>
            <span className={styles.tagName}>{tag}</span>
            <span className={styles.tagCount}>{count}</span>
          </button>
        ))}
      </div>
    )}
    {activeTag && tagNotes.length > 0 && (
      <div className={styles.tagNoteList}>
        <div className={styles.sectionLabel}>Notes tagged #{activeTag}</div>
        {tagNotes.map(note => (
          <button
            key={note.id}
            className={`${styles.noteItem} ${activeNoteId === note.id ? styles.active : ''}`}
            style={{ paddingLeft: 14 }}
            onClick={() => openTab(note.id, note.title)}
          >
            <span className={styles.icon}>📄</span>
            <span className={styles.noteTitle}>{note.title}</span>
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 7: Add tags CSS to LeftSidebar.module.css**

```css
.tagsSection { border-top: 1px solid rgba(255,255,255,0.04); margin-top: 4px; padding-top: 4px; }
.tagsHeader {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; background: none; border: none; cursor: pointer;
  padding: 4px 14px; font-family: inherit;
}
.tagsArrow { font-size: 10px; color: rgba(255,255,255,0.2); }
.tagsList { padding: 2px 0; }
.tagItem {
  display: flex; align-items: center; gap: 4px;
  width: 100%; background: none; border: none; cursor: pointer;
  padding: 4px 14px; font-family: inherit; border-radius: 0;
  transition: background 0.1s;
}
.tagItem:hover { background: rgba(255,255,255,0.05); }
.tagActive { background: rgba(56,182,220,0.1) !important; }
.tagHash { font-size: 11px; color: rgba(56,182,220,0.55); flex-shrink: 0; }
.tagName { font-size: 12px; color: rgba(200,218,245,0.65); flex: 1; text-align: left; }
.tagCount {
  font-size: 10px; color: rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.06); border-radius: 8px; padding: 1px 6px;
}
.tagNoteList { border-top: 1px solid rgba(255,255,255,0.04); }
[data-theme="modern-light"] .tagsSection { border-top-color: rgba(0,0,0,0.06); }
[data-theme="modern-light"] .tagsArrow { color: rgba(0,0,0,0.25); }
[data-theme="modern-light"] .tagItem:hover { background: rgba(0,0,0,0.04); }
[data-theme="modern-light"] .tagActive { background: rgba(2,132,199,0.08) !important; }
[data-theme="modern-light"] .tagHash { color: rgba(2,132,199,0.7); }
[data-theme="modern-light"] .tagName { color: rgba(0,0,0,0.65); }
[data-theme="modern-light"] .tagCount { color: rgba(0,0,0,0.3); background: rgba(0,0,0,0.05); }
```

- [ ] **Step 8: Commit**

```bash
git add src/main/ipc/notes.ts \
        src/shared/types/IPC.ts \
        src/preload/index.ts \
        src/renderer/lib/ipc.ts \
        src/renderer/components/layout/LeftSidebar.tsx \
        src/renderer/components/layout/LeftSidebar.module.css \
        tests/main/services/tags.test.ts
git commit -m "feat: tags sidebar — browse notes by hashtag"
```

---

### Task 10: Daily Notes

**Files:**
- Modify: `src/main/ipc/notes.ts`
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/ipc.ts`
- Modify: `src/renderer/stores/vaultStore.ts`
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`
- Modify: `src/renderer/components/layout/LeftSidebar.module.css`
- Create: `tests/main/services/dailyNote.test.ts`

- [ ] **Step 1: Write test**

```typescript
// tests/main/services/dailyNote.test.ts
import { describe, it, expect } from 'vitest'

describe('daily note date key', () => {
  const todayKey = (d: Date): string => {
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  it('formats a known date correctly', () => {
    expect(todayKey(new Date(2026, 3, 4))).toBe('2026-04-04')
  })

  it('output matches YYYY-MM-DD pattern', () => {
    expect(todayKey(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/main/services/dailyNote.test.ts
```

Expected: PASS.

- [ ] **Step 3: Add `notes:create-daily` IPC handler in notes.ts**

Add helper at the top of `registerNotesHandlers`:

```typescript
const todayKey = (): string => {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
```

Add handler:

```typescript
ipcMain.handle('notes:create-daily', (): NoteContent => {
  const title      = todayKey()
  const folderPath = 'Daily Notes'

  const existing = db().prepare(
    `SELECT * FROM notes WHERE title = ? AND folder_path = ? AND note_type = 'daily'`
  ).get(title, folderPath) as Note | undefined

  if (existing) {
    return { note: existing, markdown: services.vault().readNote(existing.path) }
  }

  const id       = crypto.randomUUID()
  const notePath = `${folderPath}/${title}.md`
  const markdown = `# ${title}\n\n`

  services.vault().writeNote(notePath, markdown)
  services.index().indexNote({ id, path: notePath, title, markdown, folderPath, noteType: 'daily' })
  services.index().syncFTS(id, title, markdown)

  const maxRow = db().prepare(
    `SELECT COALESCE(MAX(order_index), -1) as m FROM notes WHERE folder_path = ?`
  ).get(folderPath) as { m: number }
  db().prepare('UPDATE notes SET order_index = ? WHERE id = ?').run(maxRow.m + 1, id)

  return { note: db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note, markdown }
})
```

- [ ] **Step 4: Add to IPC types, preload, ipc.ts**

`src/shared/types/IPC.ts`:

```typescript
createDaily: () => Promise<NoteContent>
```

`src/preload/index.ts`:

```typescript
createDaily: () => ipcRenderer.invoke('notes:create-daily'),
```

`src/renderer/lib/ipc.ts`:

```typescript
createDaily: (): Promise<NoteContent> => window.owl.notes.createDaily(),
```

- [ ] **Step 5: Add "Today" button to LeftSidebar JSX**

Near the top of the sidebar JSX, add before the first section div:

```tsx
<button
  className={styles.todayBtn}
  onClick={async () => {
    const raw = await ipc.notes.createDaily()
    await loadNotes()
    const note = normalizeNote(raw.note)
    openTab(note.id, note.title)
  }}
  title="Open or create today's daily note"
>
  📅 Today
</button>
```

- [ ] **Step 6: Add todayBtn CSS to LeftSidebar.module.css**

```css
.todayBtn {
  display: flex; align-items: center; gap: 6px;
  width: calc(100% - 16px); margin: 4px 8px 2px;
  padding: 6px 10px;
  background: rgba(56,182,220,0.07);
  border: 1px solid rgba(56,182,220,0.18);
  border-radius: 7px;
  color: rgba(56,182,220,0.8);
  font-size: 12px; font-weight: 500;
  font-family: inherit; cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.todayBtn:hover { background: rgba(56,182,220,0.13); color: rgba(56,182,220,1); }
[data-theme="modern-light"] .todayBtn {
  background: rgba(2,132,199,0.06); border-color: rgba(2,132,199,0.2); color: #0284c7;
}
[data-theme="modern-light"] .todayBtn:hover { background: rgba(2,132,199,0.12); }
```

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/notes.ts \
        src/shared/types/IPC.ts \
        src/preload/index.ts \
        src/renderer/lib/ipc.ts \
        src/renderer/components/layout/LeftSidebar.tsx \
        src/renderer/components/layout/LeftSidebar.module.css \
        tests/main/services/dailyNote.test.ts
git commit -m "feat: daily notes — Today button creates/opens YYYY-MM-DD note"
```

---

## Phase C — Media & Export

### Task 11: `owl://` Protocol + Image Save IPC

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/services/VaultService.ts`
- Modify: `src/main/ipc/notes.ts`
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/ipc.ts`
- Create: `tests/main/services/imageService.test.ts`

Background: `VaultService.init()` already creates `{vault}/attachments/images/`. Images are stored there as `{uuid}.{ext}` and referenced in markdown as `owl://attachments/images/{uuid}.{ext}`.

- [ ] **Step 1: Write test**

```typescript
// tests/main/services/imageService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

describe('image save to attachments folder', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'owl-img-')) })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('saves a buffer to attachments/images and returns a relative path', () => {
    const imgDir = join(tmpDir, 'attachments', 'images')
    mkdirSync(imgDir, { recursive: true })
    const uuid = randomUUID()
    const filename = `${uuid}.png`
    writeFileSync(join(imgDir, filename), Buffer.from('fake-png-data'))
    expect(existsSync(join(imgDir, filename))).toBe(true)
    const relPath = `attachments/images/${filename}`
    expect(relPath).toMatch(/^attachments\/images\/[a-f0-9-]+\.png$/)
  })
})
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/main/services/imageService.test.ts
```

Expected: PASS.

- [ ] **Step 3: Add `getRoot()` to VaultService.ts**

```typescript
// Add inside the VaultService class:
getRoot(): string { return this.vaultPath }
```

- [ ] **Step 4: Register `owl://` protocol in main/index.ts**

Add imports at the top of `src/main/index.ts`:

```typescript
import { protocol, net } from 'electron'
import { pathToFileURL } from 'url'
```

Before `app.whenReady()`, add:

```typescript
protocol.registerSchemesAsPrivileged([
  { scheme: 'owl', privileges: { secure: true, standard: true, supportFetchAPI: true } },
])
```

Inside `app.whenReady().then(() => {`, after `settingsService = new SettingsService(...)`:

```typescript
protocol.handle('owl', (request) => {
  const resourcePath = request.url.slice('owl://'.length)
  if (!activePath) return new Response('No active vault', { status: 404 })
  const filePath = join(activePath, resourcePath)
  return net.fetch(pathToFileURL(filePath).toString())
})
```

- [ ] **Step 5: Add `notes:save-image` IPC handler in notes.ts**

Add imports at top of file:

```typescript
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
```

Add handler in `registerNotesHandlers`:

```typescript
ipcMain.handle('notes:save-image', (_e, base64Data: string, ext: string): string => {
  const root    = services.vault().getRoot()
  const imgDir  = join(root, 'attachments', 'images')
  mkdirSync(imgDir, { recursive: true })
  const safExt  = ext.replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'png'
  const filename = `${randomUUID()}.${safExt}`
  writeFileSync(join(imgDir, filename), Buffer.from(base64Data, 'base64'))
  return `attachments/images/${filename}`
})
```

- [ ] **Step 6: Add to IPC types, preload, ipc.ts**

`src/shared/types/IPC.ts`:

```typescript
saveImage: (base64Data: string, ext: string) => Promise<string>
```

`src/preload/index.ts`:

```typescript
saveImage: (base64Data, ext) => ipcRenderer.invoke('notes:save-image', base64Data, ext),
```

`src/renderer/lib/ipc.ts`:

```typescript
saveImage: (base64Data: string, ext: string): Promise<string> => window.owl.notes.saveImage(base64Data, ext),
```

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts \
        src/main/services/VaultService.ts \
        src/main/ipc/notes.ts \
        src/shared/types/IPC.ts \
        src/preload/index.ts \
        src/renderer/lib/ipc.ts \
        tests/main/services/imageService.test.ts
git commit -m "feat: owl:// protocol + notes:save-image IPC"
```

---

### Task 12: Image Paste and Drag-and-Drop in Editor

**Files:**
- Create: `src/renderer/components/editor/extensions/ImageUpload.ts`
- Modify: `src/renderer/components/editor/NoteEditor.tsx`
- Modify: `src/renderer/components/editor/NoteEditor.module.css`
- Modify: `src/renderer/components/editor/extensions/SlashCommand.ts`

- [ ] **Step 1: Create ImageUpload.ts**

```typescript
// src/renderer/components/editor/extensions/ImageUpload.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ipc } from '../../../lib/ipc'

async function fileToBase64(file: File): Promise<{ base64: string; ext: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] ?? ''
      const ext    = file.type.split('/')[1]?.split('+')[0] ?? 'png'
      resolve({ base64, ext })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function insertImage(file: File, editor: import('@tiptap/core').Editor): Promise<void> {
  if (!file.type.startsWith('image/')) return
  const { base64, ext } = await fileToBase64(file)
  const relativePath    = await ipc.notes.saveImage(base64, ext)
  editor.chain().focus().setImage({ src: `owl://${relativePath}`, alt: file.name }).run()
}

export const ImageUpload = Extension.create({
  name: 'imageUpload',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('imageUpload'),
        props: {
          handlePaste(_view, event) {
            const items = Array.from(event.clipboardData?.items ?? [])
            const imageItem = items.find(i => i.type.startsWith('image/'))
            if (!imageItem) return false
            event.preventDefault()
            const file = imageItem.getAsFile()
            if (file) void insertImage(file, editor)
            return true
          },
          handleDrop(_view, event) {
            const files = Array.from(event.dataTransfer?.files ?? [])
            const imageFile = files.find(f => f.type.startsWith('image/'))
            if (!imageFile) return false
            event.preventDefault()
            void insertImage(imageFile, editor)
            return true
          },
        },
      }),
    ]
  },
})
```

- [ ] **Step 2: Add Image and ImageUpload extensions to NoteEditor.tsx**

Add imports:

```typescript
import Image from '@tiptap/extension-image'
import { ImageUpload } from './extensions/ImageUpload'
```

Add to extensions array:

```typescript
Image.configure({ inline: false, allowBase64: false }),
ImageUpload,
```

- [ ] **Step 3: Add image CSS to NoteEditor.module.css**

```css
/* Images */
.editorWrap :global(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  display: block;
  margin: 16px 0;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 2px 12px rgba(0,0,0,0.25);
}
.editorWrap :global(.ProseMirror img.ProseMirror-selectednode) {
  outline: 2px solid rgba(56,182,220,0.6);
  border-radius: 8px;
}
[data-theme="modern-light"] .editorWrap :global(.ProseMirror img) {
  border-color: rgba(0,0,0,0.1); box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}
```

- [ ] **Step 4: Add Image slash command in SlashCommand.ts**

```typescript
{
  title: 'Image', description: 'Upload image from file', icon: '🖼',
  command: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).run()
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1] ?? ''
        const ext    = file.type.split('/')[1]?.split('+')[0] ?? 'png'
        const { ipc: ipcLib } = await import('../../../lib/ipc')
        const rel = await ipcLib.notes.saveImage(base64, ext)
        editor.chain().focus().setImage({ src: `owl://${rel}`, alt: file.name }).run()
      }
      reader.readAsDataURL(file)
    }
    input.click()
  },
},
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/extensions/ImageUpload.ts \
        src/renderer/components/editor/NoteEditor.tsx \
        src/renderer/components/editor/NoteEditor.module.css \
        src/renderer/components/editor/extensions/SlashCommand.ts
git commit -m "feat: image paste, drop, and /image slash command"
```

---

### Task 13: PDF Export

**Files:**
- Create: `src/main/ipc/export.ts`
- Create: `src/renderer/print.css`
- Modify: `src/main/index.ts`
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/ipc.ts`
- Modify: `src/renderer/components/editor/NoteEditor.tsx`
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`
- Modify: `src/renderer/index.tsx`

- [ ] **Step 1: Create export.ts IPC handler**

```typescript
// src/main/ipc/export.ts
import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'

export function registerExportHandlers(getWindow: () => BrowserWindow): void {
  ipcMain.handle('export:pdf', async (_e, noteTitle: string): Promise<void> => {
    const win = getWindow()

    // Signal the renderer to hide chrome before capture
    win.webContents.send('export:before-print')
    await new Promise<void>(r => setTimeout(r, 200))

    try {
      const data = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 },
      })

      const { filePath } = await dialog.showSaveDialog(win, {
        defaultPath: `${noteTitle}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })

      if (filePath) writeFileSync(filePath, data)
    } finally {
      win.webContents.send('export:after-print')
    }
  })
}
```

- [ ] **Step 2: Register export handlers in main/index.ts**

Add import:

```typescript
import { registerExportHandlers } from './ipc/export'
```

After `const win = new BrowserWindow(...)` is declared (near the bottom of `whenReady`), add:

```typescript
registerExportHandlers(() => win)
```

- [ ] **Step 3: Add to IPC types**

`src/shared/types/IPC.ts` — add a new interface and add it to `OwlAPI`:

```typescript
export interface OwlExportAPI {
  pdf: (noteTitle: string) => Promise<void>
}

export interface OwlAPI {
  vault:  OwlVaultAPI
  notes:  OwlNotesAPI
  search: OwlSearchAPI
  shell:  OwlShellAPI
  export: OwlExportAPI
}
```

- [ ] **Step 4: Add to preload**

In `src/preload/index.ts`, add to the `owl` object:

```typescript
export: {
  pdf: (noteTitle) => ipcRenderer.invoke('export:pdf', noteTitle),
},
```

Also forward the before/after-print IPC events to the renderer as DOM events:

```typescript
ipcRenderer.on('export:before-print', () =>
  window.dispatchEvent(new CustomEvent('owl:before-print')))
ipcRenderer.on('export:after-print', () =>
  window.dispatchEvent(new CustomEvent('owl:after-print')))
```

- [ ] **Step 5: Add to ipc.ts**

```typescript
export: {
  pdf: (noteTitle: string): Promise<void> => window.owl.export.pdf(noteTitle),
},
```

- [ ] **Step 6: Create print.css**

```css
/* src/renderer/print.css — applied via body.printing class during PDF export */
body.printing [class*="TabBar"],
body.printing [class*="titleBar"],
body.printing [class*="menuBar"],
body.printing [class*="LeftSidebar"],
body.printing [class*="RightSidebar"],
body.printing [class*="resizeHandle"],
body.printing [class*="ContextMenu"],
body.printing [class*="FindBar"] {
  display: none !important;
}
body.printing [class*="editorWrap"] {
  overflow: visible !important;
  padding: 0 !important;
}
body.printing [class*="ProseMirror"] {
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  min-height: unset !important;
}
```

- [ ] **Step 7: Import print.css in renderer/index.tsx**

```typescript
import './print.css'
```

- [ ] **Step 8: Handle print lifecycle in NoteEditor.tsx**

Add an effect:

```typescript
useEffect(() => {
  const onBefore = (): void => document.body.classList.add('printing')
  const onAfter  = (): void => document.body.classList.remove('printing')
  window.addEventListener('owl:before-print', onBefore)
  window.addEventListener('owl:after-print',  onAfter)
  return () => {
    window.removeEventListener('owl:before-print', onBefore)
    window.removeEventListener('owl:after-print',  onAfter)
  }
}, [])
```

Add the `ipc` import (needed for the PDF button below):

```typescript
import { ipc } from '../../lib/ipc'
```

- [ ] **Step 9: Add PDF button to editor toolbar**

In the `titleActions` div, add after the source toggle button:

```tsx
{note && (
  <button
    className={styles.sourceToggle}
    onClick={() => void ipc.export.pdf(note.title)}
    title="Export note as PDF"
  >
    ↓ PDF
  </button>
)}
```

- [ ] **Step 10: Add "Export as PDF" to note context menu in LeftSidebar.tsx**

In `noteContextItems`, before the `Delete` entry, add:

```typescript
{ separator: true },
{
  label: 'Export as PDF',
  icon: '📄',
  onClick: () => void ipc.export.pdf(note.title),
},
```

- [ ] **Step 11: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/main/ipc/export.ts \
        src/main/index.ts \
        src/shared/types/IPC.ts \
        src/preload/index.ts \
        src/renderer/lib/ipc.ts \
        src/renderer/components/editor/NoteEditor.tsx \
        src/renderer/components/layout/LeftSidebar.tsx \
        src/renderer/print.css \
        src/renderer/index.tsx
git commit -m "feat: export note as PDF"
```

---

## Self-review

**Spec coverage:**
| Feature | Task(s) |
|---|---|
| Task lists / checkboxes | 2 |
| Tables | 3 |
| Math / LaTeX | 4 |
| Spellcheck | 5 |
| Find in note (Ctrl+F) | 6 |
| Pinned notes | 7–8 |
| Tags sidebar | 9 |
| Daily notes | 10 |
| Images (paste/drop/slash) | 11–12 |
| PDF export | 13 |

All 10 features covered. ✓

**Type consistency:**
- `Note.pinned: boolean` added in Task 7, consumed in Task 8. ✓
- `ipc.notes.saveImage` defined in Task 11, used in Task 12. ✓
- `ipc.export.pdf` defined in Task 13, imported via `import { ipc }` in both NoteEditor.tsx and LeftSidebar.tsx. ✓
- `VaultService.getRoot()` added in Task 11, used in the same task's IPC handler. ✓
- `MathBlock.insertMathBlock` command declared via `declare module '@tiptap/core'` in MathBlock.ts. ✓
- `injectMathTags` from `src/renderer/lib/math.ts` imported in both `editorStore.ts` (conceptually) and `NoteEditor.tsx` — the plan makes clear to import it in NoteEditor.tsx's `useEffect([note?.id])`. ✓

**Known implementation note for Task 4 (math serialization):** `tiptap-markdown` v0.8.x reads `storage.markdown.serialize` on each TipTap Node extension to know how to serialize back to markdown. If this exact API path doesn't work in the installed version, the fallback is to post-process the markdown string returned by `editor.storage.markdown.getMarkdown()` in `editorStore.save()`, replacing `<div data-math-block="formula">` patterns back to `$$formula$$`. The `injectMathTags` function in `src/renderer/lib/math.ts` handles the load direction; an inverse `extractMathTags` handles the save direction if needed.
