// src/renderer/components/editor/RightEditor.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/WikiLink'
import { WikiLinkPicker } from './extensions/WikiLinkPicker'
import { FoldHeadings } from './extensions/FoldHeadings'
import { Callout } from './extensions/Callout'
import { SlashCommand } from './extensions/SlashCommand'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { MathInline } from './extensions/MathInline'
import { MathBlock } from './extensions/MathBlock'
import { SearchHighlight } from './extensions/SearchHighlight'
import { injectMathTags } from '../../lib/math'
import { ipc } from '../../lib/ipc'
import { useSplitStore } from '../../stores/splitStore'
import { useTabStore } from '../../stores/tabStore'
import { parseFrontmatter, serializeFrontmatter, type Frontmatter } from '../../lib/markdown'
import { normalizeNote } from '../../stores/vaultStore'
import type { Note } from '@shared/types/Note'
import styles from './RightEditor.module.css'

const AUTOSAVE_MS = 2000

export function RightEditor(): JSX.Element | null {
  const isSplit        = useSplitStore(s => s.isSplit)
  const rightNoteId    = useSplitStore(s => s.rightNoteId)
  const closeRight     = useSplitStore(s => s.closeRight)

  // Use refs so save closure is always fresh (no stale closures)
  const stateRef = useRef<{
    note: Note | null
    markdown: string
    frontmatter: Frontmatter
    isDirty: boolean
  }>({ note: null, markdown: '', frontmatter: {}, isDirty: false })

  const [note, setNote] = useState<Note | null>(null)
  const [isCanvas, setIsCanvas] = useState(false)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async () => {
    const { note: n, markdown, frontmatter, isDirty } = stateRef.current
    if (!n || !isDirty) return
    try {
      const full = n.noteType === 'canvas' ? markdown : serializeFrontmatter(frontmatter, markdown)
      await ipc.notes.save(n.id, full)
      stateRef.current.isDirty = false
    } catch { /* best-effort */ }
  }, [])

  // Load note on ID change
  useEffect(() => {
    if (!rightNoteId) {
      setNote(null)
      setIsCanvas(false)
      stateRef.current = { note: null, markdown: '', frontmatter: {}, isDirty: false }
      return
    }

    ipc.notes.read(rightNoteId).then(({ note: raw, markdown: rawMd }) => {
      const n = normalizeNote(raw)
      const canvas = n.noteType === 'canvas'
      setIsCanvas(canvas)
      setNote(n)

      if (canvas) {
        stateRef.current = { note: n, markdown: rawMd, frontmatter: {}, isDirty: false }
        return
      }
      const { frontmatter, body } = parseFrontmatter(rawMd)
      const hasH1 = /^#[^\S\n]/.test(body.trimStart())
      const md = hasH1 ? body : `# ${n.title}\n\n${body.trimStart()}`
      stateRef.current = { note: n, markdown: md, frontmatter, isDirty: false }
    }).catch(() => {})
  }, [rightNoteId])

  // Sync content into TipTap when note changes
  useEffect(() => {
    if (!editor) return
    queueMicrotask(() => {
      if (!editor.isDestroyed) {
        editor.commands.setContent(injectMathTags(stateRef.current.markdown))
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightNoteId])

  const editor = useEditor({
    extensions: [
      StarterKit,
      WikiLink,
      WikiLinkPicker,
      FoldHeadings,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Callout,
      SlashCommand,
      TaskList,
      TaskItem.configure({ nested: true }),
      MathInline,
      MathBlock,
      SearchHighlight,
    ],
    content: '',
    editorProps: {
      attributes: { spellcheck: 'true' },
      handleClick: (_view, _pos, event) => {
        const el = (event.target as HTMLElement).closest('[data-href]')
        if (el) {
          const href = el.getAttribute('data-href')
          if (href) window.dispatchEvent(new CustomEvent('owl:open-wiki-link', { detail: { href } }))
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = ed.storage.markdown?.getMarkdown() as string
      stateRef.current.markdown = md
      stateRef.current.isDirty = true
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(save, AUTOSAVE_MS)
    },
  })

  // Force-save on unmount
  useEffect(() => () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    void save()
  }, [save])

  const openInMain = useCallback(() => {
    if (!note) return
    void (async () => {
      await save()
      useTabStore.getState().openTab(note.id, note.title)
    })()
  }, [note, save])

  if (!isSplit || !rightNoteId) return null

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>{note?.title ?? '…'}</span>
        <button className={styles.headerBtn} onClick={openInMain} title="Open as main tab">↗</button>
        <button className={styles.headerBtn} onClick={closeRight} title="Close split pane">✕</button>
      </div>

      {isCanvas ? (
        <div className={styles.canvasMsg}>
          Canvas notes can only be edited in the main pane.
          <button className={styles.openMainBtn} onClick={openInMain}>Open in main</button>
        </div>
      ) : (
        <div className={styles.editorWrap}>
          <EditorContent editor={editor} className={styles.editor} />
        </div>
      )}
    </div>
  )
}
