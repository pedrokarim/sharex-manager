import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "@/lib/types/history";

/**
 * Fichiers envoyés : seul leur propriétaire ou un admin les supprime ou
 * change leur visibilité ; l'historique ne montre à chacun que ses envois,
 * sans jeton de suppression ; le lien de suppression ShareX marche avec son
 * jeton, dont seule l'empreinte est gardée.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string; email?: string } },
  history: [] as HistoryEntry[],
  /** Fichiers de data/ simulés en mémoire (clés API, jetons de suppression). */
  data: new Map<string, string>(),
  logs: [] as Array<{ action: string; message: string; metadata?: Record<string, unknown> }>,
  secure: new Set<string>(),
}));

const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-file-access-"));
afterAll(() => fs.rmSync(uploads, { recursive: true, force: true }));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => state.session } },
  trustedOrigins: ["https://sxm.example.test"],
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => uploads }));
vi.mock("@/lib/utils/db", () => ({
  logDb: { createLog: (entry: { action: string; message: string; metadata?: Record<string, unknown> }) => state.logs.push(entry) },
}));
vi.mock("@/lib/utils/logger", () => ({
  logger: {
    logFileAction: async (action: string, message: string, options: { metadata?: Record<string, unknown> }) =>
      state.logs.push({ action, message, metadata: options.metadata }),
  },
}));
vi.mock("@/lib/media/video", () => ({ forgetVideo: async () => {} }));
vi.mock("@/lib/secure-files", () => ({
  isFileSecure: async (name: string) => state.secure.has(name),
  setFileSecure: async (name: string, secure: boolean) => void (secure ? state.secure.add(name) : state.secure.delete(name)),
  removeFileFromSecure: async (name: string) => void state.secure.delete(name),
}));
vi.mock("@/lib/history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/history")>();
  return {
    ...actual,
    getAllHistory: async () => state.history,
    searchHistory: async (filters: { userId?: string }) =>
      state.history.filter((entry) => !filters.userId || entry.userId === filters.userId),
  };
});
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  const dataKey = (file: unknown) =>
    typeof file === "string" && /[\\/]data[\\/](api-keys|deletion-tokens)\.json$/.test(file)
      ? file.replace(/^.*[\\/]data[\\/]/, "")
      : null;
  const readFile = (async (file: unknown, ...rest: unknown[]) => {
    const key = dataKey(file);
    if (!key) return (actual.readFile as (...args: unknown[]) => Promise<unknown>)(file, ...rest);
    const value = state.data.get(key);
    if (value === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return value;
  }) as typeof actual.readFile;
  const writeFile = (async (file: unknown, content: unknown, ...rest: unknown[]) => {
    const key = dataKey(file);
    if (!key) return (actual.writeFile as (...args: unknown[]) => Promise<void>)(file, content, ...rest);
    state.data.set(key, String(content));
  }) as typeof actual.writeFile;
  return { ...actual, default: { ...actual, readFile, writeFile }, readFile, writeFile };
});

const ORIGIN = "https://sxm.example.test";
const alice = { user: { id: "alice", role: "user", email: "alice@example.test" } };
const bob = { user: { id: "bob", role: "user", email: "bob@example.test" } };
const admin = { user: { id: "root", role: "admin", email: "root@example.test" } };

function entry(id: string, filename: string, userId: string | undefined, method: HistoryEntry["uploadMethod"] = "web"): HistoryEntry {
  return {
    id,
    filename,
    originalFilename: filename,
    uploadDate: `2026-10-0${id}T10:00:00.000Z`,
    fileSize: 1000,
    mimeType: "image/png",
    ipAddress: `203.0.113.${id}`,
    userId,
    uploadMethod: method,
    fileUrl: `https://img.example.test/${filename}`,
    deletionToken: `legacy-token-${id}`,
  };
}

function writeUpload(name: string) {
  fs.writeFileSync(path.join(uploads, name), "x");
}

beforeEach(() => {
  state.session = null;
  state.logs = [];
  state.secure = new Set();
  state.data = new Map([
    ["api-keys.json", JSON.stringify([{ id: "key_alice", name: "ShareX", key: "sk_a", createdBy: "alice", permissions: {} }])],
  ]);
  state.history = [
    entry("1", "alice-web.png", "alice"),
    entry("2", "alice-sharex.png", "key_alice", "api"),
    entry("3", "bob.png", "bob"),
    entry("4", "orphan.png", undefined),
    entry("5", "deleted-key.png", "key_gone", "api"),
  ];
  for (const name of ["alice-web.png", "alice-sharex.png", "bob.png", "orphan.png", "deleted-key.png"]) writeUpload(name);
});

