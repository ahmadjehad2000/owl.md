# Phase 2B: Tabs, Knowledge Base Hierarchy & Keyboard Shortcuts — Design

## Goal

Add multi-tab editing, a drag-and-drop Parent/Child Knowledge Base hierarchy in the sidebar, and tab keyboard shortcuts to owl.md.

## Architecture

Three independent features shipped together:

1. **Tabs** — a `tabStore` owns an ordered list of open tabs, each caching its own editor state so unsaved edits survive tab switches. `editorStore` becomes the "active view" and syncs bidirectionally with the active tab's cache.
2. **Knowledge Base Hierarchy** — Parent Knowledge Bases are `note_type = 'folder'` rows in the `notes` table (no `.md` file on disk). Child Knowledge Bases are regular notes linked via `parent_id`. The sidebar renders a collapsible tree; `@dnd-kit/core` + `@dnd-kit/sortable` handle drag-and-drop reordering and nesting. A new `order_index` column on `notes` persists manual sort order.
3. **Keyboard shortcuts** — `Ctrl+W` close tab, `Ctrl+Tab` next tab, `Ctrl+Shift+Tab` previous tab — wired in `AppShell`.

## Tech Stack

TipTap 2, Zustand 4, `@dnd-kit/core`, `@dnd-kit/sortable`, CSS Modules, Electron IPC.

---

## Data Model

### Schema addition

```sql
ALTER TABLE notes ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;
```

Applied at vault open time if the column does not exist (checked via `PRAGMA table_info`).

### Updated `Note` type

```typescript
export interface Note {
  id: string
  path: string
  title: string
  contentHash: string
  createdAt: number
  updatedAt: number
  parentId: string | null
  folderPath: string
  noteType: 'note' | 'daily' | 'canvas' | 'mindmap' | 'folder'
  orderIndex: number
}
```

### Parent Knowledge Base

- `note_type = 'folder'`
- `path = ''` (no file on disk)
- `title` = user-supplied name
- `parent_id = null` (folders are always root-level in Phase 2B)
- `order_index` controls position among other folders/root-level items

### Child Knowledge Base

- `note_type = 'note'` (unchanged)
- `parent_id` = id of the containing Parent Knowledge Base
- `order_index` controls position within the parent

---

## Tab Store

### Interface

```typescript
// src/renderer/stores/tabStore.ts
import type { Frontmatter } from '../lib/markdown'

export interface Tab {
  id: string            // UUID — tab identity (not note identity)
  noteId: string
  title: string
  isDirty: boolean
  markdown: string | null      // null = not yet loaded
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
```

### Behaviour

- `openTab(noteId, title)` — if a tab for that `noteId` already exists, activate it; otherwise push a new `Tab` with `markdown: null` and activate it.
- Activating a tab with `markdown !== null` → restore cached state to `editorStore` (no IPC). Activating a tab with `markdown === null` → call `editorStore.loadNote(noteId)`, which will call `updateTabContent` once loaded.
- `closeTab(tabId)` — removes the tab; if it was active, activates the nearest remaining tab (prefer left, fall back right). If no tabs remain, `activeTabId = null`.
- `nextTab` / `prevTab` — cycle through `tabs` array, wrapping around.

---

## Editor Store Changes

`editorStore` gains an `activeTabId` field and two integration points:

1. **On load** (`loadNote`): after loading, call `tabStore.updateTabContent(activeTabId, body, frontmatter, false)`.
2. **On content change** (`setMarkdown`, `setFrontmatter`): also call `tabStore.updateTabContent(activeTabId, ...)` to keep cache current.
3. **On save** (`save`): after successful save, call `tabStore.markTabClean(activeTabId)`.

`editorStore` does not own `activeTabId` — it reads it from `tabStore` when needed.

---

## Tab Bar Component

`TabBar.tsx` renders directly above `NoteEditor` inside the editor area flex column.

- One button per tab: `[title] [●?] [×]`
  - `●` shown when `tab.isDirty`
  - `×` calls `tabStore.closeTab(tab.id)`
- Active tab is visually highlighted
- Tab overflow: horizontal scroll (no wrapping, no truncation of tab bar)
- `+` button at the right end calls `vaultStore`'s create-note flow to open a new blank note in a new tab

---

## Left Sidebar — Tree View

### Tree structure

```
▼ Research              ← Parent Knowledge Base (folder, expanded)
    My Paper Notes      ← Child Knowledge Base (note, indented)
    Literature Review   ← Child Knowledge Base (note, indented)
▶ Projects              ← Parent Knowledge Base (collapsed)
  Untitled Note         ← root-level note (no parent)
  Daily Log             ← root-level note
```

Folders are always shown before root-level notes. Within each group, items are sorted by `order_index` ascending.

### Sidebar header buttons

```
All Notes   [+ Child Knowledge Base]  [+ New Parent Knowledge Base]
```

- **+ Child Knowledge Base** — creates a new note at root level (existing behaviour, renamed label)
- **+ New Parent Knowledge Base** — creates a folder row (`note_type = 'folder'`) via `notes:create-folder` IPC; no `.md` file written

