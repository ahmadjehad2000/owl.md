# Properties Panel Inline + Note Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the properties panel inline above the note body (like Obsidian) and add note aliases so `[[alias]]` wiki-links resolve to the aliased note.

**Architecture:** The inline properties panel renders above the TipTap editor within `NoteEditor.tsx`, reading/writing `editorStore.frontmatter`. Aliases are stored in a reserved `aliases` frontmatter key; `IndexService.resolveLinks` is updated to check aliases in addition to titles when resolving wiki-links.

**Tech Stack:** React, Zustand (editorStore), TipTap, better-sqlite3 (IndexService), CSS Modules

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/components/editor/InlineProperties.tsx` | Create | Collapsible frontmatter table rendered above editor body |
| `src/renderer/components/editor/InlineProperties.module.css` | Create | Styles for inline properties (pill badges, type icons, editable fields) |
| `src/renderer/components/editor/NoteEditor.tsx` | Modify | Render `<InlineProperties>` between tab bar and TipTap editor |
| `src/renderer/components/layout/PropertiesPanel.tsx` | Modify | Render a note saying "Properties now shown inline above the editor" (keep for discoverability) |
| `src/main/services/IndexService.ts` | Modify | `resolveLinks` checks aliases array in addition to title |
| `tests/main/services/IndexService.aliases.test.ts` | Create | Tests for alias-based link resolution |
| `tests/renderer/components/InlineProperties.test.tsx` | Create | Tests for add/remove/edit property, aliases field |

---

### Task 1: InlineProperties component — display and collapse

**Files:**
- Create: `src/renderer/components/editor/InlineProperties.tsx`
- Create: `src/renderer/components/editor/InlineProperties.module.css`

- [ ] **Step 1: Write failing test**

Create `tests/renderer/components/InlineProperties.test.tsx`:

```tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { InlineProperties } from '../../../src/renderer/components/editor/InlineProperties'
import type { Frontmatter } from '../../../src/renderer/lib/markdown'

const noop = (): void => {}

test('renders frontmatter keys', () => {
  const fm: Frontmatter = { status: 'draft', priority: 2 }
  render(<InlineProperties frontmatter={fm} onChange={noop} />)
  expect(screen.getByText('status')).toBeInTheDocument()
  expect(screen.getByText('priority')).toBeInTheDocument()
})

test('is collapsed by default and expands on click', () => {
  const fm: Frontmatter = { status: 'draft' }
  render(<InlineProperties frontmatter={fm} onChange={noop} />)
  // Toggle button should exist
  const toggle = screen.getByRole('button', { name: /properties/i })
  expect(screen.queryByText('status')).toBeNull() // collapsed
  fireEvent.click(toggle)
  expect(screen.getByText('status')).toBeInTheDocument()
})

test('calls onChange when value is edited', () => {
  const fn = jest.fn()
  const fm: Frontmatter = { title: 'Hello' }
  render(<InlineProperties frontmatter={fm} onChange={fn} />)
  // Expand first
  fireEvent.click(screen.getByRole('button', { name: /properties/i }))
  const input = screen.getByDisplayValue('Hello')
  fireEvent.blur(input, { target: { value: 'World' } })
  expect(fn).toHaveBeenCalledWith(expect.objectContaining({ title: 'World' }))
})

