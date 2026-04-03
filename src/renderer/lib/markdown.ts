// src/renderer/lib/markdown.ts
import { basename, dirname } from 'path'

export function extractTitle(markdown: string, filePath?: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  if (filePath) return basename(filePath, '.md')
  return ''
}

export function extractWikiLinks(markdown: string): string[] {
  const matches = [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
  return [...new Set(matches.map(m => m[1].trim()))]
}

export function folderFromPath(notePath: string): string {
  const dir = dirname(notePath)
  return dir === '.' ? '' : dir
}
