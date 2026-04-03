// src/renderer/components/editor/extensions/WikiLink.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export const WikiLinkPluginKey = new PluginKey<DecorationSet>('wikiLink')

/** Exported for unit testing — builds a DecorationSet from a ProseMirror document */
export function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const match of node.text.matchAll(WIKI_LINK_RE)) {
      const from = pos + match.index!
      const to = from + match[0].length
      decorations.push(
        Decoration.inline(from, to, {
          class: 'wiki-link',
          'data-target': match[1].trim(),
          title: match[1].trim(),
        })
      )
    }
  })

  return DecorationSet.create(doc, decorations)
}

export const WikiLink = Extension.create({
  name: 'wikiLink',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: WikiLinkPluginKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations: (state) => WikiLinkPluginKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ]
  },
})
