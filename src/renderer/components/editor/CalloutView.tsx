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

const VALID_TYPES: CalloutType[] = ['info', 'warning', 'tip', 'danger']

export function CalloutView({ node }: NodeViewProps): JSX.Element {
  const rawType = node.attrs.type as string
  const type: CalloutType = VALID_TYPES.includes(rawType as CalloutType) ? (rawType as CalloutType) : 'info'
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
