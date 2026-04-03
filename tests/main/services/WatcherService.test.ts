// tests/main/services/WatcherService.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WatcherService } from '../../../src/main/services/WatcherService'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('WatcherService', () => {
  let tmpDir: string
  let watcher: WatcherService

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'owl-watch-'))
    mkdirSync(join(tmpDir, 'notes'), { recursive: true })
    watcher = new WatcherService(tmpDir)
  })

  afterEach(async () => {
    await watcher.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('calls onFileChanged when a .md file is added', async () => {
    const onChanged = vi.fn()
    watcher.start({ onFileChanged: onChanged, onFileDeleted: vi.fn() })
    writeFileSync(join(tmpDir, 'notes', 'test.md'), '# Test')
    await new Promise(r => setTimeout(r, 400))
    expect(onChanged).toHaveBeenCalledWith(expect.stringContaining('test.md'))
  })

  it('calls onFileDeleted when a .md file is removed', async () => {
    const onDeleted = vi.fn()
    writeFileSync(join(tmpDir, 'notes', 'to-delete.md'), '# Delete Me')
    watcher.start({ onFileChanged: vi.fn(), onFileDeleted: onDeleted })
    await new Promise(r => setTimeout(r, 200))
    rmSync(join(tmpDir, 'notes', 'to-delete.md'))
    await new Promise(r => setTimeout(r, 400))
    expect(onDeleted).toHaveBeenCalledWith(expect.stringContaining('to-delete.md'))
  })

  it('does not call onFileChanged for non-.md files', async () => {
    const onChanged = vi.fn()
    watcher.start({ onFileChanged: onChanged, onFileDeleted: vi.fn() })
    writeFileSync(join(tmpDir, 'notes', 'image.png'), 'fake image')
    await new Promise(r => setTimeout(r, 400))
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('stop() resolves without error', async () => {
    watcher.start({ onFileChanged: vi.fn(), onFileDeleted: vi.fn() })
    await expect(watcher.stop()).resolves.not.toThrow()
  })
})
