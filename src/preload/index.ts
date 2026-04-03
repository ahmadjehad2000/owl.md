// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { OwlAPI } from '@shared/types/IPC'

const owl: OwlAPI = {
  vault: {
    open:      (vaultPath)        => ipcRenderer.invoke('vault:open', vaultPath),
    create:    (vaultPath, name)  => ipcRenderer.invoke('vault:create', vaultPath, name),
    getConfig: ()                 => ipcRenderer.invoke('vault:getConfig'),
  },
  notes: {
    list:         ()              => ipcRenderer.invoke('notes:list'),
    read:         (id)            => ipcRenderer.invoke('notes:read', id),
    save:         (id, markdown)  => ipcRenderer.invoke('notes:save', id, markdown),
    create:       (title, folder) => ipcRenderer.invoke('notes:create', title, folder),
    delete:       (id)            => ipcRenderer.invoke('notes:delete', id),
    getBacklinks: (id)            => ipcRenderer.invoke('notes:getBacklinks', id),
  },
  search: {
    query: (q) => ipcRenderer.invoke('search:query', q),
  },
}

contextBridge.exposeInMainWorld('owl', owl)
