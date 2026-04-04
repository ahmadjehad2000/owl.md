# Phase 1 Desktop Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all browser-only APIs (`prompt`/`alert`), auto-compute vault paths in Documents, show vault list instead of file picker, persist last-opened vault and auto-open on startup, support multiple open vault sessions with in-app switching, and add a Vaults menu to the toolbar.

**Architecture:** A new `SettingsService` (main process) persists vault registry and last-opened path to `userData/settings.json`. `main/index.ts` is refactored from module-level singletons to a `Map<string, VaultSession>` so multiple vault sessions can be open simultaneously. `App.tsx` becomes a state machine (`init → welcome | create | loading | vault-list → ready`). A `VaultManagerModal` handles in-app vault creation/opening with a single/both choice. The AppShell titlebar gains a vault switcher dropdown when multiple sessions are open.

**Tech Stack:** Electron 28 (`app.getPath`), React 18, Zustand 4, CSS Modules, Node.js `fs`/`path`, Vitest.

---

## File Map

| Status | File | Purpose |
|--------|------|---------|
| Create | `src/main/services/SettingsService.ts` | Persists `{ knownVaults, lastVaultPath }` to `userData/settings.json` |
| Modify | `src/main/index.ts` | Replace 4 module singletons with `Map<string, VaultSession>`; wire SettingsService |
| Modify | `src/main/ipc/vault.ts` | New handlers: `vault:create` (name only), `vault:activate`, `vault:list-known`, `vault:get-last`, `vault:get-sessions` |
| Modify | `src/shared/types/IPC.ts` | Add 4 new vault API types; change `create` signature to `(name) → VaultConfig` |
| Modify | `src/preload/index.ts` | Expose new vault channels |
| Modify | `src/renderer/lib/ipc.ts` | Add new vault method wrappers |
| Modify | `src/renderer/stores/vaultStore.ts` | Add `openedConfigs[]`, `activateVault(path)`, change `createVault` to name-only |
| Modify | `src/renderer/App.tsx` | State machine; remove `prompt()`; create/loading/vault-list screens |
| Modify | `src/renderer/App.module.css` | Add create-name input, vault-card, loading-message styles |
| Create | `src/renderer/components/vault/VaultManagerModal.tsx` | In-app create/open modal with single/both choice; used from MenuBar |
| Create | `src/renderer/components/vault/VaultManagerModal.module.css` | Modal styles |
| Create | `src/renderer/stores/vaultManagerStore.ts` | `{ isOpen, mode: 'create' \| 'open' \| null }` |
| Modify | `src/renderer/components/layout/AppShell.tsx` | Render `<VaultManagerModal />`; add vault switcher to titlebar when >1 session open |
| Modify | `src/renderer/components/layout/AppShell.module.css` | Vault switcher styles |
| Modify | `src/renderer/components/layout/MenuBar.tsx` | Add Vaults menu; replace `alert()` with store dispatch |
| Create | `tests/main/services/SettingsService.test.ts` | 6 unit tests for SettingsService |

---

### Task 1: SettingsService + IPC layer

**Files:**
- Create: `src/main/services/SettingsService.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/vault.ts`
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/ipc.ts`
- Test: `tests/main/services/SettingsService.test.ts`

- [ ] **Step 1: Write failing tests for SettingsService**

```typescript
// tests/main/services/SettingsService.test.ts
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { SettingsService } from '../../../src/main/services/SettingsService'

let testDir: string
let service: SettingsService

