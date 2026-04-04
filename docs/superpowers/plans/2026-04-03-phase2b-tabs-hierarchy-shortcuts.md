# Phase 2B: Tabs, Knowledge Base Hierarchy & Keyboard Shortcuts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-tab editing, a Parent/Child Knowledge Base tree hierarchy in the sidebar with drag-and-drop, and tab keyboard shortcuts to owl.md.

**Architecture:** A new `tabStore` caches per-tab editor state so unsaved edits survive tab switches; `editorStore` syncs bidirectionally with the active tab. Parent Knowledge Bases are `note_type='folder'` rows in the `notes` table (no `.md` file on disk); Child Knowledge Bases are regular notes linked via `parent_id`. dnd-kit handles drag-and-drop in the sidebar tree.

**Tech Stack:** Zustand 4, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, React 18, Electron IPC, better-sqlite3, CSS Modules.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/main/db/migrations/002_order_index.ts` | Adds `order_index` column to notes |
| Modify | `src/main/services/DatabaseService.ts` | Register migration 002; fix INSERT/UPDATE bug |
| Modify | `src/shared/types/Note.ts` | Add `'folder'` to noteType, add `orderIndex` |
| Modify | `src/shared/types/IPC.ts` | Add `move`, `createFolder` to OwlNotesAPI |
| Modify | `src/main/ipc/notes.ts` | `notes:move`, `notes:create-folder` handlers |
| Modify | `src/preload/index.ts` | Expose new IPC channels |
| Modify | `src/renderer/lib/ipc.ts` | Wire `notes.move`, `notes.createFolder` |
| Create | `src/renderer/stores/tabStore.ts` | Tab list, active tab, per-tab state cache |
| Modify | `src/renderer/stores/editorStore.ts` | Add `restoreTab`, `unloadNote`; sync with tabStore |
| Create | `src/renderer/components/editor/TabBar.tsx` | Tab bar rendered above NoteEditor |
| Create | `src/renderer/components/editor/TabBar.module.css` | Tab bar styles |
| Modify | `src/renderer/components/editor/NoteEditor.tsx` | Render TabBar; tab-activation effect |
| Modify | `src/renderer/stores/vaultStore.ts` | Normalize camelCase; add `createFolder` action |
| Modify | `src/renderer/components/layout/LeftSidebar.tsx` | Tree view, dnd-kit, folder creation |
| Modify | `src/renderer/components/layout/LeftSidebar.module.css` | Tree + drag styles |
| Modify | `src/renderer/components/layout/AppShell.tsx` | Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab |
| Modify | `tests/main/services/DatabaseService.test.ts` | order_index migration + folder/move DB ops |
| Create | `tests/renderer/stores/tabStore.test.ts` | Tab open/close/cycle/cache tests |

---

### Task 1: DB migration + shared types

**Files:**
- Create: `src/main/db/migrations/002_order_index.ts`
- Modify: `src/main/services/DatabaseService.ts`
- Modify: `src/shared/types/Note.ts`
- Modify: `src/shared/types/IPC.ts`
- Test: `tests/main/services/DatabaseService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/main/services/DatabaseService.test.ts` after the existing 6 tests, inside the `describe('DatabaseService', () => {` block:

```typescript
  it('adds order_index column via migration 002', () => {
    const cols = db.get()
      .prepare('PRAGMA table_info(notes)')
      .all() as Array<{ name: string }>
    expect(cols.some(c => c.name === 'order_index')).toBe(true)
  })

  it('records schema_version = 2 after both migrations', () => {
    const row = db.get()
      .prepare('SELECT version FROM schema_version')
      .get() as { version: number }
    expect(row.version).toBe(2)
  })

  it('can store a folder note (note_type = folder)', () => {
    const d = db.get()
    const now = Date.now()
    d.prepare(`
      INSERT INTO notes (id, path, title, content_hash, created_at, updated_at,
                         parent_id, folder_path, note_type, order_index)
      VALUES ('f1', '', 'Research', '', ?, ?, NULL, '', 'folder', 0)
    `).run(now, now)
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get('f1') as Record<string, unknown>
    expect(row.note_type).toBe('folder')
    expect(row.path).toBe('')
  })

  it('can move a note into a parent folder', () => {
    const d = db.get()
    const now = Date.now()
    d.prepare(`INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, parent_id, folder_path, note_type, order_index) VALUES ('f2', '', 'Folder', '', ?, ?, NULL, '', 'folder', 0)`).run(now, now)
    d.prepare(`INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, parent_id, folder_path, note_type, order_index) VALUES ('n2', 'n.md', 'Note', 'h', ?, ?, NULL, '', 'note', 0)`).run(now, now)
    d.prepare('UPDATE notes SET parent_id = ?, order_index = ? WHERE id = ?').run('f2', 1, 'n2')
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get('n2') as Record<string, unknown>
    expect(row.parent_id).toBe('f2')
    expect(row.order_index).toBe(1)
  })

  it('can move a note back to root (parent_id = null)', () => {
    const d = db.get()
    const now = Date.now()
    d.prepare(`INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, parent_id, folder_path, note_type, order_index) VALUES ('f3', '', 'Folder', '', ?, ?, NULL, '', 'folder', 0)`).run(now, now)
    d.prepare(`INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, parent_id, folder_path, note_type, order_index) VALUES ('n3', 'n3.md', 'Note3', 'h', ?, ?, 'f3', '', 'note', 0)`).run(now, now)
    d.prepare('UPDATE notes SET parent_id = NULL, order_index = 0 WHERE id = ?').run('n3')
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get('n3') as Record<string, unknown>
    expect(row.parent_id).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: `adds order_index column` and `records schema_version = 2` FAIL.

- [ ] **Step 3: Create migration 002**

Create `src/main/db/migrations/002_order_index.ts`:

```typescript
// src/main/db/migrations/002_order_index.ts
import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  // Idempotent: skip if column already exists
  const cols = db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>
  if (!cols.some(c => c.name === 'order_index')) {
    db.prepare('ALTER TABLE notes ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0').run()
  }
}
```

Note: we use `db.prepare(...).run()` (single-statement API) rather than `db.exec()` here.

- [ ] **Step 4: Update DatabaseService**

Replace `src/main/services/DatabaseService.ts`:

```typescript
// src/main/services/DatabaseService.ts
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { CREATE_SCHEMA_VERSION } from '../db/schema'
import { up as migration001 } from '../db/migrations/001_initial'
import { up as migration002 } from '../db/migrations/002_order_index'

const MIGRATIONS: Array<(db: Database.Database) => void> = [migration001, migration002]

export class DatabaseService {
  private _db: Database.Database | null = null

  constructor(private readonly vaultPath: string) {}

  open(): void {
    const owlDir = join(this.vaultPath, '.owl')
    mkdirSync(owlDir, { recursive: true })
    this._db = new Database(join(owlDir, 'db.sqlite'))
    this._db.pragma('journal_mode = WAL')
    this._db.pragma('foreign_keys = ON')
    this.runMigrations()
  }

  close(): void {
    this._db?.close()
    this._db = null
  }

  get(): Database.Database {
    if (!this._db) throw new Error('DatabaseService not open — call open() first')
    return this._db
  }

  private runMigrations(): void {
    const db = this.get()
    db.prepare(CREATE_SCHEMA_VERSION).run()

    const row = db.prepare('SELECT version FROM schema_version').get() as
      | { version: number } | undefined
    const currentVersion = row?.version ?? 0
    let hasRow = row !== undefined

    for (let i = currentVersion; i < MIGRATIONS.length; i++) {
      const capture = hasRow
      const runMigration = db.transaction(() => {
        MIGRATIONS[i](db)
        if (!capture) {
          db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1)
          hasRow = true
        } else {
          db.prepare('UPDATE schema_version SET version = ?').run(i + 1)
        }
      })
      runMigration()
    }
  }
}
```

Key change from original: `db.exec(CREATE_SCHEMA_VERSION)` → `db.prepare(CREATE_SCHEMA_VERSION).run()`, migration array now includes `migration002`, and the INSERT/UPDATE logic now uses `capture` (snapshot of `hasRow` before the loop body) so multiple migrations on a fresh DB correctly INSERT once then UPDATE.

- [ ] **Step 5: Update shared types — Note.ts**

Replace `src/shared/types/Note.ts`:

```typescript
// src/shared/types/Note.ts

export interface Note {
  id: string
  path: string              // vault-relative, e.g. "Research/paper.md". Empty for folders.
  title: string
  contentHash: string
  createdAt: number         // unix ms
  updatedAt: number
  parentId: string | null
  folderPath: string
  noteType: 'note' | 'daily' | 'canvas' | 'mindmap' | 'folder'
  orderIndex: number
}

export interface NoteContent {
  note: Note
  markdown: string
}

export interface BacklinkResult {
  sourceNoteId: string
  sourceTitle: string
  sourcePath: string
  linkText: string
}

export interface SearchResult {
  id: string
  path: string
  title: string
  excerpt: string
}

export interface VaultConfig {
  name: string
  path: string
  createdAt: number
  schemaVersion: number
}
```

- [ ] **Step 6: Update shared types — IPC.ts**

Replace `src/shared/types/IPC.ts`:

```typescript
// src/shared/types/IPC.ts
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from './Note'

export interface OwlVaultAPI {
  open:        (vaultPath: string) => Promise<VaultConfig>
  create:      (name: string)      => Promise<VaultConfig>
  activate:    (vaultPath: string) => Promise<VaultConfig>
  listKnown:   ()                  => Promise<VaultConfig[]>
  getLast:     ()                  => Promise<string | null>
  getSessions: ()                  => Promise<VaultConfig[]>
  getConfig:   ()                  => Promise<VaultConfig | null>
}

export interface OwlNotesAPI {
  list:         () => Promise<Note[]>
  read:         (id: string) => Promise<NoteContent>
  save:         (id: string, markdown: string) => Promise<Note>
  create:       (title: string, folderPath: string) => Promise<NoteContent>
  delete:       (id: string) => Promise<void>
  getBacklinks: (id: string) => Promise<BacklinkResult[]>
  createFolder: (name: string) => Promise<Note>
  move:         (noteId: string, newParentId: string | null, orderIndex: number) => Promise<void>
}

export interface OwlSearchAPI {
  query: (q: string) => Promise<SearchResult[]>
}

export interface OwlAPI {
  vault:  OwlVaultAPI
  notes:  OwlNotesAPI
  search: OwlSearchAPI
}

declare global {
  interface Window { owl: OwlAPI }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test 2>&1 | tail -8
```

Expected: `Test Files  11 passed`, `Tests  71 passed` (65 + 5 new DB tests). The schema_version=2 test may show 1 on existing DBs — delete `.owl/db.sqlite` in your test vault to start fresh if needed. The Vitest tests use temp directories so they always start fresh.

- [ ] **Step 8: Commit**

```bash
git add src/main/db/migrations/002_order_index.ts src/main/services/DatabaseService.ts \
        src/shared/types/Note.ts src/shared/types/IPC.ts \
        tests/main/services/DatabaseService.test.ts
git commit -m "feat: migration 002 order_index, folder noteType, move/createFolder IPC types"
```

---

### Task 2: IPC handlers + preload + ipc.ts

**Files:**
- Modify: `src/main/ipc/notes.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/ipc.ts`

- [ ] **Step 1: Add notes:create-folder and notes:move handlers**

Replace `src/main/ipc/notes.ts`:

```typescript
// src/main/ipc/notes.ts
import { ipcMain } from 'electron'
import { dirname, basename } from 'path'
import type { Note, NoteContent } from '@shared/types/Note'
import type { DatabaseService } from '../services/DatabaseService'
import type { VaultService } from '../services/VaultService'
import type { IndexService } from '../services/IndexService'

export function registerNotesHandlers(services: {
  db: () => DatabaseService
  vault: () => VaultService
  index: () => IndexService
}): void {
  const db = () => services.db().get()

  ipcMain.handle('notes:list', (): Note[] =>
    db().prepare('SELECT * FROM notes ORDER BY updated_at DESC').all() as Note[]
  )

  ipcMain.handle('notes:read', (_e, id: string): NoteContent => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
    if (!note) throw new Error(`Note not found: ${id}`)
    return { note, markdown: services.vault().readNote(note.path) }
  })

  ipcMain.handle('notes:save', (_e, id: string, markdown: string): Note => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
    if (!note) throw new Error(`Note not found: ${id}`)
    services.vault().writeNote(note.path, markdown)
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : basename(note.path, '.md')
    const folderPath = dirname(note.path) === '.' ? '' : dirname(note.path)
    const raw = note as unknown as Record<string, unknown>
    const noteType = (raw.note_type ?? raw.noteType ?? 'note') as Note['noteType']
    services.index().indexNote({ id, path: note.path, title, markdown, folderPath, noteType })
    services.index().syncFTS(id, title, markdown)
    services.index().resolveLinks()
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
  })

  ipcMain.handle('notes:create', (_e, title: string, folderPath: string): NoteContent => {
    const id = crypto.randomUUID()
    const fileName = `${title.replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '-')}.md`
    const notePath = folderPath ? `${folderPath}/${fileName}` : fileName
    const markdown = `# ${title}\n\n`
    services.vault().writeNote(notePath, markdown)
    services.index().indexNote({ id, path: notePath, title, markdown, folderPath, noteType: 'note' })
    services.index().syncFTS(id, title, markdown)
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
    return { note, markdown }
  })

  ipcMain.handle('notes:delete', (_e, id: string): void => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined
    if (!note) return
    services.vault().deleteNote(note.path)
    services.index().removeNote(id)
  })

  ipcMain.handle('notes:getBacklinks', (_e, id: string) =>
    services.index().getBacklinks(id)
  )

  ipcMain.handle('notes:create-folder', (_e, name: string): Note => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const result = db().prepare(
      `SELECT COALESCE(MAX(order_index), -1) as m FROM notes WHERE parent_id IS NULL`
    ).get() as { m: number }
    db().prepare(`
      INSERT INTO notes (id, path, title, content_hash, created_at, updated_at,
                         parent_id, folder_path, note_type, order_index)
      VALUES (?, '', ?, '', ?, ?, NULL, '', 'folder', ?)
    `).run(id, name, now, now, result.m + 1)
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
  })

  ipcMain.handle('notes:move',
    (_e, noteId: string, newParentId: string | null, orderIndex: number): void => {
      db().prepare(
        'UPDATE notes SET parent_id = ?, order_index = ?, updated_at = ? WHERE id = ?'
      ).run(newParentId, orderIndex, Date.now(), noteId)
    }
  )
}
```

- [ ] **Step 2: Update preload**

Replace `src/preload/index.ts`:

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { OwlAPI } from '@shared/types/IPC'

const owl: OwlAPI = {
  vault: {
    open:        (vaultPath) => ipcRenderer.invoke('vault:open',         vaultPath),
    create:      (name)      => ipcRenderer.invoke('vault:create',       name),
    activate:    (vaultPath) => ipcRenderer.invoke('vault:activate',     vaultPath),
    listKnown:   ()          => ipcRenderer.invoke('vault:list-known'),
    getLast:     ()          => ipcRenderer.invoke('vault:get-last'),
    getSessions: ()          => ipcRenderer.invoke('vault:get-sessions'),
    getConfig:   ()          => ipcRenderer.invoke('vault:getConfig'),
  },
  notes: {
    list:         ()              => ipcRenderer.invoke('notes:list'),
    read:         (id)            => ipcRenderer.invoke('notes:read',         id),
    save:         (id, markdown)  => ipcRenderer.invoke('notes:save',         id, markdown),
    create:       (title, folder) => ipcRenderer.invoke('notes:create',       title, folder),
    delete:       (id)            => ipcRenderer.invoke('notes:delete',       id),
    getBacklinks: (id)            => ipcRenderer.invoke('notes:getBacklinks', id),
    createFolder: (name)          => ipcRenderer.invoke('notes:create-folder', name),
    move: (noteId, newParentId, orderIndex) =>
            ipcRenderer.invoke('notes:move', noteId, newParentId, orderIndex),
  },
  search: {
    query: (q) => ipcRenderer.invoke('search:query', q),
  },
}

contextBridge.exposeInMainWorld('owl', owl)
```

