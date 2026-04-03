# owl.md Phase 1 — Core Local Vault & Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working local-first Electron note-taking app with vault management, TipTap markdown editor, `[[wiki links]]`, backlink indexing, FTS5 full-text search, and the Aurora glass UI.

**Architecture:** Electron main process owns all file/database I/O via typed IPC handlers. React renderer owns UI state via Zustand stores. Notes are plain `.md` files; `.owl/db.sqlite` is a derived index that can be deleted and rebuilt. The `window.owl` contextBridge is the only connection between processes.

**Tech Stack:** Electron 30, React 18 + TypeScript 5, TipTap 2 + `tiptap-markdown`, Zustand 4, better-sqlite3 (FTS5), chokidar 3, electron-vite 2, vitest 1, CSS modules.

---

## File Map

```
src/
  main/
    index.ts                          # app bootstrap, BrowserWindow, service wiring
    ipc/
      vault.ts                        # IPC handlers: vault:open, vault:create, vault:getConfig
      notes.ts                        # IPC handlers: notes:list, notes:read, notes:save, notes:create, notes:delete, notes:getBacklinks
      search.ts                       # IPC handlers: search:query
    services/
      DatabaseService.ts              # SQLite open/close, migrations, .get() accessor
      VaultService.ts                 # file CRUD, vault dir structure, walkDir
      IndexService.ts                 # FTS5 upsert, backlink extraction, search query
      WatcherService.ts               # chokidar watch, debounced reindex trigger
    db/
      schema.ts                       # SQL strings for all CREATE TABLE / CREATE VIRTUAL TABLE
      migrations/
        001_initial.ts                # first migration for Phase 1
  preload/
    index.ts                          # contextBridge window.owl typed bridge
  renderer/
    index.tsx                         # React entry point
    App.tsx                           # vault open/create gate, root layout
    App.module.css                    # global CSS reset, vault gate styles
    lib/
      ipc.ts                          # typed window.owl client helpers
      markdown.ts                     # extractWikiLinks(), extractTitle() utilities
    stores/
      vaultStore.ts                   # vault path, note list, open note id
      editorStore.ts                  # current note content, dirty flag, save status
      searchStore.ts                  # query, results, modal open state
    components/
      layout/
        AppShell.tsx                  # three-panel layout, Aurora glass CSS
        AppShell.module.css
        LeftSidebar.tsx               # workspace tree, pinned notes, recent notes
        LeftSidebar.module.css
        RightSidebar.tsx              # backlinks panel
        RightSidebar.module.css
      editor/
        NoteEditor.tsx                # TipTap editor, autosave on change
        NoteEditor.module.css
        extensions/
          WikiLink.ts                 # ProseMirror decoration plugin: [[links]] highlighted inline
      search/
        SearchModal.tsx               # Cmd+F modal, input, result list
        SearchModal.module.css
        SearchResults.tsx             # individual result rows with snippet
  shared/
    types/
      Note.ts                         # Note, NoteContent, BacklinkResult, SearchResult
      IPC.ts                          # OwlAPI interface + window.owl declaration

tests/
  main/
    services/
      DatabaseService.test.ts
      VaultService.test.ts
      IndexService.test.ts
      WatcherService.test.ts
  renderer/
    setup.ts
    lib/
      markdown.test.ts
    extensions/
      WikiLink.test.ts

electron.vite.config.ts
electron-builder.yml
vitest.config.ts
package.json
tsconfig.json
tsconfig.node.json
tsconfig.web.json
.gitignore
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `electron.vite.config.ts`
- Create: `electron-builder.yml`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/main/index.ts` (stub)
- Create: `src/preload/index.ts` (stub)
- Create: `src/renderer/index.tsx` (stub)
- Create: `src/renderer/App.tsx` (stub)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "owl-md",
  "version": "0.1.0",
  "description": "Local-first knowledge workspace",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-vite build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  },
  "dependencies": {
    "@tiptap/extension-placeholder": "^2.4.0",
    "@tiptap/pm": "^2.4.0",
    "@tiptap/react": "^2.4.0",
    "@tiptap/starter-kit": "^2.4.0",
    "better-sqlite3": "^9.4.3",
    "chokidar": "^3.6.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tiptap-markdown": "^0.8.10",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^15.0.7",
    "@testing-library/user-event": "^14.5.2",
    "@types/better-sqlite3": "^7.6.10",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "@vitest/ui": "^1.6.0",
    "electron": "^30.0.9",
    "electron-builder": "^24.13.3",
    "electron-vite": "^2.3.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.2",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 3: Create tsconfig.node.json**

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.*",
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"],
    "moduleResolution": "bundler",
    "strict": true,
    "paths": { "@shared/*": ["src/shared/*"] }
  }
}
```

- [ ] **Step 4: Create tsconfig.web.json**

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": ["src/renderer/**/*", "src/shared/**/*"],
  "compilerOptions": {
    "composite": true,
    "strict": true,
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@renderer/*": ["src/renderer/*"]
    }
  }
}
```

- [ ] **Step 5: Create electron.vite.config.ts**

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer')
      }
    }
  }
})
```

- [ ] **Step 6: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/main/**/*.test.ts'],
          globals: true,
        },
        resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } }
      },
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.ts'],
          globals: true,
          setupFiles: ['tests/renderer/setup.ts'],
        },
        resolve: {
          alias: {
            '@shared': resolve(__dirname, 'src/shared'),
            '@renderer': resolve(__dirname, 'src/renderer')
          }
        }
      }
    ]
  }
})
```

- [ ] **Step 7: Create tests/renderer/setup.ts**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 8: Create electron-builder.yml**

```yaml
appId: md.owl.app
productName: owl.md
directories:
  buildResources: build
  output: release
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{tsconfig.json,tsconfig.*}'
  - '!tests/*'
asarUnpack:
  - resources/**
win:
  executableName: owl-md
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
mac:
  notarize: false
dmg:
  artifactName: ${name}-${version}.${ext}
linux:
  target:
    - AppImage
    - deb
  category: Utility
appImage:
  artifactName: ${name}-${version}.${ext}
npmRebuild: false
```

- [ ] **Step 9: Create .gitignore**

```
node_modules/
out/
dist/
release/
.owl/
*.db
*.db-shm
*.db-wal
.DS_Store
```

- [ ] **Step 10: Create stub entry files**

`src/main/index.ts`:
```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#060b12',
    show: false,
  })
  win.on('ready-to-show', () => win.show())
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

`src/preload/index.ts`:
```typescript
import { contextBridge } from 'electron'
contextBridge.exposeInMainWorld('owl', {})
```

`src/renderer/index.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

`src/renderer/App.tsx`:
```tsx
export default function App() {
  return <div style={{ color: 'white', background: '#060b12', height: '100vh', padding: 32 }}>owl.md loading…</div>
}
```

- [ ] **Step 11: Install dependencies**

```bash
cd /home/device/Documents/owl.md && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 12: Verify dev server starts**

```bash
npm run dev
```

Expected: Electron window opens showing "owl.md loading…" on dark background. Close it.

- [ ] **Step 13: Verify tests run (zero tests, no failures)**

```bash
npm test
```

Expected: 0 tests, 0 failures.

- [ ] **Step 14: Commit**

```bash
git add -A && git commit -m "feat: project scaffold — electron-vite, react, tiptap, vitest"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/shared/types/Note.ts`
- Create: `src/shared/types/IPC.ts`

- [ ] **Step 1: Create Note.ts**

```typescript
// src/shared/types/Note.ts

export interface Note {
  id: string
  path: string              // vault-relative, e.g. "Research/paper.md"
  title: string
  contentHash: string
  createdAt: number         // unix ms
  updatedAt: number
  parentId: string | null
  folderPath: string        // e.g. "Research"
  noteType: 'note' | 'daily' | 'canvas' | 'mindmap'
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

- [ ] **Step 2: Create IPC.ts**

```typescript
// src/shared/types/IPC.ts
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from './Note'

export interface OwlVaultAPI {
  open: (vaultPath: string) => Promise<VaultConfig>
  create: (vaultPath: string, name: string) => Promise<VaultConfig>
  getConfig: () => Promise<VaultConfig>
}

export interface OwlNotesAPI {
  list: () => Promise<Note[]>
  read: (id: string) => Promise<NoteContent>
  save: (id: string, markdown: string) => Promise<Note>
  create: (title: string, folderPath: string) => Promise<NoteContent>
  delete: (id: string) => Promise<void>
  getBacklinks: (id: string) => Promise<BacklinkResult[]>
}

export interface OwlSearchAPI {
  query: (q: string) => Promise<SearchResult[]>
}

export interface OwlAPI {
  vault: OwlVaultAPI
  notes: OwlNotesAPI
  search: OwlSearchAPI
}

declare global {
  interface Window { owl: OwlAPI }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/ && git commit -m "feat: shared types — Note, VaultConfig, OwlAPI"
```

---

## Task 3: DatabaseService

**Files:**
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/migrations/001_initial.ts`
- Create: `src/main/services/DatabaseService.ts`
- Create: `tests/main/services/DatabaseService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/main/services/DatabaseService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('DatabaseService', () => {
  let tmpDir: string
  let db: DatabaseService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-test-'))
    db = new DatabaseService(tmpDir)
    db.open()
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .owl/db.sqlite on open', () => {
    expect(existsSync(join(tmpDir, '.owl', 'db.sqlite'))).toBe(true)
  })

