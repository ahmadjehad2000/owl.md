// tests/renderer/extensions/Table.test.ts
import { describe, it, expect } from 'vitest'
import { getSlashItems } from '../../../src/renderer/components/editor/extensions/SlashCommand'

describe('SlashCommand — table', () => {
  it('includes a Table entry', () => {
    expect(getSlashItems('').some(i => i.title === 'Table')).toBe(true)
  })
  it('filters table by query "tab"', () => {
    expect(getSlashItems('tab')[0].title).toBe('Table')
  })
})
