// src/main/ipc/vault.ts
import { ipcMain } from 'electron'
import type { VaultConfig } from '@shared/types/Note'

export function registerVaultHandlers(services: {
  openVault:        (path: string) => Promise<VaultConfig>
  createVault:      (name: string) => Promise<VaultConfig>
  activateVault:    (path: string) => Promise<VaultConfig>
  listKnownVaults:  ()             => VaultConfig[]
  getLastVaultPath: ()             => string | null
  getOpenSessions:  ()             => VaultConfig[]
}): void {
  ipcMain.handle('vault:open',         (_e, path: string) => services.openVault(path))
  ipcMain.handle('vault:create',       (_e, name: string) => services.createVault(name))
  ipcMain.handle('vault:activate',     (_e, path: string) => services.activateVault(path))
  ipcMain.handle('vault:list-known',   ()                  => services.listKnownVaults())
  ipcMain.handle('vault:get-last',     ()                  => services.getLastVaultPath())
  ipcMain.handle('vault:get-sessions', ()                  => services.getOpenSessions())
  // Kept for backwards compatibility — returns active vault config
  ipcMain.handle('vault:getConfig',    ()                  => services.getOpenSessions()[0] ?? null)
}