### Expand/collapse

Local `expandedIds: Set<string>` state in `LeftSidebar` (not persisted — collapses reset on reload).

### Drag-and-drop

Uses `@dnd-kit/core` `DndContext` wrapping the full tree with `PointerSensor`.

- **Drag note → over a folder** (held 400ms hover): highlights folder as drop target → on drop, calls `notes:move` with `{ noteId, newParentId: folderId, orderIndex: lastIndex + 1 }`.
- **Drag note → between items** within the same parent: reorders; calls `notes:move` with the new `orderIndex`.
- **Drag note → root zone** (above all folders, or explicit root drop area): calls `notes:move` with `newParentId: null`.
- **Drag folder → between folders**: reorders folders; calls `notes:move` with new `orderIndex`.
- Dragging a folder onto another folder is not supported (no nested folders in Phase 2B).

---

## New IPC Handlers

### `notes:create-folder`

```typescript
ipcMain.handle('notes:create-folder', (_e, name: string): Note => {
  const id = crypto.randomUUID()
  const now = Date.now()
  const maxOrder = (db().prepare(
    `SELECT COALESCE(MAX(order_index), -1) as m FROM notes WHERE parent_id IS NULL`
  ).get() as { m: number }).m
  db().prepare(`
    INSERT INTO notes (id, path, title, content_hash, created_at, updated_at,
                       parent_id, folder_path, note_type, order_index)
    VALUES (?, '', ?, '', ?, ?, NULL, '', 'folder', ?)
  `).run(id, name, now, now, maxOrder + 1)
  return db().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note
})
```

### `notes:move`

```typescript
ipcMain.handle('notes:move',
  (_e, noteId: string, newParentId: string | null, orderIndex: number): void => {
    db().prepare(
      'UPDATE notes SET parent_id = ?, order_index = ?, updated_at = ? WHERE id = ?'
    ).run(newParentId, orderIndex, Date.now(), noteId)
  }
)
```

---

## Keyboard Shortcuts

In `AppShell.tsx` `handleKeyDown`:

```typescript
if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
  e.preventDefault()
  const { activeTabId, closeTab } = useTabStore.getState()
  if (activeTabId) closeTab(activeTabId)
}
if ((e.metaKey || e.ctrlKey) && e.key === 'Tab') {
  e.preventDefault()
  e.shiftKey
    ? useTabStore.getState().prevTab()
    : useTabStore.getState().nextTab()
}
```

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/renderer/stores/tabStore.ts` | Tab list, active tab, per-tab state cache |
| Create | `src/renderer/components/editor/TabBar.tsx` | Tab bar rendered above NoteEditor |
| Create | `src/renderer/components/editor/TabBar.module.css` | Tab bar styles |
| Modify | `src/renderer/stores/editorStore.ts` | Sync with tabStore on load/change/save |
| Modify | `src/renderer/components/editor/NoteEditor.tsx` | Render TabBar above editor content |
| Modify | `src/renderer/components/layout/LeftSidebar.tsx` | Tree view, dnd-kit, folder creation |
| Modify | `src/renderer/components/layout/LeftSidebar.module.css` | Tree indentation, drag styles |
| Modify | `src/renderer/components/layout/AppShell.tsx` | Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab |
| Modify | `src/main/ipc/notes.ts` | `notes:move`, `notes:create-folder` |
| Modify | `src/main/db/schema.ts` | `order_index` column + migration check |
| Modify | `src/main/services/DatabaseService.ts` | Run `order_index` migration on open |
| Modify | `src/shared/types/Note.ts` | Add `'folder'` to noteType, add `orderIndex` |
| Modify | `src/shared/types/IPC.ts` | Add `move`, `createFolder` to notes API |
| Modify | `src/renderer/lib/ipc.ts` | Wire `notes.move`, `notes.createFolder` |
| Modify | `src/renderer/stores/vaultStore.ts` | `notes:list` returns all types including folders; expose `folders` and `notes` as separate derived arrays so consumers don't filter manually |
| Create | `tests/renderer/stores/tabStore.test.ts` | openTab dedup, closeTab, cycle, cache sync |

---

## Error Handling

- `notes:move` on a non-existent note: no-op (note may have been deleted mid-drag).
- Tab for a deleted note: `editorStore.loadNote` will throw; tab shows an error state (title goes red, editor shows "Note not found").
- `order_index` migration: wrapped in a try/catch; if `ALTER TABLE` fails because column already exists, the error is silently ignored.

---

## Testing

- `tabStore.test.ts`: open same note twice → only one tab; close active tab → activates adjacent; nextTab wraps; updateTabContent → cache survives activate/deactivate cycle.
- No E2E drag-and-drop tests (dnd-kit relies on pointer events not available in jsdom).
- `notes:move` IPC tested via `DatabaseService` integration test: move note to parent, verify `parent_id` updated; move to null, verify cleared.
