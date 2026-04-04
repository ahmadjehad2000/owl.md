# Phase 2C-A: Context Menus, Quick Switcher & F2 Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add right-click context menus across the app, a fast Quick Switcher (Cmd+O), and F2 rename with automatic backlink updating.

**Architecture:** A single reusable ContextMenu component driven by a useContextMenu hook handles all right-click surfaces. QuickSwitcher is a lightweight modal separate from the command palette. Rename flows through a new notes:rename IPC handler that updates the file, DB row, and all [[links]] in the vault.

**Tech Stack:** React 18, Zustand 4, Electron IPC, better-sqlite3, CSS Modules.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/renderer/components/ui/ContextMenu.tsx` | Reusable context menu component |
| Create | `src/renderer/components/ui/ContextMenu.module.css` | Context menu styles |
| Create | `src/renderer/hooks/useContextMenu.ts` | Hook: position, items, open/close state |
| Modify | `src/renderer/components/layout/LeftSidebar.tsx` | Add onContextMenu to note rows + inline rename |
| Modify | `src/renderer/components/editor/TabBar.tsx` | Add onContextMenu to tabs; add pin state |
| Modify | `src/renderer/stores/tabStore.ts` | Add `pinned` field on Tab; `pinTab`/`unpinTab`; `closeOthers`; `closeToRight`; `updateTabTitle` |
| Modify | `src/renderer/components/editor/NoteEditor.tsx` | Add onContextMenu for text selection + wiki-link right-click |
| Create | `src/renderer/components/command/QuickSwitcher.tsx` | Quick switcher modal |
| Create | `src/renderer/components/command/QuickSwitcher.module.css` | Quick switcher styles |
| Create | `src/renderer/stores/quickSwitcherStore.ts` | Open/close state |
| Modify | `src/renderer/components/layout/AppShell.tsx` | Cmd+O → open quick switcher; F2 → rename |
| Modify | `src/main/ipc/notes.ts` | Add `notes:rename`, `notes:reveal` handlers |
| Modify | `src/main/services/VaultService.ts` | Add `renameNote(oldPath, newPath)` |
| Modify | `src/preload/index.ts` | Expose rename, reveal |
| Modify | `src/renderer/lib/ipc.ts` | Wire rename, reveal |
| Modify | `src/shared/types/IPC.ts` | Add rename, reveal to OwlNotesAPI |
| Modify | `tests/main/services/VaultService.test.ts` | `renameNote` tests |
| Create | `tests/renderer/stores/quickSwitcherStore.test.ts` | open/close tests |
| Create | `tests/renderer/stores/tabStore.pinning.test.ts` | Pin/unpin, closeOthers, closeToRight tests |

---

### Task 1: Extend tabStore — pin, closeOthers, closeToRight, updateTabTitle

**Files:**
- Modify: `src/renderer/stores/tabStore.ts`
- Create: `tests/renderer/stores/tabStore.pinning.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/stores/tabStore.pinning.test.ts`:

```typescript
// tests/renderer/stores/tabStore.pinning.test.ts
import { beforeEach, describe, it, expect } from 'vitest'
import { useTabStore } from '../../../src/renderer/stores/tabStore'

beforeEach(() => {
  useTabStore.setState({ tabs: [], activeTabId: null })
})

describe('pinTab / unpinTab', () => {
  it('sets pinned = true on the tab', () => {
    useTabStore.getState().openTab('n1', 'Note 1')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().pinTab(tabId)
    expect(useTabStore.getState().tabs[0].pinned).toBe(true)
  })

  it('sets pinned = false on unpinTab', () => {
    useTabStore.getState().openTab('n1', 'Note 1')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().pinTab(tabId)
    useTabStore.getState().unpinTab(tabId)
    expect(useTabStore.getState().tabs[0].pinned).toBe(false)
  })

  it('closeTab does not close a pinned tab', () => {
    useTabStore.getState().openTab('n1', 'Note 1')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().pinTab(tabId)
    useTabStore.getState().closeTab(tabId)
    expect(useTabStore.getState().tabs).toHaveLength(1)
  })
})

describe('closeOthers', () => {
  it('closes all tabs except the specified one (skips pinned)', () => {
    useTabStore.getState().openTab('n1', 'N1')
    useTabStore.getState().openTab('n2', 'N2')
    useTabStore.getState().openTab('n3', 'N3')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().pinTab(tabs[0].id)
    useTabStore.getState().closeOthers(tabs[1].id)
    const remaining = useTabStore.getState().tabs
    expect(remaining.some(t => t.id === tabs[0].id)).toBe(true)  // pinned survives
    expect(remaining.some(t => t.id === tabs[1].id)).toBe(true)  // target survives
    expect(remaining.some(t => t.id === tabs[2].id)).toBe(false) // unpinned closed
    expect(useTabStore.getState().activeTabId).toBe(tabs[1].id)
  })
})

describe('closeToRight', () => {
  it('closes all tabs to the right of the target (skips pinned)', () => {
    useTabStore.getState().openTab('n1', 'N1')
    useTabStore.getState().openTab('n2', 'N2')
    useTabStore.getState().openTab('n3', 'N3')
    useTabStore.getState().openTab('n4', 'N4')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().pinTab(tabs[3].id)
    useTabStore.getState().closeToRight(tabs[1].id)
    const remaining = useTabStore.getState().tabs
    expect(remaining.some(t => t.id === tabs[0].id)).toBe(true)
    expect(remaining.some(t => t.id === tabs[1].id)).toBe(true)
    expect(remaining.some(t => t.id === tabs[2].id)).toBe(false)
    expect(remaining.some(t => t.id === tabs[3].id)).toBe(true)  // pinned survives
  })
})

