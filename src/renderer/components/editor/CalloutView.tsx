// src/renderer/components/editor/CalloutView.tsx
import React from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type { CalloutType } from './extensions/Callout'
import styles from './CalloutView.module.css'

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

export function CalloutView({ node }: NodeViewProps): JSX.Element {
  const type = node.attrs.type as CalloutType
  return (
    <NodeViewWrapper>
      <div className={`${styles.callout} ${styles[type]}`} data-callout={type}>
        <div className={styles.header} contentEditable={false}>
          <span className={styles.icon}>{ICONS[type]}</span>
          <span className={styles.label}>{LABELS[type]}</span>
        </div>
        <NodeViewContent className={styles.content} />
      </div>
    </NodeViewWrapper>
  )
}