- [ ] **Step 3: Update renderer ipc.ts**

Replace `src/renderer/lib/ipc.ts`:

```typescript
// src/renderer/lib/ipc.ts
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from '@shared/types/Note'

export const ipc = {
  vault: {
    open:        (path: string):  Promise<VaultConfig>       => window.owl.vault.open(path),
    create:      (name: string):  Promise<VaultConfig>       => window.owl.vault.create(name),
    activate:    (path: string):  Promise<VaultConfig>       => window.owl.vault.activate(path),
    listKnown:   ():              Promise<VaultConfig[]>      => window.owl.vault.listKnown(),
    getLast:     ():              Promise<string | null>      => window.owl.vault.getLast(),
    getSessions: ():              Promise<VaultConfig[]>      => window.owl.vault.getSessions(),
    getConfig:   ():              Promise<VaultConfig | null> => window.owl.vault.getConfig(),
  },
  notes: {
    list:         (): Promise<Note[]>                    => window.owl.notes.list(),
    read:         (id: string): Promise<NoteContent>    => window.owl.notes.read(id),
    save:         (id: string, md: string): Promise<Note> => window.owl.notes.save(id, md),
    create:       (title: string, folder: string): Promise<NoteContent> =>
                    window.owl.notes.create(title, folder),
    delete:       (id: string): Promise<void>           => window.owl.notes.delete(id),
    getBacklinks: (id: string): Promise<BacklinkResult[]> =>
                    window.owl.notes.getBacklinks(id),
    createFolder: (name: string): Promise<Note>         => window.owl.notes.createFolder(name),
    move: (noteId: string, newParentId: string | null, orderIndex: number): Promise<void> =>
            window.owl.notes.move(noteId, newParentId, orderIndex),
  },
  search: {
    query: (q: string): Promise<SearchResult[]> => window.owl.search.query(q),
  },
}
```

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: `Tests 71 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/notes.ts src/preload/index.ts src/renderer/lib/ipc.ts
git commit -m "feat: notes:create-folder and notes:move IPC handlers + preload + ipc.ts"
```

