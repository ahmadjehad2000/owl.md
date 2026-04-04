// tests/renderer/extensions/TaskList.test.ts
import { describe, it, expect } from 'vitest'
import { getSlashItems } from '../../../src/renderer/components/editor/extensions/SlashCommand'

describe('SlashCommand — task list', () => {
  it('includes a Task List entry', () => {
    const items = getSlashItems('')
    expect(items.some(i => i.title === 'Task List')).toBe(true)
  })

  it('filters task list by query "task"', () => {
    const items = getSlashItems('task')
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].title).toBe('Task List')
  })
})
