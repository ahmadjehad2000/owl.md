// src/renderer/stores/vaultStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Note, VaultConfig } from '@shared/types/Note'

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
  closeVault:    (path: string) => Promise<void>
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

  closeVault: async (path) => {
    const newConfig = await ipc.vault.close(path)
    set({ config: newConfig })
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
