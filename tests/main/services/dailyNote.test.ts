// tests/main/services/dailyNote.test.ts
import { describe, it, expect } from 'vitest'

describe('daily note date key', () => {
  const todayKey = (d: Date): string => {
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  it('formats a known date correctly', () => {
    expect(todayKey(new Date(2026, 3, 4))).toBe('2026-04-04')
  })

  it('output matches YYYY-MM-DD pattern', () => {
    expect(todayKey(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
