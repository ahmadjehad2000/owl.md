// src/renderer/components/editor/extensions/WikiLinkPicker.ts
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import type { Editor, Range } from '@tiptap/core'
import { WikiLinkMenu } from '../WikiLinkMenu'
import type { WikiLinkMenuHandle } from '../WikiLinkMenu'
import { useVaultStore } from '../../../stores/vaultStore'
import { useEditorStore } from '../../../stores/editorStore'
import { extractHeadings } from '../../../lib/markdown'

export type WikiLinkItemType = 'heading' | 'note' | 'url'

export interface WikiLinkItem {
  type: WikiLinkItemType
  label: string  // display text
  href: string   // what goes inside [[ ]]
}

export function getWikiLinkItems(query: string): WikiLinkItem[] {
  const items: WikiLinkItem[] = []

  // ── Current-note headings ──────────────────────────────────────────────────
  const markdown = useEditorStore.getState().markdown
  for (const h of extractHeadings(markdown)) {
    items.push({ type: 'heading', label: h.text, href: `#${h.text}` })
  }

  // ── Vault notes ───────────────────────────────────────────────────────────
  for (const n of useVaultStore.getState().notes) {
    if (n.noteType === 'folder') continue
    items.push({ type: 'note', label: n.title, href: n.title })
  }

  // ── URL passthrough ───────────────────────────────────────────────────────
  if (/^https?:\/\/\S+/.test(query)) {
    items.push({ type: 'url', label: query, href: query })
  }

  if (!query) return items.slice(0, 30)

  const q = query.toLowerCase()
  return items
    .filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.href.toLowerCase().includes(q),
    )
    .slice(0, 30)
}

export const WikiLinkPicker = Extension.create({
  name: 'wikiLinkPicker',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: new PluginKey('wikiLinkPicker'),
        editor: this.editor,
        char: '[[',
        allowSpaces: true,
        startOfLine: false,

        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor
          range: Range
          props: WikiLinkItem
        }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent(`[[${props.href}]]`)
            .run()
        },

        items: ({ query }: { query: string }) => getWikiLinkItems(query),

        render: () => {
          let renderer: ReactRenderer<WikiLinkMenuHandle> | null = null

          return {
            onStart: (props: object) => {
              renderer = new ReactRenderer<WikiLinkMenuHandle>(WikiLinkMenu, {
                props,
                editor: this.editor,
              })
              document.body.appendChild(renderer.element)
            },
            onUpdate: (props: object) => {
              renderer?.updateProps(props)
            },
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
              if (event.key === 'Escape') {
                renderer?.element.remove()
                renderer?.destroy()
                renderer = null
                return true
              }
              if (!renderer?.ref) return false
              return renderer.ref.onKeyDown(event)
            },
            onExit: () => {
              renderer?.element.remove()
              renderer?.destroy()
              renderer = null
            },
          }
        },
      }),
    ]
  },
})