describe("propriétaire d'un fichier", () => {
  it("se lit dans l'historique, y compris par la clé API qui a envoyé", async () => {
    const { getFileOwners, canManageFile } = await import("@/lib/file-ownership");
    const owners = await getFileOwners(["alice-web.png", "alice-sharex.png", "bob.png", "orphan.png", "deleted-key.png", "unknown.png"]);
    expect(Object.fromEntries(owners)).toEqual({
      "alice-web.png": "alice",
      "alice-sharex.png": "alice",
      "bob.png": "bob",
      "orphan.png": null,
      "deleted-key.png": null,
      "unknown.png": null,
    });
    expect(await canManageFile(alice as never, "alice-sharex.png")).toBe(true);
    expect(await canManageFile(alice as never, "bob.png")).toBe(false);
    expect(await canManageFile(alice as never, "orphan.png")).toBe(false);
    expect(await canManageFile(admin as never, "orphan.png")).toBe(true);
  });

  it("suit le dernier envoi d'un nom réutilisé", async () => {
    state.history.push({ ...entry("6", "bob.png", "alice"), uploadDate: "2026-10-09T10:00:00.000Z" });
    const { getFileOwner } = await import("@/lib/file-ownership");
    expect(await getFileOwner("bob.png")).toBe("alice");
  });
});

describe("DELETE /api/files?id=", () => {
  async function remove(name: string, origin = ORIGIN) {
    const { DELETE } = await import("@/app/api/files/route");
    const request = new Request(`${ORIGIN}/api/files?id=${encodeURIComponent(name)}`, { method: "DELETE", headers: { origin } });
    return DELETE(request as never, {});
  }

  it("refuse le fichier d'un autre compte, et le journalise", async () => {
    state.session = alice;
    const response = await remove("bob.png");
    expect(response.status).toBe(403);
    expect(fs.existsSync(path.join(uploads, "bob.png"))).toBe(true);
    expect(state.logs.some((log) => log.action === "file.unauthorized")).toBe(true);
  });

  it("refuse un fichier sans propriétaire connu à un compte qui n'est pas admin", async () => {
    state.session = alice;
    expect((await remove("orphan.png")).status).toBe(403);
    expect((await remove("deleted-key.png")).status).toBe(403);
  });

  it("refuse une page d'un autre site", async () => {
    state.session = alice;
    expect((await remove("alice-web.png", "https://evil.example.test")).status).toBe(403);
    expect(fs.existsSync(path.join(uploads, "alice-web.png"))).toBe(true);
  });

  it("laisse le propriétaire supprimer son fichier, envoyé par l'interface ou par sa clé", async () => {
    state.session = alice;
    expect((await remove("alice-web.png")).status).toBe(200);
    expect((await remove("alice-sharex.png")).status).toBe(200);
    expect(fs.existsSync(path.join(uploads, "alice-web.png"))).toBe(false);
    expect(state.logs.filter((log) => log.action === "file.delete")).toHaveLength(2);
  });

  it("laisse un admin supprimer n'importe quel fichier", async () => {
    state.session = admin;
    expect((await remove("orphan.png")).status).toBe(200);
  });
});

describe("DELETE /api/files/[filename] (session)", () => {
  async function remove(name: string) {
    const { DELETE } = await import("@/app/api/files/[filename]/route");
    const request = new Request(`${ORIGIN}/api/files/${encodeURIComponent(name)}`, { method: "DELETE", headers: { origin: ORIGIN } });
    const { NextRequest } = await import("next/server");
    return DELETE(new NextRequest(request), { params: Promise.resolve({ filename: name }) });
  }

  it("n'accepte que le propriétaire ou un admin", async () => {
    state.session = bob;
    expect((await remove("alice-web.png")).status).toBe(403);
    expect(fs.existsSync(path.join(uploads, "alice-web.png"))).toBe(true);
    state.session = alice;
    expect((await remove("alice-web.png")).status).toBe(204);
    state.session = null;
    expect((await remove("bob.png")).status).toBe(401);
  });
});

