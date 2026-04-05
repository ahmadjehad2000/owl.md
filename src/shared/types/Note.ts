// src/shared/types/Note.ts

export interface Note {
  id: string
  path: string              // vault-relative, e.g. "Research/paper.md". Empty for folders.
  title: string
  contentHash: string
  createdAt: number         // unix ms
  updatedAt: number
  parentId: string | null
  folderPath: string
  noteType: 'note' | 'daily' | 'canvas' | 'mindmap' | 'folder'
  orderIndex: number
  pinned: boolean
  deletedAt: number | null
}

export interface NoteSlim {
  id: string
  path: string
  title: string
  parentId: string | null
  folderPath: string
  noteType: 'note' | 'daily' | 'canvas' | 'mindmap' | 'folder'
  orderIndex: number
  pinned: boolean
  deletedAt: number | null
}

export interface NoteContent {
  note: Note
  markdown: string
}

export interface BacklinkResult {
  sourceNoteId: string
  sourceTitle: string
  sourcePath: string
  linkText: string
}

export interface SearchResult {
  id: string
  path: string
  title: string
  excerpt: string
}

export interface GraphNode {
  id: string
  title: string
  noteType: string
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface CanvasCardData {
  id: string
  type: 'text' | 'note'
  x: number
  y: number
  w: number
  h: number
  text?: string        // for type='text'
  noteId?: string      // for type='note'
  noteTitle?: string   // cached title for type='note'
}

export interface CanvasConnection {
  id: string
  from: string
  to: string
}

export interface CanvasData {
  cards: CanvasCardData[]
  connections: CanvasConnection[]
}

export interface VaultConfig {
  name: string
  path: string
  createdAt: number
  schemaVersion: number
}
