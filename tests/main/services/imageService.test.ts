// tests/main/services/imageService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

describe('image save to attachments folder', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'owl-img-')) })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('saves a buffer to attachments/images and returns a relative path', () => {
    const imgDir = join(tmpDir, 'attachments', 'images')
    mkdirSync(imgDir, { recursive: true })
    const uuid = randomUUID()
    const filename = `${uuid}.png`
    writeFileSync(join(imgDir, filename), Buffer.from('fake-png-data'))
    expect(existsSync(join(imgDir, filename))).toBe(true)
    const relPath = `attachments/images/${filename}`
    expect(relPath).toMatch(/^attachments\/images\/[a-f0-9-]+\.png$/)
  })
})
