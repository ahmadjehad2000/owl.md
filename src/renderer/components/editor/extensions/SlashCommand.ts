// src/renderer/components/editor/extensions/SlashCommand.ts
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import type { Editor, Range } from '@tiptap/core'
import type { CalloutType } from './Callout'
import { SlashMenu } from '../SlashMenu'
import type { SlashMenuHandle } from '../SlashMenu'

export interface SlashItem {
  title: string
  description: string
  icon: string
  command: (opts: { editor: Editor; range: Range }) => void
}

export function getSlashItems(query: string): SlashItem[] {
  const all: SlashItem[] = [
    {
      title: 'Heading 1', description: 'Large section heading', icon: 'H1',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      title: 'Heading 2', description: 'Medium section heading', icon: 'H2',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      title: 'Heading 3', description: 'Small section heading', icon: 'H3',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
    },
    {
      title: 'Bullet List', description: 'Unordered list', icon: '•',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: 'Numbered List', description: 'Ordered list', icon: '1.',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: 'Code Block', description: 'Syntax-highlighted code', icon: '</>',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCodeBlock().run(),
    },
    {
      title: 'Blockquote', description: 'Indented quote', icon: '"',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setBlockquote().run(),
    },
    {
      title: 'Divider', description: 'Horizontal rule', icon: '—',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      title: 'Callout Info', description: 'Callout block — informational', icon: 'ℹ',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertCallout('info' as CalloutType).run(),
    },
    {
      title: 'Callout Warning', description: 'Callout block — warning', icon: '⚠',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertCallout('warning' as CalloutType).run(),
    },
    {
      title: 'Callout Tip', description: 'Callout block — tip', icon: '💡',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertCallout('tip' as CalloutType).run(),
    },
    {
      title: 'Callout Danger', description: 'Callout block — danger', icon: '🚫',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertCallout('danger' as CalloutType).run(),
    },
    {
      title: 'Table', description: 'Insert a 3×3 table', icon: '⊞',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: 'Task List', description: 'Checklist with checkboxes', icon: '☑',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: 'Math Inline', description: 'Inline LaTeX formula', icon: '∑',
      command: ({ editor, range }) => {
        const formula = prompt('Enter inline formula (e.g. x^2):') ?? ''
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: 'mathInline', attrs: { formula } }).run()
      },
    },
    {
      title: 'Math Block', description: 'Display LaTeX equation', icon: '∫',
      command: ({ editor, range }) => {
        const formula = prompt('Enter formula (e.g. \\int_0^\\infty f(x)dx):') ?? ''
        editor.chain().focus().deleteRange(range).insertMathBlock(formula).run()
      },
    },
  ]

  if (!query) return all
  const q = query.toLowerCase()
  return all.filter(
    item =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q),
  )
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,

        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range })
        },

        items: ({ query }: { query: string }) => getSlashItems(query),

        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle> | null = null

          return {
            onStart: (props: object) => {
              renderer = new ReactRenderer<SlashMenuHandle>(SlashMenu, {
                props,
                editor: this.editor,
              })
              document.body.appendChild(renderer.element)
            },
            onUpdate: (props: object) => {
              renderer?.updateProps(props)
            },
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
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
