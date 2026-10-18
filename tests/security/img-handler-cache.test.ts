import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Un dossier d'envois jetable : une image publique, une image sécurisée.
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-img-cache-"));
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c00000000049454e44ae426082", "hex");

vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => uploads }));
vi.mock("@/lib/utils/db", () => ({ logDb: { createLog: vi.fn() } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/secure-files", () => ({ isFileSecure: async (name: string) => name === "prive.png" }));
const session = { user: { id: "u1", role: "user" } } as { user: { id: string; role: string } } | null;
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));

beforeAll(() => {
  fs.writeFileSync(path.join(uploads, "public.png"), PNG);
  fs.writeFileSync(path.join(uploads, "prive.png"), PNG);
});
afterAll(() => fs.rmSync(uploads, { recursive: true, force: true }));

async function fetchImage(filename: string) {
  const { GET } = await import("@/app/img-handler/[filename]/route");
  const request = new Request(`https://img.example.test/${filename}`) as unknown as Parameters<typeof GET>[0];
  const response = await GET(request, { params: Promise.resolve({ filename }) });
  // Le corps est lu jusqu'au bout : le fichier est refermé avant que le dossier disparaisse.
  await response.arrayBuffer();
  return response;
}

describe("cache des images servies par img-handler", () => {
  it("garde une image publique en cache partagé une heure", async () => {
    const response = await fetchImage("public.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("ne laisse jamais un cache partagé garder une image sécurisée, même servie à un compte connecté", async () => {
    const response = await fetchImage("prive.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