describe('updateTabTitle', () => {
  it('updates the title field of a tab', () => {
    useTabStore.getState().openTab('n1', 'Old Title')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().updateTabTitle(tabId, 'New Title')
    expect(useTabStore.getState().tabs[0].title).toBe('New Title')
  })
})
```

- [ ] **Step 2: Implement the changes**

Replace `src/renderer/stores/tabStore.ts` entirely:

```typescript
// src/renderer/stores/tabStore.ts
import { create } from 'zustand'
import type { Frontmatter } from '../lib/markdown'

export interface Tab {
  id: string            // UUID — tab identity, not note identity
  noteId: string
  title: string
  isDirty: boolean
  pinned: boolean
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
  updateTabTitle:   (tabId: string, title: string) => void
  pinTab:           (tabId: string) => void
  unpinTab:         (tabId: string) => void
  closeOthers:      (tabId: string) => void
  closeToRight:     (tabId: string) => void
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
      tabs: [...s.tabs, { id, noteId, title, isDirty: false, pinned: false, markdown: null, frontmatter: null }],
    }))
    get().activateTab(id)
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const tab = tabs.find(t => t.id === tabId)
    if (!tab || tab.pinned) return
    const idx = tabs.findIndex(t => t.id === tabId)
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

  updateTabTitle: (tabId, title) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, title } : t),
    }))
  },

  pinTab: (tabId) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, pinned: true } : t),
    }))
  },

  unpinTab: (tabId) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, pinned: false } : t),
    }))
  },

  closeOthers: (tabId) => {
    const { tabs } = get()
    const remaining = tabs.filter(t => t.id === tabId || t.pinned)
    set({ tabs: remaining, activeTabId: tabId })
  },

  closeToRight: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex(t => t.id === tabId)
    if (idx === -1) return
    const remaining = tabs.filter((t, i) => i <= idx || t.pinned)
    const stillActive = remaining.some(t => t.id === activeTabId)
    set({ tabs: remaining, activeTabId: stillActive ? activeTabId : tabId })
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

- [ ] **Step 3: Run tests and commit**

```bash
npx vitest run tests/renderer/stores/tabStore.pinning.test.ts tests/renderer/stores/tabStore.test.ts
git add src/renderer/stores/tabStore.ts tests/renderer/stores/tabStore.pinning.test.ts
git commit -m "feat(tabStore): add pinned field, closeOthers, closeToRight, updateTabTitle"
```

---

### Task 2: VaultService.renameNote + IPC layer

**Files:**
- Modify: `src/main/services/VaultService.ts`
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/main/ipc/notes.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/ipc.ts`
- Modify: `tests/main/services/VaultService.test.ts`

- [ ] **Step 1: Write failing tests**

Append inside the `describe('VaultService', ...)` block in `tests/main/services/VaultService.test.ts`:

```typescript
  it('renameNote moves file to new path', () => {
    vault.writeNote('original.md', '# Original')
    vault.renameNote('original.md', 'renamed.md')
    expect(vault.readNote('renamed.md')).toBe('# Original')
    expect(() => vault.readNote('original.md')).toThrow()
  })

  it('renameNote creates target directory if needed', () => {
    vault.writeNote('top.md', '# Top')
    vault.renameNote('top.md', 'sub/folder/top.md')
    expect(vault.readNote('sub/folder/top.md')).toBe('# Top')
  })

  it('renameNote throws if source does not exist', () => {
    expect(() => vault.renameNote('ghost.md', 'other.md')).toThrow()
  })
```

- [ ] **Step 2: Implement VaultService.renameNote**

Add to `src/main/services/VaultService.ts` after the `deleteNote` method:

```typescript
  renameNote(oldPath: string, newPath: string): void {
    const oldAbs = this.noteAbsPath(oldPath)
    const newAbs = this.noteAbsPath(newPath)
    if (!existsSync(oldAbs)) throw new Error(`Note not found: ${oldPath}`)
    mkdirSync(dirname(newAbs), { recursive: true })
    renameSync(oldAbs, newAbs)
  }
```

Also add `renameSync` to the imports at the top of the file:

```typescript
import {
  mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync,
  writeFileSync, existsSync
} from 'fs'
```

- [ ] **Step 3: Add rename + reveal to shared types**

In `src/shared/types/IPC.ts`, replace the `OwlNotesAPI` interface:

```typescript
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
  reveal:       (id: string) => Promise<void>
}
```

- [ ] **Step 4: Add IPC handlers in notes.ts**

Append to `src/main/ipc/notes.ts` before the closing `}` of `registerNotesHandlers`:

```typescript
  ipcMain.handle('notes:rename', (_e, id: string, newTitle: string): Note => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined
    if (!note) throw new Error(`Note not found: ${id}`)
    const raw = note as unknown as Record<string, unknown>
    if ((raw.note_type ?? raw.noteType) === 'folder') throw new Error(`Cannot rename folder note via notes:rename`)

    const oldPath = note.path
    const newFileName = `${newTitle.replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '-')}.md`
    const folderDir = dirname(oldPath) === '.' ? '' : dirname(oldPath)
    const newPath = folderDir ? `${folderDir}/${newFileName}` : newFileName

    // 1. Rename file on disk
    services.vault().renameNote(oldPath, newPath)

    // 2. Update notes row
    db().prepare('UPDATE notes SET path = ?, title = ?, updated_at = ? WHERE id = ?')
      .run(newPath, newTitle, Date.now(), id)

    // 3. Update [[OldTitle]] → [[NewTitle]] in all other notes
    const oldTitle = note.title as string
    const allNotes = db().prepare("SELECT id, path FROM notes WHERE note_type != 'folder'").all() as Array<{ id: string; path: string }>
    for (const other of allNotes) {
      if (other.id === id) continue
      let content: string
      try { content = services.vault().readNote(other.path) } catch { continue }
      const escaped = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const updated = content.replace(new RegExp(`\\[\\[${escaped}(\\|[^\\]]+)?\\]\\]`, 'g'), (match, alias) => {
        return alias ? `[[${newTitle}${alias}]]` : `[[${newTitle}]]`
      })
      if (updated !== content) {
        services.vault().writeNote(other.path, updated)
        const titleMatch = updated.match(/^#\s+(.+)$/m)
        const otherTitle = titleMatch ? titleMatch[1] : basename(other.path, '.md')
        const rawOther = db().prepare('SELECT * FROM notes WHERE id = ?').get(other.id) as Note
        const ro = rawOther as unknown as Record<string, unknown>
        const noteType = (ro.note_type ?? ro.noteType ?? 'note') as Note['noteType']
        const folderPath = dirname(other.path) === '.' ? '' : dirname(other.path)
        services.index().indexNote({ id: other.id, path: other.path, title: otherTitle, markdown: updated, folderPath, noteType })
        services.index().syncFTS(other.id, otherTitle, updated)
      }
    }

    // 4. Re-index the renamed note
    const newMarkdown = services.vault().readNote(newPath)
    const newFolderPath = dirname(newPath) === '.' ? '' : dirname(newPath)
    services.index().indexNote({ id, path: newPath, title: newTitle, markdown: newMarkdown, folderPath: newFolderPath, noteType: 'note' })
    services.index().syncFTS(id, newTitle, newMarkdown)
    services.index().resolveLinks()

    return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
  })

  ipcMain.handle('notes:reveal', (_e, id: string): void => {
    const note = db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined
    if (!note) return
    const absPath = services.vault().noteAbsPath(note.path)
    // shell is imported at top of main process; we call it via electron's shell
    const { shell } = require('electron')
    shell.showItemInFolder(absPath)
  })
