// src/renderer/stores/vaultManagerStore.ts
import { create } from 'zustand'

export type VaultManagerMode = 'create' | 'open' | null

interface VaultManagerState {
  isOpen: boolean
  mode:   VaultManagerMode
  show:   (mode: 'create' | 'open') => void
  hide:   () => void
}

export const useVaultManagerStore = create<VaultManagerState>(set => ({
  isOpen: false,
  mode:   null,
  show:   (mode) => set({ isOpen: true, mode }),
  hide:   () => set({ isOpen: false, mode: null }),
}))
