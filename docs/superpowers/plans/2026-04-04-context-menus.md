# Context Menus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add right-click context menus to four surfaces: sidebar note rows, sidebar folder rows, the Tiptap editor body, and vault cards in the manager modal.

**Architecture:** A single shared `ContextMenu` portal component (renders into `document.body`, positioned at cursor coords) is driven by a `useContextMenu` hook that tracks open/close state and menu items. Each surface attaches `onContextMenu`, prevents the default browser menu, and passes its item list to the hook. Inline rename is handled by local state in `LeftSidebar` — when active, a row renders an `<input>` instead of its title span. New IPC channels (`notes:rename`, `notes:duplicate`, `vault:remove-known`) are added to support actions not covered by existing handlers.

**Tech Stack:** React 18, Tiptap 2, Zustand, better-sqlite3, Electron IPC, CSS Modules.

---

## File Map

### Create
- `src/renderer/components/ui/ContextMenu.tsx` — portal menu; supports items, separators, and drill-down submenus
- `src/renderer/components/ui/ContextMenu.module.css` — dark-themed menu styles

### Modify
- `src/main/services/SettingsService.ts` — add `removeKnown(path)`
- `src/main/ipc/notes.ts` — add `notes:rename`, `notes:duplicate`
- `src/main/ipc/vault.ts` — add `vault:remove-known`; accept `removeKnownVault` service
- `src/main/index.ts` — wire `removeKnownVault` into `registerVaultHandlers`
- `src/shared/types/IPC.ts` — add `rename`, `duplicate` to `OwlNotesAPI`; add `removeKnown` to `OwlVaultAPI`
- `src/renderer/lib/ipc.ts` — expose the three new calls
- `src/renderer/components/layout/LeftSidebar.tsx` — note/folder context menus + inline rename state
- `src/renderer/components/editor/NoteEditor.tsx` — editor body context menu
- `src/renderer/components/vault/VaultManagerModal.tsx` — vault card context menu

### Test
- `tests/renderer/components/ui/ContextMenu.test.tsx` — new
- `tests/main/services/SettingsService.test.ts` — extend existing
- `tests/main/services/IndexService.test.ts` — extend existing (rename/duplicate via notes IPC logic)

---

## Task 1: ContextMenu component

**Files:**
- Create: `src/renderer/components/ui/ContextMenu.tsx`
- Create: `src/renderer/components/ui/ContextMenu.module.css`
- Test: `tests/renderer/components/ui/ContextMenu.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
// tests/renderer/components/ui/ContextMenu.test.tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextMenu, type ContextMenuEntry } from '@renderer/components/ui/ContextMenu'

const items: ContextMenuEntry[] = [
  { label: 'Rename', onClick: vi.fn() },
  { separator: true },
  { label: 'Delete', danger: true, onClick: vi.fn() },
]

describe('ContextMenu', () => {
  it('renders menu items when open', () => {
    render(
      <ContextMenu
        isOpen
        position={{ x: 100, y: 200 }}
        items={items}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Rename')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <ContextMenu
        isOpen={false}
        position={{ x: 0, y: 0 }}
        items={items}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByText('Rename')).not.toBeInTheDocument()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(
      <ContextMenu isOpen position={{ x: 0, y: 0 }} items={items} onClose={onClose} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls item onClick and onClose when item is clicked', () => {
    const onClose = vi.fn()
    const itemClick = vi.fn()
    const testItems: ContextMenuEntry[] = [{ label: 'Go', onClick: itemClick }]
    render(
      <ContextMenu isOpen position={{ x: 0, y: 0 }} items={testItems} onClose={onClose} />
    )
    fireEvent.click(screen.getByText('Go'))
    expect(itemClick).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('drills into submenu and back', () => {
    const subItems: ContextMenuEntry[] = [{ label: 'FolderA', onClick: vi.fn() }]
    const menuItems: ContextMenuEntry[] = [
      { label: 'Move to folder', submenu: subItems },
    ]
    render(
      <ContextMenu isOpen position={{ x: 0, y: 0 }} items={menuItems} onClose={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Move to folder'))
    expect(screen.getByText('FolderA')).toBeInTheDocument()
    fireEvent.click(screen.getByText('← Back'))
    expect(screen.queryByText('FolderA')).not.toBeInTheDocument()
    expect(screen.getByText('Move to folder')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

```bash
cd /home/device/Documents/owl.md && npm test -- --reporter=verbose tests/renderer/components/ui/ContextMenu.test.tsx 2>&1 | tail -20
```

Expected: error about missing module `@renderer/components/ui/ContextMenu`.

- [ ] **Step 3: Create ContextMenu.module.css**

```css
/* src/renderer/components/ui/ContextMenu.module.css */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.menu {
  position: fixed;
  z-index: 1001;
  background: #1e2433;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  font-size: 13px;
  user-select: none;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 5px;
  background: none;
  border: none;
  cursor: pointer;
  color: #e2e8f0;
  text-align: left;
  font-size: 13px;
  font-family: inherit;
}

.item:hover {
  background: rgba(167, 139, 250, 0.15);
}

.item.danger {
  color: #f87171;
}

