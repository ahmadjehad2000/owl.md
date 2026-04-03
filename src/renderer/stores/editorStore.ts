// src/renderer/stores/editorStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import { parseFrontmatter, serializeFrontmatter } from '../lib/markdown'
import type { Frontmatter } from '../lib/markdown'
import type { Note } from '@shared/types/Note'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface EditorState {
  note: Note | null
  /** Body only — frontmatter stripped. This is what TipTap sees. */
  markdown: string
  frontmatter: Frontmatter
  isDirty: boolean
  saveStatus: SaveStatus
  loadNote:       (id: string) => Promise<void>
  setMarkdown:    (md: string) => void
  setFrontmatter: (fm: Frontmatter) => void
  save:           () => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  note: null,
  markdown: '',
  frontmatter: {},
  isDirty: false,
  saveStatus: 'idle',

  loadNote: async (id) => {
    const { note, markdown: raw } = await ipc.notes.read(id)
    const { frontmatter, body } = parseFrontmatter(raw)
    set({ note, markdown: body, frontmatter, isDirty: false, saveStatus: 'idle' })
  },

  setMarkdown: (md) => set({ markdown: md, isDirty: true }),

  setFrontmatter: (fm) => set({ frontmatter: fm, isDirty: true }),

  save: async () => {
    const { note, markdown, frontmatter } = get()
    if (!note) return
    set({ saveStatus: 'saving' })
    try {
      const full = serializeFrontmatter(frontmatter, markdown)
      const updated = await ipc.notes.save(note.id, full)
      set({ note: updated, isDirty: false, saveStatus: 'saved' })
      setTimeout(() => set(s => s.saveStatus === 'saved' ? { saveStatus: 'idle' } : s), 1500)
    } catch {
      set({ saveStatus: 'error' })
    }
  },
}))
