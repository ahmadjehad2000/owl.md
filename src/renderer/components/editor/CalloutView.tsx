// src/renderer/components/editor/CalloutView.tsx
import React, { useState } from 'react'
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
  const [collapsed, setCollapsed] = useState(false)

  return (
    <NodeViewWrapper>
      <div className={`${styles.callout} ${styles[type]} ${collapsed ? styles.collapsed : ''}`} data-callout={type}>
        <div
          className={styles.header}
          contentEditable={false}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Click to expand' : 'Click to collapse'}
        >
          <span className={styles.icon}>{ICONS[type]}</span>
          <span className={styles.label}>{LABELS[type]}</span>
          <span className={styles.toggle}>{collapsed ? '▶' : '▼'}</span>
        </div>
        {!collapsed && <NodeViewContent className={styles.content} />}
      </div>
    </NodeViewWrapper>
  )
}