```

- [ ] **Step 5: Wire up preload**

In `src/preload/index.ts`, replace the `notes` block:

```typescript
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
    rename:  (id, newTitle)  => ipcRenderer.invoke('notes:rename',  id, newTitle),
    reveal:  (id)            => ipcRenderer.invoke('notes:reveal',  id),
  },
```

- [ ] **Step 6: Wire renderer ipc.ts**

In `src/renderer/lib/ipc.ts`, replace the `notes` block:

```typescript
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
    rename: (id: string, newTitle: string): Promise<Note> =>
              window.owl.notes.rename(id, newTitle),
    reveal: (id: string): Promise<void> => window.owl.notes.reveal(id),
  },
```

- [ ] **Step 7: Run tests and commit**

```bash
npx vitest run tests/main/services/VaultService.test.ts
git add src/main/services/VaultService.ts src/main/ipc/notes.ts \
        src/shared/types/IPC.ts src/preload/index.ts src/renderer/lib/ipc.ts \
        tests/main/services/VaultService.test.ts
git commit -m "feat(rename): add VaultService.renameNote, notes:rename + notes:reveal IPC handlers"
```

---

### Task 3: ContextMenu component + useContextMenu hook

**Files:**
- Create: `src/renderer/hooks/useContextMenu.ts`
- Create: `src/renderer/components/ui/ContextMenu.tsx`
- Create: `src/renderer/components/ui/ContextMenu.module.css`

- [ ] **Step 1: Create the hook**

Create `src/renderer/hooks/useContextMenu.ts`:

```typescript
// src/renderer/hooks/useContextMenu.ts
import { useState, useCallback, useEffect } from 'react'

export interface ContextMenuItem {
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separator?: never
  action(): void
}

export interface ContextMenuSeparator {
  separator: true
  label?: never
  action?: never
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuEntry[]
}

interface UseContextMenuReturn {
  menuState: ContextMenuState | null
  open: (e: React.MouseEvent, items: ContextMenuEntry[]) => void
  close: () => void
}

export function useContextMenu(): UseContextMenuReturn {
  const [menuState, setMenuState] = useState<ContextMenuState | null>(null)

  const open = useCallback((e: React.MouseEvent, items: ContextMenuEntry[]) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuState({ x: e.clientX, y: e.clientY, items })
  }, [])

  const close = useCallback(() => setMenuState(null), [])

  useEffect(() => {
    if (!menuState) return
    const handle = (): void => setMenuState(null)
    window.addEventListener('click', handle, { capture: true })
    window.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') handle()
    }, { capture: true, once: true })
    return () => window.removeEventListener('click', handle, { capture: true })
  }, [menuState])

  return { menuState, open, close }
}
```

- [ ] **Step 2: Create ContextMenu component**

Create `src/renderer/components/ui/ContextMenu.tsx`:

```typescript
// src/renderer/components/ui/ContextMenu.tsx
import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ContextMenuEntry } from '../../hooks/useContextMenu'
import styles from './ContextMenu.module.css'

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose(): void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  // Adjust position so menu doesn't overflow viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 9999,
  }

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.right > window.innerWidth)  el.style.left = `${x - rect.width}px`
    if (rect.bottom > window.innerHeight) el.style.top = `${y - rect.height}px`
  }, [x, y])

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={style}
      onMouseDown={e => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if ('separator' in item && item.separator) {
          return <div key={i} className={styles.separator} />
        }
        const mi = item as Exclude<ContextMenuEntry, { separator: true }>
        return (
          <button
            key={i}
            className={`${styles.item} ${mi.danger ? styles.danger : ''} ${mi.disabled ? styles.disabled : ''}`}
            disabled={mi.disabled}
            onClick={() => { if (!mi.disabled) { mi.action(); onClose() } }}
          >
            <span className={styles.label}>{mi.label}</span>
            {mi.shortcut && <span className={styles.shortcut}>{mi.shortcut}</span>}
          </button>
        )
      })}
    </div>,
    document.body
  )
}
```

- [ ] **Step 3: Create ContextMenu styles**

Create `src/renderer/components/ui/ContextMenu.module.css`:

```css
/* src/renderer/components/ui/ContextMenu.module.css */
.menu {
  min-width: 180px;
  max-width: 260px;
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.48);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  user-select: none;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 80ms;
}

