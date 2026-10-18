import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "@/lib/types/history";

/**
 * Clés API : empreinte seule sur le disque, clé tirée par le serveur et remise
 * une fois, migration des anciennes clés en clair, un seul validateur,
 * permission « couleurs », durée de vie bornée par les réglages, révocation
 * à la suppression du compte, vue d'administration sans empreinte.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string; email?: string }; session?: { id: string } },
  users: [] as Array<{ id: string; username: string; role?: string }>,
  history: [] as HistoryEntry[],
  deletedUsers: [] as string[],
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: { getSession: async () => state.session },
    $context: Promise.resolve({
      adapter: {
        findMany: async ({ where }: { where: Array<{ value: unknown }> }) => {
          const ids = (where?.[0]?.value as string[]) ?? [];
          return state.users.filter((user) => ids.includes(user.id));
        },
      },
      internalAdapter: {
        findUserById: async (id: string) => state.users.find((user) => user.id === id) ?? null,
        deleteUser: async (id: string) => {
          state.deletedUsers.push(id);
          state.users = state.users.filter((user) => user.id !== id);
        },
      },
    }),
  },
  trustedOrigins: ["https://sxm.example.test"],
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/utils/db", () => ({ logDb: { createLog: vi.fn() } }));
vi.mock("@/lib/utils/logger", () => ({
  logger: { info: async () => {}, warning: async () => {}, error: async () => {} },
}));
vi.mock("@/lib/security/alerts", () => ({ raiseAlert: async () => null }));
// L'extraction elle-même n'est pas l'objet de ces tests : un faux sharp rend
// quelques pixels rouges. Les envois ne vont jamais jusqu'au traitement.
vi.mock("sharp", () => {
  const chain = {
    resize: () => chain,
    raw: () => chain,
    toBuffer: async () => Buffer.from([200, 30, 30, 200, 30, 30]),
  };
  return { default: () => chain };
});
vi.mock("@/lib/upload", () => ({ handleFileUpload: async () => ({ success: false, error: "non utilisé" }) }));
vi.mock("@/lib/sse", () => ({ gallerySSEManager: { broadcast: () => {}, getClientCount: () => 0 } }));
vi.mock("@/lib/history", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history")>()),
  getAllHistory: async () => state.history,
}));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-api-keys-"));
const keysFile = path.join(directory, "api-keys.json");
const securityFile = path.join(directory, "security.json");
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

const store = await import("@/lib/api-key-store");
const validator = await import("@/lib/api-key-validator");
const settings = await import("@/lib/security/settings");
store.setApiKeysPath(keysFile);
settings.setSecuritySettingsPath(securityFile);

const ORIGIN = "https://sxm.example.test";
const alice = { user: { id: "alice", role: "user", email: "alice@example.test" }, session: { id: "s-alice" } };
const admin = { user: { id: "root", role: "admin", email: "root@example.test" }, session: { id: "s-root" } };
const DAY = 24 * 60 * 60 * 1000;

const LEGACY_SECRET = "sk_legacyPlainKey0123456789abcdefgh";

function writeKeys(value: unknown) {
  fs.writeFileSync(keysFile, JSON.stringify(value, null, 2));
}

function readKeysFile(): string {
  return fs.readFileSync(keysFile, "utf-8");
}

function legacyEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "key_legacy",
    name: "ShareX ancien",
    key: LEGACY_SECRET,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    createdBy: "alice",
    permissions: { uploadImages: true, uploadText: false, uploadFiles: false },
    ...overrides,
  };
}

async function createKey(body: Record<string, unknown>, session = alice) {
  state.session = session;
  const { POST } = await import("@/app/api/api-keys/route");
  return POST(
    new Request(`${ORIGIN}/api/api-keys`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    {}
  );
}

beforeEach(() => {
  state.session = null;
  state.users = [
    { id: "alice", username: "alice" },
    { id: "root", username: "root", role: "admin" },
  ];
  state.history = [];
  state.deletedUsers = [];
  fs.rmSync(keysFile, { force: true });
  fs.rmSync(securityFile, { force: true });
  settings.setSecuritySettingsPath(securityFile);
});

describe("empreinte et migration", () => {
  it("convertit une ancienne clé en clair à la première lecture, sans la casser", async () => {
    writeKeys([legacyEntry()]);

    const keys = await store.loadApiKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0].hash).toBe(store.hashApiKey(LEGACY_SECRET));
    expect(keys[0].prefix).toBe("sk_legacy");
    // La clé en clair a quitté le disque.
    expect(readKeysFile()).not.toContain(LEGACY_SECRET);
    expect(JSON.parse(readKeysFile())[0]).not.toHaveProperty("key");

    // La configuration ShareX déjà distribuée continue de marcher.
    const valid = await validator.validateApiKeyForUpload(LEGACY_SECRET, "capture.png");
    expect(valid?.id).toBe("key_legacy");
    // Une ancienne clé gardait le droit d'extraire des couleurs.
    expect(keys[0].permissions.extractColors).toBe(true);
  });

  it("ne montre qu'un quart d'une ancienne clé courte saisie à la main", () => {
    expect(store.displayPrefix("abcdefgh")).toBe("ab");
    expect(store.displayPrefix("sk_0123456789abcdefghijklmnop")).toBe("sk_012345");
  });

  it("refuse une clé voisine (même préfixe, fin différente)", async () => {
    writeKeys([legacyEntry()]);
    expect(await validator.validateApiKey(`${LEGACY_SECRET.slice(0, -1)}X`)).toBeNull();
    expect(await validator.validateApiKey("")).toBeNull();
  });

  it("garde un fichier cohérent sous des mises à jour simultanées de « dernière utilisation »", async () => {
    writeKeys([legacyEntry(), legacyEntry({ id: "key_two", key: "sk_secondLegacyKey0123456789abcdef" })]);
    const results = await Promise.all([
      ...Array.from({ length: 10 }, () => validator.validateApiKey(LEGACY_SECRET)),
      ...Array.from({ length: 10 }, () => validator.validateApiKey("sk_secondLegacyKey0123456789abcdef")),
      store.createApiKey({
        name: "Concurrente",
        permissions: { uploadImages: true, uploadText: false, uploadFiles: false },
        expiresAt: null,
        createdBy: "alice",
      }),
    ]);
    expect(results.slice(0, 20).every(Boolean)).toBe(true);
    const onDisk = JSON.parse(readKeysFile()) as Array<{ id: string; lastUsed?: string }>;
    const ids = onDisk.map((key) => key.id);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining(["key_legacy", "key_two"]));
    expect(ids.filter((id) => id !== "key_legacy" && id !== "key_two")[0]).toMatch(/^key_/);
    expect(onDisk.find((key) => key.id === "key_legacy")?.lastUsed).toBeTruthy();
    expect(onDisk.find((key) => key.id === "key_two")?.lastUsed).toBeTruthy();
  });
});

describe("création", () => {
  it("tire la clé côté serveur, ignore celle du client et ne la remet qu'une fois", async () => {
    const response = await createKey({
      name: "ShareX",
      key: "sk_choisie_par_le_client",
      permissions: { uploadImages: true },
    });
    expect(response.status).toBe(200);
    const created = await response.json();
    expect(created.key).not.toBe("sk_choisie_par_le_client");
    expect(created.key).toMatch(/^sk_[A-Za-z0-9_-]{32,}$/);
    expect(created.prefix).toBe(created.key.slice(0, 9));
    expect(created).not.toHaveProperty("hash");

    // Sur le disque : l'empreinte, jamais la clé.
    const file = readKeysFile();
    expect(file).not.toContain(created.key);
    expect(file).toContain(store.hashApiKey(created.key));

    // La liste ne la rend plus.
    const { GET } = await import("@/app/api/api-keys/route");
    const list = await (await GET(new Request(`${ORIGIN}/api/api-keys`), {})).json();
    expect(JSON.stringify(list)).not.toContain(created.key);
    expect(list[0]).not.toHaveProperty("hash");
    expect(list[0]).not.toHaveProperty("key");
  });

  it("refuse une permission inconnue, ou aucune permission", async () => {
    expect((await createKey({ name: "x", permissions: { uploadImages: true, admin: true } })).status).toBe(400);
    expect((await createKey({ name: "x", permissions: { uploadImages: false } })).status).toBe(400);
    expect(fs.existsSync(keysFile)).toBe(false);
  });

  it("applique la durée par défaut et la durée maximale de l'écran Sécurité", async () => {
    settings.updateSecuritySettings({ apiKeys: { defaultExpiryDays: 30, maxExpiryDays: 60 } });
    const expiresIn = async (body: Record<string, unknown>) => {
      const created = await (await createKey({ name: "k", permissions: { uploadImages: true }, ...body })).json();
      return Math.round((new Date(created.expiresAt).getTime() - Date.now()) / DAY);
    };
    expect(await expiresIn({})).toBe(30);
    expect(await expiresIn({ expiresInDays: 7 })).toBe(7);
    expect(await expiresIn({ expiresInDays: 365 })).toBe(60);
    // « Sans expiration » n'est pas permis quand une durée maximale existe.
    expect(await expiresIn({ expiresInDays: null })).toBe(60);
    expect(await expiresIn({ expiresAt: new Date(Date.now() + 400 * DAY).toISOString() })).toBe(60);
  });

  it("permet une clé sans expiration quand aucun maximum n'est fixé", async () => {
    settings.updateSecuritySettings({ apiKeys: { defaultExpiryDays: null, maxExpiryDays: null } });
    const created = await (await createKey({ name: "k", permissions: { uploadImages: true }, expiresInDays: null })).json();
    expect(created.expiresAt).toBeNull();
  });
});

describe("validation unique", () => {
  it("refuse une clé expirée et une clé sans la permission du type envoyé", async () => {
    writeKeys([
      legacyEntry(),
      legacyEntry({ id: "key_old", key: "sk_expiredKey0123456789abcdefghij", expiresAt: "2020-01-01T00:00:00.000Z" }),
    ]);
    expect(await validator.validateApiKeyForUpload("sk_expiredKey0123456789abcdefghij", "a.png")).toBeNull();
    expect(await validator.validateApiKeyForUpload(LEGACY_SECRET, "notes.txt")).toBeNull();
    expect(await validator.validateApiKeyForUpload(LEGACY_SECRET, "archive.zip")).toBeNull();
    expect(await validator.validateApiKeyForUpload(LEGACY_SECRET, "a.png")).not.toBeNull();
  });

  it("/api/upload passe par ce validateur : clé inconnue refusée avant de lire le corps", async () => {
    writeKeys([legacyEntry()]);
    const { POST } = await import("@/app/api/upload/route");
    const response = await POST(
      new Request(`${ORIGIN}/api/upload`, { method: "POST", headers: { "x-api-key": "sk_inconnue" } }) as never
    );
    expect(response.status).toBe(403);
  });
});

describe("/api/colors", () => {
  const PNG = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c00000000049454e44ae426082",
    "hex"
  );

  async function extract(headers: Record<string, string>, field?: string) {
    const form = new FormData();
    form.append("image", new File([PNG], "pixel.png", { type: "image/png" }));
    if (field) form.append("apiKey", field);
    const { POST } = await import("@/app/api/colors/route");
    return POST(new Request(`${ORIGIN}/api/colors`, { method: "POST", headers, body: form }) as never);
  }

  beforeEach(async () => {
    state.session = null;
    const colors = await store.createApiKey({
      name: "couleurs",
      permissions: { uploadImages: false, uploadText: false, uploadFiles: false, extractColors: true },
      expiresAt: null,
      createdBy: "alice",
    });
    const uploadOnly = await store.createApiKey({
      name: "envoi",
      permissions: { uploadImages: true, uploadText: false, uploadFiles: false, extractColors: false },
      expiresAt: null,
      createdBy: "alice",
    });
    secrets = { colors: colors.secret, uploadOnly: uploadOnly.secret };
  });
  let secrets = { colors: "", uploadOnly: "" };

  it("exige la permission « extraction de couleurs »", async () => {
    expect((await extract({ "x-api-key": secrets.uploadOnly })).status).toBe(401);
    expect((await extract({ "x-api-key": secrets.colors })).status).toBe(200);
  });

  it("accepte encore le champ « apiKey » du formulaire, déprécié", async () => {
    expect((await extract({}, secrets.colors)).status).toBe(200);
    expect((await extract({}, secrets.uploadOnly)).status).toBe(401);
  });
});

describe("révocation", () => {
  it("révoque les clés d'un compte supprimé, et seulement les siennes", async () => {
    state.users.push({ id: "bob", username: "bob" });
    await store.createApiKey({ name: "bob 1", permissions: { uploadImages: true, uploadText: false, uploadFiles: false }, expiresAt: null, createdBy: "bob" });
    const bobKey = await store.createApiKey({ name: "bob 2", permissions: { uploadImages: true, uploadText: false, uploadFiles: false }, expiresAt: null, createdBy: "bob" });
    await store.createApiKey({ name: "alice", permissions: { uploadImages: true, uploadText: false, uploadFiles: false }, expiresAt: null, createdBy: "alice" });

    state.session = admin;
    const { DELETE } = await import("@/app/api/admin/users/route");
    const response = await DELETE(new Request(`${ORIGIN}/api/admin/users?id=bob`, { method: "DELETE" }) as never);
    expect(response.status).toBe(200);
    expect(state.deletedUsers).toEqual(["bob"]);

    const remaining = await store.loadApiKeys();
    expect(remaining.map((key) => key.createdBy)).toEqual(["alice"]);
    expect(await validator.validateApiKey(bobKey.secret)).toBeNull();
  });
});

describe("API d'administration des clés", () => {
  it("rend la forme attendue par l'écran Sécurité, sans empreinte ni clé", async () => {
    const now = Date.now();
    const active = await store.createApiKey({ name: "active", permissions: { uploadImages: true, uploadText: false, uploadFiles: false }, expiresAt: null, createdBy: "alice" });
    const expired = await store.createApiKey({ name: "expirée", permissions: { uploadImages: true, uploadText: false, uploadFiles: false }, expiresAt: new Date(now - DAY), createdBy: "alice" });
    const orphan = await store.createApiKey({ name: "orpheline", permissions: { uploadImages: true, uploadText: false, uploadFiles: false }, expiresAt: null, createdBy: "ghost" });
    const recent = (minutesAgo: number, userId: string): HistoryEntry => ({
      id: `${userId}-${minutesAgo}`,
      filename: "a.png",
      originalFilename: "a.png",
      uploadDate: new Date(now - minutesAgo * 60_000).toISOString(),
      fileSize: 1,
      mimeType: "image/png",
      ipAddress: "203.0.113.1",
      userId,
      uploadMethod: "api",
      fileUrl: "https://img.example.test/a.png",
    });
    state.history = [recent(5, active.record.id), recent(30, active.record.id), recent(90, active.record.id)];

    state.session = alice;
    const route = await import("@/app/api/admin/security/api-keys/route");
    expect((await route.GET()).status).toBe(403);

    state.session = admin;
    const response = await route.GET();
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const secret of [active.secret, expired.secret, orphan.secret]) {
      expect(text).not.toContain(secret);
      expect(text).not.toContain(store.hashApiKey(secret));
    }
    const { keys } = JSON.parse(text) as { keys: Array<Record<string, unknown>> };
    const byName = Object.fromEntries(keys.map((key) => [key.name, key]));
    expect(Object.keys(byName["active"]).sort()).toEqual(
      ["createdAt", "expiresAt", "id", "lastUsedAt", "name", "owner", "permissions", "prefix", "status", "uploadsLastHour"].sort()
    );
    expect(byName["active"]).toMatchObject({ status: "active", owner: { id: "alice", username: "alice" }, uploadsLastHour: 2, lastUsedAt: null });
    expect(byName["expirée"]).toMatchObject({ status: "expired" });
    expect(byName["orpheline"]).toMatchObject({ status: "orphan", owner: null });

    const revoke = await route.DELETE(
      Object.assign(new Request(`${ORIGIN}/api/admin/security/api-keys?id=${orphan.record.id}`, { method: "DELETE" }), {
        nextUrl: new URL(`${ORIGIN}/api/admin/security/api-keys?id=${orphan.record.id}`),
      }) as never
    );
    expect(revoke.status).toBe(200);
    expect(await validator.validateApiKey(orphan.secret)).toBeNull();
  });
});
