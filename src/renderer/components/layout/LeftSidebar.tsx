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