.item:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.07);
}

.item.danger {
  color: #f38ba8;
}

.item.danger:hover {
  background: rgba(243, 139, 168, 0.12);
}

.item.disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shortcut {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.38);
  flex-shrink: 0;
}

.separator {
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
  margin: 3px 6px;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useContextMenu.ts \
        src/renderer/components/ui/ContextMenu.tsx \
        src/renderer/components/ui/ContextMenu.module.css
git commit -m "feat(ui): add reusable ContextMenu component and useContextMenu hook"
```

---

### Task 4: Context menu on LeftSidebar (right-click on notes + inline rename)

**Files:**
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`

- [ ] **Step 1: Implement**

Replace the contents of `src/renderer/components/layout/LeftSidebar.tsx`:

```typescript
// src/renderer/components/layout/LeftSidebar.tsx
import React, { useCallback, useState, useRef } from 'react'
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
import { useContextMenu } from '../../hooks/useContextMenu'
import { ContextMenu } from '../ui/ContextMenu'
import styles from './LeftSidebar.module.css'
import type { Note } from '@shared/types/Note'

// ─── Inline rename input ─────────────────────────────────────────────────────

function InlineRenameInput({ initialValue, onCommit, onCancel }: {
  initialValue: string
  onCommit(value: string): void
  onCancel(): void
}): JSX.Element {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    inputRef.current?.select()
  }, [])

  const commit = (): void => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== initialValue) onCommit(trimmed)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      className={styles.inlineRename}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onClick={e => e.stopPropagation()}
    />
  )
}

// ─── Sortable note row ────────────────────────────────────────────────────────

function SortableNoteRow({ note, active, indent, onClick, onContextMenu, renaming, onRenameCommit, onRenameCancel }: {
  note: Note
  active: boolean
  indent: boolean
  onClick(): void
  onContextMenu(e: React.MouseEvent): void
  renaming: boolean
  onRenameCommit(value: string): void
  onRenameCancel(): void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.id, data: { type: 'note', parentId: note.parentId ?? null } })

  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className={`${styles.noteItem} ${active ? styles.active : ''} ${indent ? styles.indented : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <span className={styles.icon}>📄</span>
      {renaming
        ? <InlineRenameInput
            initialValue={note.title}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        : <span className={styles.title}>{note.title}</span>
      }
    </button>
  )
}

