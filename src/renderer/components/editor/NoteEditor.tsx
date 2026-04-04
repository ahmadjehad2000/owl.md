// src/renderer/components/editor/NoteEditor.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/WikiLink'
import { WikiLinkPicker } from './extensions/WikiLinkPicker'
import { FoldHeadings } from './extensions/FoldHeadings'
import { NoteEmbed } from './extensions/NoteEmbed'
import { HoverPreview } from './HoverPreview'
import { useHoverPreviewStore } from '../../stores/hoverPreviewStore'
import { Callout } from './extensions/Callout'
import { SlashCommand } from './extensions/SlashCommand'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { MathInline } from './extensions/MathInline'
import { MathBlock } from './extensions/MathBlock'
import { SearchHighlight } from './extensions/SearchHighlight'
import Image from '@tiptap/extension-image'
import { ImageUpload } from './extensions/ImageUpload'
import { injectMathTags } from '../../lib/math'
import 'katex/dist/katex.min.css'
import { FindBar } from './FindBar'
import { ipc } from '../../lib/ipc'
import { TabBar } from './TabBar'
import { useEditorStore } from '../../stores/editorStore'
import { useTabStore } from '../../stores/tabStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { extractHeadings } from '../../lib/markdown'
import { ContextMenu, type ContextMenuEntry } from '../ui/ContextMenu'
import styles from './NoteEditor.module.css'

const AUTOSAVE_MS = 2000   // fires 2 s after last keystroke (idle debounce)
const HOVER_SHOW_DELAY_MS = 400
const HOVER_HIDE_DELAY_MS = 200
const MIN_CARD_WIDTH = 400
const MAX_CARD_WIDTH = 1400
const DEFAULT_CARD_WIDTH = 740

