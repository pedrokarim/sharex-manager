import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUploadConfig, defaultConfig } from "./use-upload-config";
import { toast } from "sonner";

// Mock de fetch
global.fetch = vi.fn();

// Mock de sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("useUploadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetch).mockClear();
  });

  it("charge la configuration par défaut initialement", () => {
    const { result } = renderHook(() => useUploadConfig());
    expect(result.current.config).toEqual(defaultConfig);
  });

  it("charge la configuration depuis l'API", async () => {
    const mockConfig = {
      ...defaultConfig,
      allowedTypes: {
        images: false,
        documents: true,
        archives: false,
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockConfig,
    } as Response);

    const { result } = renderHook(() => useUploadConfig());

    // Attendre que le chargement soit terminé
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.config).toEqual(mockConfig);
    expect(result.current.isLoading).toBe(false);
  });

  it("gère les erreurs de chargement", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Erreur API"));

    const { result } = renderHook(() => useUploadConfig());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isLoading).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      "Impossible de charger la configuration"
    );
  });

  describe("isFileAllowed", () => {
    it("autorise les images quand elles sont permises", () => {
      const { result } = renderHook(() => useUploadConfig());

      const imageFile = new File([""], "test.jpg", { type: "image/jpeg" });
      Object.defineProperty(imageFile, "size", { value: 1024 * 1024 }); // 1MB

      expect(result.current.isFileAllowed(imageFile)).toBe(true);
    });

    it("refuse les images quand elles sont désactivées", async () => {
      const mockConfig = {
        ...defaultConfig,
        allowedTypes: {
          ...defaultConfig.allowedTypes,
          images: false,
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig,
      } as Response);

      const { result } = renderHook(() => useUploadConfig());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const imageFile = new File([""], "test.jpg", { type: "image/jpeg" });
      Object.defineProperty(imageFile, "size", { value: 1024 * 1024 }); // 1MB

      expect(result.current.isFileAllowed(imageFile)).toBe(false);
    });

    it("refuse les fichiers trop grands", () => {
      const { result } = renderHook(() => useUploadConfig());

      const largeFile = new File([""], "large.jpg", { type: "image/jpeg" });
      Object.defineProperty(largeFile, "size", { value: 20 * 1024 * 1024 }); // 20MB

      expect(result.current.isFileAllowed(largeFile)).toBe(false);
    });
  });

  describe("generateFilename", () => {
    it("génère un nom de fichier selon le pattern", () => {
      const { result } = renderHook(() => useUploadConfig());

      const filename = result.current.generateFilename("test.jpg");

      expect(filename).toMatch(/{timestamp}-{random}/);
    });
  });

  describe("getUploadPath", () => {
    it("génère le chemin correct pour la structure par type", () => {
      const { result } = renderHook(() => useUploadConfig());

      const path = result.current.getUploadPath("test.jpg", "image/jpeg");

      expect(path).toMatch(/uploads\/image\/test\.jpg$/);
    });

    it("génère le chemin correct pour la structure par date", async () => {
      const mockConfig = {
        ...defaultConfig,
        storage: {
          ...defaultConfig.storage,
          structure: "date" as const,
        },
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig,
      } as Response);

      const { result } = renderHook(() => useUploadConfig());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const path = result.current.getUploadPath("test.jpg", "image/jpeg");

      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      expect(path).toBe(`./uploads/${year}/${month}/${day}/test.jpg`);
    });
  });
});
