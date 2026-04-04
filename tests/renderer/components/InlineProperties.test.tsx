// tests/renderer/components/InlineProperties.test.tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { InlineProperties } from '../../../src/renderer/components/editor/InlineProperties'
import type { Frontmatter } from '../../../src/renderer/lib/markdown'

const noop = (): void => {}

test('renders frontmatter keys when expanded', () => {
  const fm: Frontmatter = { status: 'draft', priority: 2 }
  render(<InlineProperties frontmatter={fm} onChange={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /properties/i }))
  expect(screen.getByText('status')).toBeInTheDocument()
  expect(screen.getByText('priority')).toBeInTheDocument()
})

test('is collapsed by default', () => {
  const fm: Frontmatter = { status: 'draft' }
  render(<InlineProperties frontmatter={fm} onChange={noop} />)
  expect(screen.queryByText('status')).toBeNull()
})

test('calls onChange when value is edited', () => {
  const fn = vi.fn()
  const fm: Frontmatter = { title: 'Hello' }
  render(<InlineProperties frontmatter={fm} onChange={fn} />)
  fireEvent.click(screen.getByRole('button', { name: /properties/i }))
  const input = screen.getByDisplayValue('Hello')
  fireEvent.change(input, { target: { value: 'World' } })
  fireEvent.blur(input)
  expect(fn).toHaveBeenCalledWith(expect.objectContaining({ title: 'World' }))
})

test('add new property via Enter key', () => {
  const fn = vi.fn()
  render(<InlineProperties frontmatter={{}} onChange={fn} />)
  fireEvent.click(screen.getByRole('button', { name: /properties/i }))
  const newKeyInput = screen.getByPlaceholderText('Add property…')
  fireEvent.change(newKeyInput, { target: { value: 'rating' } })
  fireEvent.keyDown(newKeyInput, { key: 'Enter' })
  expect(fn).toHaveBeenCalledWith({ rating: '' })
})
