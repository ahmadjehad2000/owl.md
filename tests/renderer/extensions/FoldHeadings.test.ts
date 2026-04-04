// @vitest-environment node
// tests/renderer/extensions/FoldHeadings.test.ts
import { describe, it, expect } from 'vitest'
import { schema } from '@tiptap/pm/schema-basic'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  FoldPluginKey,
  buildFoldDecorations,
  getCollapsedPositions,
  togglePosition,
} from '../../../src/renderer/components/editor/extensions/FoldHeadings'

function makeDoc(children: ProseMirrorNode[]): ProseMirrorNode {
  return schema.node('doc', null, children)
}
function h(level: 1 | 2 | 3, text: string): ProseMirrorNode {
  return schema.node('heading', { level }, [schema.text(text)])
}
function p(text: string): ProseMirrorNode {
  return schema.node('paragraph', null, [schema.text(text)])
}

describe('togglePosition', () => {
  it('adds a position to an empty set', () => {
    expect(togglePosition(new Set<number>(), 5).has(5)).toBe(true)
  })
  it('removes a position already in the set', () => {
    const result = togglePosition(new Set<number>([5, 10]), 5)
    expect(result.has(5)).toBe(false)
    expect(result.has(10)).toBe(true)
  })
  it('does not mutate original', () => {
    const original = new Set<number>([5])
    togglePosition(original, 5)
    expect(original.has(5)).toBe(true)
  })
})

describe('getCollapsedPositions', () => {
  it('reflects the passed set', () => {
    const s = new Set([1, 7, 22])
    expect(getCollapsedPositions(s)).toBe(s)
  })
})

describe('buildFoldDecorations', () => {
  it('adds a widget decoration per heading', () => {
    const doc = makeDoc([h(1, 'Title'), p('body'), h(2, 'Section')])
    expect(buildFoldDecorations(doc, new Set()).find().length).toBe(2)
  })

  it('hides nodes between a collapsed h2 and the next h2', () => {
    const doc = makeDoc([h(2, 'A'), p('under A'), h(2, 'B'), p('under B')])
    let h2Pos = -1
    doc.forEach((node, offset) => { if (h2Pos === -1 && node.type.name === 'heading') h2Pos = offset })
    const decs = buildFoldDecorations(doc, new Set([h2Pos]))
    const hideDecs = decs.find().filter(d =>
      (d as unknown as { spec: { style?: string } }).spec?.style?.includes('display:none')
    )
    expect(hideDecs.length).toBeGreaterThanOrEqual(1)
  })

  it('does not hide content under uncollapsed h2', () => {
    const doc = makeDoc([h(2, 'A'), p('under A'), h(2, 'B'), p('under B')])
    const hideDecs = buildFoldDecorations(doc, new Set()).find().filter(d =>
      (d as unknown as { spec: { style?: string } }).spec?.style?.includes('display:none')
    )
    expect(hideDecs.length).toBe(0)
  })

  it('collapses content under h1 until next h1 or end', () => {
    const doc = makeDoc([h(1, 'Top'), p('intro'), h(2, 'Sub'), p('sub body')])
    let h1Pos = -1
    doc.forEach((node, offset) => { if (h1Pos === -1 && node.type.name === 'heading') h1Pos = offset })
    const hideDecs = buildFoldDecorations(doc, new Set([h1Pos])).find().filter(d =>
      (d as unknown as { spec: { style?: string } }).spec?.style?.includes('display:none')
    )
    expect(hideDecs.length).toBeGreaterThanOrEqual(2)
  })
})

describe('FoldPluginKey', () => {
  it('is defined with correct name', () => {
    expect(FoldPluginKey).toBeDefined()
    expect(FoldPluginKey.key).toContain('foldHeadings')
  })
})
