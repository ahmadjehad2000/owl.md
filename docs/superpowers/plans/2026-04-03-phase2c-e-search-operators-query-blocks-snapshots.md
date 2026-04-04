# Search Operators + Embedded Query Blocks + File Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search operators (`file:`, `tag:`, `path:`, `task:`, regex) to the search modal; add embedded `query:` code blocks that render live search results inside notes; add file snapshots (version history per note).

**Architecture:** Search operators are parsed by a new `parseSearchQuery` utility on the main process side before hitting SQLite FTS — each operator maps to an additional WHERE clause. Embedded query blocks are a TipTap `CodeBlock` language extension (`lang="query"`) that renders a `QueryBlock` React component via `NodeViewWrapper`. File snapshots are stored in a `.owl/snapshots/{noteId}/` directory as timestamped `.md` files, written on every manual save.

**Tech Stack:** React, TipTap (NodeViewWrapper, ReactNodeViewRenderer), better-sqlite3, Node.js fs, DOMPurify (for safe FTS snippet rendering), CSS Modules

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/main/lib/searchParser.ts` | Create | `parseSearchQuery(q)` → `{ fts, filters }` object |
| `src/main/services/IndexService.ts` | Modify | `searchFTS` accepts parsed filters to add WHERE clauses |
| `src/main/ipc/search.ts` | Modify | Parse query before calling `searchFTS` |
| `src/renderer/components/editor/extensions/QueryBlock.ts` | Create | TipTap extension — overrides code block rendering for `lang="query"` |
| `src/renderer/components/editor/QueryBlockView.tsx` | Create | React component rendered inside the TipTap node view |
| `src/renderer/components/editor/QueryBlockView.module.css` | Create | Styles for the live results panel inside the note |
| `src/main/services/SnapshotService.ts` | Create | `save(noteId, content)` + `list(noteId)` + `read(noteId, timestamp)` + `prune(noteId)` |
| `src/main/ipc/notes.ts` | Modify | `notes:save` calls SnapshotService; add `notes:snapshots:list` and `notes:snapshots:read` handlers |
| `src/shared/types/IPC.ts` | Modify | Add `OwlSnapshotsAPI` with `list` and `read` |
| `src/renderer/components/layout/SnapshotPanel.tsx` | Create | Right sidebar panel showing snapshot history |
| `src/renderer/components/layout/SnapshotPanel.module.css` | Create | Snapshot list styles |
| `src/renderer/components/layout/RightSidebar.tsx` | Modify | Add "History" tab to the three existing tabs |
| `src/renderer/stores/rightPanelStore.ts` | Modify | Add `'history'` to the `RightTab` type |
| `tests/main/lib/searchParser.test.ts` | Create | Unit tests for all operator types |
| `tests/main/services/SnapshotService.test.ts` | Create | Tests for save, list, read snapshot operations |

---

### Task 1: Search operator parser

**Files:**
- Create: `src/main/lib/searchParser.ts`
- Create: `tests/main/lib/searchParser.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/main/lib/searchParser.test.ts`:

```typescript
import { parseSearchQuery } from '../../../src/main/lib/searchParser'

test('plain text query returns fts term only', () => {
  const result = parseSearchQuery('hello world')
  expect(result.fts).toBe('hello world')
  expect(result.filters).toEqual([])
})

test('file: operator', () => {
  const result = parseSearchQuery('file:readme')
  expect(result.fts).toBe('')
  expect(result.filters).toContainEqual({ type: 'file', value: 'readme' })
})

test('tag: operator', () => {
  const result = parseSearchQuery('tag:project')
  expect(result.fts).toBe('')
  expect(result.filters).toContainEqual({ type: 'tag', value: 'project' })
})

test('path: operator', () => {
  const result = parseSearchQuery('path:research')
  expect(result.fts).toBe('')
  expect(result.filters).toContainEqual({ type: 'path', value: 'research' })
})

test('task: operator with incomplete', () => {
  const result = parseSearchQuery('task:incomplete')
  expect(result.filters).toContainEqual({ type: 'task', value: 'incomplete' })
})

