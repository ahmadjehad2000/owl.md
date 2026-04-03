// src/renderer/stores/editorStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Note } from '@shared/types/Note'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface EditorState {
  note: Note | null
  markdown: string
  isDirty: boolean
  saveStatus: SaveStatus
  loadNote:    (id: string) => Promise<void>
  setMarkdown: (md: string) => void
  save:        () => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  note: null,
  markdown: '',
  isDirty: false,
  saveStatus: 'idle',

  loadNote: async (id) => {
    const { note, markdown } = await ipc.notes.read(id)
    set({ note, markdown, isDirty: false, saveStatus: 'idle' })
  },

  setMarkdown: (md) => set({ markdown: md, isDirty: true }),

  save: async () => {
    const { note, markdown } = get()
    if (!note) return
    set({ saveStatus: 'saving' })
    try {
      const updated = await ipc.notes.save(note.id, markdown)
      set({ note: updated, isDirty: false, saveStatus: 'saved' })
      setTimeout(() => set({ saveStatus: 'idle' }), 1500)
    } catch {
      set({ saveStatus: 'error' })
    }
  },
}))