.item.danger:hover {
  background: rgba(248, 113, 113, 0.12);
}

.itemIcon {
  width: 16px;
  text-align: center;
  font-size: 12px;
  opacity: 0.7;
  flex-shrink: 0;
}

.itemLabel {
  flex: 1;
}

.itemShortcut {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  font-family: monospace;
}

.itemArrow {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
}

.separator {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 3px 8px;
}

.backItem {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.submenuHeader {
  padding: 4px 10px 2px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.3);
}
```

- [ ] **Step 4: Create ContextMenu.tsx**

```tsx
// src/renderer/components/ui/ContextMenu.tsx
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ContextMenu.module.css'

export type ContextMenuItem = {
  label: string
  icon?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
  submenu?: ContextMenuEntry[]
}

export type ContextMenuSeparator = { separator: true }

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

interface ContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  items: ContextMenuEntry[]
  onClose: () => void
}

function isSep(e: ContextMenuEntry): e is ContextMenuSeparator {
  return 'separator' in e
}

export function ContextMenu({ isOpen, position, items, onClose }: ContextMenuProps): JSX.Element | null {
  const [stack, setStack] = useState<ContextMenuEntry[][]>([])

  // Reset drill-down stack whenever the menu opens with new items
  useEffect(() => {
    if (isOpen) setStack([])
  }, [isOpen, items])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (stack.length > 0) { setStack(s => s.slice(0, -1)); return }
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose, stack])

  if (!isOpen) return null

  const currentItems = stack.length > 0 ? stack[stack.length - 1] : items

  // Clamp to viewport
  const x = Math.min(position.x, window.innerWidth  - 200)
  const y = Math.min(position.y, window.innerHeight - 300)

  const handleItemClick = (item: ContextMenuItem): void => {
    if (item.disabled) return
    if (item.submenu) {
      setStack(s => [...s, item.submenu!])
      return
    }
    item.onClick?.()
    onClose()
  }

  return createPortal(
    <>
      <div className={styles.overlay} onMouseDown={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div className={styles.menu} style={{ left: x, top: y }} onMouseDown={e => e.stopPropagation()}>
        {stack.length > 0 && (
          <>
            <button className={`${styles.item} ${styles.backItem}`} onClick={() => setStack(s => s.slice(0, -1))}>
              <span className={styles.itemLabel}>← Back</span>
            </button>
            <div className={styles.separator} />
          </>
        )}
        {currentItems.map((entry, i) =>
          isSep(entry)
            ? <div key={i} className={styles.separator} />
            : (
              <button
                key={i}
                className={`${styles.item} ${entry.danger ? styles.danger : ''}`}
                onClick={() => handleItemClick(entry)}
                disabled={entry.disabled}
              >
                {entry.icon && <span className={styles.itemIcon}>{entry.icon}</span>}
                <span className={styles.itemLabel}>{entry.label}</span>
                {entry.shortcut && <span className={styles.itemShortcut}>{entry.shortcut}</span>}
                {entry.submenu  && <span className={styles.itemArrow}>▶</span>}
              </button>
            )
        )}
      </div>
    </>,
    document.body
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /home/device/Documents/owl.md && npm test -- --reporter=verbose tests/renderer/components/ui/ContextMenu.test.tsx 2>&1 | tail -20
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/ui/ContextMenu.tsx src/renderer/components/ui/ContextMenu.module.css tests/renderer/components/ui/ContextMenu.test.tsx && git commit -m "feat: shared ContextMenu portal component with drill-down submenu support"
```

---

## Task 2: SettingsService.removeKnown

**Files:**
- Modify: `src/main/services/SettingsService.ts`
- Test: `tests/main/services/SettingsService.test.ts`

- [ ] **Step 1: Add failing test**

Open `tests/main/services/SettingsService.test.ts` and append:

```ts
describe('removeKnown', () => {
  it('removes vault from known list', () => {
    const dir  = mkdtempSync(join(tmpdir(), 'owl-settings-'))
    const svc  = new SettingsService(dir)
    svc.addKnownVault({ name: 'A', path: '/a', createdAt: 1, schemaVersion: 1 })
    svc.addKnownVault({ name: 'B', path: '/b', createdAt: 2, schemaVersion: 1 })
    svc.removeKnown('/a')
    expect(svc.getKnownVaults().map(v => v.path)).toEqual(['/b'])
  })

  it('clears lastVaultPath when removed vault was last', () => {
    const dir  = mkdtempSync(join(tmpdir(), 'owl-settings-'))
    const svc  = new SettingsService(dir)
    svc.addKnownVault({ name: 'A', path: '/a', createdAt: 1, schemaVersion: 1 })
    svc.setLastVaultPath('/a')
    svc.removeKnown('/a')
    expect(svc.getLastVaultPath()).toBeNull()
  })

  it('leaves lastVaultPath when a different vault is removed', () => {
    const dir  = mkdtempSync(join(tmpdir(), 'owl-settings-'))
    const svc  = new SettingsService(dir)
    svc.addKnownVault({ name: 'A', path: '/a', createdAt: 1, schemaVersion: 1 })
    svc.addKnownVault({ name: 'B', path: '/b', createdAt: 2, schemaVersion: 1 })
    svc.setLastVaultPath('/b')
    svc.removeKnown('/a')
    expect(svc.getLastVaultPath()).toBe('/b')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /home/device/Documents/owl.md && npm test -- --reporter=verbose tests/main/services/SettingsService.test.ts 2>&1 | tail -20
```

Expected: `removeKnown is not a function`.

- [ ] **Step 3: Add `removeKnown` to SettingsService**

In `src/main/services/SettingsService.ts`, add after `setLastVaultPath`:

```ts
removeKnown(path: string): void {
  this.settings.knownVaults = this.settings.knownVaults.filter(v => v.path !== path)
  if (this.settings.lastVaultPath === path) {
    this.settings.lastVaultPath = null
  }
  this.save()
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /home/device/Documents/owl.md && npm test -- --reporter=verbose tests/main/services/SettingsService.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/main/services/SettingsService.ts tests/main/services/SettingsService.test.ts && git commit -m "feat: SettingsService.removeKnown — remove vault from known list"
```

---

## Task 3: notes:rename IPC handler

**Files:**
- Modify: `src/main/ipc/notes.ts`

Rename reads the current markdown, replaces (or prepends) the first `# Heading`, writes it back via VaultService, re-indexes. It does **not** rename the file on disk — the path stays stable, only the title changes.

- [ ] **Step 1: Add handler to notes.ts**

After the `notes:move` handler, add:

```ts
ipcMain.handle('notes:rename', (_e, id: string, newTitle: string): Note => {
  const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined
  if (!note) throw new Error(`Note not found: ${id}`)
  const raw = note as unknown as Record<string, unknown>
  const noteType = (raw.note_type ?? raw.noteType ?? 'note') as Note['noteType']
  if (noteType === 'folder') {
    // Folders have no markdown file — just update the DB title
    db().prepare('UPDATE notes SET title = ?, updated_at = ? WHERE id = ?')
      .run(newTitle, Date.now(), id)
    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
  }
  const markdown = services.vault().readNote(note.path)
  const updated = markdown.match(/^#\s+.+$/m)
    ? markdown.replace(/^#\s+.+$/m, `# ${newTitle}`)
    : `# ${newTitle}\n\n${markdown}`
  services.vault().writeNote(note.path, updated)
  const folderPath = dirname(note.path) === '.' ? '' : dirname(note.path)
  services.index().indexNote({ id, path: note.path, title: newTitle, markdown: updated, folderPath, noteType })
  services.index().syncFTS(id, newTitle, updated)
  return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
})
```

- [ ] **Step 2: Run full test suite to verify no regressions**

```bash
cd /home/device/Documents/owl.md && npm test 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/main/ipc/notes.ts && git commit -m "feat: notes:rename IPC handler — updates title in markdown heading and DB"
```

---

## Task 4: notes:duplicate IPC handler

**Files:**
- Modify: `src/main/ipc/notes.ts`

Duplicate reads the source note, creates a new file with `" (Copy)"` appended to the title (in the heading and the filename), same folder/parent.

- [ ] **Step 1: Add handler to notes.ts**

After the `notes:rename` handler, add:

```ts
ipcMain.handle('notes:duplicate', (_e, id: string): NoteContent => {
  const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined
  if (!note) throw new Error(`Note not found: ${id}`)
  const raw = note as unknown as Record<string, unknown>
  const noteType = (raw.note_type ?? raw.noteType ?? 'note') as Note['noteType']
  if (noteType === 'folder') throw new Error('Cannot duplicate a folder')

  const srcMarkdown = services.vault().readNote(note.path)
  const srcTitle    = (db().prepare('SELECT title FROM notes WHERE id = ?').get(id) as { title: string }).title
  const newTitle    = `${srcTitle} (Copy)`
  const newMarkdown = srcMarkdown.match(/^#\s+.+$/m)
    ? srcMarkdown.replace(/^#\s+.+$/m, `# ${newTitle}`)
    : `# ${newTitle}\n\n${srcMarkdown}`

  const rawNote     = note as unknown as Record<string, unknown>
  const folderPath  = (rawNote.folder_path ?? rawNote.folderPath ?? '') as string
  const parentId    = (rawNote.parent_id   ?? rawNote.parentId   ?? null) as string | null

  const newId       = crypto.randomUUID()
  const fileName    = `${newTitle.replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '-')}.md`
  const newPath     = folderPath ? `${folderPath}/${fileName}` : fileName

  services.vault().writeNote(newPath, newMarkdown)
  services.index().indexNote({ id: newId, path: newPath, title: newTitle, markdown: newMarkdown, folderPath, noteType })
  services.index().syncFTS(newId, newTitle, newMarkdown)

  // Place after source note
  const srcOrder = (db().prepare('SELECT order_index FROM notes WHERE id = ?').get(id) as { order_index: number }).order_index
  db().prepare('UPDATE notes SET order_index = order_index + 1 WHERE parent_id IS ? AND order_index > ?')
    .run(parentId, srcOrder)
  db().prepare('UPDATE notes SET parent_id = ?, order_index = ?, updated_at = ? WHERE id = ?')
    .run(parentId, srcOrder + 1, Date.now(), newId)

  const newNote = db().prepare('SELECT * FROM notes WHERE id = ?').get(newId) as Note
  return { note: newNote, markdown: newMarkdown }
})
```

- [ ] **Step 2: Run full test suite**

```bash
cd /home/device/Documents/owl.md && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/main/ipc/notes.ts && git commit -m "feat: notes:duplicate IPC handler — copies note with (Copy) suffix, same parent"
```

---

## Task 5: vault:remove-known IPC + wire-up

**Files:**
- Modify: `src/main/ipc/vault.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add `removeKnownVault` service dep and handler in vault.ts**

Replace the `registerVaultHandlers` signature and add the new handler:

```ts
// src/main/ipc/vault.ts
import { ipcMain } from 'electron'
import type { VaultConfig } from '@shared/types/Note'

export function registerVaultHandlers(services: {
  openVault:         (path: string) => Promise<VaultConfig>
  createVault:       (name: string) => Promise<VaultConfig>
  activateVault:     (path: string) => Promise<VaultConfig>
  listKnownVaults:   ()             => VaultConfig[]
  getLastVaultPath:  ()             => string | null
  getOpenSessions:   ()             => VaultConfig[]
  removeKnownVault:  (path: string) => void
}): void {
  ipcMain.handle('vault:open',          (_e, path: string) => services.openVault(path))
  ipcMain.handle('vault:create',        (_e, name: string) => services.createVault(name))
  ipcMain.handle('vault:activate',      (_e, path: string) => services.activateVault(path))
  ipcMain.handle('vault:list-known',    ()                  => services.listKnownVaults())
  ipcMain.handle('vault:get-last',      ()                  => services.getLastVaultPath())
  ipcMain.handle('vault:get-sessions',  ()                  => services.getOpenSessions())
  ipcMain.handle('vault:getConfig',     ()                  => services.getOpenSessions()[0] ?? null)
  ipcMain.handle('vault:remove-known',  (_e, path: string) => services.removeKnownVault(path))
}
```

- [ ] **Step 2: Wire `removeKnownVault` in index.ts**

In `src/main/index.ts`, add `removeKnownVault` to the `registerVaultHandlers` call (inside `app.whenReady()`):

```ts
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
  removeKnownVault: (path: string) => settingsService.removeKnown(path),
})
```

- [ ] **Step 3: Run full test suite**

```bash
cd /home/device/Documents/owl.md && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/main/ipc/vault.ts src/main/index.ts && git commit -m "feat: vault:remove-known IPC handler — removes vault from settings list"
```

---

## Task 6: Expose new IPC in shared types and renderer lib

**Files:**
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/renderer/lib/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Update shared types**

In `src/shared/types/IPC.ts`, update the two interfaces:

```ts
export interface OwlNotesAPI {
  list:         () => Promise<Note[]>
  read:         (id: string) => Promise<NoteContent>
  save:         (id: string, markdown: string) => Promise<Note>
  create:       (title: string, folderPath: string) => Promise<NoteContent>
  delete:       (id: string) => Promise<void>
  getBacklinks: (id: string) => Promise<BacklinkResult[]>
  createFolder: (name: string) => Promise<Note>
  move:         (noteId: string, newParentId: string | null, orderIndex: number) => Promise<void>
  rename:       (id: string, newTitle: string) => Promise<Note>
  duplicate:    (id: string) => Promise<NoteContent>
}

export interface OwlVaultAPI {
  open:          (vaultPath: string) => Promise<VaultConfig>
  create:        (name: string)      => Promise<VaultConfig>
  activate:      (vaultPath: string) => Promise<VaultConfig>
  listKnown:     ()                  => Promise<VaultConfig[]>
  getLast:       ()                  => Promise<string | null>
  getSessions:   ()                  => Promise<VaultConfig[]>
  getConfig:     ()                  => Promise<VaultConfig | null>
  removeKnown:   (path: string)      => Promise<void>
}
```

- [ ] **Step 2: Update preload**

In `src/preload/index.ts`, add the three new channels:

```ts
const owl: OwlAPI = {
  vault: {
    open:        (vaultPath) => ipcRenderer.invoke('vault:open',         vaultPath),
    create:      (name)      => ipcRenderer.invoke('vault:create',       name),
    activate:    (vaultPath) => ipcRenderer.invoke('vault:activate',     vaultPath),
    listKnown:   ()          => ipcRenderer.invoke('vault:list-known'),
    getLast:     ()          => ipcRenderer.invoke('vault:get-last'),
    getSessions: ()          => ipcRenderer.invoke('vault:get-sessions'),
    getConfig:   ()          => ipcRenderer.invoke('vault:getConfig'),
    removeKnown: (path)      => ipcRenderer.invoke('vault:remove-known', path),
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
    rename:    (id, newTitle) => ipcRenderer.invoke('notes:rename',    id, newTitle),
    duplicate: (id)           => ipcRenderer.invoke('notes:duplicate', id),
  },
  search: {
    query: (q) => ipcRenderer.invoke('search:query', q),
  },
}
```

- [ ] **Step 3: Update renderer ipc.ts**

In `src/renderer/lib/ipc.ts`, add to the notes and vault objects:

```ts
export const ipc = {
  vault: {
    open:        (path: string):  Promise<VaultConfig>       => window.owl.vault.open(path),
    create:      (name: string):  Promise<VaultConfig>       => window.owl.vault.create(name),
    activate:    (path: string):  Promise<VaultConfig>       => window.owl.vault.activate(path),
    listKnown:   ():              Promise<VaultConfig[]>      => window.owl.vault.listKnown(),
    getLast:     ():              Promise<string | null>      => window.owl.vault.getLast(),
    getSessions: ():              Promise<VaultConfig[]>      => window.owl.vault.getSessions(),
    getConfig:   ():              Promise<VaultConfig | null> => window.owl.vault.getConfig(),
    removeKnown: (path: string):  Promise<void>              => window.owl.vault.removeKnown(path),
  },
  notes: {
    list:         (): Promise<Note[]>                        => window.owl.notes.list(),
    read:         (id: string): Promise<NoteContent>         => window.owl.notes.read(id),
    save:         (id: string, md: string): Promise<Note>    => window.owl.notes.save(id, md),
    create:       (title: string, folder: string): Promise<NoteContent> =>
                    window.owl.notes.create(title, folder),
    delete:       (id: string): Promise<void>                => window.owl.notes.delete(id),
    getBacklinks: (id: string): Promise<BacklinkResult[]>    => window.owl.notes.getBacklinks(id),
    createFolder: (name: string): Promise<Note>              => window.owl.notes.createFolder(name),
    move: (noteId: string, newParentId: string | null, orderIndex: number): Promise<void> =>
            window.owl.notes.move(noteId, newParentId, orderIndex),
    rename:    (id: string, newTitle: string): Promise<Note>     => window.owl.notes.rename(id, newTitle),
    duplicate: (id: string): Promise<NoteContent>                => window.owl.notes.duplicate(id),
  },
  search: {
    query: (q: string): Promise<SearchResult[]> => window.owl.search.query(q),
  },
}
```

- [ ] **Step 4: Run full test suite**

```bash
cd /home/device/Documents/owl.md && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/shared/types/IPC.ts src/preload/index.ts src/renderer/lib/ipc.ts && git commit -m "feat: expose rename, duplicate, removeKnown through IPC type chain"
```

---

## Task 7: LeftSidebar — note row and folder row context menus + inline rename

**Files:**
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`

This is the most substantial UI task. Key changes:
- `LeftSidebar` tracks `renamingId: string | null` (which note/folder is being renamed inline)
- `SortableNoteRow` and `SortableFolderRow` receive `renamingId` + `onStartRename` + `onContextMenu` props
- When `note.id === renamingId`, the title span is replaced with an `<input>`; submitting calls `ipc.notes.rename` + `loadNotes`
- One `ContextMenu` instance lives at the bottom of the `LeftSidebar` JSX, driven by a `useContextMenu`-like inline state

- [ ] **Step 1: Add `useContextMenu` inline state to LeftSidebar and wire ContextMenu**

Replace the full `LeftSidebar.tsx` with the following (preserving all existing drag-and-drop logic):

```tsx
// src/renderer/components/layout/LeftSidebar.tsx
import React, { useCallback, useState, useRef } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  closestCenter, DragOverlay,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useVaultStore } from '../../stores/vaultStore'
import { useTabStore } from '../../stores/tabStore'
import { ipc } from '../../lib/ipc'
import { ContextMenu, type ContextMenuEntry } from '../ui/ContextMenu'
import styles from './LeftSidebar.module.css'
import type { Note } from '@shared/types/Note'

const dropAnimation: DropAnimation = {
  duration: 180,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
}

// ─── Sortable note row ───────────────────────────────────────────────────────

function SortableNoteRow({ note, active, indent, onClick, onContextMenu, isRenaming, onRenameCommit, onRenameCancel }: {
  note: Note
  active: boolean
  indent: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  isRenaming: boolean
  onRenameCommit: (newTitle: string) => void
  onRenameCancel: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.id, data: { type: 'note', parentId: note.parentId ?? null } })
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`${styles.noteItem} ${active ? styles.active : ''} ${indent ? styles.indented : ''}`}
      onClick={isRenaming ? undefined : onClick}
      onContextMenu={onContextMenu}
      {...attributes}
      {...(isRenaming ? {} : listeners)}
    >
      <span className={styles.icon}>📄</span>
      {isRenaming ? (
        <input
          ref={inputRef}
          autoFocus
          className={styles.renameInput}
          defaultValue={note.title}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter')  { onRenameCommit(inputRef.current?.value.trim() || note.title); return }
            if (e.key === 'Escape') { onRenameCancel(); return }
          }}
          onBlur={() => onRenameCommit(inputRef.current?.value.trim() || note.title)}
        />
      ) : (
        <span className={styles.title}>{note.title}</span>
      )}
    </button>
  )
}

// ─── Sortable folder row ─────────────────────────────────────────────────────

function SortableFolderRow({ folder, isOver, onContextMenu, isRenaming, onRenameCommit, onRenameCancel, children }: {
  folder: Note
  isOver: boolean
  onContextMenu: (e: React.MouseEvent) => void
  isRenaming: boolean
  onRenameCommit: (newTitle: string) => void
  onRenameCancel: () => void
  children: React.ReactNode
}): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.id, data: { type: 'folder' } })
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`${styles.folderGroup} ${isOver ? styles.dropTarget : ''}`}
    >
      <button
        className={styles.folderRow}
        onClick={() => { if (!isRenaming) setExpanded(e => !e) }}
        onContextMenu={onContextMenu}
        {...attributes}
        {...(isRenaming ? {} : listeners)}
      >
        <span className={styles.folderArrow}>{expanded ? '▼' : '▶'}</span>
        <span className={styles.folderIcon}>📁</span>
        {isRenaming ? (
          <input
            ref={inputRef}
            autoFocus
            className={styles.renameInput}
            defaultValue={folder.title}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter')  { onRenameCommit(inputRef.current?.value.trim() || folder.title); return }
              if (e.key === 'Escape') { onRenameCancel(); return }
            }}
            onBlur={() => onRenameCommit(inputRef.current?.value.trim() || folder.title)}
          />
        ) : (
          <span className={styles.title}>{folder.title}</span>
        )}
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
  const [renamingId, setRenamingId]     = useState<string | null>(null)

  // Context menu state
  const [menuOpen, setMenuOpen]       = useState(false)
  const [menuPos,  setMenuPos]        = useState({ x: 0, y: 0 })
  const [menuItems, setMenuItems]     = useState<ContextMenuEntry[]>([])

  const activeNoteId = tabs.find(t => t.id === activeTabId)?.noteId ?? null

  const openContextMenu = useCallback((e: React.MouseEvent, items: ContextMenuEntry[]) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuItems(items)
    setMenuOpen(true)
  }, [])

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

  const handleRenameCommit = useCallback(async (id: string, newTitle: string) => {
    setRenamingId(null)
    if (!newTitle) return
    await ipc.notes.rename(id, newTitle)
    await loadNotes()
  }, [loadNotes])

  const handleDelete = useCallback(async (note: Note) => {
    await ipc.notes.delete(note.id)
    await loadNotes()
  }, [loadNotes])

  const handleDuplicate = useCallback(async (note: Note) => {
    const { note: newNote } = await ipc.notes.duplicate(note.id)
    await loadNotes()
    openTab(newNote.id, newNote.title)
  }, [loadNotes, openTab])

  const noteContextItems = useCallback((note: Note): ContextMenuEntry[] => {
    const folders = notes.filter(n => n.noteType === 'folder')
    const moveSubmenu: ContextMenuEntry[] = folders.map(f => ({
      label: f.title,
      icon: '📁',
      onClick: async () => {
        const siblings = notes.filter(n => n.noteType !== 'folder' && n.parentId === f.id)
        await ipc.notes.move(note.id, f.id, siblings.length)
        await loadNotes()
      },
    }))

    const items: ContextMenuEntry[] = [
      { label: 'Rename', icon: '✏️', shortcut: 'F2', onClick: () => setRenamingId(note.id) },
      { label: 'Duplicate', icon: '📋', onClick: () => handleDuplicate(note) },
      { separator: true },
    ]

    if (folders.length > 0) {
      items.push({ label: 'Move to folder', icon: '📁', submenu: moveSubmenu })
    }
    if (note.parentId) {
      items.push({
        label: 'Lift to root',
        icon: '↗',
        onClick: async () => {
          const rootNotes = notes.filter(n => n.noteType !== 'folder' && !n.parentId)
          await ipc.notes.move(note.id, null, rootNotes.length)
          await loadNotes()
        },
      })
    }

    items.push({ separator: true })
    items.push({ label: 'Delete', icon: '🗑', danger: true, onClick: () => handleDelete(note) })
    return items
  }, [notes, loadNotes, handleDuplicate, handleDelete])

  const folderContextItems = useCallback((folder: Note): ContextMenuEntry[] => [
    { label: 'Rename', icon: '✏️', shortcut: 'F2', onClick: () => setRenamingId(folder.id) },
    { separator: true },
    {
      label: 'New note inside',
      icon: '📄',
      onClick: async () => {
        const title = `Untitled ${new Date().toLocaleDateString()}`
        const { note } = await ipc.notes.create(title, '')  // files are stored flat; parent is DB-only
        const childCount = notes.filter(n => n.parentId === folder.id).length
        await ipc.notes.move(note.id, folder.id, childCount)
        await loadNotes()
        openTab(note.id, note.title)
      },
    },
    { separator: true },
    {
      label: 'Delete folder',
      icon: '🗑',
      danger: true,
      onClick: async () => {
        await ipc.notes.delete(folder.id)
        await loadNotes()
      },
    },
  ], [notes, loadNotes, openTab])

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
        const siblings = notes
          .filter(n => n.noteType !== 'folder' && n.parentId === newParentId)
          .sort((a, b) => a.orderIndex - b.orderIndex)
        await ipc.notes.move(active.id as string, newParentId, siblings.length)
      } else {
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
                  onContextMenu={e => openContextMenu(e, folderContextItems(folder))}
                  isRenaming={renamingId === folder.id}
                  onRenameCommit={t => handleRenameCommit(folder.id, t)}
                  onRenameCancel={() => setRenamingId(null)}
                >
                  <SortableContext items={children.map(n => n.id)} strategy={verticalListSortingStrategy}>
                    {children.map(n => (
                      <SortableNoteRow
                        key={n.id}
                        note={n}
                        active={n.id === activeNoteId}
                        indent
                        onClick={() => openNote(n)}
                        onContextMenu={e => openContextMenu(e, noteContextItems(n))}
                        isRenaming={renamingId === n.id}
                        onRenameCommit={t => handleRenameCommit(n.id, t)}
                        onRenameCancel={() => setRenamingId(null)}
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
                onContextMenu={e => openContextMenu(e, noteContextItems(n))}
                isRenaming={renamingId === n.id}
                onRenameCommit={t => handleRenameCommit(n.id, t)}
                onRenameCancel={() => setRenamingId(null)}
              />
            ))}
          </SortableContext>
        </div>
      </div>

      <DragOverlay dropAnimation={dropAnimation}>
        {dragItem
          ? <div className={styles.dragGhost}>
              <span className={styles.dragGhostIcon}>{dragItem.noteType === 'folder' ? '📁' : '📄'}</span>
              <span className={styles.dragGhostTitle}>{dragItem.title}</span>
            </div>
          : null
        }
      </DragOverlay>

      <ContextMenu
        isOpen={menuOpen}
        position={menuPos}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
    </DndContext>
  )
}
```

- [ ] **Step 2: Add `.renameInput` to LeftSidebar.module.css**

In `src/renderer/components/layout/LeftSidebar.module.css`, append:

```css
.renameInput {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.5);
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 13px;
  font-family: inherit;
  padding: 1px 5px;
  outline: none;
}
```

- [ ] **Step 3: Run full test suite**

```bash
cd /home/device/Documents/owl.md && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/layout/LeftSidebar.tsx src/renderer/components/layout/LeftSidebar.module.css && git commit -m "feat: right-click context menus for note rows and folder rows; inline rename"
```

---

## Task 8: NoteEditor — editor body context menu

**Files:**
- Modify: `src/renderer/components/editor/NoteEditor.tsx`

The editor's `editorWrap` div gets `onContextMenu`. The menu shows "Turn into wiki-link" (when text is selected), "Insert callout", then native Cut/Copy/Paste.

"Turn into wiki-link" wraps the selected plain text with `[[` and `]]` using Tiptap's `insertContentAt`.

- [ ] **Step 1: Add context menu state and handler to NoteEditor.tsx**

Add these imports at the top of `NoteEditor.tsx`:

```tsx
import { useState, useCallback } from 'react'  // add to existing import
import { ContextMenu, type ContextMenuEntry } from '../ui/ContextMenu'
```

Add this state and handler inside the `NoteEditor` function body, before the `return`:

```tsx
const [editorMenuOpen, setEditorMenuOpen] = useState(false)
const [editorMenuPos,  setEditorMenuPos]  = useState({ x: 0, y: 0 })
const [editorMenuItems, setEditorMenuItems] = useState<ContextMenuEntry[]>([])

