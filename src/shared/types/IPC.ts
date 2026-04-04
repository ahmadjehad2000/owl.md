// src/shared/types/IPC.ts
import type { Note, NoteContent, NoteSlim, BacklinkResult, SearchResult, VaultConfig } from './Note'

export interface OwlVaultAPI {
  open:        (vaultPath: string) => Promise<VaultConfig>
  create:      (name: string)      => Promise<VaultConfig>
  activate:    (vaultPath: string) => Promise<VaultConfig>
  listKnown:   ()                  => Promise<VaultConfig[]>
  getLast:     ()                  => Promise<string | null>
  getSessions: ()                  => Promise<VaultConfig[]>
  getConfig:   ()                  => Promise<VaultConfig | null>
  removeKnown: (path: string)      => Promise<void>
  close:       (path: string)      => Promise<VaultConfig | null>
}

export interface OwlNotesAPI {
  list:         () => Promise<Note[]>
  listSlim:     () => Promise<NoteSlim[]>
  read:         (id: string) => Promise<NoteContent>
  save:         (id: string, markdown: string) => Promise<Note>
  create:       (title: string, folderPath: string) => Promise<NoteContent>
  delete:       (id: string) => Promise<void>
  getBacklinks: (id: string) => Promise<BacklinkResult[]>
  createFolder: (name: string) => Promise<Note>
  move:         (noteId: string, newParentId: string | null, orderIndex: number) => Promise<void>
  rename:       (id: string, newTitle: string) => Promise<Note>
  duplicate:    (id: string) => Promise<NoteContent>
  pin:          (id: string, pinned: boolean) => Promise<Note>
  listTags:     () => Promise<Array<{ tag: string; count: number }>>
  notesByTag:   (tag: string) => Promise<Note[]>
  createDaily:  () => Promise<NoteContent>
  saveImage:    (base64Data: string, ext: string) => Promise<string>
}

export interface OwlSearchAPI {
  query: (q: string) => Promise<SearchResult[]>
}

export interface OwlShellAPI {
  openExternal: (url: string) => Promise<void>
}

export interface OwlExportAPI {
  pdf: (noteTitle: string) => Promise<void>
}

export interface OwlAPI {
  vault:  OwlVaultAPI
  notes:  OwlNotesAPI
  search: OwlSearchAPI
  shell:  OwlShellAPI
  export: OwlExportAPI
}

declare global {
  interface Window { owl: OwlAPI }
}
