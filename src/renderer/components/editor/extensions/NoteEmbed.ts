// src/renderer/components/editor/extensions/NoteEmbed.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { ipc } from '../../../lib/ipc'
import { useVaultStore } from '../../../stores/vaultStore'

const NOTE_EMBED_RE = /!\[\[([^\]]+)\]\]/g
export const NoteEmbedPluginKey = new PluginKey<DecorationSet>('noteEmbed')
const embedCache = new Map<string, string>()

export function buildEmbedDecorations(
  doc: ProseMirrorNode,
  loadEmbed: (title: string) => void
): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const match of node.text.matchAll(NOTE_EMBED_RE)) {
      const from  = pos + match.index!
      const to    = from + match[0].length
      const title = match[1].trim()

      decorations.push(Decoration.inline(from, to, { class: 'note-embed-syntax', 'data-embed-target': title }))

      const cached = embedCache.get(title)
      if (cached === undefined) loadEmbed(title)

      decorations.push(
        Decoration.widget(from, () => {
          const container = document.createElement('div')
          container.className = 'note-embed-card'
          const titleEl = document.createElement('div')
          titleEl.className = 'note-embed-title'
          titleEl.textContent = title
          const bodyEl = document.createElement('div')
          bodyEl.className = 'note-embed-body'
          if (cached === undefined)    { bodyEl.textContent = 'Loading…'; bodyEl.classList.add('note-embed-loading') }
          else if (cached === '')      { bodyEl.textContent = '(Note not found)'; bodyEl.classList.add('note-embed-empty') }
          else                         { bodyEl.textContent = cached.slice(0, 400) }
          container.appendChild(titleEl)
          container.appendChild(bodyEl)
          return container
        }, { side: -1, key: `embed-${title}-${from}` })
      )
    }
  })

  return DecorationSet.create(doc, decorations)
}

export const NoteEmbed = Extension.create({
  name: 'noteEmbed',

  addProseMirrorPlugins() {
    let viewRef: { dispatch: (tr: import('@tiptap/pm/state').Transaction) => void; state: import('@tiptap/pm/state').EditorState } | null = null

    const triggerRedecorate = (): void => {
      if (!viewRef) return
      viewRef.dispatch(viewRef.state.tr.setMeta('noteEmbedRefresh', true))
    }

    const loadEmbed = async (title: string): Promise<void> => {
      if (embedCache.has(title)) return
      embedCache.set(title, undefined as unknown as string)
      const notes = useVaultStore.getState().notes
      const found = notes.find(n => n.title.toLowerCase() === title.toLowerCase())
      if (!found) { embedCache.set(title, ''); triggerRedecorate(); return }
      try {
        const { markdown } = await ipc.notes.read(found.id)
        const body = markdown.replace(/^---[\s\S]*?---\n?/, '').trim()
        embedCache.set(title, body.slice(0, 800))
      } catch {
        embedCache.set(title, '')
      }
      triggerRedecorate()
    }

    return [
      new Plugin({
        key: NoteEmbedPluginKey,
        view: (editorView) => { viewRef = editorView; return { destroy: () => { viewRef = null } } },
        state: {
          init: (_, { doc }) => buildEmbedDecorations(doc, loadEmbed),
          apply: (tr, old, _prev, next) => {
            if (tr.docChanged || tr.getMeta('noteEmbedRefresh')) return buildEmbedDecorations(next.doc, loadEmbed)
            return old
          },
        },
        props: {
          decorations: (state) => NoteEmbedPluginKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ]
  },
})