const handleEditorContextMenu = useCallback((e: React.MouseEvent) => {
  if (!editor) return
  e.preventDefault()
  const { from, to } = editor.state.selection
  const hasSelection = from !== to
  const selectedText = hasSelection
    ? editor.state.doc.textBetween(from, to, ' ')
    : ''

  const items: ContextMenuEntry[] = []

  if (hasSelection) {
    items.push({
      label: 'Turn into wiki-link',
      icon: '🔗',
      onClick: () => {
        editor.chain().focus().deleteSelection()
          .insertContent(`[[${selectedText}]]`).run()
      },
    })
  }

  items.push({
    label: 'Insert callout',
    icon: '📣',
    submenu: [
      { label: 'Info',    icon: 'ℹ️',  onClick: () => editor.chain().focus().insertCallout('info').run() },
      { label: 'Warning', icon: '⚠️',  onClick: () => editor.chain().focus().insertCallout('warning').run() },
      { label: 'Tip',     icon: '💡',  onClick: () => editor.chain().focus().insertCallout('tip').run() },
      { label: 'Danger',  icon: '🚨',  onClick: () => editor.chain().focus().insertCallout('danger').run() },
    ],
  })

  if (items.length > 0) items.push({ separator: true })

  items.push(
    { label: 'Cut',   shortcut: 'Ctrl+X', onClick: () => document.execCommand('cut') },
    { label: 'Copy',  shortcut: 'Ctrl+C', onClick: () => document.execCommand('copy') },
    { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => document.execCommand('paste') },
  )

  setEditorMenuPos({ x: e.clientX, y: e.clientY })
  setEditorMenuItems(items)
  setEditorMenuOpen(true)
}, [editor])
```

- [ ] **Step 2: Attach handler and render ContextMenu in the JSX**

Find the `editorWrap` div in the `return` block and add `onContextMenu`:

```tsx
<div className={styles.editorWrap} onContextMenu={handleEditorContextMenu}>
  <EditorContent editor={editor} />
