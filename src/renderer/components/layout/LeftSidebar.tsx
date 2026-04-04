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
import { ConfirmModal } from '../ui/ConfirmModal'
import styles from './LeftSidebar.module.css'
import type { Note } from '@shared/types/Note'

const dropAnimation: DropAnimation = {
  duration: 180,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
}

/** Returns true if `candidateId` is a descendant of `ancestorId` in the notes tree */
function isDescendant(candidateId: string, ancestorId: string, notes: Note[]): boolean {
  let current = notes.find(n => n.id === candidateId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    current = notes.find(n => n.id === current!.parentId)
  }
  return false
}

// ─── Sortable note row ───────────────────────────────────────────────────────

function SortableNoteRow({ note, active, depth, onClick, onAuxClick, onContextMenu, isRenaming, onRenameCommit, onRenameCancel }: {
  note: Note
  active: boolean
  depth: number
  onClick: () => void
  onAuxClick: () => void
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
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, paddingLeft: `${10 + depth * 16}px` }}
      className={`${styles.noteItem} ${active ? styles.active : ''}`}
      onClick={isRenaming ? undefined : onClick}
      onAuxClick={e => { if (e.button === 1) { e.preventDefault(); onAuxClick() } }}
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

function SortableFolderRow({ folder, isOver, depth, onContextMenu, isRenaming, onRenameCommit, onRenameCancel, children }: {
  folder: Note
  isOver: boolean
  depth: number
  onContextMenu: (e: React.MouseEvent) => void
  isRenaming: boolean
  onRenameCommit: (newTitle: string) => void
  onRenameCancel: () => void
  children: React.ReactNode
}): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.id, data: { type: 'folder', parentId: folder.parentId ?? null } })
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`${styles.folderGroup} ${isOver ? styles.dropTarget : ''}`}
    >
      <button
        className={styles.folderRow}
        style={{ paddingLeft: `${6 + depth * 16}px` }}
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

