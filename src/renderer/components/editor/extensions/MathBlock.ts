// src/renderer/components/editor/extensions/MathBlock.ts
import { Node, mergeAttributes } from '@tiptap/core'
import katex from 'katex'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathBlock: { insertMathBlock: (formula?: string) => ReturnType }
  }
}

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return { formula: { default: '' } }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-math-block]',
        getAttrs: (el) => ({ formula: (el as HTMLElement).getAttribute('data-math-block') ?? '' }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': HTMLAttributes.formula })]
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; ensureNewLine: () => void },
          node: { attrs: { formula: string } }
        ) {
          state.ensureNewLine()
          state.write(`$$\n${node.attrs.formula}\n$$`)
          state.ensureNewLine()
        },
      },
    }
  },

  addCommands() {
    return {
      insertMathBlock:
        (formula = '') =>
        ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) =>
          commands.insertContent({ type: 'mathBlock', attrs: { formula } }),
    }
  },

  addNodeView() {
    return ({ node, getPos, editor }: {
      node: { attrs: { formula: string } }
      getPos: () => number | undefined
      editor: import('@tiptap/core').Editor
    }) => {
      const dom = document.createElement('div')
      dom.className = 'math-block'
      dom.contentEditable = 'false'

      const renderFormula = (formula: string): void => {
        dom.textContent = ''
        try {
          katex.render(formula, dom, { throwOnError: false, displayMode: true })
        } catch {
          dom.textContent = formula
        }
      }

      renderFormula(node.attrs.formula)

      dom.addEventListener('click', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        const formula = prompt('Edit formula:', node.attrs.formula)
        if (formula !== null) {
          editor.chain().focus().command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { formula })
            return true
          }).run()
        }
      })

      return { dom }
    }
  },
})
