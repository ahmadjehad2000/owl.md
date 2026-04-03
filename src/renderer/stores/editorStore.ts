// src/renderer/stores/editorStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import { parseFrontmatter, serializeFrontmatter } from '../lib/markdown'
import { useTabStore } from './tabStore'
import type { Frontmatter } from '../lib/markdown'
import type { Note } from '@shared/types/Note'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface EditorState {
  note:        Note | null
  /** Body only — frontmatter stripped. This is what TipTap sees. */
  markdown:    string
  frontmatter: Frontmatter
  isDirty:     boolean
  saveStatus:  SaveStatus
  loadNote:       (id: string) => Promise<void>
  restoreTab:     (markdown: string, frontmatter: Frontmatter, isDirty: boolean, note: Note | null) => void
  unloadNote:     () => void
  setMarkdown:    (md: string) => void
  setFrontmatter: (fm: Frontmatter) => void
  save:           () => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  note:        null,
  markdown:    '',
  frontmatter: {},
  isDirty:     false,
  saveStatus:  'idle',

  loadNote: async (id) => {
    const { note, markdown: raw } = await ipc.notes.read(id)
    const { frontmatter, body } = parseFrontmatter(raw)
    set({ note, markdown: body, frontmatter, isDirty: false, saveStatus: 'idle' })
    const { activeTabId } = useTabStore.getState()
    if (activeTabId) {
      useTabStore.getState().updateTabContent(activeTabId, body, frontmatter, false)
    }
  },

  restoreTab: (markdown, frontmatter, isDirty, note) => {
    set({ note, markdown, frontmatter, isDirty, saveStatus: 'idle' })
  },

  unloadNote: () => {
    set({ note: null, markdown: '', frontmatter: {}, isDirty: false, saveStatus: 'idle' })
  },

  setMarkdown: (md) => {
    set({ markdown: md, isDirty: true })
    const { activeTabId } = useTabStore.getState()
    if (activeTabId) {
      useTabStore.getState().updateTabContent(activeTabId, md, get().frontmatter, true)
    }
  },

  setFrontmatter: (fm) => {
    set({ frontmatter: fm, isDirty: true })
    const { activeTabId } = useTabStore.getState()
    if (activeTabId) {
      useTabStore.getState().updateTabContent(activeTabId, get().markdown, fm, true)
    }
  },

  save: async () => {
    const { note, markdown, frontmatter } = get()
    if (!note) return
    set({ saveStatus: 'saving' })
    try {
      const full = serializeFrontmatter(frontmatter, markdown)
      const updated = await ipc.notes.save(note.id, full)
      set({ note: updated, isDirty: false, saveStatus: 'saved' })
      const { activeTabId } = useTabStore.getState()
      if (activeTabId) useTabStore.getState().markTabClean(activeTabId)
      setTimeout(() => set(s => s.saveStatus === 'saved' ? { saveStatus: 'idle' } : s), 1500)
    } catch {
      set({ saveStatus: 'error' })
    }
  },
}))
