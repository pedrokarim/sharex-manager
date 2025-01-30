import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UploadZone } from './upload-zone'
import { renderWithProviders } from '@/tests/utils'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock des hooks et des dépendances
vi.mock('@/hooks/use-upload-config', () => ({
  useUploadConfig: () => ({
    config: {
      allowedTypes: {
        images: true,
        documents: true,
        archives: true
      },
      limits: {
        maxFileSize: 10,
        minFileSize: 1,
        maxFilesPerUpload: 10,
        maxFilesPerType: {
          images: 5,
          documents: 5,
          archives: 5
        }
      }
    },
    isLoading: false,
    isFileAllowed: () => true
  })
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}))

describe('UploadZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children content', () => {
    renderWithProviders(
      <UploadZone>
        <div data-testid="child-content">Test Content</div>
      </UploadZone>
    )
    
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('shows loading state when config is loading', () => {
    vi.mocked(useUploadConfig).mockReturnValueOnce({
      config: {} as any,
      isLoading: true,
      isFileAllowed: () => true
    })

    renderWithProviders(
      <UploadZone>
        <div>Content</div>
      </UploadZone>
    )
    
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('handles file drop correctly', async () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' })
    
    renderWithProviders(
      <UploadZone>
        <div>Content</div>
      </UploadZone>
    )
    
    const dropzone = screen.getByTestId('dropzone')
    
    Object.defineProperty(file, 'size', { value: 1024 * 1024 }) // 1MB
    
    const dataTransfer = {
      files: [file],
      items: [
        {
          kind: 'file',
          type: file.type,
          getAsFile: () => file
        }
      ],
      types: ['Files']
    }

    await fireEvent.drop(dropzone, { dataTransfer })
    
    expect(screen.getByText('test.png')).toBeInTheDocument()
  })

  it('validates file size', async () => {
    const largeFile = new File(['test'], 'large.png', { type: 'image/png' })
    Object.defineProperty(largeFile, 'size', { value: 20 * 1024 * 1024 }) // 20MB
    
    renderWithProviders(
      <UploadZone>
        <div>Content</div>
      </UploadZone>
    )
    
    const dropzone = screen.getByTestId('dropzone')
    
    const dataTransfer = {
      files: [largeFile],
      items: [
        {
          kind: 'file',
          type: largeFile.type,
          getAsFile: () => largeFile
        }
      ],
      types: ['Files']
    }

    await fireEvent.drop(dropzone, { dataTransfer })
    
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('taille du fichier dépasse la limite'))
  })

  it('allows file removal', async () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 1024 * 1024 })
    
    renderWithProviders(
      <UploadZone>
        <div>Content</div>
      </UploadZone>
    )
    
    const dropzone = screen.getByTestId('dropzone')
    
    await fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
        items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
        types: ['Files']
      }
    })
    
    const removeButton = screen.getByLabelText('Supprimer test.png')
    await userEvent.click(removeButton)
    
    expect(screen.queryByText('test.png')).not.toBeInTheDocument()
  })
}) 