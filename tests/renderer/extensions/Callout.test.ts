// tests/renderer/extensions/Callout.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { Callout } from '../../../src/renderer/components/editor/extensions/Callout'

describe('Callout extension', () => {
  it('has name "callout"', () => {
    expect(Callout.name).toBe('callout')
  })

  it('is a block group node', () => {
    expect(Callout.config.group).toBe('block')
  })

  it('has a type attribute defaulting to "info"', () => {
    const attrs = Callout.config.addAttributes?.call(Callout) as Record<string, { default: string }>
    expect(attrs.type.default).toBe('info')
  })
})
