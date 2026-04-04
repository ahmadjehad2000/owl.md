// src/renderer/components/editor/extensions/SearchHighlight.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node as ProseMirrorNode } from 'prosemirror-model'

const pluginKey = new PluginKey<{ term: string; currentIndex: number }>('searchHighlight')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchTerm: (term: string) => ReturnType
      nextSearchResult: () => ReturnType
      previousSearchResult: () => ReturnType
    }
  }
}

function findMatches(doc: ProseMirrorNode, term: string): Array<{ from: number; to: number }> {
  if (!term) return []
  const matches: Array<{ from: number; to: number }> = []
  const lower = term.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text.toLowerCase()
    let idx = 0
    while ((idx = text.indexOf(lower, idx)) !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + term.length })
      idx += term.length
    }
  })
  return matches
}

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addStorage() {
    return { term: '', currentIndex: 0, resultCount: 0 }
  },

  addCommands() {
    return {
      setSearchTerm: (term: string) => ({ editor, dispatch, tr }) => {
        this.storage.term = term
        this.storage.currentIndex = 0
        const matches = findMatches(editor.state.doc, term)
        this.storage.resultCount = matches.length
        if (dispatch) dispatch(tr.setMeta(pluginKey, { term, currentIndex: 0 }))
        return true
      },
      nextSearchResult: () => ({ editor, dispatch, tr }) => {
        const matches = findMatches(editor.state.doc, this.storage.term)
        if (!matches.length) return false
        this.storage.currentIndex = (this.storage.currentIndex + 1) % matches.length
        const idx = this.storage.currentIndex
        if (dispatch) {
          dispatch(tr.setMeta(pluginKey, { term: this.storage.term, currentIndex: idx }))
          // Scroll the current match into view
          const match = matches[idx]
          editor.commands.setTextSelection({ from: match.from, to: match.to })
        }
        return true
      },
      previousSearchResult: () => ({ editor, dispatch, tr }) => {
        const matches = findMatches(editor.state.doc, this.storage.term)
        if (!matches.length) return false
        this.storage.currentIndex = (this.storage.currentIndex - 1 + matches.length) % matches.length
        const idx = this.storage.currentIndex
        if (dispatch) {
          dispatch(tr.setMeta(pluginKey, { term: this.storage.term, currentIndex: idx }))
          const match = matches[idx]
          editor.commands.setTextSelection({ from: match.from, to: match.to })
        }
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const getStorage = () => this.storage
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: () => ({ term: '', currentIndex: 0 }),
          apply: (tr, value) => {
            const meta = tr.getMeta(pluginKey) as { term: string; currentIndex: number } | undefined
            return meta ?? value
          },
        },
        props: {
          decorations(state) {
            const { term, currentIndex } = pluginKey.getState(state) ?? { term: '', currentIndex: 0 }
            if (!term) return DecorationSet.empty
            const matches = findMatches(state.doc, term)
            if (!matches.length) return DecorationSet.empty
            const storage = getStorage()
            storage.resultCount = matches.length
            const decos = matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class: i === currentIndex ? 'search-highlight-current' : 'search-highlight',
              })
            )
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
