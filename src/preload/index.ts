// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { OwlAPI } from '@shared/types/IPC'

const owl: OwlAPI = {
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  },
  vault: {
    open:        (vaultPath) => ipcRenderer.invoke('vault:open',         vaultPath),
    create:      (name)      => ipcRenderer.invoke('vault:create',       name),
    activate:    (vaultPath) => ipcRenderer.invoke('vault:activate',     vaultPath),
    listKnown:   ()          => ipcRenderer.invoke('vault:list-known'),
    getLast:     ()          => ipcRenderer.invoke('vault:get-last'),
    getSessions: ()          => ipcRenderer.invoke('vault:get-sessions'),
    getConfig:   ()          => ipcRenderer.invoke('vault:getConfig'),
    removeKnown: (path)      => ipcRenderer.invoke('vault:remove-known', path),
    close:       (path)      => ipcRenderer.invoke('vault:close',        path),
  },
  notes: {
    list:         ()              => ipcRenderer.invoke('notes:list'),
    read:         (id)            => ipcRenderer.invoke('notes:read',          id),
    save:         (id, markdown)  => ipcRenderer.invoke('notes:save',          id, markdown),
    create:       (title, folder) => ipcRenderer.invoke('notes:create',        title, folder),
    delete:       (id)            => ipcRenderer.invoke('notes:delete',        id),
    getBacklinks: (id)            => ipcRenderer.invoke('notes:getBacklinks',  id),
    createFolder: (name)          => ipcRenderer.invoke('notes:create-folder', name),
    move: (noteId, newParentId, orderIndex) =>
            ipcRenderer.invoke('notes:move',      noteId, newParentId, orderIndex),
    rename:    (id, newTitle)   => ipcRenderer.invoke('notes:rename',    id, newTitle),
    duplicate: (id)             => ipcRenderer.invoke('notes:duplicate', id),
    pin:       (id, pinned)     => ipcRenderer.invoke('notes:pin',       id, pinned),
  },
  search: {
    query: (q) => ipcRenderer.invoke('search:query', q),
  },
}

contextBridge.exposeInMainWorld('owl', owl)
