// src/main/services/SettingsService.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { VaultConfig } from '@shared/types/Note'

interface Settings {
  knownVaults: VaultConfig[]
  lastVaultPath: string | null
}

export class SettingsService {
  private readonly settingsPath: string
  private settings: Settings

  constructor(userDataPath: string) {
    this.settingsPath = join(userDataPath, 'settings.json')
    this.settings = this.load()
  }

  private load(): Settings {
    if (!existsSync(this.settingsPath)) {
      return { knownVaults: [], lastVaultPath: null }
    }
    try {
      return JSON.parse(readFileSync(this.settingsPath, 'utf-8')) as Settings
    } catch {
      return { knownVaults: [], lastVaultPath: null }
    }
  }

  private save(): void {
    mkdirSync(dirname(this.settingsPath), { recursive: true })
    writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
  }

  getKnownVaults(): VaultConfig[] {
    return this.settings.knownVaults
  }

  addKnownVault(config: VaultConfig): void {
    const idx = this.settings.knownVaults.findIndex(v => v.path === config.path)
    if (idx >= 0) {
      this.settings.knownVaults[idx] = config
    } else {
      this.settings.knownVaults.push(config)
    }
    this.save()
  }

  getLastVaultPath(): string | null {
    return this.settings.lastVaultPath
  }

  setLastVaultPath(path: string): void {
    this.settings.lastVaultPath = path
    this.save()
  }

  removeKnown(path: string): void {
    this.settings.knownVaults = this.settings.knownVaults.filter(v => v.path !== path)
    if (this.settings.lastVaultPath === path) {
      this.settings.lastVaultPath = null
    }
    this.save()
  }
}
