// src/renderer/stores/settingsStore.ts
import { create } from 'zustand'

export type Theme = 'default' | 'modern-dark' | 'modern-light'

export type FontFamily =
  | 'system'
  | 'inter'
  | 'georgia'
  | 'merriweather'
  | 'jetbrains'

export type LineHeight = 'compact' | 'normal' | 'relaxed'

export interface Settings {
  theme:       Theme
  fontFamily:  FontFamily
  lineHeight:  LineHeight
}

const FONT_MAP: Record<FontFamily, string> = {
  system:      `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif`,
  inter:       `'Inter', -apple-system, sans-serif`,
  georgia:     `'Georgia', 'Times New Roman', serif`,
  merriweather:`'Merriweather', 'Georgia', serif`,
  jetbrains:   `'JetBrains Mono', 'Fira Code', 'SF Mono', monospace`,
}

const LINE_HEIGHT_MAP: Record<LineHeight, string> = {
  compact:  '1.5',
  normal:   '1.8',
  relaxed:  '2.1',
}

const STORAGE_KEY = 'owl:settings'

function loadSaved(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults(), ...JSON.parse(raw) as Partial<Settings> }
  } catch { /* ignore */ }
  return defaults()
}

function defaults(): Settings {
  return { theme: 'default', fontFamily: 'system', lineHeight: 'normal' }
}

/** Apply settings to the document immediately (no re-render needed) */
export function applySettings(s: Settings): void {
  const root = document.documentElement
  // Theme
  if (s.theme === 'default') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', s.theme)
  }
  // Font
  root.style.setProperty('--owl-font', FONT_MAP[s.fontFamily])
  // Line height
  root.style.setProperty('--owl-line-height', LINE_HEIGHT_MAP[s.lineHeight])
}

interface SettingsStore {
  settings:    Settings
  isOpen:      boolean
  draft:       Settings          // pending (unsaved) edits
  open:        () => void
  close:       () => void
  setDraft:    (patch: Partial<Settings>) => void
  save:        () => void
  discard:     () => void
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const initial = loadSaved()
  // Apply on boot
  applySettings(initial)

  return {
    settings: initial,
    draft:    { ...initial },
    isOpen:   false,

    open:  () => set(s => ({ isOpen: true, draft: { ...s.settings } })),
    close: () => set({ isOpen: false }),

    setDraft: (patch) => set(s => ({ draft: { ...s.draft, ...patch } })),

    save: () => {
      const { draft } = get()
      applySettings(draft)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
      set({ settings: { ...draft }, isOpen: false })
    },

    discard: () => set(s => ({ draft: { ...s.settings }, isOpen: false })),
  }
})
