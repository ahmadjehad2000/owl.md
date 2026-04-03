// @vitest-environment node
// tests/renderer/extensions/WikiLink.test.ts
import { describe, it, expect } from 'vitest'
import { buildDecorations } from '../../../src/renderer/components/editor/extensions/WikiLink'
import { schema } from '@tiptap/pm/schema-basic'

describe('buildDecorations', () => {
  function makeDoc(text: string) {
    return schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text(text)])
    ])
  }

  it('detects [[simple link]] and returns one decoration', () => {
    expect(buildDecorations(makeDoc('See [[My Note]] here')).find()).toHaveLength(1)
  })

  it('decoration spans the full [[...]] including brackets', () => {
    const doc = makeDoc('A [[Note]] B')
    const decs = buildDecorations(doc).find()
    const text = 'A [[Note]] B'
    const from = 1 + text.indexOf('[[')    // +1 for paragraph open token
    const to = 1 + text.indexOf(']]') + 2
    expect(decs[0].from).toBe(from)
    expect(decs[0].to).toBe(to)
  })

  it('detects multiple [[links]] in one paragraph', () => {
    expect(buildDecorations(makeDoc('[[A]] and [[B]]')).find()).toHaveLength(2)
  })

  it('returns no decorations for plain text', () => {
    expect(buildDecorations(makeDoc('no wiki links here')).find()).toHaveLength(0)
  })

  it('handles [[link|alias]] syntax', () => {
    expect(buildDecorations(makeDoc('See [[Target|Display Text]] here')).find()).toHaveLength(1)
  })
})
