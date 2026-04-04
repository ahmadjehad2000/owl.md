// src/renderer/components/editor/extensions/Callout.ts
import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRendererProps } from '@tiptap/core'
import styles from '../CalloutView.module.css'

export type CalloutType = 'info' | 'warning' | 'tip' | 'danger'

const VALID_TYPES: CalloutType[] = ['info', 'warning', 'tip', 'danger']

const ICONS: Record<CalloutType, string> = {
  info:    'ℹ',
  warning: '⚠',
  tip:     '💡',
  danger:  '🚫',
}

const LABELS: Record<CalloutType, string> = {
  info:    'Info',
  warning: 'Warning',
  tip:     'Tip',
  danger:  'Danger',
}

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

  // Pure DOM node view — no ReactNodeViewRenderer, no flushSync
  addNodeView() {
    return ({ node }: NodeViewRendererProps) => {
      const type: CalloutType = VALID_TYPES.includes(node.attrs.type as CalloutType)
        ? (node.attrs.type as CalloutType)
        : 'info'

      let collapsed = false

      const dom = document.createElement('div')
      dom.className = `${styles.callout} ${styles[type]}`
      dom.setAttribute('data-callout', type)

      const header = document.createElement('div')
      header.className = styles.header
      header.contentEditable = 'false'

      const icon = document.createElement('span')
      icon.className = styles.icon
      icon.textContent = ICONS[type]

      const label = document.createElement('span')
      label.className = styles.label
      label.textContent = LABELS[type]

      const toggle = document.createElement('span')
      toggle.className = styles.toggle
      toggle.textContent = '▼'

      header.append(icon, label, toggle)

      const contentDOM = document.createElement('div')
      contentDOM.className = styles.content

      header.addEventListener('click', () => {
        collapsed = !collapsed
        dom.classList.toggle(styles.collapsed, collapsed)
        contentDOM.style.display = collapsed ? 'none' : ''
        toggle.textContent = collapsed ? '▶' : '▼'
      })

      dom.append(header, contentDOM)

      return { dom, contentDOM }
    }
  },
})
