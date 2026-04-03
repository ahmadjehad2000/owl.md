// tests/renderer/stores/tabStore.test.ts
import { beforeEach, describe, it, expect } from 'vitest'
import { useTabStore } from '../../../src/renderer/stores/tabStore'

beforeEach(() => {
  useTabStore.setState({ tabs: [], activeTabId: null })
})

describe('openTab', () => {
  it('creates a new tab and makes it active', () => {
    useTabStore.getState().openTab('note-1', 'Note 1')
    const { tabs, activeTabId } = useTabStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0].noteId).toBe('note-1')
    expect(tabs[0].markdown).toBeNull()
    expect(activeTabId).toBe(tabs[0].id)
  })

  it('deduplicates: opening the same note twice activates the existing tab', () => {
    useTabStore.getState().openTab('note-1', 'Note 1')
    const firstId = useTabStore.getState().activeTabId
    useTabStore.getState().openTab('note-1', 'Note 1')
    expect(useTabStore.getState().tabs).toHaveLength(1)
    expect(useTabStore.getState().activeTabId).toBe(firstId)
  })

  it('opens multiple different notes as separate tabs', () => {
    useTabStore.getState().openTab('note-1', 'N1')
    useTabStore.getState().openTab('note-2', 'N2')
    expect(useTabStore.getState().tabs).toHaveLength(2)
  })
})

describe('closeTab', () => {
  it('removes the tab and sets activeTabId to null when last tab', () => {
    useTabStore.getState().openTab('note-1', 'N1')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().closeTab(tabId)
    expect(useTabStore.getState().tabs).toHaveLength(0)
    expect(useTabStore.getState().activeTabId).toBeNull()
  })

  it('activates the previous tab when the active tab is closed', () => {
    useTabStore.getState().openTab('note-1', 'N1')
    useTabStore.getState().openTab('note-2', 'N2')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().closeTab(tabs[1].id)
    expect(useTabStore.getState().tabs).toHaveLength(1)
    expect(useTabStore.getState().activeTabId).toBe(tabs[0].id)
  })

  it('activates the next tab when closing the first tab', () => {
    useTabStore.getState().openTab('note-1', 'N1')
    useTabStore.getState().openTab('note-2', 'N2')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().activateTab(tabs[0].id)
    useTabStore.getState().closeTab(tabs[0].id)
    expect(useTabStore.getState().activeTabId).toBe(tabs[1].id)
  })
})

describe('nextTab / prevTab', () => {
  it('cycles forward, wrapping from last to first', () => {
    useTabStore.getState().openTab('n1', 'N1')
    useTabStore.getState().openTab('n2', 'N2')
    useTabStore.getState().openTab('n3', 'N3')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().activateTab(tabs[2].id)
    useTabStore.getState().nextTab()
    expect(useTabStore.getState().activeTabId).toBe(tabs[0].id)
  })

  it('cycles backward, wrapping from first to last', () => {
    useTabStore.getState().openTab('n1', 'N1')
    useTabStore.getState().openTab('n2', 'N2')
    useTabStore.getState().openTab('n3', 'N3')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().activateTab(tabs[0].id)
    useTabStore.getState().prevTab()
    expect(useTabStore.getState().activeTabId).toBe(tabs[2].id)
  })

  it('does nothing with fewer than 2 tabs', () => {
    useTabStore.getState().openTab('n1', 'N1')
    const before = useTabStore.getState().activeTabId
    useTabStore.getState().nextTab()
    expect(useTabStore.getState().activeTabId).toBe(before)
  })
})

describe('updateTabContent + markTabClean', () => {
  it('caches markdown and frontmatter in the tab', () => {
    useTabStore.getState().openTab('n1', 'N1')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().updateTabContent(tabId, '# Hello', { author: 'me' }, true)
    const tab = useTabStore.getState().tabs[0]
    expect(tab.markdown).toBe('# Hello')
    expect(tab.frontmatter).toEqual({ author: 'me' })
    expect(tab.isDirty).toBe(true)
  })

  it('cache survives switching away and back', () => {
    useTabStore.getState().openTab('n1', 'N1')
    useTabStore.getState().openTab('n2', 'N2')
    const { tabs } = useTabStore.getState()
    useTabStore.getState().activateTab(tabs[0].id)
    useTabStore.getState().updateTabContent(tabs[0].id, '# Cached', {}, false)
    useTabStore.getState().activateTab(tabs[1].id)
    useTabStore.getState().activateTab(tabs[0].id)
    const tab = useTabStore.getState().tabs.find(t => t.id === tabs[0].id)!
    expect(tab.markdown).toBe('# Cached')
  })

  it('markTabClean sets isDirty to false', () => {
    useTabStore.getState().openTab('n1', 'N1')
    const tabId = useTabStore.getState().tabs[0].id
    useTabStore.getState().updateTabContent(tabId, '# Hi', {}, true)
    useTabStore.getState().markTabClean(tabId)
    expect(useTabStore.getState().tabs[0].isDirty).toBe(false)
  })
})
