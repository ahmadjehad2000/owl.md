// src/shared/types/IPC.ts
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from './Note'

export interface OwlVaultAPI {
  open: (vaultPath: string) => Promise<VaultConfig>
  create: (vaultPath: string, name: string) => Promise<VaultConfig>
  getConfig: () => Promise<VaultConfig>
}

export interface OwlNotesAPI {
  list: () => Promise<Note[]>
  read: (id: string) => Promise<NoteContent>
  save: (id: string, markdown: string) => Promise<Note>
  create: (title: string, folderPath: string) => Promise<NoteContent>
  delete: (id: string) => Promise<void>
  getBacklinks: (id: string) => Promise<BacklinkResult[]>
}

export interface OwlSearchAPI {
  query: (q: string) => Promise<SearchResult[]>
}

export interface OwlAPI {
  vault: OwlVaultAPI
  notes: OwlNotesAPI
  search: OwlSearchAPI
}

declare global {
  interface Window { owl: OwlAPI }
}
