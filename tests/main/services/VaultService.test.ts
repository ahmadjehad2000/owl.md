// tests/main/services/VaultService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VaultService } from '../../../src/main/services/VaultService'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('VaultService', () => {
  let tmpDir: string
  let vault: VaultService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-vault-'))
    vault = new VaultService(tmpDir)
    vault.init('Test Vault')
  })

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }))

  it('creates notes/ and attachments/ directories on init', () => {
    expect(existsSync(join(tmpDir, 'notes'))).toBe(true)
    expect(existsSync(join(tmpDir, 'attachments'))).toBe(true)
  })

  it('writes .owl/config.json with vault name', () => {
    const { readFileSync } = require('fs')
    const config = JSON.parse(readFileSync(join(tmpDir, '.owl', 'config.json'), 'utf-8'))
    expect(config.name).toBe('Test Vault')
    expect(config.schemaVersion).toBe(1)
  })

  it('writeNote creates file with content', () => {
    vault.writeNote('hello.md', '# Hello\n\nWorld')
    expect(vault.readNote('hello.md')).toBe('# Hello\n\nWorld')
  })

  it('writeNote creates nested directories', () => {
    vault.writeNote('Research/papers/my-paper.md', '# Paper')
    expect(vault.readNote('Research/papers/my-paper.md')).toBe('# Paper')
  })

  it('deleteNote removes file', () => {
    vault.writeNote('temp.md', 'delete me')
    vault.deleteNote('temp.md')
    expect(() => vault.readNote('temp.md')).toThrow()
  })

  it('listNotes returns all .md files recursively', () => {
    vault.writeNote('a.md', '')
    vault.writeNote('sub/b.md', '')
    vault.writeNote('sub/deep/c.md', '')
    const notes = vault.listNotes()
    expect(notes).toContain('a.md')
    expect(notes).toContain('sub/b.md')
    expect(notes).toContain('sub/deep/c.md')
    expect(notes).toHaveLength(3)
  })

  it('listNotes ignores non-.md files', () => {
    vault.writeNote('a.md', '')
    const { writeFileSync, mkdirSync } = require('fs')
    mkdirSync(join(tmpDir, 'notes', 'sub'), { recursive: true })
    writeFileSync(join(tmpDir, 'notes', 'image.png'), '')
    expect(vault.listNotes()).toHaveLength(1)
  })

  it('noteAbsPath resolves vault-relative path', () => {
    expect(vault.noteAbsPath('Research/a.md')).toBe(join(tmpDir, 'notes', 'Research', 'a.md'))
  })
})