// ─── Main sidebar ─────────────────────────────────────────────────────────────

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
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; label: string; isFolder: boolean } | null>(null)

  const [menuOpen,  setMenuOpen]  = useState(false)
  const [menuPos,   setMenuPos]   = useState({ x: 0, y: 0 })
  const [menuItems, setMenuItems] = useState<ContextMenuEntry[]>([])

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

  const openNote = useCallback((note: Note) => { openTab(note.id, note.title) }, [openTab])

  const createNote = useCallback(async () => {
    try {
      const title = `Untitled ${new Date().toLocaleDateString()}`
      const { note } = await ipc.notes.create(title, '')
      await loadNotes()
      openTab(note.id, note.title)
    } catch (e) { console.error('Failed to create note:', e) }
  }, [loadNotes, openTab])

  const handleNewFolder = useCallback(async () => {
    try {
      const name = `New Parent Knowledge Base ${Date.now().toString().slice(-4)}`
      await createFolder(name)
    } catch (e) { console.error('Failed to create folder:', e) }
  }, [createFolder])

  const handleRenameCommit = useCallback(async (id: string, newTitle: string) => {
    setRenamingId(null)
    if (!newTitle) return
    await ipc.notes.rename(id, newTitle)
    await loadNotes()
  }, [loadNotes])

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmTarget) return
    setConfirmTarget(null)
    await ipc.notes.delete(confirmTarget.id)
    await loadNotes()
  }, [confirmTarget, loadNotes])

  const handleDelete = useCallback((note: Note) => {
    setConfirmTarget({ id: note.id, label: note.title, isFolder: false })
  }, [])

  const handleDuplicate = useCallback(async (note: Note) => {
    const { note: newNote } = await ipc.notes.duplicate(note.id)
    await loadNotes()
    openTab(newNote.id, newNote.title)
  }, [loadNotes, openTab])

  const noteContextItems = useCallback((note: Note): ContextMenuEntry[] => {
    const folders = notes.filter(n => n.noteType === 'folder')
    const items: ContextMenuEntry[] = [
      { label: 'Open in new tab', icon: '🗂', onClick: () => openTab(note.id, note.title) },
      { separator: true },
      { label: 'Rename', icon: '✏️', shortcut: 'F2', onClick: () => setRenamingId(note.id) },
      { label: 'Duplicate', icon: '📋', onClick: () => handleDuplicate(note) },
      {
        label: 'Insert link in current note',
        icon: '🔗',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('owl:insert-text', { detail: `[[${note.title}]]` }))
        },
      },
      { separator: true },
    ]

    if (folders.length > 0) {
      const moveSubmenu: ContextMenuEntry[] = folders.map(f => ({
        label: f.title,
        icon: '📁',
        onClick: async () => {
          const siblings = notes.filter(n => n.noteType !== 'folder' && n.parentId === f.id)
          await ipc.notes.move(note.id, f.id, siblings.length)
          await loadNotes()
        },
      }))
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

  const folderContextItems = useCallback((folder: Note): ContextMenuEntry[] => {
    const otherFolders = notes.filter(n => n.noteType === 'folder' && n.id !== folder.id && !isDescendant(n.id, folder.id, notes))
    const items: ContextMenuEntry[] = [
      { label: 'Rename', icon: '✏️', shortcut: 'F2', onClick: () => setRenamingId(folder.id) },
      { separator: true },
      {
        label: 'New note inside',
        icon: '📄',
        onClick: async () => {
          const title = `Untitled ${new Date().toLocaleDateString()}`
          const { note } = await ipc.notes.create(title, '')
          const childCount = notes.filter(n => n.parentId === folder.id).length
          await ipc.notes.move(note.id, folder.id, childCount)
          await loadNotes()
          openTab(note.id, note.title)
        },
      },
      {
        label: 'New subfolder',
        icon: '📁',
        onClick: async () => {
          const name = `Subfolder ${Date.now().toString().slice(-4)}`
          await createFolder(name)
          const newFolder = useVaultStore.getState().notes.find(n => n.noteType === 'folder' && n.title === name)
          if (newFolder) {
            const siblings = notes.filter(n => n.noteType === 'folder' && n.parentId === folder.id)
            await ipc.notes.move(newFolder.id, folder.id, siblings.length)
            await loadNotes()
          }
        },
      },
      { separator: true },
    ]

    if (otherFolders.length > 0) {
      items.push({
        label: 'Move into folder',
        icon: '📁',
        submenu: otherFolders.map(f => ({
          label: f.title,
          icon: '📁',
          onClick: async () => {
            const siblings = notes.filter(n => n.noteType === 'folder' && n.parentId === f.id)
            await ipc.notes.move(folder.id, f.id, siblings.length)
            await loadNotes()
          },
        })),
      })
    }

    if (folder.parentId) {
      items.push({
        label: 'Lift to root',
        icon: '↗',
        onClick: async () => {
          const rootFolders = notes.filter(n => n.noteType === 'folder' && !n.parentId)
          await ipc.notes.move(folder.id, null, rootFolders.length)
          await loadNotes()
        },
      })
    }

    items.push({ separator: true })
    items.push({
      label: 'Delete folder',
      icon: '🗑',
      danger: true,
      onClick: () => setConfirmTarget({ id: folder.id, label: folder.title, isFolder: true }),
    })
    return items
  }, [notes, loadNotes, openTab, createFolder])

  const allFolders = notes.filter(n => n.noteType === 'folder').sort((a, b) => a.orderIndex - b.orderIndex)
  const rootFolders = allFolders.filter(f => !f.parentId)
  const rootNotes   = notes.filter(n => n.noteType !== 'folder' && !n.parentId).sort((a, b) => a.orderIndex - b.orderIndex)

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
    const overIsFolder = overData?.type === 'folder'

    if (activeData.type === 'folder') {
      const overId = over.id as string
      const activeId = active.id as string

      if (overIsFolder) {
        // Prevent dropping folder onto itself or its own descendant
        if (overId === activeId) return
        if (isDescendant(overId, activeId, notes)) return
        const activeFolder = allFolders.find(f => f.id === activeId)
        // Already in this folder — skip
        if (activeFolder?.parentId === overId) return
        const siblings = notes.filter(n => n.noteType === 'folder' && n.parentId === overId)
        await ipc.notes.move(activeId, overId, siblings.length)
      } else {
        // Reorder within same parent level
        const activeFolder = allFolders.find(f => f.id === activeId)
        const sameLevel = allFolders.filter(f => (f.parentId ?? null) === (activeFolder?.parentId ?? null))
        const ids = sameLevel.map(f => f.id)
        const oldIdx = ids.indexOf(activeId)
        const newIdx = ids.indexOf(overId)
        if (oldIdx !== -1 && newIdx !== -1) {
          const reordered = arrayMove(ids, oldIdx, newIdx)
          const parentId = activeFolder?.parentId ?? null
          await Promise.all(reordered.map((id, idx) => ipc.notes.move(id, parentId, idx)))
        }
      }
      await loadNotes()
      return
    }

    if (activeData.type === 'note') {
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

  /** Recursively render a folder and its children */
  function renderFolder(folder: Note, depth: number): JSX.Element {
    const childFolders = allFolders.filter(f => f.parentId === folder.id).sort((a, b) => a.orderIndex - b.orderIndex)
    const childNotes   = notes.filter(n => n.noteType !== 'folder' && n.parentId === folder.id).sort((a, b) => a.orderIndex - b.orderIndex)
    const allChildIds  = [...childFolders.map(f => f.id), ...childNotes.map(n => n.id)]

    return (
      <SortableFolderRow
        key={folder.id}
        folder={folder}
        isOver={overFolderId === folder.id}
        depth={depth}
        onContextMenu={e => openContextMenu(e, folderContextItems(folder))}
        isRenaming={renamingId === folder.id}
        onRenameCommit={t => handleRenameCommit(folder.id, t)}
        onRenameCancel={() => setRenamingId(null)}
      >
        <SortableContext items={allChildIds} strategy={verticalListSortingStrategy}>
          {childFolders.map(f => renderFolder(f, depth + 1))}
          {childNotes.map(n => (
            <SortableNoteRow
              key={n.id}
              note={n}
              active={n.id === activeNoteId}
              depth={depth + 1}
              onClick={() => openNote(n)}
              onAuxClick={() => openTab(n.id, n.title)}
              onContextMenu={e => openContextMenu(e, noteContextItems(n))}
              isRenaming={renamingId === n.id}
              onRenameCommit={t => handleRenameCommit(n.id, t)}
              onRenameCancel={() => setRenamingId(null)}
            />
          ))}
        </SortableContext>
      </SortableFolderRow>
    )
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
          <SortableContext items={rootFolders.map(f => f.id)} strategy={verticalListSortingStrategy}>
            {rootFolders.map(f => renderFolder(f, 0))}
          </SortableContext>

          <SortableContext items={rootNotes.map(n => n.id)} strategy={verticalListSortingStrategy}>
            {rootNotes.map(n => (
              <SortableNoteRow
                key={n.id}
                note={n}
                active={n.id === activeNoteId}
                depth={0}
                onClick={() => openNote(n)}
                onAuxClick={() => openTab(n.id, n.title)}
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

      <ConfirmModal
        isOpen={confirmTarget !== null}
        title={confirmTarget?.isFolder ? 'Delete folder?' : 'Delete note?'}
        message={
          confirmTarget?.isFolder
            ? `"${confirmTarget.label}" and all its contents will be permanently deleted.`
            : `"${confirmTarget?.label}" will be permanently deleted.`
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </DndContext>
  )
}
