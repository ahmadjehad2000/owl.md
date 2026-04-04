// src/renderer/stores/hoverPreviewStore.ts
import { create } from 'zustand'

interface HoverPreviewState {
  visible:   boolean
  noteTitle: string | null
  content:   string | null
  x:         number
  y:         number
  loading:   boolean
  showPreview: (noteTitle: string, x: number, y: number) => void
  setContent:  (content: string) => void
  hidePreview: () => void
}

export const useHoverPreviewStore = create<HoverPreviewState>((set) => ({
  visible:   false,
  noteTitle: null,
  content:   null,
  x:         0,
  y:         0,
  loading:   false,
  showPreview: (noteTitle, x, y) => set({ visible: true, noteTitle, x, y, loading: true, content: null }),
  setContent:  (content)         => set({ content, loading: false }),
  hidePreview: ()                => set({ visible: false, noteTitle: null, content: null, loading: false }),
}))