---

### Task 3: tabStore

**Files:**
- Create: `src/renderer/stores/tabStore.ts`
- Create: `tests/renderer/stores/tabStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/stores/tabStore.test.ts`:

```typescript
// tests/renderer/stores/tabStore.test.ts
import { beforeEach, describe, it, expect } from 'vitest'
import { useTabStore } from '../../../src/renderer/stores/tabStore'

beforeEach(() => {
  useTabStore.setState({ tabs: [], activeTabId: null })
})

describe('openTab', () => {
  it('creates a new tab and makes it active', () => {
    useTabStore.getState().openTab('note-1', 'Note 1')
    const { tabs, activeTabId } = useTabStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0].noteId).toBe('note-1')
    expect(tabs[0].markdown).toBeNull()
    expect(activeTabId).toBe(tabs[0].id)
  })

  it('deduplicates: opening the same note twice activates the existing tab', () => {
    useTabStore.getState().openTab('note-1', 'Note 1')
    const firstId = useTabStore.getState().activeTabId
    useTabStore.getState().openTab('note-1', 'Note 1')
    expect(useTabStore.getState().tabs).toHaveLength(1)
    expect(useTabStore.getState().activeTabId).toBe(firstId)
  })

  it('opens multiple different notes as separate tabs', () => {
    useTabStore.getState().openTab('note-1', 'N1')
    useTabStore.getState().openTab('note-2', 'N2')
    expect(useTabStore.getState().tabs).toHaveLength(2)
  })
})

describe('closeTab', () => {
  it('removes the tab and sets activeTabId to null when last tab', () => {
    useTabStore.getState().openTab('note-1', 'N1')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().closeTab(tabId)
    expect(useTabStore.getState().tabs).toHaveLength(0)
    expect(useTabStore.getState().activeTabId).toBeNull()
  })

  it('activates the previous tab when the active tab is closed', () => {
    useTabStore.getState().openTab('note-1', 'N1')
    useTabStore.getState().openTab('note-2', 'N2')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().closeTab(tabs[1].id)
    expect(useTabStore.getState().tabs).toHaveLength(1)
    expect(useTabStore.getState().activeTabId).toBe(tabs[0].id)
  })

  it('activates the next tab when closing the first tab', () => {
    useTabStore.getState().openTab('note-1', 'N1')
    useTabStore.getState().openTab('note-2', 'N2')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().activateTab(tabs[0].id)
    useTabStore.getState().closeTab(tabs[0].id)
    expect(useTabStore.getState().activeTabId).toBe(tabs[1].id)
  })
})

describe('nextTab / prevTab', () => {
  it('cycles forward, wrapping from last to first', () => {
    useTabStore.getState().openTab('n1', 'N1')
    useTabStore.getState().openTab('n2', 'N2')
    useTabStore.getState().openTab('n3', 'N3')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().activateTab(tabs[2].id)
    useTabStore.getState().nextTab()
    expect(useTabStore.getState().activeTabId).toBe(tabs[0].id)
  })

  it('cycles backward, wrapping from first to last', () => {
    useTabStore.getState().openTab('n1', 'N1')
    useTabStore.getState().openTab('n2', 'N2')
    useTabStore.getState().openTab('n3', 'N3')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().activateTab(tabs[0].id)
    useTabStore.getState().prevTab()
    expect(useTabStore.getState().activeTabId).toBe(tabs[2].id)
  })

  it('does nothing with fewer than 2 tabs', () => {
    useTabStore.getState().openTab('n1', 'N1')
    const before = useTabStore.getState().activeTabId
    useTabStore.getState().nextTab()
    expect(useTabStore.getState().activeTabId).toBe(before)
  })
})

describe('updateTabContent + markTabClean', () => {
  it('caches markdown and frontmatter in the tab', () => {
    useTabStore.getState().openTab('n1', 'N1')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().updateTabContent(tabId, '# Hello', { author: 'me' }, true)
    const tab = useTabStore.getState().tabs[0]
    expect(tab.markdown).toBe('# Hello')
    expect(tab.frontmatter).toEqual({ author: 'me' })
    expect(tab.isDirty).toBe(true)
  })

  it('cache survives switching away and back', () => {
    useTabStore.getState().openTab('n1', 'N1')
    useTabStore.getState().openTab('n2', 'N2')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().activateTab(tabs[0].id)
    useTabStore.getState().updateTabContent(tabs[0].id, '# Cached', {}, false)
    useTabStore.getState().activateTab(tabs[1].id)
    useTabStore.getState().activateTab(tabs[0].id)
    const tab = useTabStore.getState().tabs.find(t => t.id === tabs[0].id)!
    expect(tab.markdown).toBe('# Cached')
  })

  it('markTabClean sets isDirty to false', () => {
    useTabStore.getState().openTab('n1', 'N1')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().updateTabContent(tabId, '# Hi', {}, true)
    useTabStore.getState().markTabClean(tabId)
    expect(useTabStore.getState().tabs[0].isDirty).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test 2>&1 | grep -E "FAIL|Cannot find"
```