</div>
```

After the closing `</div>` of the root, add:

```tsx
<ContextMenu
  isOpen={editorMenuOpen}
  position={editorMenuPos}
  items={editorMenuItems}
  onClose={() => setEditorMenuOpen(false)}
/>
```

So the full return looks like:

```tsx
return (
  <div className={styles.root}>
    <TabBar />
    {note ? (
      <>
        <div className={styles.toolbar}>
          <span className={styles.breadcrumb}>
            {parentFolder
              ? <><span className={styles.breadcrumbFolder}>{parentFolder.title}</span><span className={styles.breadcrumbSep}>/</span><span className={styles.breadcrumbNote}>{note.title}</span></>
              : <span className={styles.breadcrumbNote}>{note.title}</span>
            }
          </span>
          <span className={`${styles.saveStatus} ${statusClass}`}>{statusLabel}</span>
        </div>
        <div className={styles.editorWrap} onContextMenu={handleEditorContextMenu}>
          <EditorContent editor={editor} />
        </div>
      </>
    ) : (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🦉</div>
        <div className={styles.emptyTitle}>No note open</div>
        <div className={styles.emptyDesc}>Select a note from the sidebar or press ⌘K to create one</div>
      </div>
    )}
    <ContextMenu
      isOpen={editorMenuOpen}
      position={editorMenuPos}
      items={editorMenuItems}
      onClose={() => setEditorMenuOpen(false)}
    />
  </div>
)
```

- [ ] **Step 3: Run full test suite**

```bash
cd /home/device/Documents/owl.md && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/editor/NoteEditor.tsx && git commit -m "feat: right-click context menu in note editor — wiki-link, callout, cut/copy/paste"
```

---

## Task 9: VaultManagerModal — vault card context menu

**Files:**
- Modify: `src/renderer/components/vault/VaultManagerModal.tsx`

Each vault card in the "Open Vault" list gets `onContextMenu`. Actions: "Switch to this vault" (calls `handleOpenExisting`) and "Remove from list" (calls `ipc.vault.removeKnown` + reloads list).

- [ ] **Step 1: Add context menu state and imports to VaultManagerModal.tsx**

Add to the imports:

```tsx
import { ContextMenu, type ContextMenuEntry } from '../ui/ContextMenu'
```

Add these state variables inside the `VaultManagerModal` function body (after `const [error, setError] = useState<string | null>(null)`):

```tsx
const [vaultMenuOpen,  setVaultMenuOpen]  = useState(false)
const [vaultMenuPos,   setVaultMenuPos]   = useState({ x: 0, y: 0 })
const [vaultMenuItems, setVaultMenuItems] = useState<ContextMenuEntry[]>([])
```

- [ ] **Step 2: Add vault card context menu handler**

Add this function inside `VaultManagerModal`, before the `return`:

```tsx
const handleVaultCardContextMenu = useCallback((e: React.MouseEvent, v: VaultConfig) => {
  e.preventDefault()
  e.stopPropagation()
  const items: ContextMenuEntry[] = [
    { label: 'Switch to this vault', icon: '↩', onClick: () => handleOpenExisting(v.path) },
    { separator: true },
    {
      label: 'Remove from list',
      icon: '✕',
      danger: true,
      onClick: async () => {
        await ipc.vault.removeKnown(v.path)
        const updated = await ipc.vault.listKnown()
        setKnownVaults(updated)
      },
    },
  ]
  setVaultMenuPos({ x: e.clientX, y: e.clientY })
  setVaultMenuItems(items)
  setVaultMenuOpen(true)
}, [handleOpenExisting])
```

Note: you need to add `useCallback` to imports from React if not already present:

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
```

