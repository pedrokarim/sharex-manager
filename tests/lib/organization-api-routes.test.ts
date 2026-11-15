/**
 * Routes des tags et des collections (docs/organisation.md, § 4). La base est
 * simulée (`bun:sqlite` n'existe pas sous Node) ; la galerie lit un dossier
 * d'envoi temporaire.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { state, db } = vi.hoisted(() => {
  const state = {
    session: null as null | { user: { id: string; role: string } },
    tagsByFile: new Map<string, string[]>(),
  };
  const db = {
    listTags: vi.fn(),
    getTag: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    mergeTags: vi.fn(),
    getFileTags: vi.fn(),
    setFileTags: vi.fn(),
    updateFilesTags: vi.fn(),
    tagsByFile: vi.fn(() => state.tagsByFile),
    forgetFile: vi.fn(),
    listCollections: vi.fn(),
    findCollection: vi.fn(),
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
  };
  return { state, db };
});

const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-organization-"));
afterAll(() => fs.rmSync(uploads, { recursive: true, force: true }));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => state.session } },
  trustedOrigins: ["https://sxm.example.test"],
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => uploads }));
vi.mock("@/lib/organization/organization-db", () => ({ organizationDb: db }));
vi.mock("@/lib/file-metadata", () => ({
  loadFileFlagSets: async () => ({ secureFiles: new Set(), starredFiles: new Set() }),
  getFileMetadata: async (name: string) => {
    const stats = fs.statSync(path.join(uploads, name));
    return { name, url: `/api/files/${name}`, size: stats.size, createdAt: stats.mtime.toISOString() };
  },
}));
vi.mock("@/lib/utils/db", () => ({ logDb: { createLog: () => {} } }));
vi.mock("@/lib/utils/logger", () => ({ logger: { logFileAction: async () => {} } }));
vi.mock("@/lib/media/video", () => ({ forgetVideo: async () => {} }));
vi.mock("@/lib/secure-files", () => ({
  isFileSecure: async () => false,
  setFileSecure: async () => {},
  removeFileFromSecure: async () => {},
}));

const ORIGIN = "https://sxm.example.test";
const alice = { user: { id: "alice", role: "user" } };
const bob = { user: { id: "bob", role: "user" } };
const admin = { user: { id: "root", role: "admin" } };

const tag = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Valorant",
  slug: "valorant",
  description: null,
  fileCount: 0,
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
  createdBy: "alice",
  lastUsedAt: null,
  ...extra,
});

const collection = (extra: Record<string, unknown> = {}) => ({
  id: 7,
  name: "Vidéos",
  slug: "videos",
  description: null,
  rules: { kinds: ["video"] },
  sort: "name",
  order: "asc",
  userId: "alice",
  pinned: false,
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
  ...extra,
});

function json(url: string, method: string, body?: unknown) {
  return new Request(`${ORIGIN}${url}`, {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

beforeEach(() => {
  state.session = alice;
  state.tagsByFile = new Map();
  for (const fn of Object.values(db)) fn.mockReset();
  db.tagsByFile.mockImplementation(() => state.tagsByFile);
  db.findCollection.mockImplementation((id: string, userId: string) =>
    (id === "7" || id === "videos") && userId === "alice" ? collection() : null,
  );
  for (const name of fs.readdirSync(uploads)) fs.rmSync(path.join(uploads, name));
  for (const name of ["a.png", "b.mp4", "c.mp4"]) fs.writeFileSync(path.join(uploads, name), name);
});

describe("/api/tags", () => {
  it("demande une session", async () => {
    state.session = null;
    const { GET } = await import("@/app/api/tags/route");
    expect((await GET(json("/api/tags", "GET"), {})).status).toBe(401);
  });

  it("liste les tags", async () => {
    db.listTags.mockReturnValue([tag({ fileCount: 2 })]);
    const { GET } = await import("@/app/api/tags/route");
    const response = await GET(json("/api/tags", "GET"), {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tags: [tag({ fileCount: 2 })] });
  });

  it("crée un tag (201), ou rend l'existant (200), au nom du compte", async () => {
    const { POST } = await import("@/app/api/tags/route");
    db.createTag.mockReturnValueOnce({ tag: tag(), created: true }).mockReturnValueOnce({ tag: tag(), created: false });
    const first = await POST(json("/api/tags", "POST", { name: "Valorant" }), {});
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ tag: tag(), created: true });
    expect(db.createTag).toHaveBeenCalledWith({ name: "Valorant", createdBy: "alice" });
    expect((await POST(json("/api/tags", "POST", { name: "valorant" }), {})).status).toBe(200);
    expect((await POST(json("/api/tags", "POST", { name: 3 }), {})).status).toBe(400);
  });

  it("refuse une demande venue d'un autre site", async () => {
    const { POST } = await import("@/app/api/tags/route");
    const request = new Request(`${ORIGIN}/api/tags`, {
      method: "POST",
      headers: { origin: "https://evil.example.test" },
      body: JSON.stringify({ name: "x" }),
    });
    expect((await POST(request as never, {})).status).toBe(403);
  });
});

describe("/api/tags/[id]", () => {
  it("renommer et supprimer : créateur ou admin seulement", async () => {
    const { PATCH, DELETE } = await import("@/app/api/tags/[id]/route");
    db.getTag.mockReturnValue(tag());
    db.updateTag.mockReturnValue(tag({ name: "Valo" }));

    state.session = bob;
    expect((await PATCH(json("/api/tags/1", "PATCH", { name: "Valo" }), params({ id: "1" }))).status).toBe(403);
    expect((await DELETE(json("/api/tags/1", "DELETE"), params({ id: "1" }))).status).toBe(403);
    expect(db.updateTag).not.toHaveBeenCalled();
    expect(db.deleteTag).not.toHaveBeenCalled();

    state.session = alice;
    const renamed = await PATCH(json("/api/tags/1", "PATCH", { name: "Valo" }), params({ id: "1" }));
    expect(await renamed.json()).toEqual({ tag: tag({ name: "Valo" }) });

    state.session = admin;
    const removed = await DELETE(json("/api/tags/1", "DELETE"), params({ id: "1" }));
    expect(await removed.json()).toEqual({ success: true });
    expect(db.deleteTag).toHaveBeenCalledWith(1);
  });

  it("un tag sans auteur connu ne se modifie que par un admin", async () => {
    const { PATCH } = await import("@/app/api/tags/[id]/route");
    db.getTag.mockReturnValue(tag({ createdBy: null }));
    db.updateTag.mockReturnValue(tag());
    expect((await PATCH(json("/api/tags/1", "PATCH", { description: "x" }), params({ id: "1" }))).status).toBe(403);
    state.session = admin;
    expect((await PATCH(json("/api/tags/1", "PATCH", { description: "x" }), params({ id: "1" }))).status).toBe(200);
  });

  it("404 pour un tag inconnu, 400 pour un identifiant ou un corps faux", async () => {
    const { PATCH } = await import("@/app/api/tags/[id]/route");
    db.getTag.mockReturnValue(null);
    expect((await PATCH(json("/api/tags/9", "PATCH", { name: "x" }), params({ id: "9" }))).status).toBe(404);
    expect((await PATCH(json("/api/tags/x", "PATCH", { name: "x" }), params({ id: "x" }))).status).toBe(400);
    db.getTag.mockReturnValue(tag());
    expect((await PATCH(json("/api/tags/1", "PATCH", {}), params({ id: "1" }))).status).toBe(400);
  });

  it("fusionner : admin seulement", async () => {
    const { POST } = await import("@/app/api/tags/[id]/merge/route");
    db.mergeTags.mockReturnValue(tag({ id: 2 }));
    expect((await POST(json("/api/tags/1/merge", "POST", { into: 2 }), params({ id: "1" }))).status).toBe(403);
    state.session = admin;
    const merged = await POST(json("/api/tags/1/merge", "POST", { into: 2 }), params({ id: "1" }));
    expect(await merged.json()).toEqual({ tag: tag({ id: 2 }) });
    expect(db.mergeTags).toHaveBeenCalledWith(1, 2);
    const { OrganizationError } = await import("@/lib/organization/rules");
    db.mergeTags.mockImplementation(() => {
      throw new OrganizationError("same_tag", "Un tag ne peut pas être fusionné dans lui-même.");
    });
    const same = await POST(json("/api/tags/2/merge", "POST", { into: 2 }), params({ id: "2" }));
    expect(same.status).toBe(400);
    expect((await same.json()).code).toBe("same_tag");
  });
});

describe("tags d'un fichier", () => {
  it("lit et remplace les tags d'un fichier présent", async () => {
    const { GET, PUT } = await import("@/app/api/files/[filename]/tags/route");
    const refs = [{ id: 1, name: "Valorant", slug: "valorant" }];
    db.getFileTags.mockReturnValue(refs);
    db.setFileTags.mockReturnValue(refs);
    expect(await (await GET(json("/api/files/a.png/tags", "GET"), params({ filename: "a.png" }))).json()).toEqual({
      tags: refs,
    });
    // Tout compte connecté pose des tags, même sur le fichier d'un autre.
    state.session = bob;
    const put = await PUT(json("/api/files/a.png/tags", "PUT", { tags: ["Valorant"] }), params({ filename: "a.png" }));
    expect(await put.json()).toEqual({ tags: refs });
    expect(db.setFileTags).toHaveBeenCalledWith("a.png", ["Valorant"], "bob");
  });

  it("404 pour un fichier absent ou un chemin", async () => {
    const { PUT } = await import("@/app/api/files/[filename]/tags/route");
    for (const filename of ["gone.png", "../a.png"]) {
      expect((await PUT(json("/x", "PUT", { tags: [] }), params({ filename }))).status).toBe(404);
    }
    expect(db.setFileTags).not.toHaveBeenCalled();
  });

  it("pose en lot sur les fichiers présents et cite les absents", async () => {
    const { POST } = await import("@/app/api/files/tags/batch/route");
    db.updateFilesTags.mockReturnValue({ added: 2, removed: 0, tags: [{ id: 1, name: "Jeu", slug: "jeu" }], skipped: [] });
    const response = await POST(
      json("/api/files/tags/batch", "POST", { files: ["a.png", "b.mp4", "gone.png", "../x"], add: ["Jeu"] }),
      {},
    );
    expect(await response.json()).toEqual({
      added: 2,
      removed: 0,
      tags: [{ id: 1, name: "Jeu", slug: "jeu" }],
      skipped: [],
      missing: ["gone.png", "../x"],
    });
    expect(db.updateFilesTags).toHaveBeenCalledWith(["a.png", "b.mp4"], { add: ["Jeu"], remove: undefined }, "alice");
    expect((await POST(json("/api/files/tags/batch", "POST", { files: ["a.png"] }), {})).status).toBe(400);
  });
});

describe("/api/collections", () => {
  it("liste les collections du compte avec compte et aperçu", async () => {
    db.listCollections.mockReturnValue([collection()]);
    const { GET } = await import("@/app/api/collections/route");
    const body = await (await GET(json("/api/collections", "GET"), {})).json();
    expect(db.listCollections).toHaveBeenCalledWith("alice");
    expect(body).toEqual({ collections: [{ ...collection(), fileCount: 2, cover: ["b.mp4", "c.mp4"] }] });
  });

  it("crée pour le compte connecté, refuse des règles invalides", async () => {
    const { POST } = await import("@/app/api/collections/route");
    db.createCollection.mockReturnValue(collection());
    const created = await POST(json("/api/collections", "POST", { name: "Vidéos", rules: { kinds: ["video"] } }), {});
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ collection: collection() });
    expect(db.createCollection).toHaveBeenCalledWith("alice", { name: "Vidéos", rules: { kinds: ["video"] } });
    expect((await POST(json("/api/collections", "POST", { name: "X", rules: { bogus: 1 } }), {})).status).toBe(400);
  });

  it("une collection d'un autre compte est introuvable", async () => {
    const { GET, PATCH, DELETE } = await import("@/app/api/collections/[id]/route");
    state.session = bob;
    expect((await GET(json("/api/collections/7", "GET"), params({ id: "7" }))).status).toBe(404);
    expect((await PATCH(json("/api/collections/7", "PATCH", { pinned: true }), params({ id: "7" }))).status).toBe(404);
    expect((await DELETE(json("/api/collections/7", "DELETE"), params({ id: "7" }))).status).toBe(404);
    expect(db.updateCollection).not.toHaveBeenCalled();
    expect(db.deleteCollection).not.toHaveBeenCalled();
  });

  it("lit par identifiant ou par slug, modifie et supprime pour le propriétaire", async () => {
    const { GET, PATCH, DELETE } = await import("@/app/api/collections/[id]/route");
    const read = await (await GET(json("/api/collections/videos", "GET"), params({ id: "videos" }))).json();
    expect(read).toEqual({ collection: { ...collection(), fileCount: 2, cover: ["b.mp4", "c.mp4"] } });
    db.updateCollection.mockReturnValue(collection({ pinned: true }));
    const patched = await PATCH(json("/api/collections/7", "PATCH", { pinned: true }), params({ id: "7" }));
    expect(await patched.json()).toEqual({ collection: collection({ pinned: true }) });
    expect(db.updateCollection).toHaveBeenCalledWith(7, "alice", { pinned: true });
    db.deleteCollection.mockReturnValue(true);
    expect(await (await DELETE(json("/api/collections/7", "DELETE"), params({ id: "7" }))).json()).toEqual({
      success: true,
    });
  });

  it("aperçu : compte et quatre noms au plus, dans l'ordre de tri ; refus sans règle", async () => {
    const { POST } = await import("@/app/api/collections/preview/route");
    state.tagsByFile = new Map([["c.mp4", ["valorant"]]]);
    const preview = await POST(
      json("/api/collections/preview", "POST", { rules: { kinds: ["video"], tagsAll: ["Valorant"] } }),
      {},
    );
    expect(await preview.json()).toEqual({ fileCount: 1, cover: ["c.mp4"] });
    const empty = await POST(json("/api/collections/preview", "POST", { rules: { tagsAll: [] } }), {});
    expect(empty.status).toBe(400);
    expect((await empty.json()).code).toBe("empty_rules");
  });
});

describe("GET /api/files : filtres par tag et par collection", () => {
  async function list(query: string) {
    const { GET } = await import("@/app/api/files/route");
    return GET(new Request(`${ORIGIN}/api/files?${query}`));
  }

  it("filtre par tags, tous requis, y compris dans la frise des mois", async () => {
    state.tagsByFile = new Map([
      ["a.png", ["valorant", "clip"]],
      ["b.mp4", ["valorant"]],
    ]);
    const body = await (await list("tag=valorant&tag=clip")).json();
    expect(body.files.map((file: { name: string }) => file.name)).toEqual(["a.png"]);
    const timeline = await (await list("tag=valorant&timeline=1")).json();
    expect(timeline.total).toBe(2);
  });

  it("applique la collection du compte et son tri ; 404 pour celle d'un autre", async () => {
    const body = await (await list("collection=7")).json();
    expect(body.files.map((file: { name: string }) => file.name)).toEqual(["b.mp4", "c.mp4"]);
    const reversed = await (await list("collection=7&order=desc")).json();
    expect(reversed.files.map((file: { name: string }) => file.name)).toEqual(["c.mp4", "b.mp4"]);
    state.session = bob;
    expect((await list("collection=7")).status).toBe(404);
  });
});