test('task: operator with complete', () => {
  const result = parseSearchQuery('task:complete')
  expect(result.filters).toContainEqual({ type: 'task', value: 'complete' })
})

test('regex: operator', () => {
  const result = parseSearchQuery('regex:\\d{4}')
  expect(result.filters).toContainEqual({ type: 'regex', value: '\\d{4}' })
})

test('mixed: fts text + tag', () => {
  const result = parseSearchQuery('meeting notes tag:work')
  expect(result.fts).toBe('meeting notes')
  expect(result.filters).toContainEqual({ type: 'tag', value: 'work' })
})

test('unknown operator treated as plain text', () => {
  const result = parseSearchQuery('foo:bar')
  expect(result.fts).toBe('foo:bar')
  expect(result.filters).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/device/Documents/owl.md && npx jest tests/main/lib/searchParser.test.ts --no-coverage 2>&1 | tail -5
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement parseSearchQuery**

Create `src/main/lib/searchParser.ts`:

```typescript
// src/main/lib/searchParser.ts

type FilterType = 'file' | 'tag' | 'path' | 'task' | 'regex'

export interface SearchFilter {
  type: FilterType
  value: string
}

export interface ParsedSearchQuery {
  fts: string
  filters: SearchFilter[]
}

const KNOWN_OPERATORS: ReadonlySet<FilterType> = new Set(['file', 'tag', 'path', 'task', 'regex'])

/**
 * Parse a search query string into FTS text and structured filters.
 *
 * Supported operators: file:, tag:, path:, task:, regex:
 * Each operator token is `operator:value` with no spaces.
 * Mixed: "meeting notes tag:work" → fts="meeting notes", filters=[{type:'tag',value:'work'}]
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const parts = query.trim().split(/\s+/)
  const filters: SearchFilter[] = []
  const plainParts: string[] = []

  for (const part of parts) {
    const colonIdx = part.indexOf(':')
    if (colonIdx > 0) {
      const op = part.slice(0, colonIdx) as FilterType
      if (KNOWN_OPERATORS.has(op)) {
        filters.push({ type: op, value: part.slice(colonIdx + 1) })
        continue
      }
    }
    plainParts.push(part)
  }

  return {
    fts: plainParts.join(' ').trim(),
    filters,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/device/Documents/owl.md && npx jest tests/main/lib/searchParser.test.ts --no-coverage 2>&1 | tail -5
```
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/main/lib/searchParser.ts tests/main/lib/searchParser.test.ts && git commit -m "feat: add search operator parser (file:, tag:, path:, task:, regex:)"
```

---

### Task 2: Wire search operators into IndexService + search:query

**Files:**
- Modify: `src/main/services/IndexService.ts`
- Modify: `src/main/ipc/search.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/main/services/IndexService.aliases.test.ts`:

```typescript
test('searchWithFilters: tag filter returns matching note', () => {
  const db = makeDb()
  const idx = new IndexService(db)
  idx.indexNote({ id: 'A', path: 'a.md', title: 'Alpha', markdown: '# Alpha\n#project stuff', folderPath: '', noteType: 'note' })
  idx.indexNote({ id: 'B', path: 'b.md', title: 'Beta',  markdown: '# Beta\n#design stuff',  folderPath: '', noteType: 'note' })
  idx.syncFTS('A', 'Alpha', '# Alpha\n#project stuff')
  idx.syncFTS('B', 'Beta',  '# Beta\n#design stuff')
  const results = idx.searchWithFilters('', [{ type: 'tag', value: 'project' }])
  expect(results.map(r => r.id)).toContain('A')
  expect(results.map(r => r.id)).not.toContain('B')
})

test('searchWithFilters: file filter matches title', () => {
  const db = makeDb()
  const idx = new IndexService(db)
  idx.indexNote({ id: 'A', path: 'a.md', title: 'Research Notes', markdown: '# Research Notes', folderPath: '', noteType: 'note' })
  idx.syncFTS('A', 'Research Notes', '# Research Notes')
  const results = idx.searchWithFilters('', [{ type: 'file', value: 'Research' }])
  expect(results.map(r => r.id)).toContain('A')
})

test('searchWithFilters: path filter', () => {
  const db = makeDb()
  const idx = new IndexService(db)
  idx.indexNote({ id: 'A', path: 'work/projects.md', title: 'Projects', markdown: '', folderPath: 'work', noteType: 'note' })
  idx.syncFTS('A', 'Projects', '')
  const results = idx.searchWithFilters('', [{ type: 'path', value: 'work' }])
  expect(results.map(r => r.id)).toContain('A')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/device/Documents/owl.md && npx jest tests/main/services/IndexService.aliases.test.ts --no-coverage 2>&1 | tail -5
```
Expected: FAIL — `searchWithFilters` not found

- [ ] **Step 3: Add searchWithFilters to IndexService**

Add the import and method to `src/main/services/IndexService.ts`:

```typescript
import type { SearchFilter } from '../lib/searchParser'

// Add inside the IndexService class:
searchWithFilters(ftsQuery: string, filters: SearchFilter[]): SearchResult[] {
  const conditions: string[] = []
  const params: unknown[] = []

  for (const f of filters) {
    if (f.type === 'tag') {
      conditions.push(`EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id AND t.tag = ?)`)
      params.push(f.value)
    } else if (f.type === 'file') {
      conditions.push(`n.title LIKE ?`)
      params.push(`%${f.value}%`)
    } else if (f.type === 'path') {
      conditions.push(`n.path LIKE ?`)
      params.push(`%${f.value}%`)
    } else if (f.type === 'task') {
      if (f.value === 'incomplete') {
        conditions.push(`notes_fts.content LIKE ?`)
        params.push('%- [ ]%')
      } else if (f.value === 'complete') {
        conditions.push(`notes_fts.content LIKE ?`)
        params.push('%- [x]%')
      }
    }
    // regex is applied post-query in JS
  }

  let rows: SearchResult[]

  if (ftsQuery) {
    const whereClause = conditions.length ? `AND ${conditions.join(' AND ')}` : ''
    try {
      rows = this.db.prepare(`
        SELECT n.id, n.path, n.title,
               snippet(notes_fts, 1, '<mark>', '</mark>', '…', 10) as excerpt
        FROM notes_fts
        JOIN notes n ON notes_fts.rowid = n.rowid
        WHERE notes_fts MATCH ? ${whereClause}
        ORDER BY bm25(notes_fts, 10, 1)
        LIMIT 50
      `).all(ftsQuery + '*', ...params) as SearchResult[]
    } catch {
      rows = []
    }
  } else if (conditions.length) {
    const whereClause = conditions.join(' AND ')
    rows = this.db.prepare(`
      SELECT n.id, n.path, n.title, '' as excerpt
      FROM notes n
      JOIN notes_fts ON notes_fts.rowid = n.rowid
      WHERE ${whereClause}
      LIMIT 50
    `).all(...params) as SearchResult[]
  } else {
    return []
  }

  // Apply regex filter post-query
  const regexFilter = filters.find(f => f.type === 'regex')
  if (regexFilter) {
    try {
      const re = new RegExp(regexFilter.value, 'i')
      rows = rows.filter(r => re.test(r.title) || re.test(r.excerpt ?? ''))
    } catch {
      // invalid regex — skip filter
    }
  }

  return rows
}
```

- [ ] **Step 4: Update search:query IPC handler**

Modify `src/main/ipc/search.ts`:

```typescript
// src/main/ipc/search.ts
import { ipcMain } from 'electron'
import { parseSearchQuery } from '../lib/searchParser'
import type { IndexService } from '../services/IndexService'

export function registerSearchHandlers(index: () => IndexService): void {
  ipcMain.handle('search:query', (_e, q: string) => {
    if (!q.trim()) return []
    const { fts, filters } = parseSearchQuery(q)
    if (filters.length === 0) {
      return index().searchFTS(fts || q)
    }
    return index().searchWithFilters(fts, filters)
  })
}
```

- [ ] **Step 5: Run all tests**

```bash
cd /home/device/Documents/owl.md && npx jest --no-coverage 2>&1 | tail -5
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/main/services/IndexService.ts src/main/ipc/search.ts src/main/lib/searchParser.ts && git commit -m "feat: wire search operators into IndexService.searchWithFilters"
```

---

### Task 3: SnapshotService

**Files:**
- Create: `src/main/services/SnapshotService.ts`
- Create: `tests/main/services/SnapshotService.test.ts`

Snapshots are stored as `<vaultPath>/.owl/snapshots/<noteId>/<timestamp>.md`. The service lists and reads them without DB involvement — filesystem only.

- [ ] **Step 1: Write failing test**

Create `tests/main/services/SnapshotService.test.ts`:

```typescript
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SnapshotService } from '../../../src/main/services/SnapshotService'

function makeVault(): string {
  const dir = join(tmpdir(), `owl-snap-test-${Date.now()}`)
  mkdirSync(join(dir, '.owl', 'snapshots'), { recursive: true })
  return dir
}

test('save creates a snapshot file', () => {
  const vaultPath = makeVault()
  const svc = new SnapshotService(vaultPath)
  svc.save('note-1', 'My content')
  const snaps = svc.list('note-1')
  expect(snaps).toHaveLength(1)
  expect(snaps[0]).toMatch(/^\d+$/) // timestamp string
  rmSync(vaultPath, { recursive: true, force: true })
})

test('list returns snapshots sorted newest-first', async () => {
  const vaultPath = makeVault()
  const svc = new SnapshotService(vaultPath)
  svc.save('note-1', 'Version A')
  await new Promise(r => setTimeout(r, 5))
  svc.save('note-1', 'Version B')
  const snaps = svc.list('note-1')
  expect(snaps).toHaveLength(2)
  expect(Number(snaps[0])).toBeGreaterThan(Number(snaps[1]))
  rmSync(vaultPath, { recursive: true, force: true })
})

test('read returns snapshot content', () => {
  const vaultPath = makeVault()
  const svc = new SnapshotService(vaultPath)
  svc.save('note-1', '# Hello snapshot')
  const snap = svc.list('note-1')[0]
  expect(svc.read('note-1', snap)).toBe('# Hello snapshot')
  rmSync(vaultPath, { recursive: true, force: true })
})

test('list returns empty array for unknown noteId', () => {
  const vaultPath = makeVault()
  const svc = new SnapshotService(vaultPath)
  expect(svc.list('unknown')).toEqual([])
  rmSync(vaultPath, { recursive: true, force: true })
})

test('prune keeps only last 20 snapshots', async () => {
  const vaultPath = makeVault()
  const svc = new SnapshotService(vaultPath)
  for (let i = 0; i < 25; i++) {
    svc.save('note-1', `Version ${i}`)
    await new Promise(r => setTimeout(r, 2))
  }
  svc.prune('note-1')
  expect(svc.list('note-1')).toHaveLength(20)
  rmSync(vaultPath, { recursive: true, force: true })
}, 10000)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/device/Documents/owl.md && npx jest tests/main/services/SnapshotService.test.ts --no-coverage 2>&1 | tail -5
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement SnapshotService**

Create `src/main/services/SnapshotService.ts`:

```typescript
// src/main/services/SnapshotService.ts
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const MAX_SNAPSHOTS = 20

export class SnapshotService {
  constructor(private readonly vaultPath: string) {}

  private snapshotDir(noteId: string): string {
    return join(this.vaultPath, '.owl', 'snapshots', noteId)
  }

  save(noteId: string, content: string): void {
    const dir = this.snapshotDir(noteId)
    mkdirSync(dir, { recursive: true })
    const timestamp = String(Date.now())
    writeFileSync(join(dir, `${timestamp}.md`), content, 'utf-8')
    this.prune(noteId)
  }

  list(noteId: string): string[] {
    const dir = this.snapshotDir(noteId)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.slice(0, -3))             // strip .md → timestamp string
      .sort((a, b) => Number(b) - Number(a)) // newest first
  }

  read(noteId: string, timestamp: string): string {
    return readFileSync(join(this.snapshotDir(noteId), `${timestamp}.md`), 'utf-8')
  }

  prune(noteId: string): void {
    const snaps = this.list(noteId)
    if (snaps.length <= MAX_SNAPSHOTS) return
    const dir = this.snapshotDir(noteId)
    // oldest are at the end (sorted newest-first)
    for (const ts of snaps.slice(MAX_SNAPSHOTS)) {
      unlinkSync(join(dir, `${ts}.md`))
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/device/Documents/owl.md && npx jest tests/main/services/SnapshotService.test.ts --no-coverage 2>&1 | tail -5
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/main/services/SnapshotService.ts tests/main/services/SnapshotService.test.ts && git commit -m "feat: add SnapshotService with save/list/read/prune"
```

---

### Task 4: Wire SnapshotService into notes:save IPC + new snapshot IPC handlers

**Files:**
- Modify: `src/main/ipc/notes.ts`
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/main/main.ts` (or wherever services are instantiated — verify by reading)

- [ ] **Step 1: Read main.ts to find service wiring**

Read `src/main/main.ts` to find where `VaultService`, `DatabaseService`, and `IndexService` are created — `SnapshotService` follows the same pattern.

- [ ] **Step 2: Instantiate SnapshotService in main.ts**

In `src/main/main.ts`, after the existing service instantiation and wherever `vaultPath` is set:

```typescript
import { SnapshotService } from './services/SnapshotService'

// In the same place VaultService/DatabaseService are created:
const snapshot = new SnapshotService(vaultPath)
```

Pass it to `registerNotesHandlers`:

```typescript
registerNotesHandlers({ db, vault, index, snapshot })
```

- [ ] **Step 3: Update registerNotesHandlers signature**

In `src/main/ipc/notes.ts`, update the parameter type:

```typescript
import { SnapshotService } from '../services/SnapshotService'

export function registerNotesHandlers(services: {
  db: () => DatabaseService
  vault: () => VaultService
  index: () => IndexService
  snapshot: () => SnapshotService
}): void {
```

In the `notes:save` handler, after writing the note file and before returning, call:

```typescript
services.snapshot().save(id, markdown)
```

Add two new handlers at the end of the function:

```typescript
ipcMain.handle('notes:snapshots:list', (_e, noteId: string): string[] =>
  services.snapshot().list(noteId)
)

ipcMain.handle('notes:snapshots:read', (_e, noteId: string, timestamp: string): string =>
  services.snapshot().read(noteId, timestamp)
)
```

- [ ] **Step 4: Add OwlSnapshotsAPI to IPC types**

In `src/shared/types/IPC.ts`:

```typescript
export interface OwlSnapshotsAPI {
  list: (noteId: string) => Promise<string[]>
  read: (noteId: string, timestamp: string) => Promise<string>
}

export interface OwlAPI {
  vault:     OwlVaultAPI
  notes:     OwlNotesAPI
  search:    OwlSearchAPI
  tags:      OwlTagsAPI
  snapshots: OwlSnapshotsAPI
}
```

- [ ] **Step 5: Expose snapshots in preload**

Read `src/main/preload.ts`. In `contextBridge.exposeInMainWorld`, add:

```typescript
snapshots: {
  list: (noteId: string) => ipcRenderer.invoke('notes:snapshots:list', noteId),
  read: (noteId: string, timestamp: string) => ipcRenderer.invoke('notes:snapshots:read', noteId, timestamp),
},
```

- [ ] **Step 6: Add snapshots to renderer ipc.ts**

Read `src/renderer/lib/ipc.ts`. Add:

```typescript
snapshots: {
  list: (noteId: string): Promise<string[]> => window.owl.snapshots.list(noteId),
  read: (noteId: string, timestamp: string): Promise<string> => window.owl.snapshots.read(noteId, timestamp),
},
```

- [ ] **Step 7: Run tests**

```bash
cd /home/device/Documents/owl.md && npx jest --no-coverage 2>&1 | tail -5
```
Expected: all pass

- [ ] **Step 8: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/main/ipc/notes.ts src/shared/types/IPC.ts src/main/preload.ts src/renderer/lib/ipc.ts && git commit -m "feat: wire SnapshotService into notes:save, expose snapshots IPC"
```

---

### Task 5: SnapshotPanel right sidebar tab

**Files:**
- Modify: `src/renderer/stores/rightPanelStore.ts`
- Create: `src/renderer/components/layout/SnapshotPanel.tsx`
- Create: `src/renderer/components/layout/SnapshotPanel.module.css`
- Modify: `src/renderer/components/layout/RightSidebar.tsx`

- [ ] **Step 1: Add 'history' to RightTab type**

Modify `src/renderer/stores/rightPanelStore.ts`:

```typescript
export type RightTab = 'backlinks' | 'outline' | 'properties' | 'history'
```

- [ ] **Step 2: Create SnapshotPanel**

Create `src/renderer/components/layout/SnapshotPanel.tsx`:

```tsx
// src/renderer/components/layout/SnapshotPanel.tsx
import React, { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { ipc } from '../../lib/ipc'
import styles from './SnapshotPanel.module.css'

function formatTimestamp(ts: string): string {
  const ms = Number(ts)
  if (Number.isNaN(ms)) return ts
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function SnapshotPanel(): JSX.Element {
  const note = useEditorStore(s => s.note)
  const setMarkdown = useEditorStore(s => s.setMarkdown)
  const [snapshots, setSnapshots] = useState<string[]>([])
  const [preview, setPreview]     = useState<string | null>(null)
  const [previewTs, setPreviewTs] = useState<string | null>(null)

  useEffect(() => {
    if (!note) { setSnapshots([]); return }
    ipc.snapshots.list(note.id).then(setSnapshots).catch(() => setSnapshots([]))
  }, [note?.id])

  const openPreview = async (ts: string): Promise<void> => {
    if (!note) return
    const content = await ipc.snapshots.read(note.id, ts)
    setPreview(content)
    setPreviewTs(ts)
  }

  const restoreSnapshot = (): void => {
    if (!preview) return
    setMarkdown(preview)
    setPreview(null)
    setPreviewTs(null)
  }

  if (!note) return <div className={styles.empty}>Open a note to view history</div>

  if (preview !== null) {
    return (
      <div className={styles.preview}>
        <div className={styles.previewHeader}>
          <span className={styles.previewTitle}>{formatTimestamp(previewTs ?? '')}</span>
          <div className={styles.previewActions}>
            <button className={styles.restoreBtn} onClick={restoreSnapshot}>Restore</button>
            <button className={styles.closeBtn} onClick={() => setPreview(null)}>✕</button>
          </div>
        </div>
        <pre className={styles.previewContent}>{preview}</pre>
      </div>
    )
  }

  if (snapshots.length === 0) {
    return <div className={styles.empty}>No snapshots yet — save to create one</div>
  }

  return (
    <div className={styles.root}>
      {snapshots.map(ts => (
        <button key={ts} className={styles.row} onClick={() => openPreview(ts)}>
          <span className={styles.time}>{formatTimestamp(ts)}</span>
        </button>
      ))}
    </div>
  )
}
```

Create `src/renderer/components/layout/SnapshotPanel.module.css`:

```css
.root { padding: 4px 0; }

.empty {
  padding: 16px 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
}

.row {
  display: flex;
  align-items: center;
  width: 100%;
  background: none;
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
  margin: 1px 4px;
}
.row:hover { background: rgba(255, 255, 255, 0.07); }

.time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
}

.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.previewHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.previewTitle {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.previewActions { display: flex; gap: 6px; }

.restoreBtn {
  background: rgba(56, 182, 220, 0.2);
  border: 1px solid rgba(56, 182, 220, 0.4);
  border-radius: 4px;
  color: rgba(56, 182, 220, 0.9);
  cursor: pointer;
  font-size: 11px;
  padding: 3px 8px;
}
.restoreBtn:hover { background: rgba(56, 182, 220, 0.3); }

.closeBtn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 12px;
  padding: 3px 8px;
}
.closeBtn:hover { color: rgba(255, 255, 255, 0.8); }

.previewContent {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  font-size: 11px;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.6);
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 3: Add History tab to RightSidebar**

Modify `src/renderer/components/layout/RightSidebar.tsx`:

```typescript
// Change the TABS constant to include history:
const TABS: { id: 'backlinks' | 'outline' | 'properties' | 'history'; label: string }[] = [
  { id: 'backlinks',  label: 'Links'   },
  { id: 'outline',    label: 'Outline' },
  { id: 'properties', label: 'Props'   },
  { id: 'history',    label: 'History' },
]
```

Add SnapshotPanel import and render in the body section:

```tsx
import { SnapshotPanel } from './SnapshotPanel'

// In the body:
{activeTab === 'history' && <SnapshotPanel />}
```

- [ ] **Step 4: Run full tests**

```bash
cd /home/device/Documents/owl.md && npx jest --no-coverage 2>&1 | tail -5
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/stores/rightPanelStore.ts src/renderer/components/layout/SnapshotPanel.tsx src/renderer/components/layout/SnapshotPanel.module.css src/renderer/components/layout/RightSidebar.tsx && git commit -m "feat: add History tab to right sidebar with snapshot panel"
```

---

### Task 6: Embedded query blocks (TipTap extension)

**Files:**
- Create: `src/renderer/components/editor/extensions/QueryBlock.ts`
- Create: `src/renderer/components/editor/QueryBlockView.tsx`
- Create: `src/renderer/components/editor/QueryBlockView.module.css`
- Modify: `src/renderer/components/editor/NoteEditor.tsx` (add extension)

Embedded query blocks use TipTap's code block mechanism. When a code block has `lang="query"`, a custom node view renders live search results. FTS excerpts contain `<mark>` tags from SQLite's `snippet()` — these are sanitized with DOMPurify before rendering.

- [ ] **Step 1: Install DOMPurify**

```bash
cd /home/device/Documents/owl.md && npm install dompurify && npm install --save-dev @types/dompurify
```

- [ ] **Step 2: Read NoteEditor.tsx to understand extension registration**

Read `src/renderer/components/editor/NoteEditor.tsx`. Find the `useEditor({ extensions: [...] })` call to understand how to add a new extension.

- [ ] **Step 3: Create QueryBlockView component**

Create `src/renderer/components/editor/QueryBlockView.tsx`:

```tsx
// src/renderer/components/editor/QueryBlockView.tsx
import React, { useEffect, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import DOMPurify from 'dompurify'
import { useTabStore } from '../../stores/tabStore'
import { ipc } from '../../lib/ipc'
import type { SearchResult } from '@shared/types/Note'
import styles from './QueryBlockView.module.css'

interface Props {
  node: { attrs: { language?: string }; textContent: string }
}

export function QueryBlockView({ node }: Props): JSX.Element {
  const query = node.textContent.trim()
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query) { setResults([]); return }
    setLoading(true)
    ipc.search.query(query)
      .then(r => { setResults(r); setLoading(false) })
      .catch(() => { setResults([]); setLoading(false) })
  }, [query])

  return (
    <NodeViewWrapper className={styles.root}>
      <div className={styles.header}>
        <span className={styles.label}>query</span>
        <span className={styles.queryText}>{query}</span>
      </div>
      <div className={styles.results}>
        {loading && <div className={styles.status}>Searching…</div>}
        {!loading && results.length === 0 && query && (
          <div className={styles.status}>No results</div>
        )}
        {!loading && results.map(r => (
          <button
            key={r.id}
            className={styles.result}
            onClick={() => useTabStore.getState().openTab(r.id, r.title)}
          >
            <span className={styles.resultTitle}>{r.title}</span>
            {r.excerpt && (
              <span
                className={styles.excerpt}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(r.excerpt, { ALLOWED_TAGS: ['mark'] })
                }}
              />
            )}
          </button>
        ))}
      </div>
    </NodeViewWrapper>
  )
}
```

Create `src/renderer/components/editor/QueryBlockView.module.css`:

```css
.root {
  background: rgba(56, 182, 220, 0.05);
  border: 1px solid rgba(56, 182, 220, 0.2);
  border-radius: 8px;
  margin: 8px 0;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(56, 182, 220, 0.08);
  border-bottom: 1px solid rgba(56, 182, 220, 0.15);
}

