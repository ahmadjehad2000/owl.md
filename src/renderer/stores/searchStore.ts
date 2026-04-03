// src/renderer/stores/searchStore.ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { SearchResult } from '@shared/types/Note'

interface SearchState {
  isOpen:    boolean
  query:     string
  results:   SearchResult[]
  isLoading: boolean
  open:     () => void
  close:    () => void
  setQuery: (q: string) => Promise<void>
}

export const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  query: '',
  results: [],
  isLoading: false,

  open:  () => set({ isOpen: true, query: '', results: [] }),
  close: () => set({ isOpen: false }),

  setQuery: async (q) => {
    set({ query: q, isLoading: true })
    try {
      const results = await ipc.search.query(q)
      set({ results, isLoading: false })
    } catch {
      set({ results: [], isLoading: false })
    }
  },
}))
