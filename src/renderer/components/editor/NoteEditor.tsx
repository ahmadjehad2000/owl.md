// src/renderer/components/editor/NoteEditor.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/WikiLink'
import { Callout } from './extensions/Callout'
import { SlashCommand } from './extensions/SlashCommand'
import { TabBar } from './TabBar'
import { useEditorStore } from '../../stores/editorStore'
import { useTabStore } from '../../stores/tabStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { extractHeadings } from '../../lib/markdown'
import { ContextMenu, type ContextMenuEntry } from '../ui/ContextMenu'
import styles from './NoteEditor.module.css'

const AUTOSAVE_MS = 1500

export function NoteEditor(): JSX.Element {
  const note        = useEditorStore(s => s.note)
  const markdown    = useEditorStore(s => s.markdown)
  const isDirty     = useEditorStore(s => s.isDirty)
  const saveStatus  = useEditorStore(s => s.saveStatus)
  const setMarkdown = useEditorStore(s => s.setMarkdown)
  const save        = useEditorStore(s => s.save)
  const restoreTab  = useEditorStore(s => s.restoreTab)
  const unloadNote  = useEditorStore(s => s.unloadNote)
  const loadNote    = useEditorStore(s => s.loadNote)
  const setHeadings = useRightPanelStore(s => s.setHeadings)
  const activeTabId = useTabStore(s => s.activeTabId)
  const notes       = useVaultStore(s => s.notes)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const parentFolder = note?.parentId
    ? notes.find(n => n.id === note.parentId) ?? null
    : null

  // When the active tab changes: restore from cache or load from disk
  useEffect(() => {
    if (activeTabId === null) { unloadNote(); return }
    const tab = useTabStore.getState().tabs.find(t => t.id === activeTabId)
    if (!tab) return
    if (tab.markdown !== null && tab.frontmatter !== null) {
      const allNotes = useVaultStore.getState().notes
      const n = allNotes.find(n => n.id === tab.noteId) ?? null
      restoreTab(tab.markdown, tab.frontmatter, tab.isDirty, n)
    } else {
      loadNote(tab.noteId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])

  const editor = useEditor({
    extensions: [
      StarterKit,
      WikiLink,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Callout,
      SlashCommand,
    ],
    content: markdown,
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown.getMarkdown() as string
      setMarkdown(md)
      setHeadings(extractHeadings(md))
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
    setHeadings(extractHeadings(markdown))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

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

  const statusLabel =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? '✓ Saved' :
    saveStatus === 'error'  ? '✗ Save failed' :
    isDirty ? '●' : ''

  const statusClass = saveStatus !== 'idle' ? styles[saveStatus] : isDirty ? styles.dirty : ''

  // Editor context menu
  const [editorMenuOpen,  setEditorMenuOpen]  = useState(false)
  const [editorMenuPos,   setEditorMenuPos]   = useState({ x: 0, y: 0 })
  const [editorMenuItems, setEditorMenuItems] = useState<ContextMenuEntry[]>([])

  const handleEditorContextMenu = useCallback((e: React.MouseEvent) => {
    if (!editor) return
    e.preventDefault()
    const { from, to } = editor.state.selection
    const hasSelection = from !== to
    const selectedText = hasSelection
      ? editor.state.doc.textBetween(from, to, ' ')
      : ''

    const items: ContextMenuEntry[] = []

    if (hasSelection) {
      items.push({
        label: 'Turn into wiki-link',
        icon: '🔗',
        onClick: () => {
          editor.chain().focus().deleteSelection()
            .insertContent(`[[${selectedText}]]`).run()
        },
      })
    }

    items.push({
      label: 'Insert callout',
      icon: '📣',
      submenu: [
        { label: 'Info',    icon: 'ℹ️',  onClick: () => editor.chain().focus().insertCallout('info').run() },
        { label: 'Warning', icon: '⚠️',  onClick: () => editor.chain().focus().insertCallout('warning').run() },
        { label: 'Tip',     icon: '💡',  onClick: () => editor.chain().focus().insertCallout('tip').run() },
        { label: 'Danger',  icon: '🚨',  onClick: () => editor.chain().focus().insertCallout('danger').run() },
      ],
    })

    if (items.length > 0) items.push({ separator: true })

    items.push(
      { label: 'Cut',   shortcut: 'Ctrl+X', onClick: () => document.execCommand('cut') },
      { label: 'Copy',  shortcut: 'Ctrl+C', onClick: () => document.execCommand('copy') },
      { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => document.execCommand('paste') },
    )

    setEditorMenuPos({ x: e.clientX, y: e.clientY })
    setEditorMenuItems(items)
    setEditorMenuOpen(true)
  }, [editor])

  return (
    <div className={styles.root}>
      <TabBar />
      {note ? (
        <>
          <div className={styles.toolbar}>
            <span className={styles.breadcrumb}>
              {parentFolder
                ? <><span className={styles.breadcrumbFolder}>{parentFolder.title}</span><span className={styles.breadcrumbSep}>/</span><span className={styles.breadcrumbNote}>{note.title}</span></>
                : <span className={styles.breadcrumbNote}>{note.title}</span>
              }
            </span>
            <span className={`${styles.saveStatus} ${statusClass}`}>{statusLabel}</span>
          </div>
          <div className={styles.editorWrap} onContextMenu={handleEditorContextMenu}>
            <EditorContent editor={editor} />
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🦉</div>
          <div className={styles.emptyTitle}>No note open</div>
          <div className={styles.emptyDesc}>Select a note from the sidebar or press ⌘K to create one</div>
        </div>
      )}
      <ContextMenu
        isOpen={editorMenuOpen}
        position={editorMenuPos}
        items={editorMenuItems}
        onClose={() => setEditorMenuOpen(false)}
      />
    </div>
  )
}
