// src/renderer/components/editor/extensions/FoldHeadings.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export const FoldPluginKey = new PluginKey<Set<number>>('foldHeadings')

export function togglePosition(set: Set<number>, pos: number): Set<number> {
  const next = new Set(set)
  if (next.has(pos)) next.delete(pos)
  else next.add(pos)
  return next
}

export function getCollapsedPositions(s: Set<number>): Set<number> {
  return s
}

export function buildFoldDecorations(
  doc: ProseMirrorNode,
  collapsed: Set<number>
): DecorationSet {
  const decorations: Decoration[] = []
  const headings: Array<{ pos: number; level: number }> = []
  const topNodes: Array<{ pos: number; node: ProseMirrorNode }> = []

  doc.forEach((node, offset) => {
    topNodes.push({ pos: offset, node })
    if (node.type.name === 'heading') {
      headings.push({ pos: offset, level: node.attrs.level as number })
    }
  })

  for (let hi = 0; hi < headings.length; hi++) {
    const { pos, level } = headings[hi]
    const isCollapsed = collapsed.has(pos)

    decorations.push(
      Decoration.widget(
        pos + 1,
        () => {
          const btn = document.createElement('button')
          btn.className = 'fold-toggle'
          btn.setAttribute('data-fold-pos', String(pos))
          btn.setAttribute('aria-label', isCollapsed ? 'Expand section' : 'Collapse section')
          btn.textContent = isCollapsed ? '▶' : '▼'
          btn.style.cssText = [
            'position:absolute', 'left:-28px', 'top:50%', 'transform:translateY(-50%)',
            'background:none', 'border:none', 'cursor:pointer', 'font-size:10px',
            'color:rgba(255,255,255,0.3)', 'padding:2px 4px', 'border-radius:3px',
            'opacity:0', 'transition:opacity 0.15s', 'line-height:1',
          ].join(';')
          return btn
        },
        { side: -1, key: `fold-widget-${pos}` }
      )
    )

    if (!isCollapsed) continue

    const headingNodeIndex = topNodes.findIndex(n => n.pos === pos)
    if (headingNodeIndex === -1) continue

    for (let ni = headingNodeIndex + 1; ni < topNodes.length; ni++) {
      const { pos: nPos, node: nNode } = topNodes[ni]
      if (nNode.type.name === 'heading' && (nNode.attrs.level as number) <= level) break
      decorations.push(Decoration.node(nPos, nPos + nNode.nodeSize, { style: 'display:none' }, { style: 'display:none' }))
    }
  }

  return DecorationSet.create(doc, decorations)
}

const FOLD_TOGGLE_META = 'foldToggle'

export const FoldHeadings = Extension.create({
  name: 'foldHeadings',

  addProseMirrorPlugins() {
    return [
      new Plugin<Set<number>>({
        key: FoldPluginKey,
        state: {
          init: () => new Set<number>(),
          apply: (tr: Transaction, collapsed: Set<number>): Set<number> => {
            const meta = tr.getMeta(FOLD_TOGGLE_META) as number | undefined
            if (meta !== undefined) return togglePosition(collapsed, meta)
            if (tr.docChanged) {
              const next = new Set<number>()
              collapsed.forEach(pos => next.add(tr.mapping.map(pos)))
              return next
            }
            return collapsed
          },
        },
        props: {
          decorations: (state) => {
            const collapsed = FoldPluginKey.getState(state) ?? new Set<number>()
            return buildFoldDecorations(state.doc, collapsed)
          },
          handleDOMEvents: {
            click: (view, event) => {
              const btn = (event.target as HTMLElement).closest('.fold-toggle') as HTMLElement | null
              if (!btn) return false
              const posAttr = btn.getAttribute('data-fold-pos')
              if (posAttr === null) return false
              view.dispatch(view.state.tr.setMeta(FOLD_TOGGLE_META, parseInt(posAttr, 10)))
              event.preventDefault()
              return true
            },
          },
        },
      }),
    ]
  },
})
