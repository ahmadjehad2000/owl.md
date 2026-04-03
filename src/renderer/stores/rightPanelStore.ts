// src/renderer/stores/rightPanelStore.ts
import { create } from 'zustand'
import type { Heading } from '../lib/markdown'

export type RightTab = 'backlinks' | 'outline' | 'properties'

interface RightPanelState {
  activeTab: RightTab
  headings: Heading[]
  setTab:      (tab: RightTab) => void
  setHeadings: (headings: Heading[]) => void
}

export const useRightPanelStore = create<RightPanelState>(set => ({
  activeTab: 'backlinks',
  headings: [],
  setTab:      tab      => set({ activeTab: tab }),
  setHeadings: headings => set({ headings }),
}))
