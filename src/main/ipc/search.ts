// src/main/ipc/search.ts
import { ipcMain } from 'electron'
import type { IndexService } from '../services/IndexService'

export function registerSearchHandlers(index: () => IndexService): void {
  ipcMain.handle('search:query', (_e, q: string) => {
    if (!q.trim()) return []
    return index().searchFTS(q)
  })
}
