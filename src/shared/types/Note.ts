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

export interface VaultConfig {
  name: string
  path: string
  createdAt: number
  schemaVersion: number
}
