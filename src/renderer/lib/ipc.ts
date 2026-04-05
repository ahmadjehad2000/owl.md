// src/renderer/lib/ipc.ts
import type { Note, NoteContent, NoteSlim, BacklinkResult, SearchResult, VaultConfig, GraphData } from '@shared/types/Note'

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
    listSlim:     (): Promise<NoteSlim[]>                     => window.owl.notes.listSlim(),
    read:         (id: string): Promise<NoteContent>           => window.owl.notes.read(id),
    save:         (id: string, md: string): Promise<Note>      => window.owl.notes.save(id, md),
    create:       (title: string, folder: string): Promise<NoteContent> =>
                    window.owl.notes.create(title, folder),
    delete:       (id: string): Promise<void>                  => window.owl.notes.delete(id),
    getBacklinks: (id: string): Promise<BacklinkResult[]>      => window.owl.notes.getBacklinks(id),
    createFolder: (name: string): Promise<Note>                => window.owl.notes.createFolder(name),
    move: (noteId: string, newParentId: string | null, orderIndex: number): Promise<void> =>
            window.owl.notes.move(noteId, newParentId, orderIndex),
    rename:      (id: string, newTitle: string): Promise<Note>                     => window.owl.notes.rename(id, newTitle),
    duplicate:   (id: string): Promise<NoteContent>                               => window.owl.notes.duplicate(id),
    pin:         (id: string, pinned: boolean): Promise<Note>                     => window.owl.notes.pin(id, pinned),
    listTags:    (): Promise<Array<{ tag: string; count: number }>>               => window.owl.notes.listTags(),
    notesByTag:  (tag: string): Promise<Note[]>                                   => window.owl.notes.notesByTag(tag),
    createDaily: (): Promise<NoteContent>                                         => window.owl.notes.createDaily(),
    saveImage:   (base64Data: string, ext: string): Promise<string>               => window.owl.notes.saveImage(base64Data, ext),
    getGraphData: (): Promise<GraphData>                                          => window.owl.notes.getGraphData(),
  },
  export: {
    pdf: (noteTitle: string): Promise<void> => window.owl.export.pdf(noteTitle),
  },
  search: {
    query: (q: string): Promise<SearchResult[]> => window.owl.search.query(q),
  },
  shell: {
    openExternal: (url: string): Promise<void> => window.owl.shell.openExternal(url),
  },
}
