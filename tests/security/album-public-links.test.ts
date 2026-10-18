import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import {
  PUBLIC_ALBUM_SLUG_PATTERN,
  SLUG_SUFFIX_LENGTH,
  newPublicAlbumSlug,
  randomSlugSuffix,
  slugBase,
} from "@/lib/album-slug";

/**
 * Un album « public par son lien » n'est protégé que par son adresse : elle
 * ne doit pas se deviner depuis le nom, et l'album ne doit montrer aucun
 * fichier marqué privé.
 */

describe("adresse publique d'un album", () => {
  it("garde un préfixe lisible et ajoute un suffixe aléatoire d'au moins 10 signes", () => {
    const slug = newPublicAlbumSlug("Vacances d'été 2026 !");
    expect(slug).toMatch(PUBLIC_ALBUM_SLUG_PATTERN);
    expect(slug.startsWith("vacances-d-ete-2026-")).toBe(true);
    const suffix = slug.slice("vacances-d-ete-2026-".length);
    expect(SLUG_SUFFIX_LENGTH).toBeGreaterThanOrEqual(10);
    expect(suffix).toHaveLength(SLUG_SUFFIX_LENGTH);
  });

  it("ne se déduit pas du nom : deux albums du même nom ont deux adresses", () => {
    const slugs = new Set(Array.from({ length: 200 }, () => newPublicAlbumSlug("Vacances")));
    expect(slugs.size).toBe(200);
    expect(slugs.has("vacances")).toBe(false);
    expect(slugs.has("vacances-1")).toBe(false);
  });

  it("un nom sans lettre ni chiffre donne une adresse faite du seul suffixe", () => {
    expect(slugBase("!!! ???")).toBe("");
    expect(newPublicAlbumSlug("!!! ???")).toMatch(new RegExp(`^[a-z2-9]{${SLUG_SUFFIX_LENGTH}}$`));
  });

  it("le suffixe couvre tout l'alphabet, sans signe ambigu", () => {
    const seen = new Set(randomSlugSuffix(4000));
    expect(seen.size).toBe(32);
    for (const ambiguous of ["l", "o", "0", "1"]) expect(seen.has(ambiguous)).toBe(false);
  });
});

/**
 * La base passe par `bun:sqlite`, absent de Node : le scénario tourne dans un
 * sous-processus Bun, sur une base neuve dans un dossier temporaire.
 */
const workDir = mkdtempSync(join(tmpdir(), "sxm-albums-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

function runWithAlbums<T>(script: string): T {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "src/lib/utils/albums-db.ts")).href;
  const output = execFileSync(
    "bun",
    [
      "-e",
      [
        `import { albumsDb } from ${JSON.stringify(moduleUrl)};`,
        `const out = (() => { ${script} })();`,
        "console.log(JSON.stringify(out));",
      ].join("\n"),
    ],
    { cwd: workDir, encoding: "utf8" }
  );
  return JSON.parse(output.trim().split("\n").pop()!) as T;
}

describe("adresse publique en base", () => {
  it("donne une adresse aléatoire, la garde quand l'album change, et la remplace sur demande", () => {
    const result = runWithAlbums<{
      first: string;
      afterRename: string;
      legacyFound: boolean;
      regenerated: string;
      legacyAfter: boolean;
      newFound: boolean;
      privateRegenerate: unknown;
    }>(`
      const album = albumsDb.createAlbum({ name: "Vacances", userId: "alice" });
      const first = albumsDb.updateAlbum(album.id, { isPublic: true, publicSlug: albumsDb.generateUniqueSlug("Vacances", album.id) }).publicSlug;
      const afterRename = albumsDb.updateAlbum(album.id, { name: "Autre nom" }).publicSlug;

      // Un album partagé avant le correctif garde son adresse.
      const legacy = albumsDb.createAlbum({ name: "Ancien", userId: "alice" });
      albumsDb.updateAlbum(legacy.id, { isPublic: true, publicSlug: "ancien" });
      albumsDb.updateAlbum(legacy.id, { description: "modifié" });
      const legacyFound = albumsDb.getAlbumByPublicSlug("ancien")?.id === legacy.id;

      const regenerated = albumsDb.regeneratePublicSlug(legacy.id).publicSlug;
      const legacyAfter = albumsDb.getAlbumByPublicSlug("ancien") !== null;
      const newFound = albumsDb.getAlbumByPublicSlug(regenerated)?.id === legacy.id;

      const hidden = albumsDb.createAlbum({ name: "Privé", userId: "alice" });
      const privateRegenerate = albumsDb.regeneratePublicSlug(hidden.id);
      return { first, afterRename, legacyFound, regenerated, legacyAfter, newFound, privateRegenerate };
    `);

    expect(result.first).toMatch(PUBLIC_ALBUM_SLUG_PATTERN);
    expect(result.first.startsWith("vacances-")).toBe(true);
    expect(result.afterRename).toBe(result.first);
    expect(result.legacyFound).toBe(true);
    expect(result.regenerated).toMatch(PUBLIC_ALBUM_SLUG_PATTERN);
    expect(result.regenerated).not.toBe("ancien");
    expect(result.legacyAfter).toBe(false);
    expect(result.newFound).toBe(true);
    expect(result.privateRegenerate).toBeNull();
  });
});