test('add new property', () => {
  const fn = jest.fn()
  render(<InlineProperties frontmatter={{}} onChange={fn} />)
  fireEvent.click(screen.getByRole('button', { name: /properties/i }))
  const newKeyInput = screen.getByPlaceholderText('Add property…')
  fireEvent.change(newKeyInput, { target: { value: 'rating' } })
  fireEvent.keyDown(newKeyInput, { key: 'Enter' })
  expect(fn).toHaveBeenCalledWith({ rating: '' })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/device/Documents/owl.md && npx jest tests/renderer/components/InlineProperties.test.tsx --no-coverage 2>&1 | tail -5
```
Expected: FAIL — `InlineProperties` not found

- [ ] **Step 3: Create InlineProperties component**

Create `src/renderer/components/editor/InlineProperties.tsx`:

```tsx
// src/renderer/components/editor/InlineProperties.tsx
import React, { useState } from 'react'
import type { Frontmatter, FrontmatterValue } from '../../lib/markdown'
import styles from './InlineProperties.module.css'

function parseValue(raw: string): FrontmatterValue {
  const t = raw.trim()
  if (t.includes(',')) return t.split(',').map(s => s.trim()).filter(Boolean)
  if (t === 'true')  return true
  if (t === 'false') return false
  const n = Number(t)
  if (!Number.isNaN(n) && t !== '') return n
  return t
}

function displayValue(v: FrontmatterValue): string {
  return Array.isArray(v) ? v.join(', ') : String(v)
}

interface Props {
  frontmatter: Frontmatter
  onChange: (next: Frontmatter) => void
}

export function InlineProperties({ frontmatter, onChange }: Props): JSX.Element {
  const [open, setOpen]     = useState(false)
  const [newKey, setNewKey] = useState('')

  const keyCount = Object.keys(frontmatter).length

  const update = (key: string, raw: string): void =>
    onChange({ ...frontmatter, [key]: parseValue(raw) })

  const remove = (key: string): void => {
    const next = { ...frontmatter }
    delete next[key]
    onChange(next)
  }

  const addKey = (): void => {
    const k = newKey.trim()
    if (!k || Object.hasOwn(frontmatter, k)) return
    onChange({ ...frontmatter, [k]: '' })
    setNewKey('')
  }

  return (
    <div className={styles.root}>
      <button
        className={styles.toggle}
        onClick={() => setOpen(o => !o)}
        aria-label="properties"
      >
        <span className={styles.toggleIcon}>{open ? '▼' : '▶'}</span>
        <span className={styles.toggleLabel}>Properties</span>
        {keyCount > 0 && <span className={styles.badge}>{keyCount}</span>}
      </button>

      {open && (
        <div className={styles.table}>
          {Object.entries(frontmatter).map(([key, value]) => (
            <div key={key} className={styles.row}>
              <span className={styles.key}>{key}</span>
              <input
                className={styles.value}
                defaultValue={displayValue(value)}
                onBlur={e => update(key, e.currentTarget.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
              <button className={styles.remove} onClick={() => remove(key)} title="Remove">×</button>
            </div>
          ))}
          <div className={styles.addRow}>
            <input
              className={styles.newKey}
              placeholder="Add property…"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addKey() }}
            />
            <button className={styles.addBtn} onClick={addKey}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create CSS module**

Create `src/renderer/components/editor/InlineProperties.module.css`:

```css
.root {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.015);
}

.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  padding: 8px 0;
  width: 100%;
  text-align: left;
  user-select: none;
}
.toggle:hover { color: rgba(255, 255, 255, 0.65); }

.toggleIcon { font-size: 8px; }
.toggleLabel { font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
.badge {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 10px;
}

.table { padding-bottom: 8px; }

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.key {
  width: 120px;
  flex-shrink: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid transparent;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  padding: 3px 6px;
  outline: none;
}
.value:focus { border-color: rgba(56, 182, 220, 0.4); }

.remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.25);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}
.remove:hover { color: rgba(255, 80, 80, 0.7); }

.addRow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.newKey {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  padding: 2px 4px;
  outline: none;
}
.newKey::placeholder { color: rgba(255, 255, 255, 0.25); }
.newKey:focus { border-bottom-color: rgba(56, 182, 220, 0.5); }

.addBtn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 14px;
  padding: 1px 6px;
  line-height: 1.4;
}
.addBtn:hover { color: rgba(255, 255, 255, 0.8); border-color: rgba(255, 255, 255, 0.3); }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /home/device/Documents/owl.md && npx jest tests/renderer/components/InlineProperties.test.tsx --no-coverage 2>&1 | tail -5
```
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/editor/InlineProperties.tsx src/renderer/components/editor/InlineProperties.module.css tests/renderer/components/InlineProperties.test.tsx && git commit -m "feat: add InlineProperties component with collapse/expand"
```

---

### Task 2: Wire InlineProperties into NoteEditor

**Files:**
- Modify: `src/renderer/components/editor/NoteEditor.tsx`

- [ ] **Step 1: Write failing test**

Add to `tests/renderer/components/InlineProperties.test.tsx`:

```tsx
// Note: NoteEditor integration is tested visually — the unit test for
// InlineProperties already covers the component logic.
// This step verifies NoteEditor imports and renders InlineProperties.
import { readFileSync } from 'fs'
test('NoteEditor imports InlineProperties', () => {
  const src = readFileSync(
    'src/renderer/components/editor/NoteEditor.tsx', 'utf8'
  )
  expect(src).toContain('InlineProperties')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/device/Documents/owl.md && npx jest tests/renderer/components/InlineProperties.test.tsx --no-coverage 2>&1 | tail -5
```
Expected: FAIL — "InlineProperties" not found in NoteEditor.tsx

- [ ] **Step 3: Read NoteEditor to find the insertion point**

Read `src/renderer/components/editor/NoteEditor.tsx` and find the JSX return statement. The `<InlineProperties>` component should be placed between the tab bar area and the `<EditorContent>` (TipTap output).

Find the pattern that looks like:
```tsx
return (
  <div className={styles.wrapper}>
    {/* ... TabBar or similar ... */}
    <EditorContent editor={editor} .../>
  </div>
)
```

- [ ] **Step 4: Add InlineProperties to NoteEditor**

At the top of the return statement, after any wrapping div but before `<EditorContent>`, add:

```tsx
import { InlineProperties } from './InlineProperties'
// ... existing imports

// Inside the component, access frontmatter and setFrontmatter:
const frontmatter    = useEditorStore(s => s.frontmatter)
const setFrontmatter = useEditorStore(s => s.setFrontmatter)
const note           = useEditorStore(s => s.note)

// In the JSX, before <EditorContent>:
{note && (
  <InlineProperties
    frontmatter={frontmatter}
    onChange={setFrontmatter}
  />
)}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /home/device/Documents/owl.md && npx jest tests/renderer/components/InlineProperties.test.tsx --no-coverage 2>&1 | tail -5
```
Expected: PASS (5 tests)

- [ ] **Step 6: Update PropertiesPanel right-sidebar with redirect notice**

In `src/renderer/components/layout/PropertiesPanel.tsx`, add a note at the top of the panel when a note is open. After the `if (!note) return ...` guard, add a static notice above the existing rows:

```tsx
// At the top of the returned JSX, before the map:
<div className={styles.inlineNotice}>
  Properties are also shown inline above the note editor.
</div>
```

Add `.inlineNotice` to `PropertiesPanel.module.css`:
```css
.inlineNotice {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  padding: 6px 8px 0;
  font-style: italic;
}
```

- [ ] **Step 7: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/editor/NoteEditor.tsx src/renderer/components/layout/PropertiesPanel.tsx src/renderer/components/layout/PropertiesPanel.module.css && git commit -m "feat: render InlineProperties above editor body in NoteEditor"
```

---

### Task 3: Note aliases — frontmatter key + IndexService resolution

**Files:**
- Modify: `src/main/services/IndexService.ts`
- Create: `tests/main/services/IndexService.aliases.test.ts`

The `aliases` frontmatter key (type `string[]` or comma-separated `string`) allows wiki-links to resolve using any alias. When `resolveLinks` runs, it should check both `title` and any entry in the `aliases` array of each note.

- [ ] **Step 1: Write failing test**

Create `tests/main/services/IndexService.aliases.test.ts`:

```typescript
import Database from 'better-sqlite3'
import { up as migration001 } from '../../src/main/db/migrations/001_initial'
import { up as migration002 } from '../../src/main/db/migrations/002_order_index'
import { IndexService } from '../../src/main/services/IndexService'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migration001(db)
  migration002(db)
  return db
}

test('resolveLinks resolves by note title', () => {
  const db = makeDb()
  const idx = new IndexService(db)
  idx.indexNote({ id: 'A', path: 'a.md', title: 'Alpha', markdown: '', folderPath: '', noteType: 'note' })
  idx.indexNote({ id: 'B', path: 'b.md', title: 'Beta', markdown: '[[Alpha]]', folderPath: '', noteType: 'note' })
  idx.resolveLinks()
  const links = db.prepare("SELECT target_note_id, is_resolved FROM links WHERE source_note_id = 'B'").all() as Array<{ target_note_id: string; is_resolved: number }>
  expect(links[0].target_note_id).toBe('A')
  expect(links[0].is_resolved).toBe(1)
})

test('resolveLinks resolves by alias', () => {
  const db = makeDb()
  const idx = new IndexService(db)
  // Insert note with aliases column
  db.prepare(`
    INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, folder_path, note_type, order_index, aliases)
    VALUES ('A', 'a.md', 'Alpha Note', '', 0, 0, '', 'note', 0, 'al,alpha-doc')
  `).run()
  idx.indexNote({ id: 'B', path: 'b.md', title: 'Beta', markdown: '[[alpha-doc]]', folderPath: '', noteType: 'note' })
  idx.resolveLinks()
  const links = db.prepare("SELECT target_note_id, is_resolved FROM links WHERE source_note_id = 'B'").all() as Array<{ target_note_id: string; is_resolved: number }>
  expect(links[0].target_note_id).toBe('A')
  expect(links[0].is_resolved).toBe(1)
})

test('resolveLinks: unresolvable link stays unresolved', () => {
  const db = makeDb()
  const idx = new IndexService(db)
  idx.indexNote({ id: 'B', path: 'b.md', title: 'Beta', markdown: '[[doesnt-exist]]', folderPath: '', noteType: 'note' })
  idx.resolveLinks()
  const links = db.prepare("SELECT is_resolved FROM links WHERE source_note_id = 'B'").all() as Array<{ is_resolved: number }>
  expect(links[0].is_resolved).toBe(0)
})

test('extractAliasesFromFrontmatter parses comma-separated string', () => {
  const result = IndexService.extractAliasesFromFrontmatter('---\naliases: al, alpha-doc\n---\n')
  expect(result).toEqual(['al', 'alpha-doc'])
})

test('extractAliasesFromFrontmatter parses YAML array', () => {
  const result = IndexService.extractAliasesFromFrontmatter('---\naliases: [al, alpha-doc]\n---\n')
  expect(result).toEqual(['al', 'alpha-doc'])
})

test('extractAliasesFromFrontmatter returns empty for no aliases key', () => {
  const result = IndexService.extractAliasesFromFrontmatter('---\ntitle: Hello\n---\n')
  expect(result).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/device/Documents/owl.md && npx jest tests/main/services/IndexService.aliases.test.ts --no-coverage 2>&1 | tail -10
```
Expected: FAIL — `aliases` column missing, `extractAliasesFromFrontmatter` not found

- [ ] **Step 3: Add `aliases` column migration**

Create `src/main/db/migrations/003_aliases.ts`:

```typescript
import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>
  if (!cols.some(c => c.name === 'aliases')) {
    db.prepare("ALTER TABLE notes ADD COLUMN aliases TEXT NOT NULL DEFAULT ''").run()
  }
}
```

- [ ] **Step 4: Register migration003 in DatabaseService**

Modify `src/main/services/DatabaseService.ts`:

```typescript
import { up as migration003 } from '../db/migrations/003_aliases'

const MIGRATIONS: Array<(db: Database.Database) => void> = [migration001, migration002, migration003]
```

- [ ] **Step 5: Update IndexService**

Modify `src/main/services/IndexService.ts`:

1. Add `aliases?: string` to `IndexNoteParams`:
```typescript
interface IndexNoteParams {
  id: string
  path: string
  title: string
  markdown: string
  folderPath: string
  noteType: string
  aliases?: string   // comma-separated or YAML array string
}
```

2. In `indexNote`, store aliases when upserting:
```typescript
const aliases = IndexService.extractAliasesFromFrontmatter(
  params.markdown.startsWith('---') ? params.markdown : ''
).join(', ')

this.db.prepare(`
  INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, folder_path, note_type, aliases)
  VALUES (@id, @path, @title, @hash, @now, @now, @folderPath, @noteType, @aliases)
  ON CONFLICT(id) DO UPDATE SET
    path = excluded.path, title = excluded.title,
    content_hash = excluded.content_hash, updated_at = excluded.updated_at,
    folder_path = excluded.folder_path, note_type = excluded.note_type,
    aliases = excluded.aliases
`).run({ id, path, title, hash, now, folderPath, noteType, aliases })
```

3. In `resolveLinks`, after checking by title, also check aliases:
```typescript
resolveLinks(): void {
  const unresolved = this.db.prepare(
    'SELECT rowid, source_note_id, link_text FROM links WHERE is_resolved = 0'
  ).all() as Array<{ rowid: number; source_note_id: string; link_text: string }>

  for (const link of unresolved) {
    // Try title match first
    let target = this.db.prepare('SELECT id FROM notes WHERE title = ?').get(link.link_text) as
      | { id: string } | undefined

    // Fall back to alias match
    if (!target) {
      const allNotes = this.db.prepare('SELECT id, aliases FROM notes WHERE aliases != \'\'').all() as
        Array<{ id: string; aliases: string }>
      for (const n of allNotes) {
        const aliases = n.aliases.split(',').map((a: string) => a.trim()).filter(Boolean)
        if (aliases.includes(link.link_text)) {
          target = { id: n.id }
          break
        }
      }
    }

    if (target) {
      this.db.prepare('UPDATE links SET target_note_id = ?, is_resolved = 1 WHERE rowid = ?')
        .run(target.id, link.rowid)
    }
  }
}
```

4. Add static helper:
```typescript
static extractAliasesFromFrontmatter(markdown: string): string[] {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return []
  const yaml = match[1]
  for (const line of yaml.split('\n')) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    if (key !== 'aliases') continue
    const raw = line.slice(colon + 1).trim()
    if (raw.startsWith('[') && raw.endsWith(']')) {
      return raw.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    }
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }
  return []
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd /home/device/Documents/owl.md && npx jest tests/main/services/IndexService.aliases.test.ts --no-coverage 2>&1 | tail -5
```
Expected: PASS (6 tests)

- [ ] **Step 7: Run full test suite**

```bash
cd /home/device/Documents/owl.md && npx jest --no-coverage 2>&1 | tail -10
```
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/main/db/migrations/003_aliases.ts src/main/services/DatabaseService.ts src/main/services/IndexService.ts tests/main/services/IndexService.aliases.test.ts && git commit -m "feat: add note aliases via frontmatter with wiki-link resolution"
```

---

## Self-Review

**Spec coverage:**
- ✅ InlineProperties component renders frontmatter above editor body
- ✅ Collapsible with badge count
- ✅ Add/edit/remove properties
- ✅ PropertiesPanel right sidebar updated with notice
- ✅ Note aliases in `aliases` frontmatter key
- ✅ Wiki-link resolution checks aliases
- ✅ DB migration for aliases column

**Placeholder scan:** No TBDs or vague steps found.

**Type consistency:** `IndexNoteParams.aliases` is optional string throughout; `extractAliasesFromFrontmatter` is static on `IndexService`.