describe("PUT /api/files?filename= (privé ↔ public)", () => {
  async function toggle(name: string, isSecure: boolean) {
    const { PUT } = await import("@/app/api/files/route");
    const body = new FormData();
    body.set("isSecure", String(isSecure));
    const request = new Request(`${ORIGIN}/api/files?filename=${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { origin: ORIGIN },
      body,
    });
    return PUT(request, {});
  }

  it("refuse de rendre public le fichier privé d'un autre compte", async () => {
    state.secure.add("bob.png");
    state.session = alice;
    expect((await toggle("bob.png", false)).status).toBe(403);
    expect(state.secure.has("bob.png")).toBe(true);
  });

  it("journalise la bascule faite par le propriétaire", async () => {
    state.session = bob;
    state.secure.add("bob.png");
    expect((await toggle("bob.png", false)).status).toBe(200);
    expect(state.secure.has("bob.png")).toBe(false);
    expect(state.logs).toContainEqual(
      expect.objectContaining({ action: "file.update", metadata: { fileName: "bob.png", isSecure: false } })
    );
  });
});

describe("GET /api/history", () => {
  async function list(query = "") {
    const { GET } = await import("@/app/api/history/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest(`${ORIGIN}/api/history${query}`), {});
    return (await response.json()) as { items: Array<Record<string, unknown>>; total: number };
  }

  it("ne montre à un compte que ses envois, sans IP ni jeton", async () => {
    state.session = alice;
    const body = await list();
    expect(body.items.map((item) => item.filename).sort()).toEqual(["alice-sharex.png", "alice-web.png"]);
    for (const item of body.items) {
      expect(item).not.toHaveProperty("deletionToken");
      expect(item).not.toHaveProperty("ipAddress");
    }
  });

  it("ignore le filtre par compte et le tri par IP d'un compte qui n'est pas admin", async () => {
    state.session = alice;
    const body = await list("?userId=bob&sortField=ipAddress");
    expect(body.items.map((item) => item.filename).sort()).toEqual(["alice-sharex.png", "alice-web.png"]);
    const paged = (await (await import("@/app/api/history/route")).GET(
      new (await import("next/server")).NextRequest(`${ORIGIN}/api/history?sortField=deletionToken`),
      {}
    ).then((response) => response.json())) as { sortField: string };
    expect(paged.sortField).toBe("uploadDate");
  });

  it("montre tout à un admin, avec les IP mais jamais les jetons", async () => {
    state.session = admin;
    const body = await list("?stats=true&startDate=2026-01-01");
    expect(body.total).toBe(5);
    for (const item of body.items) {
      expect(item).not.toHaveProperty("deletionToken");
      expect(item.ipAddress).toMatch(/^203\.0\.113\./);
    }
  });
});

describe("GET /api/stats/geo", () => {
  it("est réservé aux admins", async () => {
    state.session = alice;
    const { GET } = await import("@/app/api/stats/geo/route");
    const response = await GET(new Request(`${ORIGIN}/api/stats/geo`), {});
    expect(response.status).toBe(403);
  });
});

describe("jetons de suppression", () => {
  it("ne gardent que l'empreinte SHA-256, liée au fichier", async () => {
    const tokens = await import("@/lib/deletion-tokens");
    await tokens.storeDeletionToken("alice-web.png", "secret-token-123");
    const stored = state.data.get("deletion-tokens.json")!;
    expect(stored).not.toContain("secret-token-123");
    expect(JSON.parse(stored)).toEqual([
      expect.objectContaining({ filename: "alice-web.png", tokenHash: tokens.hashDeletionToken("secret-token-123") }),
    ]);
    expect(await tokens.validateDeletionToken("alice-web.png", "secret-token-123")).toBe(true);
    expect(await tokens.validateDeletionToken("alice-web.png", "secret-token-124")).toBe(false);
    expect(await tokens.validateDeletionToken("bob.png", "secret-token-123")).toBe(false);
    expect(await tokens.validateDeletionToken("alice-web.png", "")).toBe(false);
  });

  it("compare des empreintes de même longueur seulement", async () => {
    const { hashDeletionToken, sameTokenHash } = await import("@/lib/deletion-tokens");
    const hash = hashDeletionToken("a");
    expect(sameTokenHash(hash, hash)).toBe(true);
    expect(sameTokenHash(hash, hashDeletionToken("b"))).toBe(false);
    expect(sameTokenHash(hash, hash.slice(0, 10))).toBe(false);
    expect(sameTokenHash(hash, "zz")).toBe(false);
  });

  it("convertit l'ancien format en clair à la première écriture", async () => {
    state.data.set("deletion-tokens.json", JSON.stringify([{ filename: "old.png", token: "plain", createdAt: "2025-01-01" }]));
    const tokens = await import("@/lib/deletion-tokens");
    expect(await tokens.validateDeletionToken("old.png", "plain")).toBe(true);
    await tokens.storeDeletionToken("new.png", "fresh");
    const stored = state.data.get("deletion-tokens.json")!;
    expect(stored).not.toContain('"plain"');
    expect(await tokens.validateDeletionToken("old.png", "plain")).toBe(true);
  });

  it("mènent à la page de confirmation de l'application", async () => {
    const { buildDeletionUrl } = await import("@/lib/deletion-tokens");
    expect(buildDeletionUrl("https://sxm.example.test/", "a b.png", "t0k")).toBe(
      "https://sxm.example.test/delete/a%20b.png?token=t0k"
    );
  });

  it("suppriment le fichier sans session avec le bon jeton, et seulement lui", async () => {
    const { storeDeletionToken, validateDeletionToken } = await import("@/lib/deletion-tokens");
    await storeDeletionToken("bob.png", "good-token");
    const { DELETE } = await import("@/app/api/files/[filename]/route");
    const { NextRequest } = await import("next/server");
    const remove = (name: string, token: string, origin = ORIGIN) =>
      DELETE(
        new NextRequest(`${ORIGIN}/api/files/${name}?token=${token}`, { method: "DELETE", headers: { origin } }),
        { params: Promise.resolve({ filename: name }) }
      );

    expect((await remove("bob.png", "wrong-token")).status).toBe(403);
    expect((await remove("alice-web.png", "good-token")).status).toBe(403);
    expect((await remove("bob.png", "good-token", "https://evil.example.test")).status).toBe(403);
    expect(fs.existsSync(path.join(uploads, "bob.png"))).toBe(true);

    expect((await remove("bob.png", "good-token")).status).toBe(204);
    expect(fs.existsSync(path.join(uploads, "bob.png"))).toBe(false);
    // Le lien ne sert qu'une fois.
    expect(await validateDeletionToken("bob.png", "good-token")).toBe(false);
  });
});
