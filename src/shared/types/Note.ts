// src/shared/types/Note.ts

export interface Note {
  id: string
  path: string              // vault-relative, e.g. "Research/paper.md"
  title: string
  contentHash: string
  createdAt: number         // unix ms
  updatedAt: number
  parentId: string | null
  folderPath: string        // e.g. "Research"
  noteType: 'note' | 'daily' | 'canvas' | 'mindmap'
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

export interface VaultConfig {
  name: string
  path: string
  createdAt: number
  schemaVersion: number
}