.label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: rgba(56, 182, 220, 0.7);
  letter-spacing: 0.06em;
}

.queryText {
  font-size: 11px;
  font-family: monospace;
  color: rgba(56, 182, 220, 0.5);
}

.results { padding: 4px 0; }

.status {
  padding: 8px 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

.result {
  display: block;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px 12px;
  text-align: left;
}
.result:hover { background: rgba(255, 255, 255, 0.05); }

.resultTitle {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}

.excerpt {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 2px;
}
.excerpt :global(mark) {
  background: rgba(56, 182, 220, 0.25);
  color: inherit;
  border-radius: 2px;
}
```

- [ ] **Step 4: Create QueryBlock TipTap extension**

Create `src/renderer/components/editor/extensions/QueryBlock.ts`:

```typescript
// src/renderer/components/editor/extensions/QueryBlock.ts
import { ReactNodeViewRenderer } from '@tiptap/react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { QueryBlockView } from '../QueryBlockView'

/**
 * Extends the code block extension to render live query results
 * when the language is set to "query".
 */
export const QueryBlock = CodeBlockLowlight.extend({
  name: 'queryBlock',

  addNodeView() {
    return (props) => {
      if (props.node.attrs.language === 'query') {
        return ReactNodeViewRenderer(QueryBlockView)(props)
      }
      // Return null to fall through to default code block rendering
      return null as never
    }
  },
})
```

- [ ] **Step 5: Register QueryBlock in NoteEditor**

In `src/renderer/components/editor/NoteEditor.tsx`, import and add `QueryBlock` to the extensions array. Find the existing CodeBlock-related extension in the `useEditor` call — replace it with `QueryBlock.configure({ lowlight })` (since QueryBlock extends CodeBlockLowlight, it handles all code blocks, falling back to default rendering for non-query blocks).

```typescript
import { QueryBlock } from './extensions/QueryBlock'

// In useEditor extensions array, replace the existing CodeBlockLowlight with:
QueryBlock.configure({ lowlight }),
```

- [ ] **Step 6: Run full tests**

```bash
cd /home/device/Documents/owl.md && npx jest --no-coverage 2>&1 | tail -5
```
Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/editor/extensions/QueryBlock.ts src/renderer/components/editor/QueryBlockView.tsx src/renderer/components/editor/QueryBlockView.module.css src/renderer/components/editor/NoteEditor.tsx && git commit -m "feat: embedded query blocks render live search results in notes"
```

---

## Self-Review

**Spec coverage:**
- ✅ `file:`, `tag:`, `path:`, `task:`, `regex:` search operators parsed and applied
- ✅ `searchWithFilters` in IndexService with SQL WHERE clauses per operator
- ✅ Regex operator applied post-query in JS (SQLite has no built-in regex)
- ✅ SnapshotService: save, list (newest-first), read, prune (max 20)
- ✅ Snapshot written on every `notes:save`
- ✅ `notes:snapshots:list` and `notes:snapshots:read` IPC handlers
- ✅ SnapshotPanel in right sidebar History tab: view list, preview, restore
- ✅ Embedded `query:` code blocks as TipTap node view with live results
- ✅ FTS excerpts sanitized with `DOMPurify.sanitize(..., { ALLOWED_TAGS: ['mark'] })` — only `<mark>` tags pass through, all other HTML is stripped

**Placeholder scan:** No TBDs. Every step has complete code.

**Type consistency:** `SearchFilter` from `searchParser.ts` used in both parser tests and `IndexService.searchWithFilters`. `SnapshotService` constructor takes `vaultPath: string` consistently. `QueryBlockView` uses `NodeViewWrapper` from `@tiptap/react` matching existing wiki-link extension patterns. `DOMPurify.sanitize` used consistently with `{ ALLOWED_TAGS: ['mark'] }`.