Expected: FAIL — `tabStore` module not found.

- [ ] **Step 3: Implement tabStore**

Create `src/renderer/stores/tabStore.ts`:

```typescript
// src/renderer/stores/tabStore.ts
import { create } from 'zustand'
import type { Frontmatter } from '../lib/markdown'

export interface Tab {
  id: string            // UUID — tab identity, not note identity
  noteId: string
  title: string
  isDirty: boolean
  markdown: string | null       // null = not yet loaded from disk
  frontmatter: Frontmatter | null
}

interface TabStore {
  tabs: Tab[]
  activeTabId: string | null
  openTab:          (noteId: string, title: string) => void
  closeTab:         (tabId: string) => void
  activateTab:      (tabId: string) => void
  updateTabContent: (tabId: string, markdown: string, frontmatter: Frontmatter, isDirty: boolean) => void
  markTabClean:     (tabId: string) => void
  nextTab:          () => void
  prevTab:          () => void
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (noteId, title) => {
    const existing = get().tabs.find(t => t.noteId === noteId)
    if (existing) { get().activateTab(existing.id); return }
    const id = crypto.randomUUID()
    set(s => ({
      tabs: [...s.tabs, { id, noteId, title, isDirty: false, markdown: null, frontmatter: null }],
    }))
    get().activateTab(id)
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex(t => t.id === tabId)
    if (idx === -1) return
    const remaining = tabs.filter(t => t.id !== tabId)
    let nextActive: string | null = null
    if (activeTabId === tabId && remaining.length > 0) {
      nextActive = (remaining[idx - 1] ?? remaining[idx])?.id ?? null
    } else if (activeTabId !== tabId) {
      nextActive = activeTabId
    }
    set({ tabs: remaining, activeTabId: nextActive })
  },

  activateTab: (tabId) => set({ activeTabId: tabId }),

  updateTabContent: (tabId, markdown, frontmatter, isDirty) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, markdown, frontmatter, isDirty } : t),
    }))
  },

  markTabClean: (tabId) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, isDirty: false } : t),
    }))
  },

  nextTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length < 2) return
    const idx = tabs.findIndex(t => t.id === activeTabId)
    get().activateTab(tabs[(idx + 1) % tabs.length].id)
  },

  prevTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length < 2) return
    const idx = tabs.findIndex(t => t.id === activeTabId)
    get().activateTab(tabs[(idx - 1 + tabs.length) % tabs.length].id)
  },
}))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test 2>&1 | tail -6
```

Expected: `Test Files  12 passed`, `Tests  82 passed` (71 + 11 new tabStore tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/tabStore.ts tests/renderer/stores/tabStore.test.ts
git commit -m "feat: tabStore — per-tab state cache with open/close/cycle/dirty tracking"
```

---

### Task 4: editorStore ↔ tabStore integration

**Files:**
- Modify: `src/renderer/stores/editorStore.ts`

- [ ] **Step 1: Replace editorStore**

Replace `src/renderer/stores/editorStore.ts`:

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
  loadNote:       (id: string) => Promise<void>
  restoreTab:     (markdown: string, frontmatter: Frontmatter, isDirty: boolean, note: Note | null) => void
  unloadNote:     () => void
  setMarkdown:    (md: string) => void
  setFrontmatter: (fm: Frontmatter) => void
  save:           () => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  note:        null,
  markdown:    '',
  frontmatter: {},
  isDirty:     false,
  saveStatus:  'idle',

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
    set({ note: null, markdown: '', frontmatter: {}, isDirty: false, saveStatus: 'idle' })
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
}))
```

- [ ] **Step 2: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: `Tests 82 passed`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stores/editorStore.ts
git commit -m "feat: editorStore syncs with tabStore on load/change/save; adds restoreTab + unloadNote"
```

---

### Task 5: TabBar component

**Files:**
- Create: `src/renderer/components/editor/TabBar.tsx`
- Create: `src/renderer/components/editor/TabBar.module.css`

- [ ] **Step 1: Create TabBar.tsx**

Create `src/renderer/components/editor/TabBar.tsx`:

```typescript
// src/renderer/components/editor/TabBar.tsx
import React from 'react'
import { useTabStore } from '../../stores/tabStore'
import { useVaultStore } from '../../stores/vaultStore'
import { ipc } from '../../lib/ipc'
import styles from './TabBar.module.css'

export function TabBar(): JSX.Element {
  const tabs        = useTabStore(s => s.tabs)
  const activeTabId = useTabStore(s => s.activeTabId)
  const activateTab = useTabStore(s => s.activateTab)
  const closeTab    = useTabStore(s => s.closeTab)
  const openTab     = useTabStore(s => s.openTab)
  const loadNotes   = useVaultStore(s => s.loadNotes)

  const handleNew = async (): Promise<void> => {
    const title = `Untitled ${new Date().toLocaleDateString()}`
    const { note } = await ipc.notes.create(title, '')
    await loadNotes()
    openTab(note.id, note.title)
  }

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabList}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
            onClick={() => activateTab(tab.id)}
          >
            <span className={styles.tabTitle}>{tab.title}</span>
            {tab.isDirty && <span className={styles.tabDirty}>●</span>}
            <span
              className={styles.tabClose}
              role="button"
              onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      <button className={styles.tabNew} onClick={handleNew} title="New note">+</button>
    </div>
  )
}
```

- [ ] **Step 2: Create TabBar.module.css**

Create `src/renderer/components/editor/TabBar.module.css`:

```css
/* src/renderer/components/editor/TabBar.module.css */

