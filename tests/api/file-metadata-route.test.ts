import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileInfo } from "@/types/files";

const { authMock, getFileMetadataMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getFileMetadataMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: authMock } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/file-metadata", () => ({
  getFileMetadata: getFileMetadataMock,
}));

describe("GET /api/files/[filename]/metadata", () => {
  beforeEach(() => {
    authMock.mockReset();
    getFileMetadataMock.mockReset();
    vi.resetModules();
  });

  it("returns 401 when the user is not authenticated", async () => {
    authMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/files/[filename]/metadata/route");
    const response = await GET(new Request("http://localhost/api/files/demo.png/metadata"), {
      params: Promise.resolve({ filename: "demo.png" }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Non autorisé");
    expect(getFileMetadataMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the file metadata cannot be found", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });
    getFileMetadataMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/files/[filename]/metadata/route");
    const response = await GET(new Request("http://localhost/api/files/missing.png/metadata"), {
      params: Promise.resolve({ filename: "missing.png" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Fichier introuvable");
    expect(getFileMetadataMock).toHaveBeenCalledWith("missing.png");
  });

  it("returns the authenticated file metadata payload", async () => {
    const file: FileInfo = {
      name: "viewer.png",
      url: "/api/files/viewer.png",
      size: 2048,
      createdAt: "2026-04-02T10:30:00.000Z",
      isSecure: true,
      isStarred: false,
    };

    authMock.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });
    getFileMetadataMock.mockResolvedValue(file);

    const { GET } = await import("@/app/api/files/[filename]/metadata/route");
    const response = await GET(new Request("http://localhost/api/files/viewer.png/metadata"), {
      params: Promise.resolve({ filename: "viewer.png" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(file);
    expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
  });
});
