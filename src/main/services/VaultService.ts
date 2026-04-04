// src/main/services/VaultService.ts
import {
  mkdirSync, readdirSync, readFileSync, unlinkSync,
  writeFileSync, existsSync
} from 'fs'
import { join, relative, dirname } from 'path'
import type { VaultConfig } from '@shared/types/Note'

export class VaultService {
  constructor(private readonly vaultPath: string) {}

  init(name: string): void {
    mkdirSync(join(this.vaultPath, 'notes'), { recursive: true })
    mkdirSync(join(this.vaultPath, 'attachments', 'images'), { recursive: true })
    mkdirSync(join(this.vaultPath, 'attachments', 'files'), { recursive: true })
    mkdirSync(join(this.vaultPath, '.owl'), { recursive: true })

    const configPath = join(this.vaultPath, '.owl', 'config.json')
    if (!existsSync(configPath)) {
      const config: VaultConfig = {
        name,
        path: this.vaultPath,
        createdAt: Date.now(),
        schemaVersion: 1,
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    }
  }

  getConfig(): VaultConfig {
    return JSON.parse(
      readFileSync(join(this.vaultPath, '.owl', 'config.json'), 'utf-8')
    ) as VaultConfig
  }

  readNote(notePath: string): string {
    return readFileSync(this.noteAbsPath(notePath), 'utf-8')
  }

  writeNote(notePath: string, content: string): void {
    const abs = this.noteAbsPath(notePath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf-8')
  }

  noteExists(notePath: string): boolean {
    return existsSync(this.noteAbsPath(notePath))
  }

  deleteNote(notePath: string): void {
    unlinkSync(this.noteAbsPath(notePath))
  }

  listNotes(): string[] {
    const notesDir = join(this.vaultPath, 'notes')
    if (!existsSync(notesDir)) return []
    return this.walkDir(notesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => relative(notesDir, f))
  }

  noteAbsPath(notePath: string): string {
    return join(this.vaultPath, 'notes', notePath)
  }

  getRoot(): string { return this.vaultPath }

  private walkDir(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...this.walkDir(full))
      } else {
        files.push(full)
      }
    }
    return files
  }
}