.tabBar {
  display: flex;
  align-items: stretch;
  height: 32px;
  background: rgba(4, 9, 18, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  overflow: hidden;
}

.tabList {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: none;
}
.tabList::-webkit-scrollbar { display: none; }

.tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  font-size: 11px;
  font-family: inherit;
  color: rgba(255, 255, 255, 0.4);
  background: transparent;
  border: none;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.1s, color 0.1s;
}
.tab:hover { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.7); }

.tabActive {
  background: rgba(56, 182, 220, 0.1);
  color: rgba(56, 182, 220, 0.9);
  border-bottom: 2px solid rgba(56, 182, 220, 0.6);
}

.tabTitle { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.tabDirty { color: rgba(56, 182, 220, 0.7); font-size: 9px; flex-shrink: 0; }

.tabClose {
  font-size: 14px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.2);
  padding: 0 2px;
  border-radius: 3px;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
}
.tabClose:hover { background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.8); }

.tabNew {
  padding: 0 12px;
  font-size: 16px;
  line-height: 1;
  font-family: inherit;
  color: rgba(255, 255, 255, 0.3);
  background: transparent;
  border: none;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: color 0.1s, background 0.1s;
  flex-shrink: 0;
}
.tabNew:hover { color: rgba(255, 255, 255, 0.7); background: rgba(255, 255, 255, 0.05); }
```

- [ ] **Step 3: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: `Tests 82 passed`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/editor/TabBar.tsx src/renderer/components/editor/TabBar.module.css
git commit -m "feat: TabBar component — tabs with dirty indicator, close button, new note button"
```

---

### Task 6: NoteEditor integrates TabBar + tab activation; LeftSidebar opens tabs

**Files:**
- Modify: `src/renderer/components/editor/NoteEditor.tsx`
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`

- [ ] **Step 1: Update NoteEditor**

Replace `src/renderer/components/editor/NoteEditor.tsx`:

```typescript
// src/renderer/components/editor/NoteEditor.tsx
import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/WikiLink'
import { Callout } from './extensions/Callout'
import { SlashCommand } from './extensions/SlashCommand'
import { TabBar } from './TabBar'
import { useEditorStore } from '../../stores/editorStore'
import { useTabStore } from '../../stores/tabStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { extractHeadings } from '../../lib/markdown'
import styles from './NoteEditor.module.css'

const AUTOSAVE_MS = 1500

