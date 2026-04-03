// src/shared/types/IPC.ts
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from './Note'

export interface OwlVaultAPI {
  open:        (vaultPath: string) => Promise<VaultConfig>
  create:      (name: string)      => Promise<VaultConfig>
  activate:    (vaultPath: string) => Promise<VaultConfig>
  listKnown:   ()                  => Promise<VaultConfig[]>
  getLast:     ()                  => Promise<string | null>
  getSessions: ()                  => Promise<VaultConfig[]>
  getConfig:   ()                  => Promise<VaultConfig | null>
}

export interface OwlNotesAPI {
  list:         () => Promise<Note[]>
  read:         (id: string) => Promise<NoteContent>
  save:         (id: string, markdown: string) => Promise<Note>
  create:       (title: string, folderPath: string) => Promise<NoteContent>
  delete:       (id: string) => Promise<void>
  getBacklinks: (id: string) => Promise<BacklinkResult[]>
}

export interface OwlSearchAPI {
  query: (q: string) => Promise<SearchResult[]>
}

export interface OwlAPI {
  vault:  OwlVaultAPI
  notes:  OwlNotesAPI
  search: OwlSearchAPI
}

declare global {
  interface Window { owl: OwlAPI }
}
