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

  it('insertCallout command factory returns a function accepting command helpers', () => {
    const cmds = Callout.config.addCommands?.call(Callout) as Record<string, unknown>
    expect(typeof cmds.insertCallout).toBe('function')
    const inner = (cmds.insertCallout as (t: string) => (...args: unknown[]) => unknown)('info')
    expect(typeof inner).toBe('function')
    // The inner function takes one destructured argument ({ commands, state, ... })
    expect(inner.length).toBe(1)
  })
})