export function NoteEditor(): JSX.Element {
  const note        = useEditorStore(s => s.note)
  const markdown    = useEditorStore(s => s.markdown)
  const isDirty     = useEditorStore(s => s.isDirty)
  const saveStatus  = useEditorStore(s => s.saveStatus)
  const setMarkdown = useEditorStore(s => s.setMarkdown)
  const save        = useEditorStore(s => s.save)
  const restoreTab  = useEditorStore(s => s.restoreTab)
  const unloadNote  = useEditorStore(s => s.unloadNote)
  const loadNote    = useEditorStore(s => s.loadNote)
  const setHeadings = useRightPanelStore(s => s.setHeadings)
  const activeTabId = useTabStore(s => s.activeTabId)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When the active tab changes: restore from cache or load from disk
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
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Callout,
      SlashCommand,
    ],
    content: markdown,
    onUpdate: ({ editor }) => {
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
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
        save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }, [])

  const statusLabel =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? '✓ Saved' :
    saveStatus === 'error'  ? '✗ Save failed' :
    isDirty ? '●' : ''

  const statusClass = saveStatus !== 'idle' ? styles[saveStatus] : isDirty ? styles.dirty : ''

  return (
    <div className={styles.root}>
      <TabBar />
      {note ? (
        <>
          <div className={styles.toolbar}>
            <span className={`${styles.saveStatus} ${statusClass}`}>{statusLabel}</span>
          </div>
          <div className={styles.editorWrap}>
            <EditorContent editor={editor} />
          </div>
        </>
      ) : (
        <div className={styles.empty}>Open a note or create a new one</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update LeftSidebar to call openTab (static tree, pre-dnd)**

Replace `src/renderer/components/layout/LeftSidebar.tsx`:

```typescript
// src/renderer/components/layout/LeftSidebar.tsx
import React, { useCallback } from 'react'
import { useVaultStore } from '../../stores/vaultStore'
import { useTabStore } from '../../stores/tabStore'
import { ipc } from '../../lib/ipc'
import styles from './LeftSidebar.module.css'
import type { Note } from '@shared/types/Note'

export function LeftSidebar(): JSX.Element {
  const notes        = useVaultStore(s => s.notes)
  const loadNotes    = useVaultStore(s => s.loadNotes)
  const createFolder = useVaultStore(s => s.createFolder)
  const openTab      = useTabStore(s => s.openTab)
  const tabs         = useTabStore(s => s.tabs)
  const activeTabId  = useTabStore(s => s.activeTabId)

  const activeNoteId = tabs.find(t => t.id === activeTabId)?.noteId ?? null

  const openNote = useCallback((note: Note) => {
    openTab(note.id, note.title)
  }, [openTab])

  const createNote = useCallback(async () => {
    const title = `Untitled ${new Date().toLocaleDateString()}`
    const { note } = await ipc.notes.create(title, '')
    await loadNotes()
    openTab(note.id, note.title)
  }, [loadNotes, openTab])

  const handleNewFolder = useCallback(async () => {
    const name = `New Parent Knowledge Base ${Date.now().toString().slice(-4)}`
    await createFolder(name)
  }, [createFolder])

  const folders   = notes.filter(n => n.noteType === 'folder').sort((a, b) => a.orderIndex - b.orderIndex)
  const rootNotes = notes.filter(n => n.noteType !== 'folder' && !n.parentId).sort((a, b) => a.orderIndex - b.orderIndex)

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <span>All Notes</span>
        <div className={styles.headerActions}>
          <button className={styles.addButton} onClick={createNote} title="Child Knowledge Base">+</button>
          <button className={styles.addButton} onClick={handleNewFolder} title="New Parent Knowledge Base">📁</button>
        </div>
      </div>
      <div className={styles.noteList}>
        {folders.map(folder => {
          const children = notes
            .filter(n => n.noteType !== 'folder' && n.parentId === folder.id)
            .sort((a, b) => a.orderIndex - b.orderIndex)
          return (
            <FolderRow key={folder.id} folder={folder}>
              {children.map(n => (
                <NoteRow key={n.id} note={n} active={n.id === activeNoteId} indent onClick={() => openNote(n)} />
              ))}
            </FolderRow>
          )
        })}
        {rootNotes.map(n => (
          <NoteRow key={n.id} note={n} active={n.id === activeNoteId} indent={false} onClick={() => openNote(n)} />
        ))}
      </div>
    </div>
  )
}

function FolderRow({ folder, children }: { folder: Note; children: React.ReactNode }): JSX.Element {
  const [expanded, setExpanded] = React.useState(true)
  return (
    <div className={styles.folderGroup}>
      <button className={styles.folderRow} onClick={() => setExpanded(e => !e)}>
        <span className={styles.folderArrow}>{expanded ? '▼' : '▶'}</span>
        <span className={styles.folderIcon}>📁</span>
        <span className={styles.title}>{folder.title}</span>
      </button>
      {expanded && <div className={styles.folderChildren}>{children}</div>}
    </div>
  )
}

function NoteRow({ note, active, indent, onClick }: {
  note: Note; active: boolean; indent: boolean; onClick: () => void
}): JSX.Element {
  return (
    <button
      className={`${styles.noteItem} ${active ? styles.active : ''} ${indent ? styles.indented : ''}`}
      onClick={onClick}
    >
      <span className={styles.icon}>📄</span>
      <span className={styles.title}>{note.title}</span>
    </button>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: `Tests 82 passed`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/editor/NoteEditor.tsx src/renderer/components/layout/LeftSidebar.tsx
git commit -m "feat: NoteEditor renders TabBar + tab activation effect; LeftSidebar uses tabStore"
```

---

### Task 7: vaultStore — camelCase normalization + createFolder

**Files:**
- Modify: `src/renderer/stores/vaultStore.ts`

- [ ] **Step 1: Update vaultStore**

Replace `src/renderer/stores/vaultStore.ts`:

```typescript
// src/renderer/stores/vaultStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Note, VaultConfig } from '@shared/types/Note'

function normalizeNote(raw: unknown): Note {
  const r = raw as Record<string, unknown>
  return {
    id:          r.id          as string,
    path:        (r.path       ?? '') as string,
    title:       (r.title      ?? '') as string,
    contentHash: (r.content_hash ?? r.contentHash ?? '') as string,
    createdAt:   (r.created_at  ?? r.createdAt  ?? 0)    as number,
    updatedAt:   (r.updated_at  ?? r.updatedAt  ?? 0)    as number,
    parentId:    (r.parent_id   ?? r.parentId   ?? null) as string | null,
    folderPath:  (r.folder_path ?? r.folderPath ?? '')   as string,
    noteType:    (r.note_type   ?? r.noteType   ?? 'note') as Note['noteType'],
    orderIndex:  (r.order_index ?? r.orderIndex ?? 0)    as number,
  }
}

interface VaultState {
  config:        VaultConfig | null
  openedConfigs: VaultConfig[]
  notes:         Note[]
  pinnedIds:     string[]
  recentIds:     string[]
  openNoteId:    string | null
  openVault:     (path: string) => Promise<void>
  createVault:   (name: string) => Promise<void>
  activateVault: (path: string) => Promise<void>
  loadNotes:     () => Promise<void>
  loadSessions:  () => Promise<void>
  setOpenNote:   (id: string) => void
  pinNote:       (id: string) => void
  unpinNote:     (id: string) => void
  addRecent:     (id: string) => void
  createFolder:  (name: string) => Promise<void>
}

export const useVaultStore = create<VaultState>((set, get) => ({
  config:        null,
  openedConfigs: [],
  notes:         [],
  pinnedIds:     [],
  recentIds:     [],
  openNoteId:    null,

  openVault: async (path) => {
    const config = await ipc.vault.open(path)
    set({ config })
    await get().loadNotes()
    await get().loadSessions()
  },

  createVault: async (name) => {
    const config = await ipc.vault.create(name)
    set({ config })
    await get().loadNotes()
    await get().loadSessions()
  },

  activateVault: async (path) => {
    const config = await ipc.vault.activate(path)
    set({ config })
    await get().loadNotes()
    await get().loadSessions()
  },

  loadNotes: async () => {
    const raw = await ipc.notes.list()
    set({ notes: raw.map(normalizeNote) })
  },

  loadSessions: async () => {
    const openedConfigs = await ipc.vault.getSessions()
    set({ openedConfigs })
  },

  setOpenNote: (id) => {
    set({ openNoteId: id })
    get().addRecent(id)
  },

  createFolder: async (name) => {
    await ipc.notes.createFolder(name)
    await get().loadNotes()
  },

  pinNote:   (id) => set(s => ({ pinnedIds: s.pinnedIds.includes(id) ? s.pinnedIds : [...s.pinnedIds, id] })),
  unpinNote: (id) => set(s => ({ pinnedIds: s.pinnedIds.filter(p => p !== id) })),
  addRecent: (id) => set(s => ({ recentIds: [id, ...s.recentIds.filter(r => r !== id)].slice(0, 10) })),
}))
```

- [ ] **Step 2: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: `Tests 82 passed`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stores/vaultStore.ts
git commit -m "feat: vaultStore normalizes DB snake_case to camelCase; adds createFolder action"
```

---

### Task 8: LeftSidebar tree styles

**Files:**
- Modify: `src/renderer/components/layout/LeftSidebar.module.css`

- [ ] **Step 1: Update CSS**

Replace `src/renderer/components/layout/LeftSidebar.module.css`:

```css
/* src/renderer/components/layout/LeftSidebar.module.css */

.root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.section {
  padding: 10px 8px 4px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.2);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.headerActions { display: flex; align-items: center; gap: 2px; }

.addButton {
  background: none; border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer; font-size: 14px; padding: 0 4px;
  border-radius: 3px; transition: color 0.15s, background 0.15s;
}
.addButton:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }

.noteList { flex: 1; overflow-y: auto; padding: 0 4px; }
.noteList::-webkit-scrollbar { width: 4px; }
.noteList::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

/* ── Folder rows ── */

.folderGroup { margin-bottom: 2px; }

.folderRow {
  display: flex; align-items: center; gap: 5px;
  width: 100%; padding: 5px 8px; border-radius: 6px;
  cursor: pointer; font-size: 12px; color: rgba(255,255,255,0.55);
  background: none; border: none; text-align: left;
  transition: background 0.1s, color 0.1s;
}
.folderRow:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.85); }

.folderArrow { font-size: 8px; color: rgba(255,255,255,0.25); flex-shrink: 0; width: 10px; }
.folderIcon  { font-size: 12px; flex-shrink: 0; }
.folderChildren { padding-left: 8px; }

/* ── Note rows ── */

