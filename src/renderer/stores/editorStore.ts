// src/renderer/stores/editorStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import { parseFrontmatter, serializeFrontmatter } from '../lib/markdown'
import { useTabStore } from './tabStore'
import { useRightPanelStore } from './rightPanelStore'
import { normalizeNote, useVaultStore } from './vaultStore'
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
  isReadingView:     boolean
  loadNote:       (id: string) => Promise<void>
  restoreTab:     (markdown: string, frontmatter: Frontmatter, isDirty: boolean, note: Note | null) => void
  unloadNote:     () => void
  setMarkdown:    (md: string) => void
  setFrontmatter: (fm: Frontmatter) => void
  save:             () => Promise<void>
  toggleReadingView: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  note:        null,
  markdown:    '',
  frontmatter: {},
  isDirty:       false,
  saveStatus:    'idle',
  isReadingView: false,

  loadNote: async (id) => {
    const { note: rawNote, markdown: raw } = await ipc.notes.read(id)
    const note = normalizeNote(rawNote)
    const isCanvas = note.noteType === 'canvas'
    if (isCanvas) {
      set({ note, markdown: raw, frontmatter: {}, isDirty: false, saveStatus: 'idle' })
      const { activeTabId } = useTabStore.getState()
      if (activeTabId) useTabStore.getState().updateTabContent(activeTabId, raw, {}, false)
      return
    }
    const { frontmatter, body } = parseFrontmatter(raw)
    // Ensure content starts with `# Title` so it's visible in the editor.
    // If the file already has an H1 as the first line, use it as-is.
    // If not, prepend the DB title so the heading is shown.
    const hasLeadingH1 = /^#[^\S\n]/.test(body.trimStart())
    const body2 = hasLeadingH1 ? body : `# ${note.title}\n\n${body.trimStart()}`
    set({ note, markdown: body2, frontmatter, isDirty: false, saveStatus: 'idle' })
    const { activeTabId } = useTabStore.getState()
    if (activeTabId) {
      useTabStore.getState().updateTabContent(activeTabId, body2, frontmatter, false)
    }
  },

  restoreTab: (markdown, frontmatter, isDirty, note) => {
    set({ note, markdown, frontmatter, isDirty, saveStatus: 'idle' })
  },

  unloadNote: () => {
    set({ note: null, markdown: '', frontmatter: {}, isDirty: false, saveStatus: 'idle', isReadingView: false })
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
      let activeNote = note
      const isCanvas = note.noteType === 'canvas'

      if (!isCanvas) {
        // Sync first H1 heading → note title
        const h1 = markdown.match(/^#[^\S\n]+(.+?)$/m)?.[1]?.trim() ?? null
        if (h1 && h1 !== note.title) {
          const renamed = normalizeNote(await ipc.notes.rename(note.id, h1))
          activeNote = renamed
          set({ note: renamed })
          const { activeTabId } = useTabStore.getState()
          if (activeTabId) {
            useTabStore.setState(s => ({
              tabs: s.tabs.map(t => t.noteId === renamed.id ? { ...t, title: renamed.title } : t),
            }))
          }
          void useVaultStore.getState().loadNotes()
        }
      }

      const full = isCanvas ? markdown : serializeFrontmatter(frontmatter, markdown)
      const updated = normalizeNote(await ipc.notes.save(activeNote.id, full))
      set({ note: updated, isDirty: false, saveStatus: 'saved' })
      const { activeTabId } = useTabStore.getState()
      if (activeTabId) useTabStore.getState().markTabClean(activeTabId)
      setTimeout(() => set(s => s.saveStatus === 'saved' ? { saveStatus: 'idle' } : s), 1500)
      void useRightPanelStore.getState().fetchBacklinks(updated.id)
    } catch {
      set({ saveStatus: 'error' })
    }
  },

  toggleReadingView: () => set(s => ({ isReadingView: !s.isReadingView })),
}))
