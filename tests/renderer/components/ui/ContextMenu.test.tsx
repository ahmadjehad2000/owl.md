import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextMenu, type ContextMenuEntry } from '@renderer/components/ui/ContextMenu'

const items: ContextMenuEntry[] = [
  { label: 'Rename', onClick: vi.fn() },
  { separator: true },
  { label: 'Delete', danger: true, onClick: vi.fn() },
]

describe('ContextMenu', () => {
  it('renders menu items when open', () => {
    render(
      <ContextMenu
        isOpen
        position={{ x: 100, y: 200 }}
        items={items}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Rename')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <ContextMenu
        isOpen={false}
        position={{ x: 0, y: 0 }}
        items={items}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByText('Rename')).not.toBeInTheDocument()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(
      <ContextMenu isOpen position={{ x: 0, y: 0 }} items={items} onClose={onClose} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls item onClick and onClose when item is clicked', () => {
    const onClose = vi.fn()
    const itemClick = vi.fn()
    const testItems: ContextMenuEntry[] = [{ label: 'Go', onClick: itemClick }]
    render(
      <ContextMenu isOpen position={{ x: 0, y: 0 }} items={testItems} onClose={onClose} />
    )
    fireEvent.click(screen.getByText('Go'))
    expect(itemClick).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('drills into submenu and back', () => {
    const subItems: ContextMenuEntry[] = [{ label: 'FolderA', onClick: vi.fn() }]
    const menuItems: ContextMenuEntry[] = [
      { label: 'Move to folder', submenu: subItems },
    ]
    render(
      <ContextMenu isOpen position={{ x: 0, y: 0 }} items={menuItems} onClose={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Move to folder'))
    expect(screen.getByText('FolderA')).toBeInTheDocument()
    fireEvent.click(screen.getByText('← Back'))
    expect(screen.queryByText('FolderA')).not.toBeInTheDocument()
    expect(screen.getByText('Move to folder')).toBeInTheDocument()
  })
})
