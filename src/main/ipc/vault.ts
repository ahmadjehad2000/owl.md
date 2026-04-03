// src/main/ipc/vault.ts
import { ipcMain } from 'electron'
import type { VaultConfig } from '@shared/types/Note'
import type { DatabaseService } from '../services/DatabaseService'
import type { VaultService } from '../services/VaultService'

export function registerVaultHandlers(services: {
  db: () => DatabaseService
  vault: () => VaultService
  openVault: (vaultPath: string) => Promise<VaultConfig>
  setVaultPath: (p: string) => void
}): void {
  ipcMain.handle('vault:open', (_e, vaultPath: string) =>
    services.openVault(vaultPath)
  )

  ipcMain.handle('vault:create', async (_e, vaultPath: string, name: string) => {
    services.setVaultPath(vaultPath)
    services.vault().init(name)
    services.db().open()
    return services.vault().getConfig()
  })

  ipcMain.handle('vault:getConfig', () => services.vault().getConfig())
}
