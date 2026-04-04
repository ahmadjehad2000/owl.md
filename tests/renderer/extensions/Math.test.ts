// tests/renderer/extensions/Math.test.ts
import { describe, it, expect } from 'vitest'
import { getSlashItems } from '../../../src/renderer/components/editor/extensions/SlashCommand'

describe('SlashCommand — math', () => {
  it('includes Math Inline entry', () => {
    expect(getSlashItems('').some(i => i.title === 'Math Inline')).toBe(true)
  })
  it('includes Math Block entry', () => {
    expect(getSlashItems('').some(i => i.title === 'Math Block')).toBe(true)
  })
  it('filters by query "math"', () => {
    expect(getSlashItems('math').length).toBe(2)
  })
})
