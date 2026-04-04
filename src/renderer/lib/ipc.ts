// src/renderer/lib/ipc.ts
import type { Note, NoteContent, BacklinkResult, SearchResult, VaultConfig } from '@shared/types/Note'

export const ipc = {
  vault: {
    open:        (path: string):  Promise<VaultConfig>       => window.owl.vault.open(path),
    create:      (name: string):  Promise<VaultConfig>       => window.owl.vault.create(name),
    activate:    (path: string):  Promise<VaultConfig>       => window.owl.vault.activate(path),
    listKnown:   ():              Promise<VaultConfig[]>      => window.owl.vault.listKnown(),
    getLast:     ():              Promise<string | null>      => window.owl.vault.getLast(),
    getSessions: ():              Promise<VaultConfig[]>      => window.owl.vault.getSessions(),
    getConfig:   ():              Promise<VaultConfig | null> => window.owl.vault.getConfig(),
    removeKnown: (path: string):  Promise<void>              => window.owl.vault.removeKnown(path),
    close:       (path: string):  Promise<VaultConfig | null> => window.owl.vault.close(path),
  },
  notes: {
    list:         (): Promise<Note[]>                          => window.owl.notes.list(),
    read:         (id: string): Promise<NoteContent>           => window.owl.notes.read(id),
    save:         (id: string, md: string): Promise<Note>      => window.owl.notes.save(id, md),
    create:       (title: string, folder: string): Promise<NoteContent> =>
                    window.owl.notes.create(title, folder),
    delete:       (id: string): Promise<void>                  => window.owl.notes.delete(id),
    getBacklinks: (id: string): Promise<BacklinkResult[]>      => window.owl.notes.getBacklinks(id),
    createFolder: (name: string): Promise<Note>                => window.owl.notes.createFolder(name),
    move: (noteId: string, newParentId: string | null, orderIndex: number): Promise<void> =>
            window.owl.notes.move(noteId, newParentId, orderIndex),
    rename:    (id: string, newTitle: string): Promise<Note>   => window.owl.notes.rename(id, newTitle),
    duplicate: (id: string): Promise<NoteContent>              => window.owl.notes.duplicate(id),
  },
  search: {
    query: (q: string): Promise<SearchResult[]> => window.owl.search.query(q),
  },
  shell: {
    openExternal: (url: string): Promise<void> => window.owl.shell.openExternal(url),
  },
}