- [ ] **Step 3: Attach handler to vault cards and render ContextMenu**

Find the vault card buttons in the `screen === 'input' && mode === 'open'` block and add `onContextMenu`:

```tsx
{knownVaults.map(v => (
  <button
    key={v.path}
    className={styles.vaultCard}
    onClick={() => handleOpenExisting(v.path)}
    onContextMenu={e => handleVaultCardContextMenu(e, v)}
  >
    <div className={styles.vaultCardName}>{v.name}</div>
    <div className={styles.vaultCardPath}>{v.path}</div>
  </button>
))}
```

Before the closing `</div>` of the modal `div`, add:

```tsx
<ContextMenu
  isOpen={vaultMenuOpen}
  position={vaultMenuPos}
  items={vaultMenuItems}
  onClose={() => setVaultMenuOpen(false)}
/>
```

- [ ] **Step 4: Run full test suite**

```bash
cd /home/device/Documents/owl.md && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/device/Documents/owl.md && git add src/renderer/components/vault/VaultManagerModal.tsx && git commit -m "feat: right-click context menu on vault cards — switch or remove from list"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run the full test suite one more time**

```bash
cd /home/device/Documents/owl.md && npm test 2>&1 | tail -30
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Build to verify TypeScript compiles**

```bash
cd /home/device/Documents/owl.md && npm run build 2>&1 | tail -30
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit build artifacts if any changed, or just verify clean**

```bash
cd /home/device/Documents/owl.md && git status
```

All changes should already be committed from previous tasks. If clean, we're done.
