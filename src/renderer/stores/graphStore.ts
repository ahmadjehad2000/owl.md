// src/renderer/stores/graphStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { GraphData } from '@shared/types/Note'

interface GraphState {
  isOpen: boolean
  data: GraphData | null
  focusNoteId: string | null
  open:  (focusNoteId?: string | null) => void
  close: () => void
}

export const useGraphStore = create<GraphState>(set => ({
  isOpen: false,
  data: null,
  focusNoteId: null,

  open: async (focusNoteId = null) => {
    set({ isOpen: true, focusNoteId })
    try {
      const data = await ipc.notes.getGraphData()
      set({ data })
    } catch {
      set({ data: { nodes: [], edges: [] } })
    }
  },

  close: () => set({ isOpen: false, data: null, focusNoteId: null }),
}))
