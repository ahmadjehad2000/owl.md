// src/renderer/components/editor/NoteEditor.tsx
import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/WikiLink'
import { useEditorStore } from '../../stores/editorStore'
import styles from './NoteEditor.module.css'

const AUTOSAVE_MS = 1500

export function NoteEditor(): JSX.Element {
  const note = useEditorStore(s => s.note)
  const markdown = useEditorStore(s => s.markdown)
  const isDirty = useEditorStore(s => s.isDirty)
  const saveStatus = useEditorStore(s => s.saveStatus)
  const setMarkdown = useEditorStore(s => s.setMarkdown)
  const save = useEditorStore(s => s.save)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      WikiLink,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
    ],
    content: markdown,
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown.getMarkdown() as string
      setMarkdown(md)
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(() => save(), AUTOSAVE_MS)
    },
    editorProps: {
      handleClick: (_view, _pos, event) => {
        const target = (event.target as HTMLElement).closest('[data-target]')
        if (target) {
          const linkTarget = target.getAttribute('data-target')
          if (linkTarget) {
            window.dispatchEvent(new CustomEvent('owl:open-wiki-link', { detail: { target: linkTarget } }))
          }
          return true
        }
        return false
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.storage.markdown?.getMarkdown() as string | undefined
    if (current !== markdown) editor.commands.setContent(markdown)
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
        save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }, [])

  if (!note) return <div className={styles.empty}>Open a note or create a new one</div>

  const statusLabel =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? '✓ Saved' :
    saveStatus === 'error'  ? '✗ Save failed' :
    isDirty ? '●' : ''

  const statusClass = saveStatus !== 'idle' ? styles[saveStatus] : isDirty ? styles.dirty : ''

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={`${styles.saveStatus} ${statusClass}`}>{statusLabel}</span>
      </div>
      <div className={styles.editorWrap}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
