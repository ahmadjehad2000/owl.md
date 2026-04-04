// src/renderer/stores/rightPanelStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Heading } from '../lib/markdown'
import type { BacklinkResult } from '@shared/types/Note'

export type RightTab = 'backlinks' | 'outline' | 'toc' | 'properties'

interface RightPanelState {
  activeTab:      RightTab
  headings:       Heading[]
  backlinks:      BacklinkResult[]
  setTab:          (tab: RightTab) => void
  setHeadings:     (headings: Heading[]) => void
  fetchBacklinks:  (noteId: string) => Promise<void>
}

export const useRightPanelStore = create<RightPanelState>(set => ({
  activeTab: 'backlinks',
  headings:  [],
  backlinks: [],
  setTab:       tab      => set({ activeTab: tab }),
  setHeadings:  headings => set({ headings }),
  fetchBacklinks: async (noteId) => {
    try {
      const backlinks = await ipc.notes.getBacklinks(noteId)
      set({ backlinks })
    } catch {
      set({ backlinks: [] })
    }
  },
}))
