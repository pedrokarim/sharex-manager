/**
 * Envoi en morceaux de la route `/api/modules/[moduleName]/upload` : un
 * fichier plus lourd qu'une requête (Cloudflare refuse plus de 100 Mo) arrive
 * en plusieurs requêtes, recollées dans l'ordre, au nom de leur propriétaire.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: authMock } }, trustedOrigins: ["https://sxm.ascencia.re"] }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/modules/module-manager.api", () => ({
  apiModuleManager: {
    ensureInitialized: vi.fn(async () => undefined),
    getModules: vi.fn(async () => [{ name: "clipx", enabled: true, uploads: { maxMb: 1, kinds: ["video"] } }]),
  },
}));

let root: string;

/** Début d'un MP4 (boîte `ftyp`), complété jusqu'à `size` octets. */
function mp4(size: number): Buffer {
  const head = Buffer.from([0, 0, 0, 0x18, ...Buffer.from("ftypisom", "latin1")]);
  const body = Buffer.alloc(size);
  head.copy(body);
  for (let index = head.length; index < size; index++) body[index] = index % 251;
  return body;
}

function chunkRequest(params: Record<string, string | number>, body: Buffer, contentLength = body.length, extra: Record<string, string> = {}) {
  const { name, ...rest } = params;
  const query = new URLSearchParams(Object.entries(rest).map(([key, value]) => [key, String(value)]));
  return new NextRequest(`http://localhost/api/modules/clipx/upload?${query}`, {
    method: "POST",
    body: new Uint8Array(body),
    headers: {
      "content-length": String(contentLength),
      "content-type": "application/octet-stream",
      ...(name !== undefined ? { "x-file-name": encodeURIComponent(String(name)) } : {}),
      ...extra,
    },
  });
}

async function post(request: NextRequest) {
  const { POST } = await import("@/app/api/modules/[moduleName]/upload/route");
  const response = await POST(request, { params: Promise.resolve({ moduleName: "clipx" }) });
  return { status: response.status, body: await response.json() };
}

const ID = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "module-upload-chunks-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "user-1" } });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("envoi en morceaux", () => {
  it("recolle les morceaux dans l'ordre et range le fichier comme un envoi ordinaire", async () => {
    const file = mp4(250_000);
    const parts = [file.subarray(0, 100_000), file.subarray(100_000, 200_000), file.subarray(200_000)];
    let last: { status: number; body: any } | null = null;
    for (const [index, part] of parts.entries()) {
      last = await post(chunkRequest({ upload: ID, chunk: index, of: 3, size: file.length, name: "clip.mp4" }, part));
      expect(last.status).toBe(200);
    }
    expect(last!.body).toMatchObject({ kind: "video", size: file.length, originalName: "clip.mp4" });
    const stored = path.join(root, "modules", "clipx", "data", "assets", last!.body.file);
    expect(fs.readFileSync(stored).equals(file)).toBe(true);
    expect(fs.readdirSync(path.join(root, "modules", "clipx", "data", ".uploads"))).toEqual([]);
  });

  it("refuse un morceau hors d'ordre", async () => {
    const file = mp4(200_000);
    const response = await post(chunkRequest({ upload: ID, chunk: 1, of: 2, size: file.length, name: "clip.mp4" }, file.subarray(100_000)));
    expect(response.status).toBe(409);
  });

  it("un autre compte ne peut pas compléter l'envoi", async () => {
    const file = mp4(200_000);
    expect((await post(chunkRequest({ upload: ID, chunk: 0, of: 2, size: file.length, name: "clip.mp4" }, file.subarray(0, 100_000)))).status).toBe(200);
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    const response = await post(chunkRequest({ upload: ID, chunk: 1, of: 2, size: file.length, name: "clip.mp4" }, file.subarray(100_000)));
    expect(response.status).toBe(409);
  });

  it("refuse un fichier annoncé plus lourd que la limite du module, et un morceau trop gros", async () => {
    const tooBig = await post(chunkRequest({ upload: ID, chunk: 0, of: 2, size: 2 * 1024 * 1024, name: "clip.mp4" }, mp4(1000)));
    expect(tooBig.status).toBe(413);
    const hugeChunk = await post(chunkRequest({ upload: ID, chunk: 0, of: 1, size: 1000, name: "clip.mp4" }, mp4(1000), 65 * 1024 * 1024));
    expect(hugeChunk.status).toBe(413);
  });

  it("refuse un type que le module n'accepte pas et ne garde rien", async () => {
    const text = Buffer.from("ceci n'est pas une vidéo, juste du texte".repeat(10));
    const response = await post(chunkRequest({ upload: ID, chunk: 0, of: 1, size: text.length, name: "clip.mp4" }, text));
    expect(response.status).toBe(415);
    expect(fs.existsSync(path.join(root, "modules", "clipx", "data", "assets"))).toBe(false);
    expect(fs.readdirSync(path.join(root, "modules", "clipx", "data", ".uploads"))).toEqual([]);
  });

  it("refuse un envoi plus léger qu'annoncé à son dernier morceau", async () => {
    const file = mp4(100_000);
    const response = await post(chunkRequest({ upload: ID, chunk: 0, of: 1, size: 150_000, name: "clip.mp4" }, file));
    expect(response.status).toBe(400);
  });

  it("refuse dès le premier morceau un fichier qui n'est pas un média accepté", async () => {
    const text = Buffer.from("pas une vidéo ".repeat(10_000));
    const response = await post(chunkRequest({ upload: ID, chunk: 0, of: 3, size: text.length * 3, name: "x.mp4" }, text));
    expect(response.status).toBe(415);
    expect(fs.readdirSync(path.join(root, "modules", "clipx", "data", ".uploads"))).toEqual([]);
  });

  it("limite les envois en cours par compte", async () => {
    const part = mp4(100_000);
    for (const id of ["a".repeat(32), "b".repeat(32)]) {
      expect((await post(chunkRequest({ upload: id, chunk: 0, of: 2, size: 200_000, name: "x.mp4" }, part))).status).toBe(200);
    }
    const third = await post(chunkRequest({ upload: "c".repeat(32), chunk: 0, of: 2, size: 200_000, name: "x.mp4" }, part));
    expect(third.status).toBe(429);
  });

  it("refuse une origine étrangère (autre sous-domaine, cookie de session)", async () => {
    const file = mp4(1000);
    const response = await post(chunkRequest({ upload: ID, chunk: 0, of: 1, size: file.length, name: "x.mp4" }, file, file.length, { origin: "https://autre.ascencia.re" }));
    expect(response.status).toBe(403);
  });

  it("refuse sans session et avec un identifiant d'envoi invalide", async () => {
    const file = mp4(1000);
    expect((await post(chunkRequest({ upload: "../../etc", chunk: 0, of: 1, size: file.length, name: "x" }, file))).status).toBe(400);
    authMock.mockResolvedValue(null);
    expect((await post(chunkRequest({ upload: ID, chunk: 0, of: 1, size: file.length, name: "x" }, file))).status).toBe(401);
  });
});