  it('creates notes table', () => {
    const row = db.get().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'"
    ).get()
    expect(row).toBeTruthy()
  })

  it('creates notes_fts virtual table', () => {
    const row = db.get().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'"
    ).get()
    expect(row).toBeTruthy()
  })

  it('creates links, tags, blocks tables', () => {
    for (const table of ['links', 'tags', 'blocks']) {
      const row = db.get().prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
      ).get()
      expect(row, `${table} table missing`).toBeTruthy()
    }
  })

  it('records schema_version = 1 after migration', () => {
    const row = db.get().prepare('SELECT version FROM schema_version').get() as { version: number }
    expect(row.version).toBe(1)
  })

  it('is idempotent — reopening does not throw', () => {
    db.close()
    const db2 = new DatabaseService(tmpDir)
    expect(() => { db2.open(); db2.close() }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose 2>&1 | head -10
```

Expected: FAIL — `Cannot find module '../../../src/main/services/DatabaseService'`

- [ ] **Step 3: Create src/main/db/schema.ts**

```typescript
// src/main/db/schema.ts

export const CREATE_SCHEMA_VERSION = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  )
`

export const CREATE_NOTES = `
  CREATE TABLE IF NOT EXISTS notes (
    id           TEXT PRIMARY KEY,
    path         TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    parent_id    TEXT REFERENCES notes(id) ON DELETE SET NULL,
    folder_path  TEXT NOT NULL DEFAULT '',
    note_type    TEXT NOT NULL DEFAULT 'note'
  )
`

export const CREATE_LINKS = `
  CREATE TABLE IF NOT EXISTS links (
    source_note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id  TEXT NOT NULL DEFAULT '',
    source_block_id TEXT,
    link_text       TEXT NOT NULL,
    is_resolved     INTEGER NOT NULL DEFAULT 0
  )
`

export const CREATE_TAGS = `
  CREATE TABLE IF NOT EXISTS tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL
  )
`

export const CREATE_BLOCKS = `
  CREATE TABLE IF NOT EXISTS blocks (
    block_id    TEXT PRIMARY KEY,
    note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    block_type  TEXT NOT NULL,
    content     TEXT NOT NULL,
    order_index INTEGER NOT NULL
  )
`

export const CREATE_NOTES_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    content,
    content=notes,
    content_rowid=rowid
  )
`

export const CREATE_FTS_TRIGGERS = `
  CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, '');
  END;
  CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, '');
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, '');
  END;
  CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, '');
  END;
`

export const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_path);
  CREATE INDEX IF NOT EXISTS idx_links_source  ON links(source_note_id);
  CREATE INDEX IF NOT EXISTS idx_links_target  ON links(target_note_id);
  CREATE INDEX IF NOT EXISTS idx_tags_note     ON tags(note_id);
  CREATE INDEX IF NOT EXISTS idx_tags_tag      ON tags(tag);
  CREATE INDEX IF NOT EXISTS idx_blocks_note   ON blocks(note_id);
`
```

- [ ] **Step 4: Create src/main/db/migrations/001_initial.ts**

```typescript
// src/main/db/migrations/001_initial.ts
import type Database from 'better-sqlite3'
import {
  CREATE_NOTES, CREATE_LINKS, CREATE_TAGS, CREATE_BLOCKS,
  CREATE_NOTES_FTS, CREATE_FTS_TRIGGERS, INDEXES,
} from '../schema'

export function up(db: Database.Database): void {
  db.exec(CREATE_NOTES)
  db.exec(CREATE_LINKS)
  db.exec(CREATE_TAGS)
  db.exec(CREATE_BLOCKS)
  db.exec(CREATE_NOTES_FTS)
  db.exec(CREATE_FTS_TRIGGERS)
  db.exec(INDEXES)
}
```

- [ ] **Step 5: Create src/main/services/DatabaseService.ts**

```typescript
// src/main/services/DatabaseService.ts
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { CREATE_SCHEMA_VERSION } from '../db/schema'
import { up as migration001 } from '../db/migrations/001_initial'

const MIGRATIONS: Array<(db: Database.Database) => void> = [migration001]

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
    db.exec(CREATE_SCHEMA_VERSION)

    const row = db.prepare('SELECT version FROM schema_version').get() as
      | { version: number } | undefined
    const currentVersion = row?.version ?? 0

    for (let i = currentVersion; i < MIGRATIONS.length; i++) {
      const runMigration = db.transaction(() => {
        MIGRATIONS[i](db)
        if (currentVersion === 0) {
          db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1)
        } else {
          db.prepare('UPDATE schema_version SET version = ?').run(i + 1)
        }
      })
      runMigration()
    }
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|DatabaseService)"
```

