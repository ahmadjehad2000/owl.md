// src/renderer/lib/markdown.ts

export function extractTitle(markdown: string, filePath?: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  if (filePath) {
    const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
    return base.endsWith('.md') ? base.slice(0, -3) : base
  }
  return ''
}

export function extractWikiLinks(markdown: string): string[] {
  const matches = [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
  return [...new Set(matches.map(m => m[1].trim()))]
}

export function folderFromPath(notePath: string): string {
  const normalized = notePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return ''
  const dir = normalized.slice(0, lastSlash)
  return dir === '' ? '' : dir
}

// ─── Frontmatter ────────────────────────────────────────────────────────────

export type FrontmatterValue = string | number | boolean | string[]
export interface Frontmatter { [key: string]: FrontmatterValue }

export function parseFrontmatter(markdown: string): { frontmatter: Frontmatter; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/)
  if (!match) return { frontmatter: {}, body: markdown }
  return { frontmatter: parseYamlSubset(match[1]), body: match[2] }
}

function parseYamlSubset(yaml: string): Frontmatter {
  const result: Frontmatter = {}
  for (const line of yaml.split('\n')) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    const raw = line.slice(colon + 1).trim()
    if (!key) continue
    result[key] = coerceYamlValue(raw)
  }
  return result
}

function coerceYamlValue(raw: string): FrontmatterValue {
  if (raw.startsWith('[') && raw.endsWith(']'))
    return raw.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
  if (raw === 'true')  return true
  if (raw === 'false') return false
  const n = Number(raw)
  if (!Number.isNaN(n) && raw !== '' && /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw) && !/^-?0\d/.test(raw)) return n
  return raw
}

export function serializeFrontmatter(frontmatter: Frontmatter, body: string): string {
  const keys = Object.keys(frontmatter)
  if (keys.length === 0) return body
  const yaml = keys
    .map(k => {
      const v = frontmatter[k]
      return Array.isArray(v) ? `${k}: [${v.join(', ')}]` : `${k}: ${v}`
    })
    .join('\n')
  return `---\n${yaml}\n---\n${body}`
}

// ─── Outline ─────────────────────────────────────────────────────────────────

export interface Heading { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; pos: number }

export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  let inFence = false
  let pos = 0
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence
    if (!inFence) {
      const m = line.match(/^(#{1,6})\s+(.+)/)
      if (m) headings.push({ level: m[1].length as Heading['level'], text: m[2].trim(), pos })
    }
    pos++
  }
  return headings
}