// ─── Sortable folder row ──────────────────────────────────────────────────────

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

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export function LeftSidebar(): JSX.Element {
  const notes        = useVaultStore(s => s.notes)
  const loadNotes    = useVaultStore(s => s.loadNotes)
  const createFolder = useVaultStore(s => s.createFolder)
  const openTab      = useTabStore(s => s.openTab)
  const tabs         = useTabStore(s => s.tabs)
  const activeTabId  = useTabStore(s => s.activeTabId)
  const updateTabTitle = useTabStore(s => s.updateTabTitle)
  const [overFolderId, setOverFolderId] = useState<string | null>(null)
  const [dragId, setDragId]             = useState<string | null>(null)
  const [renamingId, setRenamingId]     = useState<string | null>(null)

  const { menuState, open: openMenu, close: closeMenu } = useContextMenu()

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

  const handleNoteContextMenu = useCallback((e: React.MouseEvent, note: Note) => {
    openMenu(e, [
      {
        label: 'Open in New Tab',
        action: () => openTab(note.id, note.title),
      },
      {
        label: 'Rename',
        shortcut: 'F2',
        action: () => setRenamingId(note.id),
      },
      { separator: true },
      {
        label: 'Duplicate',
        action: async () => {
          const content = await ipc.notes.read(note.id)
          const newTitle = `${note.title} copy`
          const { note: newNote } = await ipc.notes.create(newTitle, note.folderPath)
          await ipc.notes.save(newNote.id, content.markdown.replace(/^#\s+.+$/m, `# ${newTitle}`))
          await loadNotes()
        },
      },
      {
        label: 'Delete',
        danger: true,
        action: async () => {
          await ipc.notes.delete(note.id)
          await loadNotes()
        },
      },
      { separator: true },
      {
        label: 'Reveal in Finder',
        action: () => ipc.notes.reveal(note.id),
      },
    ])
  }, [openMenu, openTab, loadNotes])

  const handleRenameCommit = useCallback(async (noteId: string, newTitle: string) => {
    setRenamingId(null)
    const updatedNote = await ipc.notes.rename(noteId, newTitle)
    await loadNotes()
    // Update any open tab titles for this note
    const affectedTab = useTabStore.getState().tabs.find(t => t.noteId === noteId)
    if (affectedTab) {
      updateTabTitle(affectedTab.id, (updatedNote as unknown as Record<string, unknown>).title as string ?? newTitle)
    }
  }, [loadNotes, updateTabTitle])

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
                >
                  <SortableContext items={children.map(n => n.id)} strategy={verticalListSortingStrategy}>
                    {children.map(n => (
                      <SortableNoteRow
                        key={n.id}
                        note={n}
                        active={n.id === activeNoteId}
                        indent
                        onClick={() => openNote(n)}
                        onContextMenu={e => handleNoteContextMenu(e, n)}
                        renaming={renamingId === n.id}
                        onRenameCommit={v => handleRenameCommit(n.id, v)}
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
                onContextMenu={e => handleNoteContextMenu(e, n)}
                renaming={renamingId === n.id}
                onRenameCommit={v => handleRenameCommit(n.id, v)}
                onRenameCancel={() => setRenamingId(null)}
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

      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={menuState.items}
          onClose={closeMenu}
        />
      )}
    </DndContext>
  )
}
```

Also add `.inlineRename` to `src/renderer/components/layout/LeftSidebar.module.css`:

```css
.inlineRename {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(56, 182, 220, 0.5);
  border-radius: 4px;
  color: inherit;
  font-size: inherit;
  padding: 1px 4px;
  outline: none;
  min-width: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/layout/LeftSidebar.tsx \
        src/renderer/components/layout/LeftSidebar.module.css
git commit -m "feat(sidebar): right-click context menu and inline F2 rename on notes"
```

---

### Task 5: Context menu on TabBar (right-click on tabs + pin indicator)

**Files:**
- Modify: `src/renderer/components/editor/TabBar.tsx`
- Modify: `src/renderer/components/editor/TabBar.module.css`

- [ ] **Step 1: Implement**

Replace the contents of `src/renderer/components/editor/TabBar.tsx`:

```typescript
// src/renderer/components/editor/TabBar.tsx
import React from 'react'
import { useTabStore } from '../../stores/tabStore'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import { ipc } from '../../lib/ipc'
import { useContextMenu } from '../../hooks/useContextMenu'
import { ContextMenu } from '../ui/ContextMenu'
import styles from './TabBar.module.css'

export function TabBar(): JSX.Element {
  const tabs         = useTabStore(s => s.tabs)
  const activeTabId  = useTabStore(s => s.activeTabId)
  const activateTab  = useTabStore(s => s.activateTab)
  const closeTab     = useTabStore(s => s.closeTab)
  const openTab      = useTabStore(s => s.openTab)
  const pinTab       = useTabStore(s => s.pinTab)
  const unpinTab     = useTabStore(s => s.unpinTab)
  const closeOthers  = useTabStore(s => s.closeOthers)
  const closeToRight = useTabStore(s => s.closeToRight)
  const loadNotes    = useVaultStore(s => s.loadNotes)

  const { menuState, open: openMenu, close: closeMenu } = useContextMenu()

  const handleNew = async (): Promise<void> => {
    const title = `Untitled ${new Date().toLocaleDateString()}`
    const { note } = await ipc.notes.create(title, '')
    await loadNotes()
    openTab(note.id, note.title)
  }

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string): void => {
    const tab = useTabStore.getState().tabs.find(t => t.id === tabId)
    if (!tab) return
    openMenu(e, [
      {
        label: 'Close Tab',
        shortcut: '⌘W',
        disabled: tab.pinned,
        action: async () => {
          if (tab.isDirty) await useEditorStore.getState().save()
          closeTab(tabId)
        },
      },
      {
        label: 'Close Others',
        action: () => closeOthers(tabId),
      },
      {
        label: 'Close to the Right',
        action: () => closeToRight(tabId),
      },
      { separator: true },
      {
        label: tab.pinned ? 'Unpin Tab' : 'Pin Tab',
        action: () => tab.pinned ? unpinTab(tabId) : pinTab(tabId),
      },
    ])
  }

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabList}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''} ${tab.pinned ? styles.tabPinned : ''}`}
            onClick={() => activateTab(tab.id)}
            onContextMenu={e => handleTabContextMenu(e, tab.id)}
          >
            {tab.pinned && <span className={styles.pinIndicator} title="Pinned">📌</span>}
            <span className={styles.tabTitle}>{tab.title}</span>
            {tab.isDirty && <span className={styles.tabDirty}>●</span>}
            {!tab.pinned && (
              <span
                className={styles.tabClose}
                role="button"
                onClick={async e => {
                  e.stopPropagation()
                  const t = useTabStore.getState().tabs.find(x => x.id === tab.id)
                  if (t?.isDirty) await useEditorStore.getState().save()
                  closeTab(tab.id)
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}
      </div>
      <button className={styles.tabNew} onClick={handleNew} title="New note">+</button>

      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={menuState.items}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}
```

Add `.tabPinned` and `.pinIndicator` to `src/renderer/components/editor/TabBar.module.css` (append to existing file):

```css
.tabPinned {
  opacity: 1;
}

.pinIndicator {
  font-size: 10px;
  margin-right: 2px;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/editor/TabBar.tsx \
        src/renderer/components/editor/TabBar.module.css
git commit -m "feat(tabbar): right-click context menu with pin, close others, close to right"
```

---

### Task 6: Context menu on NoteEditor (text selection + wiki-link right-click)

**Files:**
- Modify: `src/renderer/components/editor/NoteEditor.tsx`

- [ ] **Step 1: Implement**

Replace the contents of `src/renderer/components/editor/NoteEditor.tsx`:

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
import { useContextMenu } from '../../hooks/useContextMenu'
import { ContextMenu } from '../ui/ContextMenu'
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

  const { menuState, open: openMenu, close: closeMenu } = useContextMenu()

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

  // Right-click handler on the editor content area
  const handleEditorContextMenu = (e: React.MouseEvent): void => {
    if (!editor) return

    // Check if the click target is a wiki-link
    const wikiLinkEl = (e.target as HTMLElement).closest('[data-target]')
    if (wikiLinkEl) {
      const linkTarget = wikiLinkEl.getAttribute('data-target') ?? ''
      e.preventDefault()
      openMenu(e, [
        {
          label: 'Open in New Tab',
          action: () => {
            window.dispatchEvent(new CustomEvent('owl:open-wiki-link', { detail: { target: linkTarget } }))
          },
        },
        {
          label: 'Open to the Right',
          action: () => {
            // For now: same as open in new tab; split-pane deferred to Phase 2D
            window.dispatchEvent(new CustomEvent('owl:open-wiki-link', { detail: { target: linkTarget } }))
          },
        },
        {
          label: 'Copy Link Text',
          action: () => navigator.clipboard.writeText(`[[${linkTarget}]]`),
        },
      ])
      return
    }

    // Text selection context menu
    const { from, to } = editor.state.selection
    const hasSelection = from !== to
    const selectedText = hasSelection
      ? editor.state.doc.textBetween(from, to, ' ')
      : ''
    const noteTitle = note?.title ?? ''

    openMenu(e, [
      {
        label: 'Bold',
        shortcut: '⌘B',
        disabled: !hasSelection,
        action: () => editor.chain().focus().toggleBold().run(),
      },
      {
        label: 'Italic',
        shortcut: '⌘I',
        disabled: !hasSelection,
        action: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        label: 'Strikethrough',
        disabled: !hasSelection,
        action: () => editor.chain().focus().toggleStrike().run(),
      },
      { separator: true },
      {
        label: 'Link Selection as Wiki-link',
        disabled: !hasSelection,
        action: () => {
          editor.chain().focus().insertContentAt({ from, to }, `[[${selectedText}]]`).run()
        },
      },
      {
        label: 'Copy as Wiki-link',
        action: () => navigator.clipboard.writeText(`[[${noteTitle}]]`),
      },
    ])
  }

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
          <div className={styles.editorWrap} onContextMenu={handleEditorContextMenu}>
            <EditorContent editor={editor} />
          </div>
        </>
      ) : (
        <div className={styles.empty}>Open a note or create a new one</div>
      )}

      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={menuState.items}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/editor/NoteEditor.tsx
