// src/renderer/stores/tabStore.ts
import { create } from 'zustand'
import type { Frontmatter } from '../lib/markdown'

export interface Tab {
  id: string            // UUID — tab identity, not note identity
  noteId: string
  title: string
  isDirty: boolean
  markdown: string | null       // null = not yet loaded from disk
  frontmatter: Frontmatter | null
}

interface TabStore {
  tabs: Tab[]
  activeTabId: string | null
  openTab:          (noteId: string, title: string) => void
  closeTab:         (tabId: string) => void
  activateTab:      (tabId: string) => void
  updateTabContent: (tabId: string, markdown: string, frontmatter: Frontmatter, isDirty: boolean) => void
  markTabClean:     (tabId: string) => void
  nextTab:          () => void
  prevTab:          () => void
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (noteId, title) => {
    const existing = get().tabs.find(t => t.noteId === noteId)
    if (existing) { get().activateTab(existing.id); return }
    const id = crypto.randomUUID()
    set(s => ({
      tabs: [...s.tabs, { id, noteId, title, isDirty: false, markdown: null, frontmatter: null }],
    }))
    get().activateTab(id)
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex(t => t.id === tabId)
    if (idx === -1) return
    const remaining = tabs.filter(t => t.id !== tabId)
    let nextActive: string | null = null
    if (activeTabId === tabId && remaining.length > 0) {
      nextActive = (remaining[idx - 1] ?? remaining[idx])?.id ?? null
    } else if (activeTabId !== tabId) {
      nextActive = activeTabId
    }
    set({ tabs: remaining, activeTabId: nextActive })
  },

  activateTab: (tabId) => set({ activeTabId: tabId }),

  updateTabContent: (tabId, markdown, frontmatter, isDirty) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, markdown, frontmatter, isDirty } : t),
    }))
  },

  markTabClean: (tabId) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, isDirty: false } : t),
    }))
  },

  nextTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length < 2) return
    const idx = tabs.findIndex(t => t.id === activeTabId)
    get().activateTab(tabs[(idx + 1) % tabs.length].id)
  },

  prevTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length < 2) return
    const idx = tabs.findIndex(t => t.id === activeTabId)
    get().activateTab(tabs[(idx - 1 + tabs.length) % tabs.length].id)
  },
}))
