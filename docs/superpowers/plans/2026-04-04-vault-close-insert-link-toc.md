# Vault Close Button + Insert Backlink + TOC Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add X close button on vault tabs (disabled when only one vault open), "Insert link in current note" to sidebar note context menu, and a styled TOC tab in the right sidebar.

**Architecture:** All three features are renderer-side except vault close which needs a new IPC channel. Each change is self-contained and touches only the relevant store/component.

**Tech Stack:** Electron IPC, Zustand, React, CSS Modules, Tiptap (for inserting link text via editorStore)

---

### Task 1: Vault close IPC channel

**Files:**
- Modify: `src/main/ipc/vault.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/types/IPC.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/lib/ipc.ts`

- [ ] **Step 1: Add `vault:close` handler to `src/main/ipc/vault.ts`**

Add `closeVault` to the services parameter and register handler:

```ts
export function registerVaultHandlers(services: {
  openVault:        (path: string) => Promise<VaultConfig>
  createVault:      (name: string) => Promise<VaultConfig>
  activateVault:    (path: string) => Promise<VaultConfig>
  listKnownVaults:  ()             => VaultConfig[]
  getLastVaultPath: ()             => string | null
  getOpenSessions:  ()             => VaultConfig[]
  removeKnownVault: (path: string) => void
  closeVault:       (path: string) => Promise<VaultConfig | null>
}): void {
  ipcMain.handle('vault:open',          (_e, path: string) => services.openVault(path))
  ipcMain.handle('vault:create',        (_e, name: string) => services.createVault(name))
  ipcMain.handle('vault:activate',      (_e, path: string) => services.activateVault(path))
  ipcMain.handle('vault:list-known',    ()                  => services.listKnownVaults())
  ipcMain.handle('vault:get-last',      ()                  => services.getLastVaultPath())
  ipcMain.handle('vault:get-sessions',  ()                  => services.getOpenSessions())
  ipcMain.handle('vault:getConfig',     ()                  => services.getOpenSessions()[0] ?? null)
  ipcMain.handle('vault:remove-known',  (_e, path: string) => services.removeKnownVault(path))
  ipcMain.handle('vault:close',         (_e, path: string) => services.closeVault(path))
}
```

- [ ] **Step 2: Implement `closeVault` in `src/main/index.ts`**

Add this function before `app.whenReady`:

```ts
async function closeVault(path: string): Promise<VaultConfig | null> {
  const session = sessions.get(path)
  if (!session) return null
  try {
    await session.watcher.stop()
    session.db.close()
  } catch { /* best-effort */ }
  sessions.delete(path)

  if (activePath === path) {
    // Pick another open session, or null
    const remaining = Array.from(sessions.keys())
    activePath = remaining[0] ?? null
    if (activePath) settingsService.setLastVaultPath(activePath)
  }

  return activePath ? sessions.get(activePath)!.config : null
}
```

Then register it in `registerVaultHandlers` call inside `app.whenReady`:

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
  closeVault,
})
```

- [ ] **Step 3: Add `close` to `OwlVaultAPI` in `src/shared/types/IPC.ts`**

```ts
export interface OwlVaultAPI {
  open:        (vaultPath: string) => Promise<VaultConfig>
  create:      (name: string)      => Promise<VaultConfig>
  activate:    (vaultPath: string) => Promise<VaultConfig>
  listKnown:   ()                  => Promise<VaultConfig[]>
  getLast:     ()                  => Promise<string | null>
  getSessions: ()                  => Promise<VaultConfig[]>
  getConfig:   ()                  => Promise<VaultConfig | null>
  removeKnown: (path: string)      => Promise<void>
  close:       (path: string)      => Promise<VaultConfig | null>
}
```

- [ ] **Step 4: Wire through preload `src/preload/index.ts`**

Add to vault object:
```ts
close: (path) => ipcRenderer.invoke('vault:close', path),
```

- [ ] **Step 5: Add to renderer IPC `src/renderer/lib/ipc.ts`**

Add to `ipc.vault`:
```ts
close: (path: string): Promise<VaultConfig | null> => window.owl.vault.close(path),
```

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/vault.ts src/main/index.ts src/shared/types/IPC.ts src/preload/index.ts src/renderer/lib/ipc.ts
git commit -m "feat: add vault:close IPC channel"
```

