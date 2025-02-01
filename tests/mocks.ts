import { vi } from "vitest";

// Mock next/navigation
export const mockNextNavigation = {
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
    getAll: vi.fn(),
    has: vi.fn(),
    forEach: vi.fn(),
    entries: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
    toString: vi.fn(),
  }),
  usePathname: () => "/",
};

// Mock nuqs
export const mockNuqs = {
  useQueryState: () => ["grid", vi.fn()],
};

// Mock sonner
export const mockSonner = {
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
};

// Mock useUploadConfig
export const mockUseUploadConfig = {
  useUploadConfig: () => ({
    config: {
      allowedTypes: {
        images: true,
        documents: true,
        archives: true,
      },
      limits: {
        maxFileSize: 10,
        minFileSize: 1,
        maxFilesPerUpload: 10,
        maxFilesPerType: {
          images: 5,
          documents: 5,
          archives: 5,
        },
      },
    },
    isLoading: false,
    isFileAllowed: () => true,
  }),
};