Expected: all 6 DatabaseService tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/db/ src/main/services/DatabaseService.ts tests/main/services/DatabaseService.test.ts
git commit -m "feat: DatabaseService — SQLite open, migrations, FTS5 schema"
```

---

## Task 4: VaultService

**Files:**
- Create: `src/main/services/VaultService.ts`
- Create: `tests/main/services/VaultService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/main/services/VaultService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VaultService } from '../../../src/main/services/VaultService'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('VaultService', () => {
  let tmpDir: string
  let vault: VaultService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-vault-'))
    vault = new VaultService(tmpDir)
    vault.init('Test Vault')
  })

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }))

  it('creates notes/ and attachments/ directories on init', () => {
    expect(existsSync(join(tmpDir, 'notes'))).toBe(true)
    expect(existsSync(join(tmpDir, 'attachments'))).toBe(true)
  })

  it('writes .owl/config.json with vault name', () => {
    const { readFileSync } = require('fs')
    const config = JSON.parse(readFileSync(join(tmpDir, '.owl', 'config.json'), 'utf-8'))
    expect(config.name).toBe('Test Vault')
    expect(config.schemaVersion).toBe(1)
  })

  it('writeNote creates file with content', () => {
    vault.writeNote('hello.md', '# Hello\n\nWorld')
    expect(vault.readNote('hello.md')).toBe('# Hello\n\nWorld')
  })

  it('writeNote creates nested directories', () => {
    vault.writeNote('Research/papers/my-paper.md', '# Paper')
    expect(vault.readNote('Research/papers/my-paper.md')).toBe('# Paper')
  })

  it('deleteNote removes file', () => {
    vault.writeNote('temp.md', 'delete me')
    vault.deleteNote('temp.md')
    expect(() => vault.readNote('temp.md')).toThrow()
  })

  it('listNotes returns all .md files recursively', () => {
    vault.writeNote('a.md', '')
    vault.writeNote('sub/b.md', '')
    vault.writeNote('sub/deep/c.md', '')
    const notes = vault.listNotes()
    expect(notes).toContain('a.md')
    expect(notes).toContain('sub/b.md')
    expect(notes).toContain('sub/deep/c.md')
    expect(notes).toHaveLength(3)
  })

  it('listNotes ignores non-.md files', () => {
    vault.writeNote('a.md', '')
    const { writeFileSync, mkdirSync } = require('fs')
    mkdirSync(join(tmpDir, 'notes', 'sub'), { recursive: true })
    writeFileSync(join(tmpDir, 'notes', 'image.png'), '')
    expect(vault.listNotes()).toHaveLength(1)
  })

  it('noteAbsPath resolves vault-relative path', () => {
    expect(vault.noteAbsPath('Research/a.md')).toBe(join(tmpDir, 'notes', 'Research', 'a.md'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose 2>&1 | head -10
```

Expected: FAIL — `Cannot find module '../../../src/main/services/VaultService'`

- [ ] **Step 3: Create src/main/services/VaultService.ts**

```typescript
// src/main/services/VaultService.ts
import {
  mkdirSync, readdirSync, readFileSync, unlinkSync,
  writeFileSync, existsSync
} from 'fs'
import { join, relative, dirname } from 'path'
import type { VaultConfig } from '@shared/types/Note'

export class VaultService {
  constructor(private readonly vaultPath: string) {}

  init(name: string): void {
    mkdirSync(join(this.vaultPath, 'notes'), { recursive: true })
    mkdirSync(join(this.vaultPath, 'attachments', 'images'), { recursive: true })
    mkdirSync(join(this.vaultPath, 'attachments', 'files'), { recursive: true })
    mkdirSync(join(this.vaultPath, '.owl'), { recursive: true })

    const configPath = join(this.vaultPath, '.owl', 'config.json')
    if (!existsSync(configPath)) {
      const config: VaultConfig = {
        name,
        path: this.vaultPath,
        createdAt: Date.now(),
        schemaVersion: 1,
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    }
  }

  getConfig(): VaultConfig {
    return JSON.parse(
      readFileSync(join(this.vaultPath, '.owl', 'config.json'), 'utf-8')
    ) as VaultConfig
  }

  readNote(notePath: string): string {
    return readFileSync(this.noteAbsPath(notePath), 'utf-8')
  }

  writeNote(notePath: string, content: string): void {
    const abs = this.noteAbsPath(notePath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf-8')
  }

  deleteNote(notePath: string): void {
    unlinkSync(this.noteAbsPath(notePath))
  }

  listNotes(): string[] {
    const notesDir = join(this.vaultPath, 'notes')
    if (!existsSync(notesDir)) return []
    return this.walkDir(notesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => relative(notesDir, f))
  }

  noteAbsPath(notePath: string): string {
    return join(this.vaultPath, 'notes', notePath)
  }

  private walkDir(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...this.walkDir(full))
      } else {
        files.push(full)
      }
    }
    return files
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|VaultService)"
```

Expected: all 8 VaultService tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/VaultService.ts tests/main/services/VaultService.test.ts
git commit -m "feat: VaultService — vault init, note CRUD, recursive walk"
```

---

## Task 5: IndexService

**Files:**
- Create: `src/main/services/IndexService.ts`
- Create: `tests/main/services/IndexService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/main/services/IndexService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/main/services/DatabaseService'
import { IndexService } from '../../../src/main/services/IndexService'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('IndexService', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let index: IndexService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-index-'))
    dbService = new DatabaseService(tmpDir)
    dbService.open()
    index = new IndexService(dbService.get())
  })

  afterEach(() => {
    dbService.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('indexNote inserts a row into notes', () => {
    index.indexNote({ id: 'abc123', path: 'hello.md', title: 'Hello World',
      markdown: '# Hello World\n\nSome content', folderPath: '', noteType: 'note' })
    const row = dbService.get().prepare('SELECT * FROM notes WHERE id = ?').get('abc123') as any
    expect(row.title).toBe('Hello World')
  })

  it('indexNote is idempotent — updating same id changes title', () => {
    index.indexNote({ id: 'n1', path: 'a.md', title: 'Old', markdown: 'old', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'n1', path: 'a.md', title: 'New', markdown: 'new', folderPath: '', noteType: 'note' })
    const row = dbService.get().prepare('SELECT title FROM notes WHERE id = ?').get('n1') as any
    expect(row.title).toBe('New')
  })

  it('extractLinks returns [[target]] links from markdown', () => {
    expect(IndexService.extractLinks('See [[Note A]] and [[Note B|alias]]')).toEqual(['Note A', 'Note B'])
  })

  it('extractTags returns #tags from markdown', () => {
    const tags = IndexService.extractTags('Hello #world and #foo-bar')
    expect(tags).toContain('world')
    expect(tags).toContain('foo-bar')
  })

  it('resolveLinks connects source to target by title', () => {
    index.indexNote({ id: 'src', path: 'source.md', title: 'Source',
      markdown: 'Links to [[Target]]', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'tgt', path: 'target.md', title: 'Target',
      markdown: '# Target', folderPath: '', noteType: 'note' })
    index.resolveLinks()
    const backlinks = index.getBacklinks('tgt')
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0].sourceNoteId).toBe('src')
  })

  it('searchFTS returns notes matching query', () => {
    index.indexNote({ id: 'q1', path: 'quantum.md', title: 'Quantum Mechanics',
      markdown: '# Quantum Mechanics\n\nWave function collapse', folderPath: '', noteType: 'note' })
    index.indexNote({ id: 'q2', path: 'cooking.md', title: 'Cooking Tips',
      markdown: '# Cooking Tips\n\nHow to boil water', folderPath: '', noteType: 'note' })
    index.syncFTS('q1', 'Quantum Mechanics', 'Wave function collapse')
    index.syncFTS('q2', 'Cooking Tips', 'How to boil water')
    const results = index.searchFTS('quantum')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('q1')
  })

  it('removeNote deletes note and cascades to links/tags', () => {
    index.indexNote({ id: 'del', path: 'del.md', title: 'Delete Me', markdown: '#del', folderPath: '', noteType: 'note' })
    index.removeNote('del')
    const row = dbService.get().prepare('SELECT id FROM notes WHERE id = ?').get('del')
    expect(row).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose 2>&1 | head -10
```

Expected: FAIL — `Cannot find module '../../../src/main/services/IndexService'`

- [ ] **Step 3: Create src/main/services/IndexService.ts**

```typescript
// src/main/services/IndexService.ts
import type Database from 'better-sqlite3'
import { createHash } from 'crypto'
import type { BacklinkResult, SearchResult } from '@shared/types/Note'

interface IndexNoteParams {
  id: string
  path: string
  title: string
  markdown: string
  folderPath: string
  noteType: string
}

export class IndexService {
  constructor(private readonly db: Database.Database) {}

  indexNote(params: IndexNoteParams): void {
    const { id, path, title, markdown, folderPath, noteType } = params
    const hash = createHash('sha256').update(markdown).digest('hex')
    const now = Date.now()

    this.db.prepare(`
      INSERT INTO notes (id, path, title, content_hash, created_at, updated_at, folder_path, note_type)
      VALUES (@id, @path, @title, @hash, @now, @now, @folderPath, @noteType)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path, title = excluded.title,
        content_hash = excluded.content_hash, updated_at = excluded.updated_at,
        folder_path = excluded.folder_path, note_type = excluded.note_type
    `).run({ id, path, title, hash, now, folderPath, noteType })

    this.db.prepare('DELETE FROM tags WHERE note_id = ?').run(id)
    for (const tag of IndexService.extractTags(markdown)) {
      this.db.prepare('INSERT INTO tags (note_id, tag) VALUES (?, ?)').run(id, tag)
    }

    this.db.prepare('DELETE FROM links WHERE source_note_id = ?').run(id)
    for (const target of IndexService.extractLinks(markdown)) {
      this.db.prepare(
        'INSERT INTO links (source_note_id, target_note_id, link_text, is_resolved) VALUES (?, ?, ?, 0)'
      ).run(id, '', target)
    }
  }

  syncFTS(id: string, title: string, content: string): void {
    const row = this.db.prepare('SELECT rowid FROM notes WHERE id = ?').get(id) as
      | { rowid: number } | undefined
    if (!row) return
    this.db.prepare(
      "INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', ?, ?, '')"
    ).run(row.rowid, title)
    this.db.prepare(
      'INSERT INTO notes_fts(rowid, title, content) VALUES (?, ?, ?)'
    ).run(row.rowid, title, content)
  }

  resolveLinks(): void {
    const unresolved = this.db.prepare(
      'SELECT rowid, source_note_id, link_text FROM links WHERE is_resolved = 0'
    ).all() as Array<{ rowid: number; source_note_id: string; link_text: string }>

    for (const link of unresolved) {
      const target = this.db.prepare('SELECT id FROM notes WHERE title = ?').get(link.link_text) as
        | { id: string } | undefined
      if (target) {
        this.db.prepare('UPDATE links SET target_note_id = ?, is_resolved = 1 WHERE rowid = ?')
          .run(target.id, link.rowid)
      }
    }
  }

  getBacklinks(noteId: string): BacklinkResult[] {
    return this.db.prepare(`
      SELECT l.source_note_id as sourceNoteId, n.title as sourceTitle,
             n.path as sourcePath, l.link_text as linkText
      FROM links l
      JOIN notes n ON l.source_note_id = n.id
      WHERE l.target_note_id = ? AND l.is_resolved = 1
    `).all(noteId) as BacklinkResult[]
  }

  searchFTS(query: string): SearchResult[] {
    try {
      return this.db.prepare(`
        SELECT n.id, n.path, n.title,
               snippet(notes_fts, 1, '<mark>', '</mark>', '…', 10) as excerpt
        FROM notes_fts
        JOIN notes n ON notes_fts.rowid = n.rowid
        WHERE notes_fts MATCH ?
        ORDER BY bm25(notes_fts, 10, 1)
        LIMIT 50
      `).all(query + '*') as SearchResult[]
    } catch {
      return []
    }
  }

  removeNote(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }

  static extractLinks(markdown: string): string[] {
    const matches = [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
    return [...new Set(matches.map(m => m[1].trim()))]
  }

  static extractTags(markdown: string): string[] {
    const matches = [...markdown.matchAll(/(?:^|\s)#([a-zA-Z0-9_-]+)/g)]
    return [...new Set(matches.map(m => m[1]))]
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|IndexService)"
```

Expected: all 7 IndexService tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/IndexService.ts tests/main/services/IndexService.test.ts
git commit -m "feat: IndexService — FTS5 sync, backlink extraction, tag extraction"
```

---

## Task 6: WatcherService

**Files:**
- Create: `src/main/services/WatcherService.ts`
- Create: `tests/main/services/WatcherService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/main/services/WatcherService.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WatcherService } from '../../../src/main/services/WatcherService'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('WatcherService', () => {
  let tmpDir: string
  let watcher: WatcherService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-watch-'))
    mkdirSync(join(tmpDir, 'notes'), { recursive: true })
    watcher = new WatcherService(tmpDir)
  })

  afterEach(async () => {
    await watcher.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('calls onFileChanged when a .md file is added', async () => {
    const onChanged = vi.fn()
    watcher.start({ onFileChanged: onChanged, onFileDeleted: vi.fn() })
    writeFileSync(join(tmpDir, 'notes', 'test.md'), '# Test')
    await new Promise(r => setTimeout(r, 400))
    expect(onChanged).toHaveBeenCalledWith(expect.stringContaining('test.md'))
  })

  it('calls onFileDeleted when a .md file is removed', async () => {
    const onDeleted = vi.fn()
    writeFileSync(join(tmpDir, 'notes', 'to-delete.md'), '# Delete Me')
    watcher.start({ onFileChanged: vi.fn(), onFileDeleted: onDeleted })
    await new Promise(r => setTimeout(r, 200))
    rmSync(join(tmpDir, 'notes', 'to-delete.md'))
    await new Promise(r => setTimeout(r, 400))
    expect(onDeleted).toHaveBeenCalledWith(expect.stringContaining('to-delete.md'))
  })

  it('does not call onFileChanged for non-.md files', async () => {
    const onChanged = vi.fn()
    watcher.start({ onFileChanged: onChanged, onFileDeleted: vi.fn() })
    writeFileSync(join(tmpDir, 'notes', 'image.png'), 'fake image')
    await new Promise(r => setTimeout(r, 400))
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('stop() resolves without error', async () => {
    watcher.start({ onFileChanged: vi.fn(), onFileDeleted: vi.fn() })
    await expect(watcher.stop()).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose 2>&1 | head -10
```

Expected: FAIL — `Cannot find module '../../../src/main/services/WatcherService'`

- [ ] **Step 3: Create src/main/services/WatcherService.ts**

```typescript
// src/main/services/WatcherService.ts
import chokidar, { FSWatcher } from 'chokidar'
import { join } from 'path'

interface WatcherCallbacks {
  onFileChanged: (absolutePath: string) => void
  onFileDeleted: (absolutePath: string) => void
}

export class WatcherService {
  private watcher: FSWatcher | null = null

  constructor(private readonly vaultPath: string) {}

  start(callbacks: WatcherCallbacks): void {
    const notesDir = join(this.vaultPath, 'notes')

    this.watcher = chokidar.watch(notesDir, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    })

    const handle = (path: string): void => {
      if (path.endsWith('.md')) callbacks.onFileChanged(path)
    }

    const handleDelete = (path: string): void => {
      if (path.endsWith('.md')) callbacks.onFileDeleted(path)
    }

    this.watcher.on('add', handle).on('change', handle).on('unlink', handleDelete)
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|WatcherService)"
```

Expected: all 4 WatcherService tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/WatcherService.ts tests/main/services/WatcherService.test.ts
git commit -m "feat: WatcherService — chokidar watch, .md filter, add/change/delete callbacks"
```

---

## Task 7: IPC Layer — Preload Bridge & Main Handlers

**Files:**
- Modify: `src/preload/index.ts`
- Create: `src/main/ipc/vault.ts`
- Create: `src/main/ipc/notes.ts`
- Create: `src/main/ipc/search.ts`

- [ ] **Step 1: Update src/preload/index.ts**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { OwlAPI } from '@shared/types/IPC'

const owl: OwlAPI = {
  vault: {
    open:      (vaultPath)        => ipcRenderer.invoke('vault:open', vaultPath),
    create:    (vaultPath, name)  => ipcRenderer.invoke('vault:create', vaultPath, name),
    getConfig: ()                 => ipcRenderer.invoke('vault:getConfig'),
  },
  notes: {
    list:         ()              => ipcRenderer.invoke('notes:list'),
    read:         (id)            => ipcRenderer.invoke('notes:read', id),
    save:         (id, markdown)  => ipcRenderer.invoke('notes:save', id, markdown),
    create:       (title, folder) => ipcRenderer.invoke('notes:create', title, folder),
    delete:       (id)            => ipcRenderer.invoke('notes:delete', id),
    getBacklinks: (id)            => ipcRenderer.invoke('notes:getBacklinks', id),
  },
  search: {
    query: (q) => ipcRenderer.invoke('search:query', q),
  },
}

contextBridge.exposeInMainWorld('owl', owl)
```

- [ ] **Step 2: Create src/main/ipc/vault.ts**

```typescript
// src/main/ipc/vault.ts
import { ipcMain } from 'electron'
import type { VaultConfig } from '@shared/types/Note'
import type { DatabaseService } from '../services/DatabaseService'
import type { VaultService } from '../services/VaultService'

export function registerVaultHandlers(services: {
  db: () => DatabaseService
  vault: () => VaultService
  openVault: (vaultPath: string) => Promise<VaultConfig>
  setVaultPath: (p: string) => void
}): void {
  ipcMain.handle('vault:open', (_e, vaultPath: string) =>
    services.openVault(vaultPath)
  )

  ipcMain.handle('vault:create', async (_e, vaultPath: string, name: string) => {
    services.setVaultPath(vaultPath)
    services.vault().init(name)
    services.db().open()
    return services.vault().getConfig()
  })

  ipcMain.handle('vault:getConfig', () => services.vault().getConfig())
}
```

- [ ] **Step 3: Create src/main/ipc/notes.ts**

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
    services.index().indexNote({ id, path: note.path, title, markdown, folderPath, noteType: note.noteType })
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
}
```

- [ ] **Step 4: Create src/main/ipc/search.ts**

```typescript
// src/main/ipc/search.ts
import { ipcMain } from 'electron'
import type { IndexService } from '../services/IndexService'

export function registerSearchHandlers(index: () => IndexService): void {
  ipcMain.handle('search:query', (_e, q: string) => {
    if (!q.trim()) return []
    return index().searchFTS(q)
  })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/main/ipc/
git commit -m "feat: IPC layer — typed contextBridge, vault/notes/search handlers"
```

---

## Task 8: Main Process Bootstrap

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Rewrite src/main/index.ts to wire all services**

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { join, relative, dirname, basename } from 'path'
import { DatabaseService } from './services/DatabaseService'
import { VaultService } from './services/VaultService'
import { IndexService } from './services/IndexService'
import { WatcherService } from './services/WatcherService'
import { registerVaultHandlers } from './ipc/vault'
import { registerNotesHandlers } from './ipc/notes'
import { registerSearchHandlers } from './ipc/search'
import type { VaultConfig } from '@shared/types/Note'

let vaultPath: string | null = null
let dbService: DatabaseService | null = null
let vaultService: VaultService | null = null
let indexService: IndexService | null = null
let watcherService: WatcherService | null = null

async function openVault(path: string): Promise<VaultConfig> {
  if (watcherService) await watcherService.stop()
  if (dbService) dbService.close()

  vaultPath = path
  vaultService = new VaultService(path)
  vaultService.init(basename(path))
  dbService = new DatabaseService(path)
  dbService.open()
  indexService = new IndexService(dbService.get())
  watcherService = new WatcherService(path)

  // Full initial scan
  for (const notePath of vaultService.listNotes()) {
    const markdown = vaultService.readNote(notePath)
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : basename(notePath, '.md')
    const id = getOrCreateNoteId(notePath)
    const folderPath = dirname(notePath) === '.' ? '' : dirname(notePath)
    indexService.indexNote({ id, path: notePath, title, markdown, folderPath, noteType: 'note' })
    indexService.syncFTS(id, title, markdown)
  }
  indexService.resolveLinks()

  watcherService.start({
    onFileChanged: (absPath) => {
      if (!vaultService || !indexService || !dbService) return
      const rel = relative(join(path, 'notes'), absPath)
      const markdown = vaultService.readNote(rel)
      const titleMatch = markdown.match(/^#\s+(.+)$/m)
      const title = titleMatch ? titleMatch[1] : basename(rel, '.md')
      const id = getOrCreateNoteId(rel)
      const folderPath = dirname(rel) === '.' ? '' : dirname(rel)
      indexService.indexNote({ id, path: rel, title, markdown, folderPath, noteType: 'note' })
      indexService.syncFTS(id, title, markdown)
      indexService.resolveLinks()
    },
    onFileDeleted: (absPath) => {
      if (!dbService || !indexService) return
      const rel = relative(join(path, 'notes'), absPath)
      const row = dbService.get().prepare('SELECT id FROM notes WHERE path = ?').get(rel) as
        | { id: string } | undefined
      if (row) indexService.removeNote(row.id)
    },
  })

  return vaultService.getConfig()
}

function getOrCreateNoteId(notePath: string): string {
  if (!dbService) throw new Error('DB not open')
  const row = dbService.get().prepare('SELECT id FROM notes WHERE path = ?').get(notePath) as
    | { id: string } | undefined
  return row?.id ?? crypto.randomUUID()
}

app.whenReady().then(() => {
  registerVaultHandlers({
    db: () => dbService!,
    vault: () => vaultService!,
    openVault,
    setVaultPath: (p) => { vaultPath = p },
  })

  registerNotesHandlers({
    db: () => dbService!,
    vault: () => vaultService!,
    index: () => indexService!,
  })

  registerSearchHandlers(() => indexService!)

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#060b12',
    show: false,
  })

  win.on('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
})

app.on('window-all-closed', async () => {
  if (watcherService) await watcherService.stop()
  if (dbService) dbService.close()
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Verify app starts with stub renderer**

```bash
npm run dev
```

Expected: Electron window opens, no errors in main process terminal output.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts && git commit -m "feat: main process bootstrap — wire services, vault scan, watcher start"
```

---

## Task 9: Renderer IPC Client + Zustand Stores

**Files:**
- Create: `src/renderer/lib/ipc.ts`
- Create: `src/renderer/stores/vaultStore.ts`
- Create: `src/renderer/stores/editorStore.ts`
- Create: `src/renderer/stores/searchStore.ts`

- [ ] **Step 1: Create src/renderer/lib/ipc.ts**

```typescript
// src/renderer/lib/ipc.ts
// Centralises all IPC calls. Mock this module in renderer tests.
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from '@shared/types/Note'

export const ipc = {
  vault: {
    open:      (path: string): Promise<VaultConfig>          => window.owl.vault.open(path),
    create:    (path: string, name: string): Promise<VaultConfig> => window.owl.vault.create(path, name),
    getConfig: (): Promise<VaultConfig>                       => window.owl.vault.getConfig(),
  },
  notes: {
    list:         (): Promise<Note[]>                         => window.owl.notes.list(),
    read:         (id: string): Promise<NoteContent>          => window.owl.notes.read(id),
    save:         (id: string, md: string): Promise<Note>     => window.owl.notes.save(id, md),
    create:       (title: string, folder: string): Promise<NoteContent> => window.owl.notes.create(title, folder),
    delete:       (id: string): Promise<void>                 => window.owl.notes.delete(id),
    getBacklinks: (id: string): Promise<BacklinkResult[]>     => window.owl.notes.getBacklinks(id),
  },
  search: {
    query: (q: string): Promise<SearchResult[]>               => window.owl.search.query(q),
  },
}
```

- [ ] **Step 2: Create src/renderer/stores/vaultStore.ts**

```typescript
// src/renderer/stores/vaultStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Note, VaultConfig } from '@shared/types/Note'

interface VaultState {
  config: VaultConfig | null
  notes: Note[]
  pinnedIds: string[]
  recentIds: string[]
  openNoteId: string | null
  openVault:   (path: string) => Promise<void>
  createVault: (path: string, name: string) => Promise<void>
  loadNotes:   () => Promise<void>
  setOpenNote: (id: string) => void
  pinNote:     (id: string) => void
  unpinNote:   (id: string) => void
  addRecent:   (id: string) => void
}

export const useVaultStore = create<VaultState>((set, get) => ({
  config: null,
  notes: [],
  pinnedIds: [],
  recentIds: [],
  openNoteId: null,

  openVault: async (path) => {
    const config = await ipc.vault.open(path)
    set({ config })
    await get().loadNotes()
  },

  createVault: async (path, name) => {
    const config = await ipc.vault.create(path, name)
    set({ config })
  },

  loadNotes: async () => {
    const notes = await ipc.notes.list()
    set({ notes })
  },

  setOpenNote: (id) => {
    set({ openNoteId: id })
    get().addRecent(id)
  },

  pinNote:   (id) => set(s => ({ pinnedIds: s.pinnedIds.includes(id) ? s.pinnedIds : [...s.pinnedIds, id] })),
  unpinNote: (id) => set(s => ({ pinnedIds: s.pinnedIds.filter(p => p !== id) })),
  addRecent: (id) => set(s => ({ recentIds: [id, ...s.recentIds.filter(r => r !== id)].slice(0, 10) })),
}))
```

- [ ] **Step 3: Create src/renderer/stores/editorStore.ts**

```typescript
// src/renderer/stores/editorStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Note } from '@shared/types/Note'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface EditorState {
  note: Note | null
  markdown: string
  isDirty: boolean
  saveStatus: SaveStatus
  loadNote:    (id: string) => Promise<void>
  setMarkdown: (md: string) => void
  save:        () => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  note: null,
  markdown: '',
  isDirty: false,
  saveStatus: 'idle',

  loadNote: async (id) => {
    const { note, markdown } = await ipc.notes.read(id)
    set({ note, markdown, isDirty: false, saveStatus: 'idle' })
  },

  setMarkdown: (md) => set({ markdown: md, isDirty: true }),

  save: async () => {
    const { note, markdown } = get()
    if (!note) return
    set({ saveStatus: 'saving' })
    try {
      const updated = await ipc.notes.save(note.id, markdown)
      set({ note: updated, isDirty: false, saveStatus: 'saved' })
      setTimeout(() => set({ saveStatus: 'idle' }), 1500)
    } catch {
      set({ saveStatus: 'error' })
    }
  },
}))
```

- [ ] **Step 4: Create src/renderer/stores/searchStore.ts**

```typescript
// src/renderer/stores/searchStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { SearchResult } from '@shared/types/Note'

interface SearchState {
  isOpen:    boolean
  query:     string
  results:   SearchResult[]
  isLoading: boolean
  open:     () => void
  close:    () => void
  setQuery: (q: string) => Promise<void>
}

export const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  query: '',
  results: [],
  isLoading: false,

  open:  () => set({ isOpen: true, query: '', results: [] }),
  close: () => set({ isOpen: false }),

  setQuery: async (q) => {
    set({ query: q, isLoading: true })
    try {
      const results = await ipc.search.query(q)
      set({ results, isLoading: false })
    } catch {
      set({ results: [], isLoading: false })
    }
  },
}))
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/ipc.ts src/renderer/stores/
git commit -m "feat: renderer IPC client and Zustand stores — vault, editor, search"
```

---

## Task 10: Markdown Utilities

**Files:**
- Create: `src/renderer/lib/markdown.ts`
- Create: `tests/renderer/lib/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/lib/markdown.test.ts
import { describe, it, expect } from 'vitest'
import { extractTitle, extractWikiLinks, folderFromPath } from '../../../src/renderer/lib/markdown'

describe('extractTitle', () => {
  it('returns text of first h1', () => {
    expect(extractTitle('# Hello World\n\nSome text')).toBe('Hello World')
  })
  it('returns filename fallback when no h1', () => {
    expect(extractTitle('Just text', 'Research/my-note.md')).toBe('my-note')
  })
  it('returns empty string when no h1 and no path given', () => {
    expect(extractTitle('no heading')).toBe('')
  })
})

describe('extractWikiLinks', () => {
  it('extracts [[simple links]]', () => {
    expect(extractWikiLinks('See [[Note A]] for details')).toEqual(['Note A'])
  })
  it('extracts [[link|alias]] — returns target not alias', () => {
    expect(extractWikiLinks('See [[Note A|alias]]')).toEqual(['Note A'])
  })
  it('extracts multiple unique links', () => {
    expect(extractWikiLinks('[[A]] and [[B]] and [[A]] again')).toEqual(['A', 'B'])
  })
  it('returns empty array when no links', () => {
    expect(extractWikiLinks('plain text')).toEqual([])
  })
})

describe('folderFromPath', () => {
  it('returns folder for nested path', () => {
    expect(folderFromPath('Research/papers/note.md')).toBe('Research/papers')
  })
  it('returns empty string for root-level note', () => {
    expect(folderFromPath('note.md')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose 2>&1 | head -10
```

Expected: FAIL — `Cannot find module '../../../src/renderer/lib/markdown'`

- [ ] **Step 3: Create src/renderer/lib/markdown.ts**

```typescript
// src/renderer/lib/markdown.ts
import { basename, dirname } from 'path'

export function extractTitle(markdown: string, filePath?: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  if (filePath) return basename(filePath, '.md')
  return ''
}

export function extractWikiLinks(markdown: string): string[] {
  const matches = [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
  return [...new Set(matches.map(m => m[1].trim()))]
}

export function folderFromPath(notePath: string): string {
  const dir = dirname(notePath)
  return dir === '.' ? '' : dir
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|markdown)"
```

Expected: all 8 markdown tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/markdown.ts tests/renderer/lib/markdown.test.ts
git commit -m "feat: markdown utils — extractTitle, extractWikiLinks, folderFromPath"
```

---

## Task 11: WikiLink TipTap Extension

**Files:**
- Create: `src/renderer/components/editor/extensions/WikiLink.ts`
- Create: `tests/renderer/extensions/WikiLink.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/extensions/WikiLink.test.ts
import { describe, it, expect } from 'vitest'
import { buildDecorations } from '../../../src/renderer/components/editor/extensions/WikiLink'
import { schema } from '@tiptap/pm/schema-basic'

describe('buildDecorations', () => {
  function makeDoc(text: string) {
    return schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text(text)])
    ])
  }

  it('detects [[simple link]] and returns one decoration', () => {
    expect(buildDecorations(makeDoc('See [[My Note]] here')).find()).toHaveLength(1)
  })

  it('decoration spans the full [[...]] including brackets', () => {
    const doc = makeDoc('A [[Note]] B')
    const decs = buildDecorations(doc).find()
    // ProseMirror: doc(1) + paragraph opens at pos 1, text starts at pos 2
    // 'A [[Note]] B' — [[Note]] starts at index 2 in the text
    const text = 'A [[Note]] B'
    const from = 1 + text.indexOf('[[')    // +1 for paragraph open token
    const to = 1 + text.indexOf(']]') + 2
    expect(decs[0].from).toBe(from)
    expect(decs[0].to).toBe(to)
  })

  it('detects multiple [[links]] in one paragraph', () => {
    expect(buildDecorations(makeDoc('[[A]] and [[B]]')).find()).toHaveLength(2)
  })

  it('returns no decorations for plain text', () => {
    expect(buildDecorations(makeDoc('no wiki links here')).find()).toHaveLength(0)
  })

  it('handles [[link|alias]] syntax', () => {
    expect(buildDecorations(makeDoc('See [[Target|Display Text]] here')).find()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose 2>&1 | head -10
```

Expected: FAIL — `Cannot find module '../../../src/renderer/components/editor/extensions/WikiLink'`

- [ ] **Step 3: Create src/renderer/components/editor/extensions/WikiLink.ts**

```typescript
// src/renderer/components/editor/extensions/WikiLink.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export const WikiLinkPluginKey = new PluginKey<DecorationSet>('wikiLink')

/** Exported for unit testing — builds a DecorationSet from a ProseMirror document */
export function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const match of node.text.matchAll(WIKI_LINK_RE)) {
      const from = pos + match.index!
      const to = from + match[0].length
      decorations.push(
        Decoration.inline(from, to, {
          class: 'wiki-link',
          'data-target': match[1].trim(),
          title: match[1].trim(),
        })
      )
    }
  })

  return DecorationSet.create(doc, decorations)
}

export const WikiLink = Extension.create({
  name: 'wikiLink',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: WikiLinkPluginKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations: (state) => WikiLinkPluginKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ]
  },
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|WikiLink)"
```

Expected: all 5 WikiLink tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/extensions/WikiLink.ts tests/renderer/extensions/WikiLink.test.ts
git commit -m "feat: WikiLink extension — ProseMirror decoration plugin for [[wiki links]]"
```

---

## Task 12: Aurora Glass AppShell

**Files:**
- Create: `src/renderer/components/layout/AppShell.tsx`
- Create: `src/renderer/components/layout/AppShell.module.css`

- [ ] **Step 1: Create AppShell.module.css**

```css
/* src/renderer/components/layout/AppShell.module.css */

.root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background:
    radial-gradient(ellipse 55% 55% at 15% 70%, rgba(20, 120, 160, 0.4) 0%, transparent 70%),
    radial-gradient(ellipse 50% 50% at 85% 25%, rgba(80, 40, 160, 0.35) 0%, transparent 65%),
    radial-gradient(ellipse 65% 40% at 55% 100%, rgba(0, 160, 140, 0.18) 0%, transparent 70%),
    #060b12;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #c8d8f0;
}

.titlebar {
  height: 36px;
  -webkit-app-region: drag;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 80px 0 16px;
  background: rgba(255, 255, 255, 0.025);
  backdrop-filter: blur(40px) saturate(200%);
  -webkit-backdrop-filter: blur(40px) saturate(200%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  gap: 12px;
}

.titlebar > * { -webkit-app-region: no-drag; }

.titleName {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 0.04em;
  font-weight: 500;
  flex: 1;
  text-align: center;
  pointer-events: none;
}

.body { flex: 1; display: flex; overflow: hidden; }

.sidebarLeft {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
}

.sidebarRight {
  width: 240px;
  flex-shrink: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.025);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
}

.editorArea {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.015);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.searchShortcut {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}

.searchShortcut:hover { background: rgba(255, 255, 255, 0.1); color: rgba(255,255,255,0.5); }
```

- [ ] **Step 2: Create AppShell.tsx**

```tsx
// src/renderer/components/layout/AppShell.tsx
import React, { useEffect, useCallback } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useVaultStore } from '../../stores/vaultStore'
import styles from './AppShell.module.css'

interface AppShellProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  rightPanel: React.ReactNode
}

export function AppShell({ sidebar, children, rightPanel }: AppShellProps): JSX.Element {
  const config = useVaultStore(s => s.config)
  const openSearch = useSearchStore(s => s.open)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault()
      openSearch()
    }
  }, [openSearch])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={styles.root}>
      <div className={styles.titlebar}>
        <span className={styles.titleName}>{config?.name ?? 'owl.md'}</span>
        <button className={styles.searchShortcut} onClick={openSearch}>⌘F</button>
      </div>
      <div className={styles.body}>
        <div className={styles.sidebarLeft}>{sidebar}</div>
        <div className={styles.editorArea}>{children}</div>
        <div className={styles.sidebarRight}>{rightPanel}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/AppShell.tsx src/renderer/components/layout/AppShell.module.css
git commit -m "feat: Aurora glass AppShell — three-panel layout, nebula gradient, glass panels"
```

---

## Task 13: LeftSidebar

**Files:**
- Create: `src/renderer/components/layout/LeftSidebar.tsx`
- Create: `src/renderer/components/layout/LeftSidebar.module.css`

- [ ] **Step 1: Create LeftSidebar.module.css**

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

.noteItem {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: 6px; margin: 1px 0;
  cursor: pointer; font-size: 12px; color: rgba(255,255,255,0.5);
  transition: background 0.1s, color 0.1s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border: none; background: none; width: 100%; text-align: left;
}
.noteItem:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
.noteItem.active { background: rgba(56,182,220,0.15); color: #72d4f0; }

.icon { font-size: 12px; flex-shrink: 0; opacity: 0.7; }
.title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.divider { height: 1px; background: rgba(255,255,255,0.05); margin: 6px 8px; }
```

- [ ] **Step 2: Create LeftSidebar.tsx**

```tsx
// src/renderer/components/layout/LeftSidebar.tsx
import React, { useCallback } from 'react'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '../../stores/editorStore'
import { ipc } from '../../lib/ipc'
import styles from './LeftSidebar.module.css'
import type { Note } from '@shared/types/Note'

export function LeftSidebar(): JSX.Element {
  const notes = useVaultStore(s => s.notes)
  const openNoteId = useVaultStore(s => s.openNoteId)
  const pinnedIds = useVaultStore(s => s.pinnedIds)
  const recentIds = useVaultStore(s => s.recentIds)
  const setOpenNote = useVaultStore(s => s.setOpenNote)
  const loadNotes = useVaultStore(s => s.loadNotes)
  const loadNote = useEditorStore(s => s.loadNote)

  const openNote = useCallback((id: string) => {
    setOpenNote(id)
    loadNote(id)
  }, [setOpenNote, loadNote])

  const createNote = useCallback(async () => {
    const title = `Untitled ${new Date().toLocaleDateString()}`
    const { note } = await ipc.notes.create(title, '')
    await loadNotes()
    openNote(note.id)
  }, [loadNotes, openNote])

  const pinned = pinnedIds.map(id => notes.find(n => n.id === id)).filter(Boolean) as Note[]
  const recent = recentIds.map(id => notes.find(n => n.id === id)).filter(Boolean).slice(0, 5) as Note[]
  const all = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className={styles.root}>
      {pinned.length > 0 && (
        <>
          <div className={styles.section}>Pinned</div>
          {pinned.map(n => <NoteRow key={n.id} note={n} active={n.id === openNoteId} icon="⭐" onClick={() => openNote(n.id)} />)}
          <div className={styles.divider} />
        </>
      )}
      {recent.length > 0 && (
        <>
          <div className={styles.section}>Recent</div>
          {recent.map(n => <NoteRow key={n.id} note={n} active={n.id === openNoteId} icon="🕐" onClick={() => openNote(n.id)} />)}
          <div className={styles.divider} />
        </>
      )}
      <div className={styles.section}>
        All Notes
        <button className={styles.addButton} onClick={createNote} title="New note">+</button>
      </div>
      <div className={styles.noteList}>
        {all.map(n => <NoteRow key={n.id} note={n} active={n.id === openNoteId} icon="📄" onClick={() => openNote(n.id)} />)}
      </div>
    </div>
  )
}

function NoteRow({ note, active, icon, onClick }: { note: Note; active: boolean; icon: string; onClick: () => void }): JSX.Element {
  return (
    <button className={`${styles.noteItem} ${active ? styles.active : ''}`} onClick={onClick}>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.title}>{note.title}</span>
    </button>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/LeftSidebar.tsx src/renderer/components/layout/LeftSidebar.module.css
git commit -m "feat: LeftSidebar — pinned, recent, all notes list, new note button"
```

---

## Task 14: RightSidebar — Backlinks Panel

**Files:**
- Create: `src/renderer/components/layout/RightSidebar.tsx`
- Create: `src/renderer/components/layout/RightSidebar.module.css`

- [ ] **Step 1: Create RightSidebar.module.css**

```css
/* src/renderer/components/layout/RightSidebar.module.css */

.root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.section {
  padding: 12px 12px 6px;
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em;
  color: rgba(255,255,255,0.2); font-weight: 600;
  flex-shrink: 0; border-bottom: 1px solid rgba(255,255,255,0.05);
}

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
.blLink { font-size: 10px; color: rgba(56,182,220,0.6); margin-top: 2px; }

.empty { padding: 16px 12px; font-size: 11px; color: rgba(255,255,255,0.2); font-style: italic; }
```

- [ ] **Step 2: Create RightSidebar.tsx**

```tsx
// src/renderer/components/layout/RightSidebar.tsx
import React, { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import { ipc } from '../../lib/ipc'
import type { BacklinkResult } from '@shared/types/Note'
import styles from './RightSidebar.module.css'

export function RightSidebar(): JSX.Element {
  const note = useEditorStore(s => s.note)
  const setOpenNote = useVaultStore(s => s.setOpenNote)
  const loadNote = useEditorStore(s => s.loadNote)
  const [backlinks, setBacklinks] = useState<BacklinkResult[]>([])

  useEffect(() => {
    if (!note) { setBacklinks([]); return }
    ipc.notes.getBacklinks(note.id).then(setBacklinks).catch(() => setBacklinks([]))
  }, [note?.id])

  const open = (id: string): void => { setOpenNote(id); loadNote(id) }

  return (
    <div className={styles.root}>
      <div className={styles.section}>Backlinks {backlinks.length > 0 && `(${backlinks.length})`}</div>
      <div className={styles.list}>
        {backlinks.length === 0
          ? <div className={styles.empty}>{note ? 'No backlinks yet' : 'Open a note to see backlinks'}</div>
          : backlinks.map((bl, i) => (
              <button key={i} className={styles.backlink} onClick={() => open(bl.sourceNoteId)}>
                <div className={styles.blTitle}>{bl.sourceTitle}</div>
                <div className={styles.blLink}>← [[{bl.linkText}]]</div>
              </button>
            ))
        }
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/RightSidebar.tsx src/renderer/components/layout/RightSidebar.module.css
git commit -m "feat: RightSidebar — backlinks panel with note navigation"
```

---

## Task 15: NoteEditor

**Files:**
- Create: `src/renderer/components/editor/NoteEditor.tsx`
- Create: `src/renderer/components/editor/NoteEditor.module.css`

- [ ] **Step 1: Create NoteEditor.module.css**

```css
/* src/renderer/components/editor/NoteEditor.module.css */

.root { flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 20px; border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0; background: rgba(255,255,255,0.02);
}

.saveStatus { font-size: 10px; margin-left: auto; }
.saving { color: rgba(255,255,255,0.3); }
.saved  { color: rgba(56,182,120,0.7); }
.error  { color: rgba(220,80,80,0.7); }
.dirty  { color: rgba(220,180,60,0.7); }

.editorWrap { flex: 1; overflow-y: auto; padding: 32px 48px; }
.editorWrap::-webkit-scrollbar { width: 6px; }
.editorWrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

.editorWrap :global(.ProseMirror) {
  outline: none; min-height: calc(100vh - 200px);
  font-size: 15px; line-height: 1.75;
  color: rgba(255,255,255,0.85); max-width: 720px; margin: 0 auto;
}
.editorWrap :global(.ProseMirror h1) { font-size: 28px; font-weight: 700; color: #e8eeff; margin: 0 0 20px; line-height: 1.3; }
.editorWrap :global(.ProseMirror h2) { font-size: 22px; font-weight: 600; color: #dde8ff; margin: 28px 0 12px; }
.editorWrap :global(.ProseMirror h3) { font-size: 18px; font-weight: 600; color: #ccd8f0; margin: 22px 0 10px; }
.editorWrap :global(.ProseMirror p)  { margin: 0 0 12px; }
.editorWrap :global(.ProseMirror code) {
  font-family: 'SF Mono', monospace; font-size: 13px;
  background: rgba(255,255,255,0.07); padding: 2px 5px; border-radius: 4px; color: #80c8e0;
}
.editorWrap :global(.ProseMirror pre) {
  background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; padding: 16px; overflow-x: auto; margin: 16px 0;
}
.editorWrap :global(.ProseMirror pre code) { background: none; padding: 0; font-size: 13px; color: #c8d8f0; }
.editorWrap :global(.ProseMirror blockquote) {
  border-left: 3px solid rgba(56,182,220,0.4); margin: 12px 0;
  padding-left: 16px; color: rgba(255,255,255,0.5); font-style: italic;
}
.editorWrap :global(.ProseMirror ul),
.editorWrap :global(.ProseMirror ol) { padding-left: 24px; margin: 0 0 12px; }
.editorWrap :global(.ProseMirror li) { margin-bottom: 4px; }
.editorWrap :global(.ProseMirror hr) { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0; }

/* Wiki link decoration styling */
.editorWrap :global(.wiki-link) {
  color: #5bc8f0;
  background: rgba(56,182,220,0.1);
  border-bottom: 1px solid rgba(56,182,220,0.3);
  border-radius: 3px; padding: 0 2px; cursor: pointer;
  transition: background 0.15s;
}
.editorWrap :global(.wiki-link:hover) { background: rgba(56,182,220,0.2); }

/* Placeholder */
.editorWrap :global(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left; color: rgba(255,255,255,0.2); pointer-events: none; height: 0;
}

.empty { flex: 1; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.2); font-size: 14px; }
```

- [ ] **Step 2: Create NoteEditor.tsx**

```tsx
// src/renderer/components/editor/NoteEditor.tsx
import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/WikiLink'
import { useEditorStore } from '../../stores/editorStore'
import styles from './NoteEditor.module.css'

const AUTOSAVE_MS = 1500

export function NoteEditor(): JSX.Element {
  const note = useEditorStore(s => s.note)
  const markdown = useEditorStore(s => s.markdown)
  const isDirty = useEditorStore(s => s.isDirty)
  const saveStatus = useEditorStore(s => s.saveStatus)
  const setMarkdown = useEditorStore(s => s.setMarkdown)
  const save = useEditorStore(s => s.save)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      WikiLink,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
    ],
    content: markdown,
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown.getMarkdown() as string
      setMarkdown(md)
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

  // Sync editor content when a different note is opened
  useEffect(() => {
    if (!editor) return
    const current = editor.storage.markdown?.getMarkdown() as string | undefined
    if (current !== markdown) editor.commands.setContent(markdown)
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cmd/Ctrl+S manual save
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

  if (!note) return <div className={styles.empty}>Open a note or create a new one</div>

  const statusLabel =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? '✓ Saved' :
    saveStatus === 'error'  ? '✗ Save failed' :
    isDirty ? '●' : ''

  const statusClass = saveStatus !== 'idle' ? styles[saveStatus] : isDirty ? styles.dirty : ''

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={`${styles.saveStatus} ${statusClass}`}>{statusLabel}</span>
      </div>
      <div className={styles.editorWrap}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/editor/NoteEditor.tsx src/renderer/components/editor/NoteEditor.module.css
git commit -m "feat: NoteEditor — TipTap with Markdown extension, WikiLink decoration, autosave"
```

---

## Task 16: SearchModal

**Files:**
- Create: `src/renderer/components/search/SearchModal.tsx`
- Create: `src/renderer/components/search/SearchResults.tsx`
- Create: `src/renderer/components/search/SearchModal.module.css`

- [ ] **Step 1: Create SearchModal.module.css**

```css
/* src/renderer/components/search/SearchModal.module.css */

.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 15vh; z-index: 1000;
}

.modal {
  width: 600px; max-width: 90vw;
  background: rgba(10,16,28,0.95);
  backdrop-filter: blur(40px) saturate(200%); -webkit-backdrop-filter: blur(40px) saturate(200%);
  border: 1px solid rgba(56,182,220,0.2);
  border-radius: 14px; overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
}

.inputWrap {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.07);
}

.searchIcon { font-size: 14px; color: rgba(255,255,255,0.3); flex-shrink: 0; }

.input {
  flex: 1; background: none; border: none; outline: none;
  font-size: 15px; color: rgba(255,255,255,0.85); font-family: inherit;
}
.input::placeholder { color: rgba(255,255,255,0.25); }

.results { max-height: 420px; overflow-y: auto; }
.results::-webkit-scrollbar { width: 4px; }
.results::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.empty { padding: 24px; text-align: center; font-size: 13px; color: rgba(255,255,255,0.2); }

.result {
  display: flex; flex-direction: column; gap: 3px;
  padding: 10px 16px; cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background 0.1s;
  text-align: left; background: none; border-left: none; border-right: none; border-top: none;
  width: 100%;
}
.result:hover { background: rgba(56,182,220,0.1); }

.resultTitle { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.8); }
.resultPath { font-size: 10px; color: rgba(255,255,255,0.25); }

.resultExcerpt { font-size: 11px; color: rgba(255,255,255,0.4); line-height: 1.5; }
.resultExcerpt :global(mark) {
  background: rgba(56,182,220,0.25); color: #72d4f0; border-radius: 2px; padding: 0 2px;
}
```

- [ ] **Step 2: Create SearchResults.tsx**

```tsx
// src/renderer/components/search/SearchResults.tsx
import React from 'react'
import type { SearchResult } from '@shared/types/Note'
import styles from './SearchModal.module.css'

interface Props {
  results: SearchResult[]
  onSelect: (r: SearchResult) => void
}

export function SearchResults({ results, onSelect }: Props): JSX.Element {
  if (results.length === 0) return <div className={styles.empty}>No results</div>

  return (
    <>
      {results.map(r => (
        <button key={r.id} className={styles.result} onClick={() => onSelect(r)}>
          <div className={styles.resultTitle}>{r.title}</div>
          <div className={styles.resultPath}>{r.path}</div>
          {r.excerpt && (
            <div
              className={styles.resultExcerpt}
              dangerouslySetInnerHTML={{ __html: r.excerpt }}
            />
          )}
        </button>
      ))}
    </>
  )
}
```

- [ ] **Step 3: Create SearchModal.tsx**

```tsx
// src/renderer/components/search/SearchModal.tsx
import React, { useEffect, useRef } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '../../stores/editorStore'
import { SearchResults } from './SearchResults'
import type { SearchResult } from '@shared/types/Note'
import styles from './SearchModal.module.css'

export function SearchModal(): JSX.Element | null {
  const isOpen = useSearchStore(s => s.isOpen)
  const query = useSearchStore(s => s.query)
  const results = useSearchStore(s => s.results)
  const isLoading = useSearchStore(s => s.isLoading)
  const setQuery = useSearchStore(s => s.setQuery)
  const close = useSearchStore(s => s.close)
  const setOpenNote = useVaultStore(s => s.setOpenNote)
  const loadNote = useEditorStore(s => s.loadNote)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 0)
  }, [isOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const selectResult = (r: SearchResult): void => {
    setOpenNote(r.id)
    loadNote(r.id)
    close()
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div className={styles.modal}>
        <div className={styles.inputWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search notes…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className={styles.results}>
          {!query && <div className={styles.empty}>Type to search across all notes</div>}
          {query && isLoading && <div className={styles.empty}>Searching…</div>}
          {query && !isLoading && <SearchResults results={results} onSelect={selectResult} />}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/search/
git commit -m "feat: SearchModal — FTS5 search UI with Aurora glass overlay"
```

---

## Task 17: App.tsx — Vault Gate + Root Layout

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/index.tsx`
- Create: `src/renderer/App.module.css`

- [ ] **Step 1: Create App.module.css**

```css
/* src/renderer/App.module.css */

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --accent-teal: #38b6dc;
  --accent-violet: #7c5cf7;
}

.vaultGate {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100vh; gap: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background:
    radial-gradient(ellipse 55% 55% at 15% 70%, rgba(20,120,160,0.4) 0%, transparent 70%),
    radial-gradient(ellipse 50% 50% at 85% 25%, rgba(80,40,160,0.35) 0%, transparent 65%),
    #060b12;
  color: rgba(255,255,255,0.85);
}

.logo {
  font-size: 48px; font-weight: 800;
  background: linear-gradient(135deg, #38b6dc 0%, #7c5cf7 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text; letter-spacing: -0.02em;
}

.tagline { font-size: 14px; color: rgba(255,255,255,0.3); }

.buttonGroup { display: flex; gap: 12px; margin-top: 8px; }

.btn {
  padding: 10px 22px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; border: none; transition: opacity 0.15s; font-family: inherit;
}
.btn:hover { opacity: 0.85; }

.btnPrimary { background: linear-gradient(135deg, #38b6dc, #7c5cf7); color: white; }

.btnSecondary {
  background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7);
  border: 1px solid rgba(255,255,255,0.12);
}

.error { font-size: 12px; color: rgba(220,80,80,0.8); max-width: 400px; text-align: center; }
```

- [ ] **Step 2: Rewrite src/renderer/App.tsx**

```tsx
// src/renderer/App.tsx
import React, { useState, useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { RightSidebar } from './components/layout/RightSidebar'
import { NoteEditor } from './components/editor/NoteEditor'
import { SearchModal } from './components/search/SearchModal'
import { useVaultStore } from './stores/vaultStore'
import { useEditorStore } from './stores/editorStore'
import styles from './App.module.css'

export default function App(): JSX.Element {
  const config = useVaultStore(s => s.config)
  const openVault = useVaultStore(s => s.openVault)
  const createVault = useVaultStore(s => s.createVault)
  const notes = useVaultStore(s => s.notes)
  const setOpenNote = useVaultStore(s => s.setOpenNote)
  const loadNote = useEditorStore(s => s.loadNote)
  const [error, setError] = useState<string | null>(null)

  // Navigate to a note when a [[wiki link]] is clicked
  useEffect(() => {
    const handler = (e: Event): void => {
      const { target } = (e as CustomEvent<{ target: string }>).detail
      const linked = notes.find(n => n.title === target)
      if (linked) { setOpenNote(linked.id); loadNote(linked.id) }
    }
    window.addEventListener('owl:open-wiki-link', handler)
    return () => window.removeEventListener('owl:open-wiki-link', handler)
  }, [notes, setOpenNote, loadNote])

  const handleOpen = async (): Promise<void> => {
    try {
      setError(null)
      const path = window.prompt('Enter vault path:')
      if (!path) return
      await openVault(path)
    } catch (e) { setError((e as Error).message) }
  }

  const handleCreate = async (): Promise<void> => {
    try {
      setError(null)
      const path = window.prompt('New vault path:')
      if (!path) return
      const name = window.prompt('Vault name:') ?? 'My Vault'
      await createVault(path, name)
    } catch (e) { setError((e as Error).message) }
  }

  if (!config) {
    return (
      <div className={styles.vaultGate}>
        <div className={styles.logo}>owl.md</div>
        <div className={styles.tagline}>local-first knowledge workspace</div>
        <div className={styles.buttonGroup}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleOpen}>Open Vault</button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={handleCreate}>Create Vault</button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    )
  }

  return (
    <>
      <AppShell sidebar={<LeftSidebar />} rightPanel={<RightSidebar />}>
        <NoteEditor />
      </AppShell>
      <SearchModal />
    </>
  )
}
```

- [ ] **Step 3: Update src/renderer/index.tsx**

```tsx
// src/renderer/index.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx src/renderer/App.module.css src/renderer/index.tsx
git commit -m "feat: App.tsx — vault gate, root layout, wiki-link navigation"
```

---

## Task 18: Final Verification

- [ ] **Step 1: Run all tests**

```bash
npm test -- --reporter=verbose 2>&1
```

Expected output:
```
main > DatabaseService > creates .owl/db.sqlite on open    ✓
main > DatabaseService > creates notes table               ✓
main > DatabaseService > creates notes_fts virtual table   ✓
main > DatabaseService > creates links, tags, blocks tables ✓
main > DatabaseService > records schema_version = 1        ✓
main > DatabaseService > is idempotent                     ✓
main > VaultService    > creates notes/ and attachments/   ✓
...
renderer > WikiLink > detects [[simple link]]              ✓
...

Test Files  N passed
Tests      N passed
```

Zero failures required before proceeding.

- [ ] **Step 2: Build the app**

```bash
npm run build 2>&1 | tail -20
```

Expected: `out/` directory created with `main/index.js`, `preload/index.js`, `renderer/index.html`. No TypeScript errors.

- [ ] **Step 3: Smoke test the app manually**

```bash
npm run dev
```

Work through this checklist:

- [ ] App opens with vault gate — "owl.md" gradient logo, "Open Vault" + "Create Vault" buttons
- [ ] Click "Create Vault" → enter a path → enter a name → main layout loads with Aurora glass UI
- [ ] Three-panel layout visible: glass sidebars, glass editor area, nebula gradient background
- [ ] Click "+" in left sidebar → new note created, note appears in "All Notes" list, editor opens
- [ ] Type `# My Note` and some body text → "●" dirty indicator appears in toolbar
- [ ] Wait 1.5s → auto-saves → "✓ Saved" appears and fades
- [ ] Press Cmd/Ctrl+S → immediate save
- [ ] Type `[[Another Note]]` in the editor → teal wiki-link highlighting appears
- [ ] Press Cmd/Ctrl+F → search modal opens with Aurora glass overlay
- [ ] Type a word → results appear with `<mark>`-highlighted excerpts
- [ ] Click a result → modal closes, that note opens
- [ ] Create a second note that links `[[first note title]]` → open the first note → backlinks panel shows the second note
- [ ] Verify `<vault>/notes/<title>.md` exists on disk with correct markdown
- [ ] Verify `<vault>/.owl/db.sqlite` exists

- [ ] **Step 4: Final commit**

```bash
git add -A && git commit -m "feat: Phase 1 complete — vault, editor, wiki links, backlinks, FTS5, Aurora glass UI"
```

---

## Appendix: Running Tests

```bash
npm test                                               # all tests, once
npm run test:watch                                     # watch mode
npm test -- tests/main/services/IndexService.test.ts  # single file
npm run test:ui                                        # browser UI
```

## Appendix: Common Pitfalls

**`better-sqlite3` native module not found in Electron renderer:**
SQLite should only ever be used in the main process. If you see this error, you've accidentally imported `DatabaseService` or `IndexService` into renderer code.

**FTS5 returns empty results after indexing:**
The FTS5 `content=notes` option delegates content storage to the `notes` table but requires explicit `syncFTS()` calls to populate the search index body. Verify `syncFTS(id, title, content)` is called after every `indexNote()`.

**Chokidar misses events on Linux:**
If file changes from an external editor don't trigger reindex, the filesystem may not support inotify. Add `usePolling: true` to the chokidar options in `WatcherService.ts`.

**TipTap content not updating when switching notes:**
The `useEffect` in `NoteEditor` only depends on `note?.id`. If the note ID doesn't change (e.g., renaming a note), call `editor.commands.setContent(markdown)` explicitly from the component that triggers the rename.

**Wiki links don't navigate:**
The `owl:open-wiki-link` custom event is only listened to in `App.tsx`. If the note list (`notes` from `vaultStore`) is stale (e.g., note was just created and not yet in the list), call `loadNotes()` first and then re-attempt navigation.