---

### Task 2: Vault close button in vaultStore + AppShell UI

**Files:**
- Modify: `src/renderer/stores/vaultStore.ts`
- Modify: `src/renderer/components/layout/AppShell.tsx`
- Modify: `src/renderer/components/layout/AppShell.module.css`

- [ ] **Step 1: Add `closeVault` action to `src/renderer/stores/vaultStore.ts`**

Add to the interface:
```ts
closeVault: (path: string) => Promise<void>
```

Add to the store implementation (after `activateVault`):
```ts
closeVault: async (path) => {
  const newConfig = await ipc.vault.close(path)
  set({ config: newConfig })
  await get().loadNotes()
  await get().loadSessions()
},
```

- [ ] **Step 2: Add X button to vault switcher tabs in `src/renderer/components/layout/AppShell.tsx`**

Replace the `openedConfigs.length > 1` block:

```tsx
const closeVault = useVaultStore(s => s.closeVault)
```

Add the import next to existing useVaultStore destructures. Then replace the vault switcher:

```tsx
{openedConfigs.length > 1
  ? (
    <div className={styles.vaultSwitcher}>
      {openedConfigs.map(v => (
        <div
          key={v.path}
          className={`${styles.vaultTab} ${v.path === activeConfig?.path ? styles.vaultTabActive : ''}`}
        >
          <button
            className={styles.vaultTabName}
            onClick={() => activateVault(v.path)}
          >
            {v.name}
          </button>
          <button
            className={styles.vaultTabClose}
            onClick={e => { e.stopPropagation(); void closeVault(v.path) }}
            disabled={openedConfigs.length <= 1}
            title="Close vault"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
  : <span className={styles.titleName}>{activeConfig?.name ?? 'owl.md'}</span>
}
```

- [ ] **Step 3: Add styles in `src/renderer/components/layout/AppShell.module.css`**

Append to the file:

```css
.vaultTab {
  display: flex;
  align-items: center;
  border-radius: 4px;
  overflow: hidden;
}

.vaultTabName {
  padding: 2px 8px;
  font-size: 12px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
}

.vaultTabActive .vaultTabName {
  opacity: 1;
  font-weight: 600;
}

.vaultTabClose {
  padding: 2px 5px;
  font-size: 13px;
  line-height: 1;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.vaultTab:hover .vaultTabClose {
  opacity: 0.5;
}

.vaultTabClose:hover {
  opacity: 1 !important;
}

.vaultTabClose:disabled {
  pointer-events: none;
  opacity: 0 !important;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stores/vaultStore.ts src/renderer/components/layout/AppShell.tsx src/renderer/components/layout/AppShell.module.css
git commit -m "feat: vault X close button in titlebar switcher"
```

---

### Task 3: Insert link from sidebar context menu

**Files:**
- Modify: `src/renderer/components/layout/LeftSidebar.tsx`

When a user right-clicks a note in the sidebar and chooses "Insert link in current note", the command inserts `[[note title]]` at the cursor position in the active editor.

- [ ] **Step 1: Add import for editorStore in `src/renderer/components/layout/LeftSidebar.tsx`**

Add to imports:
```ts
import { useEditorStore } from '../../stores/editorStore'
```

- [ ] **Step 2: Add "Insert link" item to `noteContextItems` callback**

The callback already has access to `notes`. Add the insert-link item inside `noteContextItems`:

```ts
const noteContextItems = useCallback((note: Note): ContextMenuEntry[] => {
  const folders = notes.filter(n => n.noteType === 'folder')
  const items: ContextMenuEntry[] = [
    { label: 'Rename', icon: '✏️', shortcut: 'F2', onClick: () => setRenamingId(note.id) },
    { label: 'Duplicate', icon: '📋', onClick: () => handleDuplicate(note) },
    {
      label: 'Insert link in current note',
      icon: '🔗',
      onClick: () => {
        const editor = useEditorStore.getState().editor
        if (!editor) return
        editor.chain().focus().insertContent(`[[${note.title}]]`).run()
      },
    },
    { separator: true },
  ]
  // ... rest unchanged
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/LeftSidebar.tsx
git commit -m "feat: insert [[link]] from sidebar note context menu"
```