export function NoteEditor(): JSX.Element {
  const note        = useEditorStore(s => s.note)
  const markdown    = useEditorStore(s => s.markdown)
  const isDirty     = useEditorStore(s => s.isDirty)
  const saveStatus  = useEditorStore(s => s.saveStatus)
  const setMarkdown       = useEditorStore(s => s.setMarkdown)
  const save              = useEditorStore(s => s.save)
  const isReadingView     = useEditorStore(s => s.isReadingView)
  const toggleReadingView = useEditorStore(s => s.toggleReadingView)
  const restoreTab  = useEditorStore(s => s.restoreTab)
  const unloadNote  = useEditorStore(s => s.unloadNote)
  const loadNote    = useEditorStore(s => s.loadNote)
  const setHeadings = useRightPanelStore(s => s.setHeadings)
  const activeTabId = useTabStore(s => s.activeTabId)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showPreview     = useHoverPreviewStore(s => s.showPreview)
  const setHoverContent = useHoverPreviewStore(s => s.setContent)
  const hidePreview     = useHoverPreviewStore(s => s.hidePreview)
  const hoverShowTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverHideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeHoverNote = useRef<string | null>(null)

  // Source mode toggle
  const [sourceMode, setSourceMode] = useState(false)
  const sourceRef = useRef<HTMLTextAreaElement>(null)

  // Find bar
  const [findBarOpen, setFindBarOpen] = useState(false)

  // Font zoom (base font size for the editor card)
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('owl:font-size')
    return saved ? Math.max(11, Math.min(26, Number(saved))) : 15
  })
  const zoomIn  = useCallback(() => setFontSize(s => { const n = Math.min(26, s + 1); localStorage.setItem('owl:font-size', String(n)); return n }), [])
  const zoomOut = useCallback(() => setFontSize(s => { const n = Math.max(11, s - 1); localStorage.setItem('owl:font-size', String(n)); return n }), [])
  const zoomReset = useCallback(() => { setFontSize(15); localStorage.setItem('owl:font-size', '15') }, [])

  // Card width resize
  const [cardWidth, setCardWidth] = useState<number>(() => {
    const saved = localStorage.getItem('owl:card-width')
    return saved ? Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, Number(saved))) : DEFAULT_CARD_WIDTH
  })
  const dragSideRef = useRef<'left' | 'right' | null>(null)
  const dragStartXRef = useRef(0)
  const dragStartWRef = useRef(0)

  const onHandleMouseDown = useCallback((side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault()
    dragSideRef.current  = side
    dragStartXRef.current = e.clientX
    dragStartWRef.current = cardWidth
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [cardWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragSideRef.current) return
      const dx = e.clientX - dragStartXRef.current
      // Both handles grow the card outward: right handle → +dx, left handle → -dx
      const delta = dragSideRef.current === 'right' ? dx : -dx
      const next = Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, dragStartWRef.current + delta * 2))
      setCardWidth(next)
      localStorage.setItem('owl:card-width', String(next))
    }
    const onUp = (): void => {
      dragSideRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

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
      WikiLinkPicker,
      FoldHeadings,
      NoteEmbed,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
      Callout,
      SlashCommand,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      MathInline,
      MathBlock,
      SearchHighlight,
      Image.configure({ inline: false, allowBase64: false }),
      ImageUpload,
    ],
    content: markdown,
    editable: !isReadingView,
    onUpdate: ({ editor }) => {
      if (isReadingView) return
      const md = editor.storage.markdown.getMarkdown() as string
      setMarkdown(md)
      setHeadings(extractHeadings(md))
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(() => save(), AUTOSAVE_MS)
    },
    editorProps: {
      attributes: {
        spellcheck: 'true',
      },
      handleClick: (_view, _pos, event) => {
        const el = (event.target as HTMLElement).closest('[data-href]')
        if (el) {
          const href = el.getAttribute('data-href')
          if (href) {
            window.dispatchEvent(new CustomEvent('owl:open-wiki-link', { detail: { href } }))
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
    const needsUpdate = current !== markdown
    // Defer setContent so it runs after React finishes reconciling the note
    // switch — calling it synchronously triggers Tiptap's internal flushSync
    // while React is still in a lifecycle, producing a console warning.
    if (needsUpdate) {
      queueMicrotask(() => {
        if (!editor.isDestroyed) editor.commands.setContent(injectMathTags(markdown))
      })
    }
    setHeadings(extractHeadings(markdown))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!isReadingView)
  }, [editor, isReadingView])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (isReadingView) return
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
        save()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setFindBarOpen(open => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

useEffect(() => {
    if (!editor) return
    const onInsertText = (e: Event): void => {
      const text = (e as CustomEvent<string>).detail
      editor.chain().focus().insertContent(text).run()
    }
    window.addEventListener('owl:insert-text', onInsertText)
    return () => window.removeEventListener('owl:insert-text', onInsertText)
  }, [editor])

  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }, [])

  useEffect(() => {
    const onBefore = (): void => document.body.classList.add('printing')
    const onAfter  = (): void => document.body.classList.remove('printing')
    window.addEventListener('owl:before-print', onBefore)
    window.addEventListener('owl:after-print',  onAfter)
    return () => {
      window.removeEventListener('owl:before-print', onBefore)
      window.removeEventListener('owl:after-print',  onAfter)
    }
  }, [])

  // When switching to source mode, focus the textarea
  useEffect(() => {
    if (sourceMode && sourceRef.current) sourceRef.current.focus()
  }, [sourceMode])

  const handleMouseOver = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.wiki-link') as HTMLElement | null
    if (!target) return
    const linkTitle = target.getAttribute('data-href')
    if (!linkTitle) return
    if (hoverHideTimer.current) { clearTimeout(hoverHideTimer.current); hoverHideTimer.current = null }
    if (activeHoverNote.current === linkTitle && useHoverPreviewStore.getState().visible) return
    if (hoverShowTimer.current) clearTimeout(hoverShowTimer.current)
    hoverShowTimer.current = setTimeout(async () => {
      const rect = target.getBoundingClientRect()
      showPreview(linkTitle, rect.left, rect.bottom)
      activeHoverNote.current = linkTitle
      const notes = useVaultStore.getState().notes
      const found = notes.find(n => n.title.toLowerCase() === linkTitle.toLowerCase())
      if (!found) { setHoverContent(''); return }
      try {
        const { markdown: raw } = await ipc.notes.read(found.id)
        if (activeHoverNote.current === linkTitle) setHoverContent(raw)
      } catch {
        if (activeHoverNote.current === linkTitle) setHoverContent('')
      }
    }, HOVER_SHOW_DELAY_MS)
  }, [showPreview, setHoverContent])

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest('.wiki-link')) return
    if (hoverShowTimer.current) { clearTimeout(hoverShowTimer.current); hoverShowTimer.current = null }
    hoverHideTimer.current = setTimeout(() => {
      hidePreview()
      activeHoverNote.current = null
    }, HOVER_HIDE_DELAY_MS)
  }, [hidePreview])

  useEffect(() => () => {
    if (hoverShowTimer.current) clearTimeout(hoverShowTimer.current)
    if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current)
  }, [])

  const statusLabel =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? '✓ Saved' :
    saveStatus === 'error'  ? '✗ Save failed' :
    isDirty ? '●' : ''

  const statusClass = saveStatus !== 'idle' ? styles[saveStatus] : isDirty ? styles.dirty : ''

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0
  const charCount = markdown.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '').length


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
      {
        label: 'Cut', shortcut: 'Ctrl+X',
        onClick: async () => {
          const sel = window.getSelection()?.toString() ?? ''
          if (sel) {
            await navigator.clipboard.writeText(sel)
            editor.chain().focus().deleteSelection().run()
          }
        },
      },
      {
        label: 'Copy', shortcut: 'Ctrl+C',
        onClick: async () => {
          const sel = window.getSelection()?.toString() ?? ''
          if (sel) await navigator.clipboard.writeText(sel)
        },
      },
      {
        label: 'Paste', shortcut: 'Ctrl+V',
        onClick: async () => {
          const text = await navigator.clipboard.readText()
          if (text) editor.chain().focus().insertContent(text).run()
        },
      },
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
          {/* Toolbar */}
          <div className={styles.titleBar}>
            <div className={styles.titleActions}>
              {isReadingView && <span className={styles.readingBadge}>Reading</span>}
              <div className={styles.zoomGroup}>
                <button className={styles.zoomBtn} onClick={zoomOut} title="Zoom out (decrease font size)" disabled={fontSize <= 11}>−</button>
                <button className={styles.zoomLabel} onClick={zoomReset} title="Reset font size">{fontSize}px</button>
                <button className={styles.zoomBtn} onClick={zoomIn}  title="Zoom in (increase font size)"  disabled={fontSize >= 26}>+</button>
              </div>
              <button
                className={`${styles.sourceToggle} ${sourceMode ? styles.sourceActive : ''}`}
                onClick={() => setSourceMode(m => !m)}
                title={sourceMode ? 'Switch to preview' : 'Switch to markdown source'}
              >
                {sourceMode ? '◉ Source' : '◎ Source'}
              </button>
              {note && (
                <button
                  className={styles.sourceToggle}
                  onClick={() => void ipc.export.pdf(note.title)}
                  title="Export note as PDF"
                >
                  ↓ PDF
                </button>
              )}
              <span className={styles.wordCount} title={`${charCount} characters`}>{wordCount} words</span>
              <span className={`${styles.saveStatus} ${statusClass}`}>{statusLabel}</span>
              <button
                className={`${styles.sourceToggle} ${isReadingView ? styles.sourceActive : ''}`}
                onClick={toggleReadingView}
                title={isReadingView ? 'Switch to edit mode' : 'Reading view'}
              >
                {isReadingView ? '✏️' : '📖'}
              </button>
            </div>
          </div>

          {/* Editor / source pane */}
          <div className={styles.editorWrap} onContextMenu={handleEditorContextMenu} onMouseOver={handleMouseOver} onMouseOut={handleMouseLeave} style={{ position: 'relative' }}>
            {findBarOpen && !sourceMode && (
              <FindBar editor={editor} onClose={() => setFindBarOpen(false)} />
            )}
            <div className={styles.cardRow} style={{ maxWidth: cardWidth }}>
              <div
                className={styles.resizeHandle}
                onMouseDown={onHandleMouseDown('left')}
                title="Drag to resize"
              />
              <div className={styles.cardContent} style={{ fontSize }}>
                {sourceMode ? (
                  <textarea
                    ref={sourceRef}
                    className={styles.sourceArea}
                    value={markdown}
                    onChange={e => {
                      setMarkdown(e.target.value)
                      setHeadings(extractHeadings(e.target.value))
                      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
                      autosaveTimer.current = setTimeout(() => save(), AUTOSAVE_MS)
                    }}
                    spellCheck={true}
                  />
                ) : (
                  <EditorContent editor={editor} />
                )}
              </div>
              <div
                className={styles.resizeHandle}
                onMouseDown={onHandleMouseDown('right')}
                title="Drag to resize"
              />
            </div>
          </div>
          <HoverPreview />
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
