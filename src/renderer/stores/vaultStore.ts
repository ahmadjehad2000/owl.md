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
