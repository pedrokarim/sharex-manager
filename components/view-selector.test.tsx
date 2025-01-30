import { describe, it, expect, vi } from 'vitest'
import { ViewSelector } from './view-selector'
import { renderWithProviders } from '@/tests/utils'
import { screen, fireEvent } from '@testing-library/react'

// Mock nuqs
vi.mock('nuqs', () => ({
  useQueryState: () => ['grid', vi.fn()],
}))

describe('ViewSelector', () => {
  it('renders all view mode buttons', () => {
    renderWithProviders(<ViewSelector />)
    
    expect(screen.getByRole('button', { name: /grid/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /details/i })).toBeInTheDocument()
  })

  it('highlights the active view mode', () => {
    renderWithProviders(<ViewSelector />)
    
    const gridButton = screen.getByRole('button', { name: /grid/i })
    expect(gridButton).toHaveClass('bg-primary')
  })

  it('changes view mode when clicking buttons', async () => {
    renderWithProviders(<ViewSelector />)
    
    const listButton = screen.getByRole('button', { name: /list/i })
    fireEvent.click(listButton)
    
    expect(listButton).toHaveClass('bg-primary')
    expect(screen.getByRole('button', { name: /grid/i })).not.toHaveClass('bg-primary')
  })
}) 