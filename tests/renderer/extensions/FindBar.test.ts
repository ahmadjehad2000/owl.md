// tests/renderer/extensions/FindBar.test.ts
import { describe, it, expect } from 'vitest'
import { SearchHighlight } from '../../../src/renderer/components/editor/extensions/SearchHighlight'

describe('SearchHighlight extension', () => {
  it('is importable and has the expected name', () => {
    expect(SearchHighlight).toBeDefined()
    expect(SearchHighlight.name).toBe('searchHighlight')
  })
})