const { albumStore, secureFiles, sessionMock } = vi.hoisted(() => ({
  albumStore: {
    album: null as Record<string, unknown> | null,
    entries: [] as Array<{ fileName: string; addedAt: string }>,
  },
  secureFiles: { list: [] as string[] },
  sessionMock: vi.fn(),
}));

vi.mock("@/lib/utils/albums-db", () => ({
  albumsDb: {
    getAlbumByPublicSlug: vi.fn(() => albumStore.album),
    getAlbum: vi.fn(() => albumStore.album),
    getAlbums: vi.fn(() => (albumStore.album ? [albumStore.album] : [])),
    getAlbumFileEntries: vi.fn(() => albumStore.entries),
    getAlbumFiles: vi.fn(() => albumStore.entries.map((entry) => entry.fileName)),
    regeneratePublicSlug: vi.fn(() => ({ ...albumStore.album, publicSlug: "nouveau-abcdefghijkm" })),
  },
}));
vi.mock("@/lib/utils/db", () => ({ logDb: { createLog: vi.fn() } }));
vi.mock("@/lib/media/video", () => ({ videoMeta: vi.fn(() => undefined) }));
vi.mock("@/lib/secure-files", () => ({ getSecureFilesSync: vi.fn(() => secureFiles.list) }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: sessionMock } },
  trustedOrigins: ["https://sxm.example"],
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

describe("surfaces publiques d'un album", () => {
  beforeEach(() => {
    albumStore.album = {
      id: 7,
      name: "Partagé",
      userId: "alice",
      isPublic: true,
      inCatalog: true,
      publicSlug: "partage-abcdefghijkm",
      fileCount: 3,
      thumbnailFile: "secret.png",
    };
    albumStore.entries = [
      { fileName: "visible.png", addedAt: "2026-10-01T00:00:00.000Z" },
      { fileName: "secret.png", addedAt: "2026-10-02T00:00:00.000Z" },
      { fileName: "autre.jpg", addedAt: "2026-10-03T00:00:00.000Z" },
    ];
    secureFiles.list = ["secret.png"];
  });

  it("l'API publique ne liste ni ne compte les fichiers sécurisés", async () => {
    const { GET } = await import("@/app/api/public/albums/[slug]/route");
    const response = await GET(new Request("http://localhost/api/public/albums/x") as never, {
      params: Promise.resolve({ slug: "partage-abcdefghijkm" }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.files.map((entry: { fileName: string }) => entry.fileName)).toEqual(["visible.png", "autre.jpg"]);
    expect(body.fileCount).toBe(2);
    expect(body.thumbnailFile).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("secret.png");
  });

  it("l'aperçu partagé et le catalogue ignorent aussi les fichiers sécurisés", async () => {
    const { getPublicAlbumSummary } = await import("@/lib/seo-album");
    const summary = getPublicAlbumSummary("partage-abcdefghijkm");
    expect(summary?.imageCount).toBe(2);
    expect(summary?.covers).toEqual(["visible.png", "autre.jpg"]);

    const { readCatalogOverview } = await import("@/lib/public-catalog");
    const overview = readCatalogOverview({ includeImages: true, randomImages: 10 });
    expect(overview.imagesTotal).toBe(2);
    expect(overview.heroImages.map((image) => image.name).sort()).toEqual(["autre.jpg", "visible.png"]);
    expect(overview.albums[0].fileCount).toBe(2);
    expect(overview.albums[0].coverImages).toEqual(["visible.png", "autre.jpg"]);
    expect(JSON.stringify(overview)).not.toContain("secret.png");
  });

  it("seul le propriétaire ou un admin change l'adresse, depuis le site", async () => {
    const { POST } = await import("@/app/api/albums/[id]/slug/route");
    const call = (origin?: string) =>
      POST(
        new Request("http://localhost/api/albums/7/slug", {
          method: "POST",
          headers: origin ? { origin } : {},
        }) as never,
        { params: Promise.resolve({ id: "7" }) }
      );

    sessionMock.mockResolvedValue({ user: { id: "alice", role: "user" } });
    expect((await call("https://evil.example")).status).toBe(403);
    expect((await call("https://sxm.example")).status).toBe(200);

    sessionMock.mockResolvedValue({ user: { id: "bob", role: "user" } });
    expect((await call()).status).toBe(403);

    sessionMock.mockResolvedValue({ user: { id: "root", role: "admin" } });
    expect((await call()).status).toBe(200);

    albumStore.album = { ...albumStore.album, isPublic: false };
    expect((await call()).status).toBe(409);
  });
});
