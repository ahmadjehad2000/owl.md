// tests/main/services/SettingsService.test.ts
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { SettingsService } from '../../../src/main/services/SettingsService'

let testDir: string
let service: SettingsService

beforeEach(() => {
  testDir = join(tmpdir(), `owl-settings-${randomUUID()}`)
  mkdirSync(testDir, { recursive: true })
  service = new SettingsService(testDir)
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('SettingsService', () => {
  it('returns empty known vaults on first init', () => {
    expect(service.getKnownVaults()).toEqual([])
  })

  it('returns null last vault path on first init', () => {
    expect(service.getLastVaultPath()).toBeNull()
  })

  it('persists and retrieves a known vault', () => {
    const config = { name: 'Test', path: '/tmp/test', createdAt: 1000, schemaVersion: 1 }
    service.addKnownVault(config)
    expect(service.getKnownVaults()).toHaveLength(1)
    expect(service.getKnownVaults()[0]).toEqual(config)
  })

  it('updates existing vault when added again with same path', () => {
    const config = { name: 'Test', path: '/tmp/test', createdAt: 1000, schemaVersion: 1 }
    service.addKnownVault(config)
    service.addKnownVault({ ...config, name: 'Updated' })
    expect(service.getKnownVaults()).toHaveLength(1)
    expect(service.getKnownVaults()[0].name).toBe('Updated')
  })

  it('persists and retrieves last vault path', () => {
    service.setLastVaultPath('/tmp/my-vault')
    expect(service.getLastVaultPath()).toBe('/tmp/my-vault')
  })

  it('persists across instances (reads from disk)', () => {
    const config = { name: 'Test', path: '/tmp/test', createdAt: 1000, schemaVersion: 1 }
    service.addKnownVault(config)
    service.setLastVaultPath('/tmp/test')
    const service2 = new SettingsService(testDir)
    expect(service2.getKnownVaults()).toHaveLength(1)
    expect(service2.getLastVaultPath()).toBe('/tmp/test')
  })
})