beforeEach(() => {
  testDir = join(tmpdir(), `owl-settings-${randomUUID()}`)
  mkdirSync(testDir, { recursive: true })
  service = new SettingsService(testDir)
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('SettingsService', () => {
  it('returns empty known vaults on first init', () => {
    expect(service.getKnownVaults()).toEqual([])
  })

  it('returns null last vault path on first init', () => {
    expect(service.getLastVaultPath()).toBeNull()
  })

  it('persists and retrieves a known vault', () => {
    const config = { name: 'Test', path: '/tmp/test', createdAt: 1000, schemaVersion: 1 }
    service.addKnownVault(config)
    expect(service.getKnownVaults()).toHaveLength(1)
    expect(service.getKnownVaults()[0]).toEqual(config)
  })

  it('updates existing vault when added again with same path', () => {
    const config = { name: 'Test', path: '/tmp/test', createdAt: 1000, schemaVersion: 1 }
    service.addKnownVault(config)
    service.addKnownVault({ ...config, name: 'Updated' })
    expect(service.getKnownVaults()).toHaveLength(1)
    expect(service.getKnownVaults()[0].name).toBe('Updated')
  })

  it('persists and retrieves last vault path', () => {
    service.setLastVaultPath('/tmp/my-vault')
    expect(service.getLastVaultPath()).toBe('/tmp/my-vault')
  })

  it('persists across instances (reads from disk)', () => {
    const config = { name: 'Test', path: '/tmp/test', createdAt: 1000, schemaVersion: 1 }
    service.addKnownVault(config)
    service.setLastVaultPath('/tmp/test')
    const service2 = new SettingsService(testDir)
    expect(service2.getKnownVaults()).toHaveLength(1)
    expect(service2.getLastVaultPath()).toBe('/tmp/test')
  })
})
```

- [ ] **Step 2: Run test — confirm fail**

Run: `npx vitest run tests/main/services/SettingsService.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/services/SettingsService'`

- [ ] **Step 3: Create `src/main/services/SettingsService.ts`**

```typescript
// src/main/services/SettingsService.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { VaultConfig } from '@shared/types/Note'

interface Settings {
  knownVaults: VaultConfig[]
  lastVaultPath: string | null
}

export class SettingsService {
  private readonly settingsPath: string
  private settings: Settings

  constructor(userDataPath: string) {
    this.settingsPath = join(userDataPath, 'settings.json')
    this.settings = this.load()
  }

  private load(): Settings {
    if (!existsSync(this.settingsPath)) {
      return { knownVaults: [], lastVaultPath: null }
    }
    try {
      return JSON.parse(readFileSync(this.settingsPath, 'utf-8')) as Settings
    } catch {
      return { knownVaults: [], lastVaultPath: null }
    }
  }

  private save(): void {
    mkdirSync(dirname(this.settingsPath), { recursive: true })
    writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
  }

  getKnownVaults(): VaultConfig[] {
    return this.settings.knownVaults
  }

  addKnownVault(config: VaultConfig): void {
    const idx = this.settings.knownVaults.findIndex(v => v.path === config.path)
    if (idx >= 0) {
      this.settings.knownVaults[idx] = config
    } else {
      this.settings.knownVaults.push(config)
    }
    this.save()
  }

  getLastVaultPath(): string | null {
    return this.settings.lastVaultPath
  }

  setLastVaultPath(path: string): void {
    this.settings.lastVaultPath = path
    this.save()
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/main/services/SettingsService.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Rewrite `src/main/index.ts`**

Replace the entire file:

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { join, relative, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { DatabaseService } from './services/DatabaseService'
import { VaultService } from './services/VaultService'
import { IndexService } from './services/IndexService'
import { WatcherService } from './services/WatcherService'
import { SettingsService } from './services/SettingsService'
import { registerVaultHandlers } from './ipc/vault'
import { registerNotesHandlers } from './ipc/notes'
import { registerSearchHandlers } from './ipc/search'
import type { VaultConfig } from '@shared/types/Note'

type VaultSession = {
  db:      DatabaseService
  vault:   VaultService
  index:   IndexService
  watcher: WatcherService
  config:  VaultConfig
}

const sessions = new Map<string, VaultSession>()
let activePath: string | null = null
let settingsService: SettingsService

function activeSession(): VaultSession {
  const s = sessions.get(activePath ?? '')
  if (!s) throw new Error('No active vault')
  return s
}

function safeVaultFolderName(name: string): string {
  const safe = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return safe || 'my-vault'
}

async function openVault(vaultPath: string): Promise<VaultConfig> {
  // Already open → just activate
  if (sessions.has(vaultPath)) {
    activePath = vaultPath
    settingsService.setLastVaultPath(vaultPath)
    return sessions.get(vaultPath)!.config
  }

  const vaultService = new VaultService(vaultPath)
  const dbService    = new DatabaseService(vaultPath)
  dbService.open()
  const indexService   = new IndexService(dbService.get())
  const watcherService = new WatcherService(vaultPath)

  for (const notePath of vaultService.listNotes()) {
    const markdown    = vaultService.readNote(notePath)
    const titleMatch  = markdown.match(/^#\s+(.+)$/m)
    const title       = titleMatch ? titleMatch[1] : basename(notePath, '.md')
    const id          = getOrCreateNoteId(dbService, notePath)
    const folderPath  = dirname(notePath) === '.' ? '' : dirname(notePath)
    indexService.indexNote({ id, path: notePath, title, markdown, folderPath, noteType: 'note' })
    indexService.syncFTS(id, title, markdown)
  }
  indexService.resolveLinks()

  watcherService.start({
    onFileChanged: (absPath) => {
      const rel        = relative(join(vaultPath, 'notes'), absPath)
      const markdown   = vaultService.readNote(rel)
      const titleMatch = markdown.match(/^#\s+(.+)$/m)
      const title      = titleMatch ? titleMatch[1] : basename(rel, '.md')
      const id         = getOrCreateNoteId(dbService, rel)
      const folderPath = dirname(rel) === '.' ? '' : dirname(rel)
      indexService.indexNote({ id, path: rel, title, markdown, folderPath, noteType: 'note' })
      indexService.syncFTS(id, title, markdown)
      indexService.resolveLinks()
    },
    onFileDeleted: (absPath) => {
      const rel = relative(join(vaultPath, 'notes'), absPath)
      const row = dbService.get().prepare('SELECT id FROM notes WHERE path = ?').get(rel) as
        { id: string } | undefined
      if (row) indexService.removeNote(row.id)
    },
  })

  const config = vaultService.getConfig()
  sessions.set(vaultPath, { db: dbService, vault: vaultService, index: indexService, watcher: watcherService, config })
  activePath = vaultPath
  settingsService.addKnownVault(config)
  settingsService.setLastVaultPath(vaultPath)
  return config
}

async function createVault(name: string): Promise<VaultConfig> {
  const vaultPath = join(app.getPath('documents'), safeVaultFolderName(name))
  if (existsSync(join(vaultPath, '.owl', 'config.json'))) {
    throw new Error(`A vault already exists at "${vaultPath}". Choose a different name.`)
  }
  const vaultService = new VaultService(vaultPath)
  vaultService.init(name)
  return openVault(vaultPath)
}

function getOrCreateNoteId(dbService: DatabaseService, notePath: string): string {
  const row = dbService.get().prepare('SELECT id FROM notes WHERE path = ?').get(notePath) as
    { id: string } | undefined
  return row?.id ?? crypto.randomUUID()
}

app.whenReady().then(() => {
  settingsService = new SettingsService(app.getPath('userData'))

  registerVaultHandlers({
    openVault,
    createVault,
    activateVault: async (path: string) => {
      if (!sessions.has(path)) return openVault(path)
      activePath = path
      settingsService.setLastVaultPath(path)
      return sessions.get(path)!.config
    },
    listKnownVaults:  () => settingsService.getKnownVaults(),
    getLastVaultPath: () => settingsService.getLastVaultPath(),
    getOpenSessions:  () => Array.from(sessions.values()).map(s => s.config),
  })

  registerNotesHandlers({
    db:    () => activeSession().db,
    vault: () => activeSession().vault,
    index: () => activeSession().index,
  })

  registerSearchHandlers(() => activeSession().index)

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#060b12',
    show: false,
  })

  win.removeMenu()
  win.on('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
})

app.on('window-all-closed', async () => {
  for (const session of sessions.values()) {
    await session.watcher.stop()
    session.db.close()
  }
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 6: Rewrite `src/main/ipc/vault.ts`**

Replace the entire file:

```typescript
// src/main/ipc/vault.ts
import { ipcMain } from 'electron'
import type { VaultConfig } from '@shared/types/Note'

export function registerVaultHandlers(services: {
  openVault:        (path: string) => Promise<VaultConfig>
  createVault:      (name: string) => Promise<VaultConfig>
  activateVault:    (path: string) => Promise<VaultConfig>
  listKnownVaults:  ()             => VaultConfig[]
  getLastVaultPath: ()             => string | null
  getOpenSessions:  ()             => VaultConfig[]
}): void {
  ipcMain.handle('vault:open',         (_e, path: string) => services.openVault(path))
  ipcMain.handle('vault:create',       (_e, name: string) => services.createVault(name))
  ipcMain.handle('vault:activate',     (_e, path: string) => services.activateVault(path))
  ipcMain.handle('vault:list-known',   ()                  => services.listKnownVaults())
  ipcMain.handle('vault:get-last',     ()                  => services.getLastVaultPath())
  ipcMain.handle('vault:get-sessions', ()                  => services.getOpenSessions())
  // Kept for compatibility — returns active vault config
  ipcMain.handle('vault:getConfig',    ()                  => services.getOpenSessions()[0] ?? null)
}
```

- [ ] **Step 7: Update `src/shared/types/IPC.ts`**

Replace the entire file:

```typescript
// src/shared/types/IPC.ts
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from './Note'

export interface OwlVaultAPI {
  open:         (vaultPath: string) => Promise<VaultConfig>
  create:       (name: string)      => Promise<VaultConfig>
  activate:     (vaultPath: string) => Promise<VaultConfig>
  listKnown:    ()                  => Promise<VaultConfig[]>
  getLast:      ()                  => Promise<string | null>
  getSessions:  ()                  => Promise<VaultConfig[]>
  getConfig:    ()                  => Promise<VaultConfig | null>
}

export interface OwlNotesAPI {
  list:         () => Promise<Note[]>
  read:         (id: string) => Promise<NoteContent>
  save:         (id: string, markdown: string) => Promise<Note>
  create:       (title: string, folderPath: string) => Promise<NoteContent>
  delete:       (id: string) => Promise<void>
  getBacklinks: (id: string) => Promise<BacklinkResult[]>
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

- [ ] **Step 8: Update `src/preload/index.ts`**

Replace the entire file:

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
    read:         (id)            => ipcRenderer.invoke('notes:read',        id),
    save:         (id, markdown)  => ipcRenderer.invoke('notes:save',        id, markdown),
    create:       (title, folder) => ipcRenderer.invoke('notes:create',      title, folder),
    delete:       (id)            => ipcRenderer.invoke('notes:delete',      id),
    getBacklinks: (id)            => ipcRenderer.invoke('notes:getBacklinks', id),
  },
  search: {
    query: (q) => ipcRenderer.invoke('search:query', q),
  },
}

contextBridge.exposeInMainWorld('owl', owl)
```

- [ ] **Step 9: Update `src/renderer/lib/ipc.ts`**

Replace the entire file:

```typescript
// src/renderer/lib/ipc.ts
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from '@shared/types/Note'

export const ipc = {
  vault: {
    open:        (path: string):  Promise<VaultConfig>        => window.owl.vault.open(path),
    create:      (name: string):  Promise<VaultConfig>        => window.owl.vault.create(name),
    activate:    (path: string):  Promise<VaultConfig>        => window.owl.vault.activate(path),
    listKnown:   ():              Promise<VaultConfig[]>       => window.owl.vault.listKnown(),
    getLast:     ():              Promise<string | null>       => window.owl.vault.getLast(),
    getSessions: ():              Promise<VaultConfig[]>       => window.owl.vault.getSessions(),
    getConfig:   ():              Promise<VaultConfig | null>  => window.owl.vault.getConfig(),
  },
  notes: {
    list:         (): Promise<Note[]>                               => window.owl.notes.list(),
    read:         (id: string): Promise<NoteContent>               => window.owl.notes.read(id),
    save:         (id: string, md: string): Promise<Note>          => window.owl.notes.save(id, md),
    create:       (title: string, folder: string): Promise<NoteContent> => window.owl.notes.create(title, folder),
    delete:       (id: string): Promise<void>                      => window.owl.notes.delete(id),
    getBacklinks: (id: string): Promise<BacklinkResult[]>          => window.owl.notes.getBacklinks(id),
  },
  search: {
    query: (q: string): Promise<SearchResult[]> => window.owl.search.query(q),
  },
}
```

- [ ] **Step 10: Run all tests**

Run: `npx vitest run`
Expected: all tests PASS (65 tests — 59 existing + 6 new)

- [ ] **Step 11: Build — confirm no TypeScript errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 12: Commit**

```bash
git add src/main/services/SettingsService.ts \
        src/main/index.ts \
        src/main/ipc/vault.ts \
        src/shared/types/IPC.ts \
        src/preload/index.ts \
        src/renderer/lib/ipc.ts \
        tests/main/services/SettingsService.test.ts
git commit -m "feat: settings persistence, multi-vault sessions, IPC layer refactor"
```

---

### Task 2: vaultStore + App.tsx state machine

**Files:**
- Modify: `src/renderer/stores/vaultStore.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.module.css`

- [ ] **Step 1: Rewrite `src/renderer/stores/vaultStore.ts`**

Replace the entire file:

```typescript
// src/renderer/stores/vaultStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Note, VaultConfig } from '@shared/types/Note'

interface VaultState {
  config:        VaultConfig | null
  openedConfigs: VaultConfig[]        // all currently open vault sessions
  notes:         Note[]
  pinnedIds:     string[]
  recentIds:     string[]
  openNoteId:    string | null
  openVault:      (path: string) => Promise<void>
  createVault:    (name: string) => Promise<void>
  activateVault:  (path: string) => Promise<void>
  loadNotes:      () => Promise<void>
  loadSessions:   () => Promise<void>
  setOpenNote:    (id: string) => void
  pinNote:        (id: string) => void
  unpinNote:      (id: string) => void
  addRecent:      (id: string) => void
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
  },

  loadNotes: async () => {
    const notes = await ipc.notes.list()
    set({ notes })
  },

  loadSessions: async () => {
    const openedConfigs = await ipc.vault.getSessions()
    set({ openedConfigs })
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

- [ ] **Step 2: Rewrite `src/renderer/App.tsx`**

Replace the entire file:

```tsx
// src/renderer/App.tsx
import React, { useState, useEffect, useRef } from 'react'
import { AppShell } from './components/layout/AppShell'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { RightSidebar } from './components/layout/RightSidebar'
import { NoteEditor } from './components/editor/NoteEditor'
import { SearchModal } from './components/search/SearchModal'
import { useVaultStore } from './stores/vaultStore'
import { useEditorStore } from './stores/editorStore'
import { ipc } from './lib/ipc'
import styles from './App.module.css'

type Screen =
  | 'init'        // checking for last-opened vault
  | 'welcome'     // main welcome (no vault yet)
  | 'create'      // create vault — name input
  | 'loading'     // vault opening / creating
  | 'vault-list'  // pick from known vaults
  | 'ready'       // main app

const LOADING_MESSAGES = [
  'Sharpening your pencils…',
  'Teaching your notes to stay organized…',
  'Convincing folders to behave…',
  'Dusting off your ideas…',
  'Feeding the owl…',
  'Arranging your thoughts…',
  'Brewing your first idea…',
  'Waking up the index…',
]

const PARTICLES: React.CSSProperties[] = [
  { left: '6%',  bottom: '-10px', width: '3px', height: '3px', animationDelay: '0s',   animationDuration: '9s'  },
  { left: '14%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '1.3s', animationDuration: '7s'  },
  { left: '23%', bottom: '-10px', width: '4px', height: '4px', animationDelay: '3.1s', animationDuration: '11s' },
  { left: '31%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '0.7s', animationDuration: '8s'  },
  { left: '42%', bottom: '-10px', width: '3px', height: '3px', animationDelay: '5.2s', animationDuration: '10s' },
  { left: '51%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '2.4s', animationDuration: '7.5s'},
  { left: '59%', bottom: '-10px', width: '4px', height: '4px', animationDelay: '4.0s', animationDuration: '12s' },
  { left: '67%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '1.8s', animationDuration: '8.5s'},
  { left: '74%', bottom: '-10px', width: '3px', height: '3px', animationDelay: '6.5s', animationDuration: '9.5s'},
  { left: '82%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '0.4s', animationDuration: '7s'  },
  { left: '89%', bottom: '-10px', width: '3px', height: '3px', animationDelay: '3.8s', animationDuration: '11s' },
  { left: '95%', bottom: '-10px', width: '2px', height: '2px', animationDelay: '2.0s', animationDuration: '8s'  },
]

function Background(): JSX.Element {
  return (
    <div className={styles.bgScene} aria-hidden="true">
      <div className={styles.orb1} /><div className={styles.orb2} />
      <div className={styles.orb3} /><div className={styles.orb4} />
      <div className={styles.sweep} />
      {PARTICLES.map((style, i) => <div key={i} className={styles.particle} style={style} />)}
    </div>
  )
}

export default function App(): JSX.Element {
  const config       = useVaultStore(s => s.config)
  const openVault    = useVaultStore(s => s.openVault)
  const createVault  = useVaultStore(s => s.createVault)
  const notes        = useVaultStore(s => s.notes)
  const setOpenNote  = useVaultStore(s => s.setOpenNote)
  const loadNote     = useEditorStore(s => s.loadNote)

  const [screen,      setScreen]      = useState<Screen>('init')
  const [error,       setError]       = useState<string | null>(null)
  const [vaultName,   setVaultName]   = useState('')
  const [msgIndex,    setMsgIndex]    = useState(0)
  const [knownVaults, setKnownVaults] = useState<import('@shared/types/Note').VaultConfig[]>([])
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Rotate loading message every 600ms
  useEffect(() => {
    if (screen !== 'loading') return
    const id = setInterval(() => setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length), 600)
    return () => clearInterval(id)
  }, [screen])

  // Focus name input when entering create screen
  useEffect(() => {
    if (screen === 'create') setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [screen])

  // On init: check for last-opened vault
  useEffect(() => {
    ipc.vault.getLast().then(async (lastPath) => {
      if (!lastPath) { setScreen('welcome'); return }
      setMsgIndex(0)
      setScreen('loading')
      const minDelay = new Promise(r => setTimeout(r, 2000))
      try {
        await Promise.all([openVault(lastPath), minDelay])
        setScreen('ready')
      } catch {
        setScreen('welcome')
      }
    }).catch(() => setScreen('welcome'))
  }, [])

  // Sync when vault config arrives (e.g. after successful open)
  useEffect(() => {
    if (config && screen !== 'loading') setScreen('ready')
  }, [config])

  // Wiki-link navigation
  useEffect(() => {
    const handler = (e: Event): void => {
      const { target } = (e as CustomEvent<{ target: string }>).detail
      const linked = notes.find(n => n.title === target)
      if (linked) { setOpenNote(linked.id); loadNote(linked.id) }
    }
    window.addEventListener('owl:open-wiki-link', handler)
    return () => window.removeEventListener('owl:open-wiki-link', handler)
  }, [notes, setOpenNote, loadNote])

  const handleCreate = async (): Promise<void> => {
    const name = vaultName.trim()
    if (!name) return
    setError(null)
    setMsgIndex(0)
    setScreen('loading')
    const minDelay = new Promise(r => setTimeout(r, 2000))
    try {
      await Promise.all([createVault(name), minDelay])
      setScreen('ready')
    } catch (e) {
      setError((e as Error).message)
      setScreen('create')
    }
  }

  const handleOpenExisting = async (path: string): Promise<void> => {
    setError(null)
    setMsgIndex(0)
    setScreen('loading')
    const minDelay = new Promise(r => setTimeout(r, 2000))
    try {
      await Promise.all([openVault(path), minDelay])
      setScreen('ready')
    } catch (e) {
      setError((e as Error).message)
      setScreen('vault-list')
    }
  }

  const handleShowVaultList = async (): Promise<void> => {
    setError(null)
    try {
      const vaults = await ipc.vault.listKnown()
      setKnownVaults(vaults)
      setScreen('vault-list')
    } catch {
      setKnownVaults([])
      setScreen('vault-list')
    }
  }

  if (screen === 'init') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingLogo}>owl.md</div>
        <div className={styles.loadingBar}><div className={styles.loadingBarFill} /></div>
        <div className={styles.loadingMsg}>initializing…</div>
      </div>
    )
  }

  if (screen === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <Background />
        <div className={styles.gateContent}>
          <div className={styles.loadingLogo}>owl.md</div>
          <div className={styles.loadingBar}><div className={styles.loadingBarFill} /></div>
          <div className={styles.loadingMsg}>{LOADING_MESSAGES[msgIndex]}</div>
        </div>
      </div>
    )
  }

  if (screen === 'welcome' || screen === 'create' || screen === 'vault-list') {
    return (
      <div className={styles.vaultGate}>
        <Background />
        <div className={styles.gateContent}>
          <div className={styles.logoWrap}>
            <div className={styles.logoHalo} />
            <div className={styles.logo}>owl.md</div>
          </div>
          <div className={styles.tagline}>a knowledge workspace</div>

          {screen === 'welcome' && (
            <div className={styles.buttonGroup}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setScreen('create')}>
                Create Vault
              </button>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={handleShowVaultList}>
                Open Vault
              </button>
            </div>
          )}

          {screen === 'create' && (
            <div className={styles.createForm}>
              <input
                ref={nameInputRef}
                className={styles.nameInput}
                placeholder="Vault name…"
                value={vaultName}
                onChange={e => setVaultName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                maxLength={64}
              />
              <div className={styles.nameHint}>
                Stored in Documents/{vaultName.trim().replace(/[<>:"/\\|?*]/g, '-') || 'my-vault'}
              </div>
              <div className={styles.buttonGroup}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={handleCreate}
                  disabled={!vaultName.trim()}
                >
                  Create
                </button>
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { setVaultName(''); setScreen('welcome') }}>
                  Back
                </button>
              </div>
            </div>
          )}

          {screen === 'vault-list' && (
            <div className={styles.vaultList}>
              {knownVaults.length === 0
                ? <div className={styles.vaultListEmpty}>No saved vaults yet.</div>
                : knownVaults.map(v => (
                    <button key={v.path} className={styles.vaultCard} onClick={() => handleOpenExisting(v.path)}>
                      <div className={styles.vaultCardName}>{v.name}</div>
                      <div className={styles.vaultCardPath}>{v.path}</div>
                    </button>
                  ))
              }
              <button className={`${styles.btn} ${styles.btnSecondary} ${styles.btnBack}`} onClick={() => setScreen('welcome')}>
                ← Back
              </button>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>
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

- [ ] **Step 3: Add new styles to `src/renderer/App.module.css`**

Append to the end of the file (after the `.error` rule):

```css
/* ─── Create vault form ──────────────────────────── */

.createForm {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 320px;
  animation: fadeIn 0.3s ease;
}

.nameInput {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  color: rgba(255,255,255,0.85);
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(56,182,220,0.25);
  border-radius: 8px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s, background 0.15s;
  text-align: center;
}

.nameInput:focus {
  border-color: rgba(56,182,220,0.55);
  background: rgba(255,255,255,0.1);
}

.nameInput::placeholder { color: rgba(255,255,255,0.25); }

.nameHint {
  font-size: 11px;
  color: rgba(255,255,255,0.2);
  font-family: 'SF Mono', 'Fira Mono', monospace;
  letter-spacing: 0.02em;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── Vault list ─────────────────────────────────── */

.vaultList {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 360px;
  max-height: 320px;
  overflow-y: auto;
  animation: fadeIn 0.25s ease;
}

.vaultListEmpty {
  font-size: 13px;
  color: rgba(255,255,255,0.25);
  padding: 24px 0;
}

.vaultCard {
  width: 100%;
  padding: 10px 16px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s;
}

.vaultCard:hover {
  background: rgba(56,182,220,0.12);
  border-color: rgba(56,182,220,0.3);
}

.vaultCardName {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
}

.vaultCardPath {
  font-size: 10px;
  color: rgba(255,255,255,0.2);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'SF Mono', 'Fira Mono', monospace;
}

.btnBack {
  margin-top: 4px;
  align-self: flex-start;
}

/* ─── Loading screen with background ────────────── */

.loadingScreen {
  position: relative;
  overflow: hidden;
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 5: Build — confirm no TypeScript errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stores/vaultStore.ts \
        src/renderer/App.tsx \
        src/renderer/App.module.css
git commit -m "feat: welcome screen state machine, vault list, loading messages, remove prompt()"
```

---

### Task 3: VaultManagerModal — in-app create/open with single/both choice

**Files:**
- Create: `src/renderer/stores/vaultManagerStore.ts`
- Create: `src/renderer/components/vault/VaultManagerModal.tsx`
- Create: `src/renderer/components/vault/VaultManagerModal.module.css`
- Modify: `src/renderer/components/layout/AppShell.tsx`

This modal is triggered from the Vaults menu (Task 4). It handles create/open flows from inside the app, asking whether to replace the current vault or load both.

- [ ] **Step 1: Create `src/renderer/stores/vaultManagerStore.ts`**

```typescript
// src/renderer/stores/vaultManagerStore.ts
import { create } from 'zustand'

export type VaultManagerMode = 'create' | 'open' | null

interface VaultManagerState {
  isOpen: boolean
  mode:   VaultManagerMode
  show:   (mode: 'create' | 'open') => void
  hide:   () => void
}

export const useVaultManagerStore = create<VaultManagerState>(set => ({
  isOpen: false,
  mode:   null,
  show:   (mode) => set({ isOpen: true, mode }),
  hide:   () => set({ isOpen: false, mode: null }),
}))
```

- [ ] **Step 2: Create `src/renderer/components/vault/VaultManagerModal.tsx`**

```tsx
// src/renderer/components/vault/VaultManagerModal.tsx
import React, { useState, useEffect, useRef } from 'react'
import { useVaultManagerStore } from '../../stores/vaultManagerStore'
import { useVaultStore } from '../../stores/vaultStore'
import { ipc } from '../../lib/ipc'
import type { VaultConfig } from '@shared/types/Note'
import styles from './VaultManagerModal.module.css'

const LOADING_MESSAGES = [
  'Sharpening your pencils…',
  'Teaching your notes to stay organized…',
  'Convincing folders to behave…',
  'Dusting off your ideas…',
  'Feeding the owl…',
  'Arranging your thoughts…',
]

type ModalScreen = 'input' | 'choice' | 'loading' | 'done'

export function VaultManagerModal(): JSX.Element | null {
  const isOpen  = useVaultManagerStore(s => s.isOpen)
  const mode    = useVaultManagerStore(s => s.mode)
  const hide    = useVaultManagerStore(s => s.hide)

  const openVault    = useVaultStore(s => s.openVault)
  const createVault  = useVaultStore(s => s.createVault)
  const activateVault = useVaultStore(s => s.activateVault)
  const loadSessions = useVaultStore(s => s.loadSessions)

  const [screen,       setScreen]      = useState<ModalScreen>('input')
  const [vaultName,    setVaultName]   = useState('')
  const [knownVaults,  setKnownVaults] = useState<VaultConfig[]>([])
  const [pendingPath,  setPendingPath] = useState<string | null>(null)
  const [pendingName,  setPendingName] = useState<string | null>(null)
  const [msgIndex,     setMsgIndex]    = useState(0)
  const [error,        setError]       = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) { setScreen('input'); setVaultName(''); setError(null); setPendingPath(null); setPendingName(null) }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && mode === 'open') {
      ipc.vault.listKnown().then(setKnownVaults).catch(() => setKnownVaults([]))
    }
  }, [isOpen, mode])

  useEffect(() => {
    if (isOpen && screen === 'input' && mode === 'create') {
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [isOpen, screen, mode])

  useEffect(() => {
    if (screen !== 'loading') return
    const id = setInterval(() => setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length), 600)
    return () => clearInterval(id)
  }, [screen])

  const runWithChoice = async (doOpen: () => Promise<void>, replaceOnly: boolean): Promise<void> => {
    setMsgIndex(0)
    setScreen('loading')
    setError(null)
    const minDelay = new Promise(r => setTimeout(r, 2000))
    try {
      await Promise.all([doOpen(), minDelay])
      if (!replaceOnly) await loadSessions()
      hide()
    } catch (e) {
      setError((e as Error).message)
      setScreen('choice')
    }
  }

  const handleCreateSubmit = (): void => {
    const name = vaultName.trim()
    if (!name) return
    setPendingName(name)
    setScreen('choice')
  }

  const handleOpenExisting = (path: string): void => {
    setPendingPath(path)
    setScreen('choice')
  }

  const handleChoiceReplace = (): void => {
    if (mode === 'create' && pendingName) {
      runWithChoice(() => createVault(pendingName), true)
    } else if (pendingPath) {
      runWithChoice(() => openVault(pendingPath), true)
    }
  }

  const handleChoiceBoth = (): void => {
    if (mode === 'create' && pendingName) {
      runWithChoice(() => createVault(pendingName), false)
    } else if (pendingPath) {
      // Open vault (adds to sessions, activates it), then loadSessions
      runWithChoice(() => openVault(pendingPath), false)
    }
  }

  if (!isOpen) return null

  const safeFolder = vaultName.trim().replace(/[<>:"/\\|?*]/g, '-') || 'my-vault'

  return (
    <div className={styles.overlay} onMouseDown={hide}>
      <div className={styles.modal} onMouseDown={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={hide}>×</button>

        {screen === 'input' && mode === 'create' && (
          <>
            <h2 className={styles.title}>Create New Vault</h2>
            <input
              ref={nameInputRef}
              className={styles.nameInput}
              placeholder="Vault name…"
              value={vaultName}
              onChange={e => setVaultName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateSubmit() }}
              maxLength={64}
            />
            <div className={styles.hint}>Will be created at Documents/{safeFolder}</div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={handleCreateSubmit} disabled={!vaultName.trim()}>
                Continue
              </button>
              <button className={styles.btnSecondary} onClick={hide}>Cancel</button>
            </div>
          </>
        )}

        {screen === 'input' && mode === 'open' && (
          <>
            <h2 className={styles.title}>Open Vault</h2>
            {knownVaults.length === 0
              ? <div className={styles.empty}>No saved vaults. Create one first.</div>
              : <div className={styles.vaultList}>
                  {knownVaults.map(v => (
                    <button key={v.path} className={styles.vaultCard} onClick={() => handleOpenExisting(v.path)}>
                      <div className={styles.vaultCardName}>{v.name}</div>
                      <div className={styles.vaultCardPath}>{v.path}</div>
                    </button>
                  ))}
                </div>
            }
            {error && <div className={styles.error}>{error}</div>}
            <button className={styles.btnSecondary} onClick={hide} style={{ marginTop: 8 }}>Cancel</button>
          </>
        )}

        {screen === 'choice' && (
          <>
            <h2 className={styles.title}>How would you like to open it?</h2>
            <p className={styles.choiceDesc}>
              <strong>{mode === 'create' ? pendingName : knownVaults.find(v => v.path === pendingPath)?.name ?? pendingPath}</strong>
            </p>
            <div className={styles.choiceButtons}>
              <button className={styles.choiceBtn} onClick={handleChoiceReplace}>
                <span className={styles.choiceBtnTitle}>Replace current vault</span>
                <span className={styles.choiceBtnDesc}>Close the current vault and open this one</span>
              </button>
              <button className={styles.choiceBtn} onClick={handleChoiceBoth}>
                <span className={styles.choiceBtnTitle}>Open alongside</span>
                <span className={styles.choiceBtnDesc}>Keep both vaults accessible via the switcher</span>
              </button>
            </div>
            <button className={styles.btnSecondary} onClick={() => setScreen('input')} style={{ marginTop: 8 }}>
              ← Back
            </button>
          </>
        )}

        {screen === 'loading' && (
          <div className={styles.loadingBody}>
            <div className={styles.loadingMsg}>{LOADING_MESSAGES[msgIndex]}</div>
            <div className={styles.loadingBar}><div className={styles.loadingBarFill} /></div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/renderer/components/vault/VaultManagerModal.module.css`**

```css
/* src/renderer/components/vault/VaultManagerModal.module.css */

.overlay {
  position: fixed;
  inset: 0;
  z-index: 600;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: fadeIn 0.1s ease;
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal {
  position: relative;
  width: 480px;
  background: #0c1624;
  border: 1px solid rgba(56,182,220,0.2);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.7);
  padding: 28px 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: slideIn 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

@keyframes slideIn {
  from { opacity: 0; transform: scale(0.96) translateY(-8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.closeBtn {
  position: absolute;
  top: 12px; right: 14px;
  font-size: 18px;
  line-height: 1;
  color: rgba(255,255,255,0.3);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.1s, background 0.1s;
}
.closeBtn:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.07); }

.title {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  margin: 0;
}

.nameInput {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  color: rgba(255,255,255,0.85);
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(56,182,220,0.22);
  border-radius: 8px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s, background 0.15s;
}
.nameInput:focus { border-color: rgba(56,182,220,0.5); background: rgba(255,255,255,0.1); }
.nameInput::placeholder { color: rgba(255,255,255,0.25); }

.hint {
  font-size: 10px;
  color: rgba(255,255,255,0.2);
  font-family: 'SF Mono', 'Fira Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error {
  font-size: 12px;
  color: rgba(220,80,80,0.8);
}

.empty {
  font-size: 13px;
  color: rgba(255,255,255,0.25);
  text-align: center;
  padding: 16px 0;
}

.vaultList {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}

.vaultCard {
  width: 100%;
  padding: 10px 14px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.1s, border-color 0.1s;
}
.vaultCard:hover { background: rgba(56,182,220,0.1); border-color: rgba(56,182,220,0.28); }

.vaultCardName {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
}
.vaultCardPath {
  font-size: 10px;
  color: rgba(255,255,255,0.2);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'SF Mono', 'Fira Mono', monospace;
}

.choiceDesc {
  font-size: 13px;
  color: rgba(255,255,255,0.55);
  margin: 0;
}
.choiceDesc strong { color: rgba(255,255,255,0.8); }

.choiceButtons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.choiceBtn {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background 0.1s, border-color 0.1s;
}
.choiceBtn:hover { background: rgba(56,182,220,0.1); border-color: rgba(56,182,220,0.28); }

.choiceBtnTitle {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
}
.choiceBtnDesc {
  font-size: 11px;
  color: rgba(255,255,255,0.3);
}

.actions {
  display: flex;
  gap: 8px;
}

.btnPrimary {
  padding: 9px 20px;
  background: linear-gradient(135deg, #38b6dc, #7c5cf7);
  color: white;
  border: none;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s;
}
.btnPrimary:disabled { opacity: 0.4; cursor: default; }
.btnPrimary:not(:disabled):hover { opacity: 0.85; }

.btnSecondary {
  padding: 9px 20px;
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.6);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.1s;
}
.btnSecondary:hover { background: rgba(255,255,255,0.12); }

.loadingBody {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px 0;
}

.loadingMsg {
  font-size: 13px;
  color: rgba(255,255,255,0.4);
  letter-spacing: 0.02em;
  min-height: 20px;
  text-align: center;
}

.loadingBar {
  width: 160px;
  height: 2px;
  background: rgba(255,255,255,0.07);
  border-radius: 2px;
  overflow: hidden;
}

.loadingBarFill {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, #38b6dc, #7c5cf7);
  border-radius: 2px;
  animation: loadingSlide 1.6s ease-in-out infinite;
}

@keyframes loadingSlide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
```

- [ ] **Step 4: Add VaultManagerModal to `src/renderer/components/layout/AppShell.tsx`**

Read the current file, then add two imports after existing imports:

```typescript
import { VaultManagerModal } from '../vault/VaultManagerModal'
import { useVaultStore } from '../../stores/vaultStore'
```

Add in the component body after `const openPalette = ...`:
```typescript
const openedConfigs  = useVaultStore(s => s.openedConfigs)
const activateVault  = useVaultStore(s => s.activateVault)
const activeConfig   = useVaultStore(s => s.config)
```

In the titlebar section, replace:
```tsx
<div className={styles.titlebarLeft}>
  <div className={styles.titlebarDot} />
  <span className={styles.titleName}>{config?.name ?? 'owl.md'}</span>
</div>
```
With:
```tsx
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
```

Add `<VaultManagerModal />` inside the root div, after `<CommandPalette />`:
```tsx
<CommandPalette />
<VaultManagerModal />
```

- [ ] **Step 5: Add vault switcher styles to `src/renderer/components/layout/AppShell.module.css`**

Append to the end of the file:

```css
/* ─── Vault switcher (multi-vault titlebar) ──────── */

.vaultSwitcher {
  display: flex;
  align-items: center;
  gap: 2px;
}

.vaultTab {
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255,255,255,0.35);
  background: transparent;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0.02em;
  transition: background 0.1s, color 0.1s;
  white-space: nowrap;
}

.vaultTab:hover {
  background: rgba(56,182,220,0.1);
  color: rgba(255,255,255,0.65);
}

.vaultTabActive {
  background: rgba(56,182,220,0.12);
  color: rgba(56,182,220,0.85);
}
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 7: Build — confirm no TypeScript errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stores/vaultManagerStore.ts \
        src/renderer/components/vault/VaultManagerModal.tsx \
        src/renderer/components/vault/VaultManagerModal.module.css \
        src/renderer/components/layout/AppShell.tsx \
        src/renderer/components/layout/AppShell.module.css
git commit -m "feat: vault manager modal (in-app create/open with single/both choice) + vault switcher"
```

---

### Task 4: Vaults menu + remove alert()

**Files:**
- Modify: `src/renderer/components/layout/MenuBar.tsx`

- [ ] **Step 1: Read `src/renderer/components/layout/MenuBar.tsx`**

Read the current file to see exact line numbers before editing.

- [ ] **Step 2: Update `src/renderer/components/layout/MenuBar.tsx`**

Replace the entire file:

```tsx
// src/renderer/components/layout/MenuBar.tsx
import React, { useState, useRef, useEffect } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
import { useVaultManagerStore } from '../../stores/vaultManagerStore'
import styles from './MenuBar.module.css'

type MenuAction = { label: string; shortcut?: string; action: () => void }
type Separator  = { separator: true }
type MenuEntry  = MenuAction | Separator

interface MenuDef { label: string; items: MenuEntry[] }

function isSep(e: MenuEntry): e is Separator { return 'separator' in e }

export function MenuBar(): JSX.Element {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const openSearch  = useSearchStore(s => s.open)
  const openPalette = useCommandPaletteStore(s => s.open)
  const showVaultManager = useVaultManagerStore(s => s.show)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const handler = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const toggle = (label: string) => setOpenMenu(prev => prev === label ? null : label)
  const run    = (action: () => void) => { action(); setOpenMenu(null) }

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Note',         shortcut: 'Ctrl+N', action: () => window.dispatchEvent(new CustomEvent('owl:new-note')) },
        { label: 'Command Palette',  shortcut: 'Ctrl+K', action: () => openPalette() },
        { separator: true },
        { label: 'Quit', action: () => window.close() },
      ],
    },
    {
      label: 'Vaults',
      items: [
        { label: 'Create New Vault', action: () => showVaultManager('create') },
        { label: 'Open Vault',       action: () => showVaultManager('open')   },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo',       shortcut: 'Ctrl+Z',       action: () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })) },
        { label: 'Redo',       shortcut: 'Ctrl+Shift+Z', action: () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true })) },
        { separator: true },
        { label: 'Cut',        shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
        { label: 'Copy',       shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
        { label: 'Paste',      shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => document.execCommand('selectAll') },
        { separator: true },
        { label: 'Find', shortcut: 'Ctrl+F', action: () => openSearch() },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'About owl.md', action: () => openPalette() },
      ],
    },
  ]

  return (
    <div className={styles.menuBar} ref={barRef}>
      {menus.map(menu => (
        <div key={menu.label} className={styles.menuRoot}>
          <button
            className={`${styles.menuTrigger} ${openMenu === menu.label ? styles.menuTriggerActive : ''}`}
            onClick={() => toggle(menu.label)}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && (
            <div className={styles.dropdown}>
              {menu.items.map((item, i) =>
                isSep(item)
                  ? <div key={i} className={styles.separator} />
                  : (
                    <button
                      key={i}
                      className={styles.dropdownItem}
                      onClick={() => run(item.action)}
                    >
                      <span className={styles.itemLabel}>{item.label}</span>
                      {item.shortcut && <span className={styles.itemShortcut}>{item.shortcut}</span>}
                    </button>
                  )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

Note: The Help → About action now opens the command palette (a sensible placeholder — no `alert()`). This can be changed to a dedicated About modal in a future task.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 4: Build — confirm no TypeScript errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/layout/MenuBar.tsx
git commit -m "feat: Vaults menu (create/open), remove alert() from About"
```

---

## Self-Review

**Spec coverage:**
- ✅ Create Vault flow — simple name input only (Task 2)
- ✅ Loading screen with rotating messages, 2s minimum (Tasks 2 + 3)
- ✅ Vault storage in Documents — auto-computed from name (Task 1 `createVault`)
- ✅ Open Vault shows existing vaults — vault-list screen (Task 2) + modal (Task 3)
- ✅ No browser file picker — no `showOpenFilePicker`, no native dialog
- ✅ Last opened vault saved — SettingsService `setLastVaultPath` (Task 1)
- ✅ Auto-open last vault on startup — `ipc.vault.getLast()` in App.tsx init effect (Task 2)
- ✅ Welcome screen only when no vault or explicit return (Task 2 screen machine)
- ✅ Vaults menu in toolbar — Task 4
- ✅ Create/open from within app — VaultManagerModal (Task 3)
- ✅ Single vs Both choice — choice screen in VaultManagerModal (Task 3)
- ✅ Replace current vault — Task 3 `handleChoiceReplace`
- ✅ Open alongside / vault switcher — Task 3 `handleChoiceBoth` + AppShell vault tabs
- ✅ Remove `prompt()` — Tasks 1 + 2 (no prompt() calls remain)
- ✅ Remove `alert()` — Task 4 (About now opens command palette)
- ✅ Desktop-only flows — all in-app, no browser dialogs

**Placeholder scan:** No TBDs. All steps contain exact code.

**Type consistency:**
- `SettingsService` constructor takes `userDataPath: string`; `app.getPath('userData')` passed in Task 1 index.ts ✅
- `vault:create` IPC takes `name: string` in vault.ts; preload passes `name`; ipc.ts wraps `(name: string)`; vaultStore calls `ipc.vault.create(name)` ✅  
- `VaultManagerStore.show` takes `'create' | 'open'`; MenuBar passes those literals ✅
- `openedConfigs` in vaultStore set by `loadSessions()` which calls `ipc.vault.getSessions()`; AppShell reads `openedConfigs` ✅
- `activateVault` in vaultStore calls `ipc.vault.activate(path)`; preload maps to `vault:activate`; main handler calls `services.activateVault(path)` ✅
