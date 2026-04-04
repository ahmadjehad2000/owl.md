// tests/renderer/stores/hoverPreviewStore.test.ts
import { beforeEach, describe, it, expect } from 'vitest'
import { useHoverPreviewStore } from '../../../src/renderer/stores/hoverPreviewStore'

beforeEach(() => {
  useHoverPreviewStore.setState({ visible: false, noteTitle: null, content: null, x: 0, y: 0, loading: false })
})

describe('showPreview', () => {
  it('sets visible=true with position and noteTitle', () => {
    useHoverPreviewStore.getState().showPreview('My Note', 100, 200)
    const s = useHoverPreviewStore.getState()
    expect(s.visible).toBe(true)
    expect(s.noteTitle).toBe('My Note')
    expect(s.x).toBe(100)
    expect(s.y).toBe(200)
    expect(s.loading).toBe(true)
  })
  it('overwrites previous state', () => {
    useHoverPreviewStore.getState().showPreview('Note A', 10, 20)
    useHoverPreviewStore.getState().showPreview('Note B', 30, 40)
    const s = useHoverPreviewStore.getState()
    expect(s.noteTitle).toBe('Note B')
  })
})

describe('setContent', () => {
  it('sets content and clears loading', () => {
    useHoverPreviewStore.getState().showPreview('My Note', 0, 0)
    useHoverPreviewStore.getState().setContent('# Hello\nworld')
    const s = useHoverPreviewStore.getState()
    expect(s.content).toBe('# Hello\nworld')
    expect(s.loading).toBe(false)
  })
})

describe('hidePreview', () => {
  it('clears all state', () => {
    useHoverPreviewStore.getState().showPreview('My Note', 100, 200)
    useHoverPreviewStore.getState().hidePreview()
    const s = useHoverPreviewStore.getState()
    expect(s.visible).toBe(false)
    expect(s.noteTitle).toBeNull()
    expect(s.content).toBeNull()
  })
})
