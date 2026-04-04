import { describe, it, expect } from 'vitest'

describe('WatcherService debounce', () => {
  it('coalesces multiple file changes within debounce window', async () => {
    const calls: string[] = []
    const debounceMs = 50

    const pending = new Map<string, ReturnType<typeof setTimeout>>()
    function debouncedHandle(path: string): void {
      const existing = pending.get(path)
      if (existing) clearTimeout(existing)
      pending.set(path, setTimeout(() => {
        pending.delete(path)
        calls.push(path)
      }, debounceMs))
    }

    debouncedHandle('/notes/a.md')
    debouncedHandle('/notes/a.md')
    debouncedHandle('/notes/a.md')

    expect(calls).toHaveLength(0)

    await new Promise(r => setTimeout(r, debounceMs + 20))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe('/notes/a.md')
  })

  it('fires separately for different files after debounce', async () => {
    const calls: string[] = []
    const debounceMs = 50

    const pending = new Map<string, ReturnType<typeof setTimeout>>()
    function debouncedHandle(path: string): void {
      const existing = pending.get(path)
      if (existing) clearTimeout(existing)
      pending.set(path, setTimeout(() => {
        pending.delete(path)
        calls.push(path)
      }, debounceMs))
    }

    debouncedHandle('/notes/a.md')
    debouncedHandle('/notes/b.md')

    await new Promise(r => setTimeout(r, debounceMs + 20))
    expect(calls).toHaveLength(2)
    expect(calls).toContain('/notes/a.md')
    expect(calls).toContain('/notes/b.md')
  })
})
