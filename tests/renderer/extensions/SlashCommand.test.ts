// tests/renderer/extensions/SlashCommand.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getSlashItems } from '../../../src/renderer/components/editor/extensions/SlashCommand'

describe('getSlashItems', () => {
  it('returns all items when query is empty', () => {
    expect(getSlashItems('')).toHaveLength(17)
  })

  it('filters items by query case-insensitively', () => {
    const items = getSlashItems('head')
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(i =>
      i.title.toLowerCase().includes('head') ||
      i.description.toLowerCase().includes('head'),
    )).toBe(true)
  })

  it('returns callout items when querying "callout"', () => {
    const items = getSlashItems('callout')
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(i =>
      i.title.toLowerCase().includes('callout') ||
      i.description.toLowerCase().includes('callout'),
    )).toBe(true)
  })

  it('returns empty array for unknown query', () => {
    expect(getSlashItems('xyznonexistent')).toHaveLength(0)
  })
})
