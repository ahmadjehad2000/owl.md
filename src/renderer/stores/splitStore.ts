// src/renderer/stores/splitStore.ts
import { create } from 'zustand'

interface SplitState {
  isSplit:         boolean
  rightNoteId:     string | null
  rightNoteTitle:  string
  toggle:    (noteId?: string, title?: string) => void
  openRight: (noteId: string, title: string)   => void
  closeRight: () => void
}

export const useSplitStore = create<SplitState>(set => ({
  isSplit:        false,
  rightNoteId:    null,
  rightNoteTitle: '',

  toggle: (noteId, title) => set(s => ({
    isSplit:        !s.isSplit,
    rightNoteId:    !s.isSplit ? (noteId ?? s.rightNoteId) : s.rightNoteId,
    rightNoteTitle: !s.isSplit ? (title ?? s.rightNoteTitle) : s.rightNoteTitle,
  })),

  openRight: (noteId, title) => set({ isSplit: true, rightNoteId: noteId, rightNoteTitle: title }),

  closeRight: () => set({ isSplit: false, rightNoteId: null, rightNoteTitle: '' }),
}))