.noteItem {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: 6px; margin: 1px 0;
  cursor: pointer; font-size: 12px; color: rgba(255,255,255,0.5);
  transition: background 0.1s, color 0.1s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border: none; background: none; width: 100%; text-align: left;
}
.noteItem:hover  { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
.noteItem.active { background: rgba(56,182,220,0.15); color: #72d4f0; }
.noteItem.indented { padding-left: 14px; }

.icon  { font-size: 12px; flex-shrink: 0; opacity: 0.7; }
.title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.divider { height: 1px; background: rgba(255,255,255,0.05); margin: 6px 8px; }

/* ── Drag states ── */
.dragging   { opacity: 0.35; }
.dropTarget {
  background: rgba(56,182,220,0.1);
  outline: 1px dashed rgba(56,182,220,0.4);
  border-radius: 6px;
}
```

- [ ] **Step 2: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: `Tests 82 passed`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/LeftSidebar.module.css
git commit -m "feat: sidebar tree styles — folder rows, indented notes, drag state classes"
```

---

### Task 9: Install dnd-kit + drag-and-drop sidebar

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`

- [ ] **Step 1: Install dnd-kit**

```bash
cd /home/device/Documents/owl.md && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added, no peer dep errors.

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
npm test 2>&1 | tail -5
```

Expected: `Tests 82 passed`.

- [ ] **Step 3: Replace LeftSidebar with drag-and-drop version**

Replace `src/renderer/components/layout/LeftSidebar.tsx`:

```typescript
// src/renderer/components/layout/LeftSidebar.tsx
import React, { useCallback, useState } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  closestCenter, DragOverlay,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useVaultStore } from '../../stores/vaultStore'
import { useTabStore } from '../../stores/tabStore'
import { ipc } from '../../lib/ipc'
import styles from './LeftSidebar.module.css'
import type { Note } from '@shared/types/Note'

// ─── Sortable note row ───────────────────────────────────────────────────────

function SortableNoteRow({ note, active, indent, onClick }: {
  note: Note; active: boolean; indent: boolean; onClick: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.id, data: { type: 'note', parentId: note.parentId ?? null } })

  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className={`${styles.noteItem} ${active ? styles.active : ''} ${indent ? styles.indented : ''}`}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <span className={styles.icon}>📄</span>
      <span className={styles.title}>{note.title}</span>
    </button>
  )
}

// ─── Sortable folder row ─────────────────────────────────────────────────────

function SortableFolderRow({ folder, isOver, children }: {
  folder: Note; isOver: boolean; children: React.ReactNode
}): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.id, data: { type: 'folder' } })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className={`${styles.folderGroup} ${isOver ? styles.dropTarget : ''}`}
    >
      <button
        className={styles.folderRow}
        onClick={() => setExpanded(e => !e)}
        {...attributes}
        {...listeners}
      >
        <span className={styles.folderArrow}>{expanded ? '▼' : '▶'}</span>
        <span className={styles.folderIcon}>📁</span>
        <span className={styles.title}>{folder.title}</span>
      </button>
      {expanded && <div className={styles.folderChildren}>{children}</div>}
    </div>
  )
}

// ─── Main sidebar ────────────────────────────────────────────────────────────

export function LeftSidebar(): JSX.Element {
  const notes        = useVaultStore(s => s.notes)
  const loadNotes    = useVaultStore(s => s.loadNotes)
  const createFolder = useVaultStore(s => s.createFolder)
  const openTab      = useTabStore(s => s.openTab)
  const tabs         = useTabStore(s => s.tabs)
  const activeTabId  = useTabStore(s => s.activeTabId)
  const [overFolderId, setOverFolderId] = useState<string | null>(null)
  const [dragId, setDragId]             = useState<string | null>(null)

  const activeNoteId = tabs.find(t => t.id === activeTabId)?.noteId ?? null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const openNote = useCallback((note: Note) => {
    openTab(note.id, note.title)
  }, [openTab])

  const createNote = useCallback(async () => {
    const title = `Untitled ${new Date().toLocaleDateString()}`
    const { note } = await ipc.notes.create(title, '')
    await loadNotes()
    openTab(note.id, note.title)
  }, [loadNotes, openTab])

  const handleNewFolder = useCallback(async () => {
    const name = `New Parent Knowledge Base ${Date.now().toString().slice(-4)}`
    await createFolder(name)
  }, [createFolder])

  const folders   = notes.filter(n => n.noteType === 'folder').sort((a, b) => a.orderIndex - b.orderIndex)
  const rootNotes = notes.filter(n => n.noteType !== 'folder' && !n.parentId).sort((a, b) => a.orderIndex - b.orderIndex)

  function handleDragStart(event: DragStartEvent): void {
    setDragId(event.active.id as string)
  }

  function handleDragOver(event: DragOverEvent): void {
    const overData = event.over?.data.current as { type?: string } | undefined
    setOverFolderId(overData?.type === 'folder' ? (event.over!.id as string) : null)
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    setDragId(null)
    setOverFolderId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeData = active.data.current as { type: string; parentId: string | null }
    const overData   = over.data.current   as { type: string; parentId?: string | null } | undefined

    if (activeData.type === 'folder') {
      // Reorder folders among themselves
      const ids = folders.map(f => f.id)
      const oldIdx = ids.indexOf(active.id as string)
      const newIdx = ids.indexOf(over.id as string)
      if (oldIdx !== -1 && newIdx !== -1) {
        const reordered = arrayMove(ids, oldIdx, newIdx)
        await Promise.all(reordered.map((id, idx) => ipc.notes.move(id, null, idx)))
        await loadNotes()
      }
      return
    }

    if (activeData.type === 'note') {
      const overIsFolder  = overData?.type === 'folder'
      const newParentId: string | null = overIsFolder
        ? (over.id as string)
        : (overData?.parentId ?? null)
      const currentParentId = activeData.parentId

      if (currentParentId !== newParentId) {
        // Move note to a different parent (nest into folder or lift to root)
        const siblings = notes
          .filter(n => n.noteType !== 'folder' && n.parentId === newParentId)
          .sort((a, b) => a.orderIndex - b.orderIndex)
        await ipc.notes.move(active.id as string, newParentId, siblings.length)
      } else {
        // Reorder within the same parent
        const container = notes
          .filter(n => n.noteType !== 'folder' && n.parentId === currentParentId)
          .sort((a, b) => a.orderIndex - b.orderIndex)
        const ids = container.map(n => n.id)
        const oldIdx = ids.indexOf(active.id as string)
        const newIdx = ids.indexOf(over.id as string)
        if (oldIdx !== -1 && newIdx !== -1) {
          const reordered = arrayMove(ids, oldIdx, newIdx)
          await Promise.all(reordered.map((id, idx) => ipc.notes.move(id, currentParentId, idx)))
        }
      }
      await loadNotes()
    }
  }

  const dragItem = dragId ? notes.find(n => n.id === dragId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.root}>
        <div className={styles.section}>
          <span>All Notes</span>
          <div className={styles.headerActions}>
            <button className={styles.addButton} onClick={createNote} title="Child Knowledge Base">+</button>
            <button className={styles.addButton} onClick={handleNewFolder} title="New Parent Knowledge Base">📁</button>
          </div>
        </div>
        <div className={styles.noteList}>
          <SortableContext items={folders.map(f => f.id)} strategy={verticalListSortingStrategy}>
            {folders.map(folder => {
              const children = notes
                .filter(n => n.noteType !== 'folder' && n.parentId === folder.id)
                .sort((a, b) => a.orderIndex - b.orderIndex)
              return (
                <SortableFolderRow
                  key={folder.id}
                  folder={folder}
                  isOver={overFolderId === folder.id}
                >
                  <SortableContext items={children.map(n => n.id)} strategy={verticalListSortingStrategy}>
                    {children.map(n => (
                      <SortableNoteRow
                        key={n.id}
                        note={n}
                        active={n.id === activeNoteId}
                        indent
                        onClick={() => openNote(n)}
                      />
                    ))}
                  </SortableContext>
                </SortableFolderRow>
              )
            })}
          </SortableContext>

          <SortableContext items={rootNotes.map(n => n.id)} strategy={verticalListSortingStrategy}>
            {rootNotes.map(n => (
              <SortableNoteRow
                key={n.id}
                note={n}
                active={n.id === activeNoteId}
                indent={false}
                onClick={() => openNote(n)}
              />
            ))}
          </SortableContext>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragItem
          ? <div style={{ padding: '4px 10px', background: 'rgba(56,182,220,0.15)', borderRadius: 6, fontSize: 12, color: 'rgba(56,182,220,0.9)', pointerEvents: 'none' }}>{dragItem.title}</div>
          : null
        }
      </DragOverlay>
    </DndContext>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: `Tests 82 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/layout/LeftSidebar.tsx package.json package-lock.json
git commit -m "feat: drag-and-drop sidebar — nest notes into Parent Knowledge Bases, reorder"
```

