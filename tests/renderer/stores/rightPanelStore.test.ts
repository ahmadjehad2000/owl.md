// tests/renderer/stores/rightPanelStore.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/renderer/lib/ipc', () => ({
  ipc: {
    notes: {
      getBacklinks: vi.fn().mockResolvedValue([
        { sourceNoteId: 'note-1', sourceTitle: 'Alpha', linkText: 'Beta' },
      ]),
    },
  },
}))

import { useRightPanelStore } from '../../../src/renderer/stores/rightPanelStore'

describe('rightPanelStore', () => {
  beforeEach(() => { useRightPanelStore.setState({ backlinks: [] }) })

  it('fetchBacklinks populates backlinks state', async () => {
    await useRightPanelStore.getState().fetchBacklinks('note-abc')
    expect(useRightPanelStore.getState().backlinks).toHaveLength(1)
    expect(useRightPanelStore.getState().backlinks[0].sourceTitle).toBe('Alpha')
  })

  it('fetchBacklinks clears backlinks on error', async () => {
    const { ipc } = await import('../../../src/renderer/lib/ipc')
    vi.mocked(ipc.notes.getBacklinks).mockRejectedValueOnce(new Error('fail'))
    await useRightPanelStore.getState().fetchBacklinks('note-abc')
    expect(useRightPanelStore.getState().backlinks).toHaveLength(0)
  })
})