git commit -m "feat(editor): right-click context menu for text selection and wiki-links"
```

---

### Task 7: quickSwitcherStore

**Files:**
- Create: `src/renderer/stores/quickSwitcherStore.ts`
- Create: `tests/renderer/stores/quickSwitcherStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/stores/quickSwitcherStore.test.ts`:

```typescript
// tests/renderer/stores/quickSwitcherStore.test.ts
import { beforeEach, describe, it, expect } from 'vitest'
import { useQuickSwitcherStore } from '../../../src/renderer/stores/quickSwitcherStore'

beforeEach(() => {
  useQuickSwitcherStore.setState({ isOpen: false })
})

describe('quickSwitcherStore', () => {
  it('starts closed', () => {
    expect(useQuickSwitcherStore.getState().isOpen).toBe(false)
  })

  it('open() sets isOpen to true', () => {
    useQuickSwitcherStore.getState().open()
    expect(useQuickSwitcherStore.getState().isOpen).toBe(true)
  })

  it('close() sets isOpen to false', () => {
    useQuickSwitcherStore.getState().open()
    useQuickSwitcherStore.getState().close()
    expect(useQuickSwitcherStore.getState().isOpen).toBe(false)
  })

  it('toggle() flips the open state', () => {
    useQuickSwitcherStore.getState().toggle()
    expect(useQuickSwitcherStore.getState().isOpen).toBe(true)
    useQuickSwitcherStore.getState().toggle()
    expect(useQuickSwitcherStore.getState().isOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Implement**

Create `src/renderer/stores/quickSwitcherStore.ts`:

```typescript
// src/renderer/stores/quickSwitcherStore.ts
import { create } from 'zustand'

interface QuickSwitcherState {
  isOpen: boolean
  open():   void
  close():  void
  toggle(): void
}

export const useQuickSwitcherStore = create<QuickSwitcherState>(set => ({
  isOpen: false,
  open:   () => set({ isOpen: true }),
  close:  () => set({ isOpen: false }),
  toggle: () => set(s => ({ isOpen: !s.isOpen })),
}))
```

- [ ] **Step 3: Run tests and commit**

```bash
npx vitest run tests/renderer/stores/quickSwitcherStore.test.ts
git add src/renderer/stores/quickSwitcherStore.ts \
        tests/renderer/stores/quickSwitcherStore.test.ts
git commit -m "feat(quickSwitcher): add quickSwitcherStore with open/close/toggle"
```

---

### Task 8: QuickSwitcher component

**Files:**
- Create: `src/renderer/components/command/QuickSwitcher.tsx`
- Create: `src/renderer/components/command/QuickSwitcher.module.css`

- [ ] **Step 1: Implement QuickSwitcher.tsx**

Create `src/renderer/components/command/QuickSwitcher.tsx`:

```typescript
// src/renderer/components/command/QuickSwitcher.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuickSwitcherStore } from '../../stores/quickSwitcherStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useTabStore } from '../../stores/tabStore'
import { ipc } from '../../lib/ipc'
import styles from './QuickSwitcher.module.css'
import type { Note } from '@shared/types/Note'

function fuzzyMatch(title: string, query: string): boolean {
  const t = title.toLowerCase()
  const q = query.toLowerCase()
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti)
    if (idx === -1) return false
    ti = idx + 1
  }
  return true
}

function fuzzyScore(title: string, query: string): number {
  // Consecutive match bonus: higher score = better
  const t = title.toLowerCase()
  const q = query.toLowerCase()
  const idx = t.indexOf(q)
  if (idx !== -1) return 1000 - idx  // exact substring wins
  return 0
}

export function QuickSwitcher(): JSX.Element | null {
  const isOpen    = useQuickSwitcherStore(s => s.isOpen)
  const close     = useQuickSwitcherStore(s => s.close)
  const notes     = useVaultStore(s => s.notes)
  const recentIds = useVaultStore(s => s.recentIds)
  const loadNotes = useVaultStore(s => s.loadNotes)

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

  const regularNotes = useMemo(
    () => notes.filter(n => n.noteType !== 'folder'),
    [notes]
  )

  const items: Note[] = useMemo(() => {
    if (!query.trim()) {
      // Show up to 8 recently used notes
      const recentNotes = recentIds
        .map(id => regularNotes.find(n => n.id === id))
        .filter((n): n is Note => n !== undefined)
        .slice(0, 8)
      if (recentNotes.length > 0) return recentNotes
      // Fall back to 8 most recently updated notes
      return [...regularNotes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
    }
    return regularNotes
      .filter(n => fuzzyMatch(n.title, query))
      .sort((a, b) => fuzzyScore(b.title, query) - fuzzyScore(a.title, query))
      .slice(0, 20)
  }, [query, regularNotes, recentIds])

  const openNote = useCallback((note: Note, newTab: boolean) => {
    if (newTab) {
      // Force a new tab even if note is already open
      const { tabs } = useTabStore.getState()
      const existing = tabs.find(t => t.noteId === note.id)
      if (existing) {
        useTabStore.getState().activateTab(existing.id)
      } else {
        useTabStore.getState().openTab(note.id, note.title)
      }
    } else {
      useTabStore.getState().openTab(note.id, note.title)
    }
    useVaultStore.getState().addRecent(note.id)
    close()
  }, [close])

  const createAndOpen = useCallback(async (title: string) => {
    const { note } = await ipc.notes.create(title, '')
    await loadNotes()
    useTabStore.getState().openTab(note.id, note.title)
    close()
  }, [close, loadNotes])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(i => Math.min(i + 1, items.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey && query.trim()) {
        void createAndOpen(query.trim())
      } else if (items[selected]) {
        openNote(items[selected], e.metaKey || e.ctrlKey)
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  if (!isOpen) return null

  const showCreateHint = query.trim().length > 0 && !items.some(n => n.title.toLowerCase() === query.toLowerCase())

  return (
    <div className={styles.overlay} onMouseDown={close}>
      <div className={styles.switcher} onMouseDown={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Jump to note… (Shift+Enter to create)"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(0) }}
          onKeyDown={onKeyDown}
        />
        <div className={styles.list}>
          {items.length === 0 && !showCreateHint && (
            <div className={styles.empty}>No matching notes</div>
          )}
          {items.map((note, i) => (
            <button
              key={note.id}
              className={`${styles.item} ${i === selected ? styles.selected : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={e => openNote(note, e.metaKey || e.ctrlKey)}
            >
              <span className={styles.icon}>📄</span>
              <span className={styles.title}>{note.title}</span>
              <span className={styles.path}>{note.folderPath || ''}</span>
            </button>
          ))}
          {showCreateHint && (
            <button
              className={`${styles.item} ${styles.createHint}`}
              onClick={() => void createAndOpen(query.trim())}
            >
              <span className={styles.icon}>✦</span>
              <span className={styles.title}>Create "{query.trim()}"</span>
              <span className={styles.path}>Shift+Enter</span>
            </button>
          )}
        </div>
        <div className={styles.footer}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>⌘↵ new tab</span>
          <span>⇧↵ create</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement QuickSwitcher.module.css**

Create `src/renderer/components/command/QuickSwitcher.module.css`:

```css
/* src/renderer/components/command/QuickSwitcher.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  z-index: 8000;
}

.switcher {
  width: 560px;
  max-width: calc(100vw - 48px);
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.input {
  padding: 14px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.list {
  max-height: 360px;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 80ms;
}

.item:hover,
.item.selected {
  background: rgba(255, 255, 255, 0.07);
}

.icon {
  font-size: 13px;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.path {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.32);
  flex-shrink: 0;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.createHint .title {
  color: rgba(137, 180, 250, 0.9);
}

.createHint .icon {
  color: rgba(137, 180, 250, 0.9);
}

.empty {
  padding: 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
}

.footer {
  display: flex;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.28);
  font-size: 11px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/command/QuickSwitcher.tsx \
        src/renderer/components/command/QuickSwitcher.module.css
git commit -m "feat(quickSwitcher): add QuickSwitcher modal with fuzzy search and recents"
```

---

### Task 9: Wire QuickSwitcher + F2 rename into AppShell

**Files:**
- Modify: `src/renderer/components/layout/AppShell.tsx`

- [ ] **Step 1: Implement**

Replace the contents of `src/renderer/components/layout/AppShell.tsx`:

```typescript
// src/renderer/components/layout/AppShell.tsx
import React, { useEffect, useCallback } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useCommandPaletteStore } from '../../stores/commandPaletteStore'
import { useQuickSwitcherStore } from '../../stores/quickSwitcherStore'
import { useTabStore } from '../../stores/tabStore'
import { useEditorStore } from '../../stores/editorStore'
import { ipc } from '../../lib/ipc'
import { MenuBar } from './MenuBar'
import { CommandPalette } from '../command/CommandPalette'
import { QuickSwitcher } from '../command/QuickSwitcher'
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
  const openSwitcher  = useQuickSwitcherStore(s => s.open)
  const openedConfigs = useVaultStore(s => s.openedConfigs)
  const activateVault = useVaultStore(s => s.activateVault)
  const activeConfig  = useVaultStore(s => s.config)

  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey

    if (mod && e.key === 'f') { e.preventDefault(); openSearch() }
    if (mod && e.key === 'k') { e.preventDefault(); openPalette() }
    if (mod && e.key === 'o') { e.preventDefault(); openSwitcher() }

    if (mod && e.key === 'w') {
      e.preventDefault()
      const { activeTabId, tabs, closeTab } = useTabStore.getState()
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId)
        if (tab?.pinned) return
        if (tab?.isDirty) await useEditorStore.getState().save()
        closeTab(activeTabId)
      }
    }

    if (mod && e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        useTabStore.getState().prevTab()
      } else {
        useTabStore.getState().nextTab()
      }
    }

    // F2 — rename active note inline
    if (e.key === 'F2') {
      e.preventDefault()
      const { activeTabId, tabs } = useTabStore.getState()
      if (!activeTabId) return
      const tab = tabs.find(t => t.id === activeTabId)
      if (!tab) return
      // Dispatch a custom event; LeftSidebar and NoteEditor both listen
      window.dispatchEvent(new CustomEvent('owl:rename-note', { detail: { noteId: tab.noteId } }))
    }
  }, [openSearch, openPalette, openSwitcher])

  // Handle wiki-link open events from NoteEditor
  useEffect(() => {
    const handler = async (e: Event): Promise<void> => {
      const target = (e as CustomEvent<{ target: string }>).detail.target
      const notes = useVaultStore.getState().notes
      const note = notes.find(n => n.title === target || n.path.endsWith(`${target}.md`))
      if (note) {
        useTabStore.getState().openTab(note.id, note.title)
        useVaultStore.getState().addRecent(note.id)
      } else {
        // Create a new note with that title
        const { note: newNote } = await ipc.notes.create(target, '')
        await useVaultStore.getState().loadNotes()
        useTabStore.getState().openTab(newNote.id, newNote.title)
      }
    }
    window.addEventListener('owl:open-wiki-link', handler)
    return () => window.removeEventListener('owl:open-wiki-link', handler)
  }, [])

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
      <QuickSwitcher />
      <VaultManagerModal />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/layout/AppShell.tsx
git commit -m "feat(appshell): wire Cmd+O quick switcher, F2 rename dispatch, and wiki-link open handler"
```

---

### Task 10: Wire F2 rename event in LeftSidebar

**Files:**
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`

The `owl:rename-note` custom event dispatched by AppShell must activate the inline rename field for the note in the sidebar. Add a `useEffect` to the `LeftSidebar` component body that listens for this event.

- [ ] **Step 1: Add the event listener**

In `src/renderer/components/layout/LeftSidebar.tsx`, add inside the `LeftSidebar` function body, after the `useContextMenu` call:

```typescript
  // Listen for F2 rename events from AppShell
  useEffect(() => {
    const handler = (e: Event): void => {
      const noteId = (e as CustomEvent<{ noteId: string }>).detail.noteId
      setRenamingId(noteId)
    }
    window.addEventListener('owl:rename-note', handler)
    return () => window.removeEventListener('owl:rename-note', handler)
  }, [])
```

Also add `useEffect` to the import at the top if not already there (it is already imported via `React`; add destructured import):

The `useEffect` is already available as `React.useEffect` but we need it destructured. The file already imports `React, { useCallback, useState, useRef }` — update to include `useEffect`:

```typescript
import React, { useCallback, useState, useRef, useEffect } from 'react'
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/layout/LeftSidebar.tsx
git commit -m "feat(sidebar): listen for owl:rename-note event to activate inline rename from F2"
```

---

### Task 11: Full end-to-end rename flow — notes:rename IPC + renderer response

This task verifies that when a rename completes in the main process, the renderer correctly reflects the new title in the tab bar, the sidebar, and all open editor tabs.

**Files:**
- Modify: `src/renderer/components/layout/LeftSidebar.tsx` (already wires rename through `handleRenameCommit`)

The `handleRenameCommit` in LeftSidebar already calls `ipc.notes.rename` and then `loadNotes()` + `updateTabTitle`. We need to also confirm the `notes:rename` IPC handler re-indexes correctly. This task is a verification + integration test in the browser (manual smoke test).

**Manual smoke test checklist:**

- [ ] Create two notes: "Alpha" and "Beta"
- [ ] In "Beta", type `[[Alpha]]`
- [ ] Right-click "Alpha" in sidebar → Rename → type "AlphaRenamed" → Enter
- [ ] Verify: sidebar shows "AlphaRenamed"
- [ ] Verify: "Beta" note content now reads `[[AlphaRenamed]]` (reopen to confirm)
- [ ] Verify: the open tab for "Alpha" (if any) now reads "AlphaRenamed" in the tab bar
- [ ] Press F2 with "AlphaRenamed" active → inline rename appears in sidebar

- [ ] **Step 1: Commit any remaining diffs**

```bash
git status
git add -p
git commit -m "chore: confirm rename round-trip integration"
```

---

### Task 12: Run full test suite and fix any regressions

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all existing tests pass; new tests for `tabStore.pinning`, `quickSwitcherStore`, and `VaultService.renameNote` pass.

- [ ] **Step 2: Fix regressions**

If existing `tabStore.test.ts` tests fail because `Tab` now has `pinned: boolean`, verify the `openTab` action initialises `pinned: false` (it does in the implementation above). The existing tests do not check for `pinned` so they should pass without modification.

- [ ] **Step 3: Final commit**

```bash
git add -p
git commit -m "test: all phase 2C-A tests passing"
```

---

### Task 13: TypeScript compile check + lint

- [ ] **Step 1: Run TypeScript**

```bash
npx tsc --noEmit
```

Fix any type errors — common issues to expect:
- `ipc.notes.reveal` and `ipc.notes.rename` not typed — resolved in Task 2.
- `window.owl.notes.rename` / `.reveal` not typed in `IPC.ts` — resolved in Task 2.
- `Tab.pinned` missing in existing tests — it is initialised as `false` in `openTab`, so `tab.pinned` accesses a valid field.

- [ ] **Step 2: Lint**

```bash
npx eslint src --ext .ts,.tsx --max-warnings 0
```

- [ ] **Step 3: Final commit**

```bash
git add -p
git commit -m "chore(types): resolve TypeScript and lint issues for phase 2C-A"
```

---

## Summary of commits expected

1. `feat(tabStore): add pinned field, closeOthers, closeToRight, updateTabTitle`
2. `feat(rename): add VaultService.renameNote, notes:rename + notes:reveal IPC handlers`
3. `feat(ui): add reusable ContextMenu component and useContextMenu hook`
4. `feat(sidebar): right-click context menu and inline F2 rename on notes`
5. `feat(tabbar): right-click context menu with pin, close others, close to right`
6. `feat(editor): right-click context menu for text selection and wiki-links`
7. `feat(quickSwitcher): add quickSwitcherStore with open/close/toggle`
8. `feat(quickSwitcher): add QuickSwitcher modal with fuzzy search and recents`
9. `feat(appshell): wire Cmd+O quick switcher, F2 rename dispatch, and wiki-link open handler`
10. `feat(sidebar): listen for owl:rename-note event to activate inline rename from F2`
11. `chore: confirm rename round-trip integration`
12. `test: all phase 2C-A tests passing`
13. `chore(types): resolve TypeScript and lint issues for phase 2C-A`
