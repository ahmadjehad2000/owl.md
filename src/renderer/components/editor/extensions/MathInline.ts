// src/renderer/components/editor/extensions/MathInline.ts
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import katex from 'katex'

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return { formula: { default: '' } }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-math-inline]',
        getAttrs: (el) => ({ formula: (el as HTMLElement).getAttribute('data-math-inline') ?? '' }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': HTMLAttributes.formula })]
  },

  // tiptap-markdown reads storage.markdown.serialize to serialize this node back to $formula$
  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { formula: string } }) {
          state.write(`$${node.attrs.formula}$`)
        },
      },
    }
  },

  addNodeView() {
    return ({ node, getPos, editor }: {
      node: { attrs: { formula: string } }
      getPos: () => number | undefined
      editor: import('@tiptap/core').Editor
    }) => {
      const dom = document.createElement('span')
      dom.className = 'math-inline'
      dom.contentEditable = 'false'

      const renderFormula = (formula: string): void => {
        // katex.render() writes math DOM nodes directly into the container element.
        dom.textContent = ''
        try {
          katex.render(formula, dom, { throwOnError: false, displayMode: false })
        } catch {
          dom.textContent = `$${formula}$`
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

  addInputRules() {
    return [
      new InputRule({
        find: /\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          const formula = match[1]
          if (!formula) return null
          const node = state.schema.nodes['mathInline'].create({ formula })
          state.tr.replaceWith(range.from, range.to, node)
          return null
        },
      }),
    ]
  },
})
