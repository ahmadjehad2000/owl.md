// src/renderer/stores/vaultStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Note, NoteSlim, VaultConfig } from '@shared/types/Note'

export function normalizeNote(raw: unknown): Note {
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
    pinned:      Boolean(r.pinned ?? 0),
    deletedAt:   (r.deleted_at ?? r.deletedAt ?? null) as number | null,
  }
}

interface VaultState {
  config:        VaultConfig | null
  openedConfigs: VaultConfig[]
  notes:         Note[]
  slimNotes:     NoteSlim[]
  trashedNotes:  Note[]
  pinnedIds:     string[]
  recentIds:     string[]
  openNoteId:    string | null
  openVault:     (path: string) => Promise<void>
  createVault:   (name: string) => Promise<void>
  activateVault: (path: string) => Promise<void>
  closeVault:    (path: string) => Promise<void>
  loadNotes:     () => Promise<void>
  loadNotesSlim: () => Promise<void>
  loadSessions:  () => Promise<void>
  loadTrashed:   () => Promise<void>
  restoreNote:   (id: string) => Promise<void>
  emptyTrash:    () => Promise<void>
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
  slimNotes:     [],
  trashedNotes:  [],
  pinnedIds:     [],
  recentIds:     [],
  openNoteId:    null,

  openVault: async (path) => {
    const config = await ipc.vault.open(path)
    set({ config })
    await get().loadNotes()
    await get().loadNotesSlim()
    await get().loadSessions()
    await get().loadTrashed()
  },

  createVault: async (name) => {
    const config = await ipc.vault.create(name)
    set({ config })
    await get().loadNotes()
    await get().loadNotesSlim()
    await get().loadSessions()
    await get().loadTrashed()
  },

  activateVault: async (path) => {
    const config = await ipc.vault.activate(path)
    set({ config })
    await get().loadNotes()
    await get().loadNotesSlim()
    await get().loadSessions()
    await get().loadTrashed()
  },

  closeVault: async (path) => {
    const newConfig = await ipc.vault.close(path)
    set({ config: newConfig, trashedNotes: [] })
    await get().loadNotes()
    await get().loadNotesSlim()
    await get().loadSessions()
  },

  loadNotes: async () => {
    const raw = await ipc.notes.list()
    set({ notes: raw.map(normalizeNote) })
  },

  loadNotesSlim: async () => {
    const raw = await ipc.notes.listSlim()
    const slimNotes = raw.map(r => {
      const n = r as Record<string, unknown>
      return {
        id:         n.id as string,
        path:       (n.path ?? '') as string,
        title:      (n.title ?? '') as string,
        parentId:   (n.parent_id ?? n.parentId ?? null) as string | null,
        folderPath: (n.folder_path ?? n.folderPath ?? '') as string,
        noteType:   (n.note_type ?? n.noteType ?? 'note') as NoteSlim['noteType'],
        orderIndex: (n.order_index ?? n.orderIndex ?? 0) as number,
        pinned:     Boolean(n.pinned ?? 0),
        deletedAt:  (n.deleted_at ?? n.deletedAt ?? null) as number | null,
      }
    })
    set({ slimNotes })
  },

  loadSessions: async () => {
    const openedConfigs = await ipc.vault.getSessions()
    set({ openedConfigs })
  },

  loadTrashed: async () => {
    const raw = await ipc.notes.listTrashed()
    set({ trashedNotes: raw.map(normalizeNote) })
  },

  restoreNote: async (id) => {
    await ipc.notes.restore(id)
    await get().loadNotesSlim()
    await get().loadTrashed()
  },

  emptyTrash: async () => {
    await ipc.notes.emptyTrash()
    set({ trashedNotes: [] })
  },

  setOpenNote: (id) => {
    set({ openNoteId: id })
    get().addRecent(id)
  },

  createFolder: async (name) => {
    await ipc.notes.createFolder(name)
    await get().loadNotes()
    await get().loadNotesSlim()
  },

  pinNote:   (id) => set(s => ({ pinnedIds: s.pinnedIds.includes(id) ? s.pinnedIds : [...s.pinnedIds, id] })),
  unpinNote: (id) => set(s => ({ pinnedIds: s.pinnedIds.filter(p => p !== id) })),
  addRecent: (id) => set(s => ({ recentIds: [id, ...s.recentIds.filter(r => r !== id)].slice(0, 10) })),
}))