---

### Task 10: AppShell keyboard shortcuts

**Files:**
- Modify: `src/renderer/components/layout/AppShell.tsx`

- [ ] **Step 1: Update AppShell**

Replace `src/renderer/components/layout/AppShell.tsx`:

```typescript
// src/renderer/components/layout/AppShell.tsx
import React, { useEffect, useCallback } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
import { useTabStore } from '../../stores/tabStore'
import { MenuBar } from './MenuBar'
import { CommandPalette } from '../command/CommandPalette'
import { VaultManagerModal } from '../vault/VaultManagerModal'
import styles from './AppShell.module.css'

interface AppShellProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  rightPanel: React.ReactNode
}

export function AppShell({ sidebar, children, rightPanel }: AppShellProps): JSX.Element {
  const openSearch    = useSearchStore(s => s.open)
  const openPalette   = useCommandPaletteStore(s => s.open)
  const openedConfigs = useVaultStore(s => s.openedConfigs)
  const activateVault = useVaultStore(s => s.activateVault)
  const activeConfig  = useVaultStore(s => s.config)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === 'f') { e.preventDefault(); openSearch() }
    if (mod && e.key === 'k') { e.preventDefault(); openPalette() }
    if (mod && e.key === 'w') {
      e.preventDefault()
      const { activeTabId, closeTab } = useTabStore.getState()
      if (activeTabId) closeTab(activeTabId)
    }
    if (mod && e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        useTabStore.getState().prevTab()
      } else {
        useTabStore.getState().nextTab()
      }
    }
  }, [openSearch, openPalette])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={styles.root}>
      <div className={styles.titlebar}>
        <div className={styles.titlebarLeft}>
          <div className={styles.titlebarDot} />
          {openedConfigs.length > 1
            ? (
              <div className={styles.vaultSwitcher}>
                {openedConfigs.map(v => (
                  <button
                    key={v.path}
                    className={`${styles.vaultTab} ${v.path === activeConfig?.path ? styles.vaultTabActive : ''}`}
                    onClick={() => activateVault(v.path)}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )
            : <span className={styles.titleName}>{activeConfig?.name ?? 'owl.md'}</span>
          }
        </div>
        <div className={styles.titlebarCenter} />
        <div className={styles.titlebarRight}>
          <button className={styles.searchShortcut} onClick={openSearch}>⌘F</button>
        </div>
      </div>
      <MenuBar />
      <div className={styles.body}>
        <div className={styles.sidebarLeft}>{sidebar}</div>
        <div className={styles.editorArea}>{children}</div>
        <div className={styles.sidebarRight}>{rightPanel}</div>
      </div>
      <CommandPalette />
      <VaultManagerModal />
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test 2>&1 | tail -8
```

Expected: `Test Files  12 passed (12)`, `Tests  82 passed (82)`.

- [ ] **Step 3: Final commit**

```bash
git add src/renderer/components/layout/AppShell.tsx
git commit -m "feat: Ctrl+W close tab, Ctrl+Tab/Ctrl+Shift+Tab cycle tabs — Phase 2B complete"
```

---

## Self-Review

**Spec coverage:**
- ✅ Browser-style tab bar above editor — TabBar in NoteEditor (Task 5, 6)
- ✅ Every note click opens a new tab (dedup on same noteId) — tabStore.openTab (Task 3, 6)
- ✅ Unsaved edits survive tab switch — per-tab markdown/frontmatter cache; restoreTab (Task 3, 4)
- ✅ Tab dirty indicator (●) and close button (×) — TabBar (Task 5)
- ✅ Parent Knowledge Bases (note_type='folder', no file on disk) — notes:create-folder (Task 2)
- ✅ Child Knowledge Bases (notes with parent_id) — notes:move (Task 2)
- ✅ Expand/collapse folders — FolderRow local state (Task 6, 8, 9)
- ✅ Drag note into folder — DragEnd cross-container (Task 9)
- ✅ Drag note to root (newParentId=null) — DragEnd cross-container (Task 9)
- ✅ Reorder notes within folder — DragEnd same-container arrayMove (Task 9)
- ✅ Reorder folders — DragEnd folder type arrayMove (Task 9)
- ✅ New Parent Knowledge Base button — handleNewFolder (Task 6, 8, 9)
- ✅ Ctrl+W close tab — AppShell handleKeyDown (Task 10)
- ✅ Ctrl+Tab / Ctrl+Shift+Tab cycle — AppShell handleKeyDown (Task 10)
- ✅ order_index schema column — migration 002 (Task 1)
- ✅ camelCase normalisation — vaultStore normalizeNote (Task 7)

**Type consistency:**
- `Tab.markdown: string | null` — checked as `!== null` consistently ✓
- `restoreTab(markdown, frontmatter, isDirty, note)` — 4-param signature matches editorStore definition and NoteEditor call ✓
- `ipc.notes.move(noteId, newParentId, orderIndex)` — 3 params match IPC.ts, preload, and ipc.ts ✓
- `useTabStore.getState()` used in AppShell outside React render — correct Zustand pattern for event handlers ✓
- `SortableNoteRow` passes `note.parentId ?? null` (the DB returns `note_type` as null for root notes; after normalizeNote this is correctly `null`) ✓
