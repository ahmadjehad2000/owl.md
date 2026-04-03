// src/renderer/lib/ipc.ts
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from '@shared/types/Note'

export const ipc = {
  vault: {
    open:      (path: string): Promise<VaultConfig>               => window.owl.vault.open(path),
    create:    (path: string, name: string): Promise<VaultConfig> => window.owl.vault.create(path, name),
    getConfig: (): Promise<VaultConfig>                           => window.owl.vault.getConfig(),
  },
  notes: {
    list:         (): Promise<Note[]>                             => window.owl.notes.list(),
    read:         (id: string): Promise<NoteContent>              => window.owl.notes.read(id),
    save:         (id: string, md: string): Promise<Note>         => window.owl.notes.save(id, md),
    create:       (title: string, folder: string): Promise<NoteContent> => window.owl.notes.create(title, folder),
    delete:       (id: string): Promise<void>                     => window.owl.notes.delete(id),
    getBacklinks: (id: string): Promise<BacklinkResult[]>         => window.owl.notes.getBacklinks(id),
  },
  search: {
    query: (q: string): Promise<SearchResult[]>                   => window.owl.search.query(q),
  },
}