---

### Task 4: TOC tab in right sidebar

A new "TOC" tab in the right panel showing the note's headings as a styled, numbered table of contents.

**Files:**
- Create: `src/renderer/components/layout/TocPanel.tsx`
- Create: `src/renderer/components/layout/TocPanel.module.css`
- Modify: `src/renderer/stores/rightPanelStore.ts`
- Modify: `src/renderer/components/layout/RightSidebar.tsx`

- [ ] **Step 1: Create `src/renderer/components/layout/TocPanel.tsx`**

```tsx
// src/renderer/components/layout/TocPanel.tsx
import React from 'react'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import styles from './TocPanel.module.css'

export function TocPanel(): JSX.Element {
  const headings = useRightPanelStore(s => s.headings)

  if (!headings.length) {
    return <div className={styles.empty}>No headings in this note</div>
  }

  // Build numbered counter per level: 1. / 1.1. / 1.1.1. etc.
  const counters = [0, 0, 0, 0, 0, 0]
  const labels = headings.map(h => {
    const idx = h.level - 1
    counters[idx]++
    for (let i = idx + 1; i < counters.length; i++) counters[i] = 0
    return counters.slice(0, idx + 1).join('.') + '.'
  })

  const scrollTo = (pos: number): void => {
    const selector = '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, ' +
                     '.ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
    const els = document.querySelectorAll(selector)
    els[pos]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={styles.toc}>
      <div className={styles.header}>Table of Contents</div>
      {headings.map((h, i) => (
        <button
          key={i}
          className={`${styles.item} ${styles[`level${h.level}`]}`}
          onClick={() => scrollTo(i)}
          title={h.text}
        >
          <span className={styles.number}>{labels[i]}</span>
          <span className={styles.text}>{h.text}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/renderer/components/layout/TocPanel.module.css`**

```css
.toc {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 0;
}

.header {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, #6b7280);
  padding: 4px 12px 8px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
  margin-bottom: 4px;
}

.empty {
  padding: 16px 12px;
  color: var(--text-muted, #6b7280);
  font-size: 12px;
  font-style: italic;
}

.item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  padding: 3px 12px;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text, #e2e8f0);
  border-radius: 4px;
  transition: background 0.1s;
  overflow: hidden;
}

.item:hover {
  background: var(--hover, rgba(255,255,255,0.05));
}

.number {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
  min-width: 28px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.text {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Level-based indent + size */
.level1 .text { font-size: 13px; font-weight: 600; }
.level2 { padding-left: 20px; }
.level3 { padding-left: 32px; }
.level4 { padding-left: 44px; }
.level5 { padding-left: 56px; }
.level6 { padding-left: 68px; }
```

- [ ] **Step 3: Add 'toc' to `RightTab` type in `src/renderer/stores/rightPanelStore.ts`**

Change:
```ts
export type RightTab = 'backlinks' | 'outline' | 'properties'
```
To:
```ts
export type RightTab = 'backlinks' | 'outline' | 'toc' | 'properties'
```

- [ ] **Step 4: Add TOC tab to `src/renderer/components/layout/RightSidebar.tsx`**

Change the `TABS` array and add TocPanel import:

```tsx
import { TocPanel } from './TocPanel'

const TABS: { id: 'backlinks' | 'outline' | 'toc' | 'properties'; label: string }[] = [
  { id: 'backlinks',  label: 'Links'   },
  { id: 'outline',    label: 'Outline' },
  { id: 'toc',        label: 'TOC'     },
  { id: 'properties', label: 'Props'   },
]
```

Add the TOC body panel in the `{activeTab === 'outline' && ...}` block area:

```tsx
{activeTab === 'toc' && <TocPanel />}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/layout/TocPanel.tsx src/renderer/components/layout/TocPanel.module.css src/renderer/stores/rightPanelStore.ts src/renderer/components/layout/RightSidebar.tsx
git commit -m "feat: TOC tab in right sidebar with numbered headings"
```
