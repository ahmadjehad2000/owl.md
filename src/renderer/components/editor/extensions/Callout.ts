// src/renderer/components/editor/extensions/Callout.ts
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CalloutView } from '../CalloutView'

export type CalloutType = 'info' | 'warning' | 'tip' | 'danger'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (type: CalloutType) => ReturnType
    }
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info' as CalloutType,
        parseHTML: el => (el.getAttribute('data-callout') ?? 'info') as CalloutType,
        renderHTML: attrs => ({ 'data-callout': attrs.type }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      insertCallout:
        (type: CalloutType) =>
        ({ commands, state }: { commands: { insertContent: (content: unknown) => boolean }; state: { selection: { from: number; to: number }; doc: { textBetween: (from: number, to: number, separator: string) => string } } }) => {
          const { from, to } = state.selection
          const selectedText = from !== to ? state.doc.textBetween(from, to, ' ') : ''
          return commands.insertContent({
            type: this.name,
            attrs: { type },
            content: [
              {
                type: 'paragraph',
                content: selectedText ? [{ type: 'text', text: selectedText }] : [],
              },
            ],
          })
        },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})
