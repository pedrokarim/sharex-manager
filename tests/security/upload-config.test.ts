import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Configuration des envois : un seul chemin d'écriture, validé par le schéma
 * zod, emprunté par PUT /api/settings/config et POST /api/uploads/config ;
 * `storage.path` ignoré (UPLOAD_PATH fait foi) ; nombre de fichiers d'un
 * envoi borné côté serveur.
 */

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string; email: string } },
  serverConfig: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => state.session } },
  trustedOrigins: ["https://sxm.example.test"],
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/utils/db", () => ({ logDb: { createLog: vi.fn() } }));
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => "/srv/sxm/uploads" }));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-upload-config-"));
const configFile = path.join(directory, "uploads.json");
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

const store = await import("@/lib/server/upload-config-store");
const { defaultConfig } = await import("@/lib/defaultConfig");
store.setUploadConfigPath(configFile);

const ORIGIN = "https://sxm.example.test";
const admin = { user: { id: "root", role: "admin", email: "root@example.test" } };
const user = { user: { id: "alice", role: "user", email: "alice@example.test" } };

function onDisk() {
  return JSON.parse(fs.readFileSync(configFile, "utf-8"));
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  state.session = admin;
  fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
});

describe("saveUploadConfig", () => {
  it("refuse une configuration invalide sans rien écrire", async () => {
    const before = fs.readFileSync(configFile, "utf-8");
    const result = await store.saveUploadConfig({ limits: { maxFileSize: 1, minFileSize: 5000 } });
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(configFile, "utf-8")).toBe(before);
    expect((await store.saveUploadConfig({ limits: { maxFileSize: 999_999 } })).ok).toBe(false);
  });

  it("fusionne un envoi partiel et ignore storage.path", async () => {
    const result = await store.saveUploadConfig({
      limits: { maxFileSize: 12 },
      storage: { path: "/etc", structure: "flat" },
    });
    expect(result.ok).toBe(true);
    const saved = onDisk();
    expect(saved.limits.maxFileSize).toBe(12);
    // Le reste des limites et des sections est conservé.
    expect(saved.limits.maxFilesPerUpload).toBe(defaultConfig.limits.maxFilesPerUpload);
    expect(saved.thumbnails).toEqual(defaultConfig.thumbnails);
    expect(saved.storage.structure).toBe("flat");
    expect(saved.storage.path).toBe(defaultConfig.storage.path);
  });

  it("montre le dossier réel à un admin, rien aux autres", () => {
    expect(store.presentUploadConfig(defaultConfig, { admin: true }).storage.path).toBe("/srv/sxm/uploads");
    expect(store.presentUploadConfig(defaultConfig, { admin: false }).storage.path).toBe("");
  });
});

describe("les deux routes passent par le même chemin", () => {
  it("PUT /api/settings/config et POST /api/uploads/config valident de la même façon", async () => {
    const settingsRoute = await import("@/app/api/settings/config/route");
    const uploadsRoute = await import("@/app/api/uploads/config/route");
    const invalid = { limits: { maxFileSize: 1, minFileSize: 5000 } };

    const put = await settingsRoute.PUT(jsonRequest(`${ORIGIN}/api/settings/config`, "PUT", invalid), {});
    const post = await uploadsRoute.POST(jsonRequest(`${ORIGIN}/api/uploads/config`, "POST", invalid), {});
    expect(put.status).toBe(400);
    expect(post.status).toBe(400);
    expect((await put.json()).error).toBe((await post.json()).error);

    // L'ancienne route acceptait n'importe quel objet qui avait l'air complet.
    const garbage = { ...defaultConfig, limits: { ...defaultConfig.limits, maxFileSize: -5 } };
    expect((await uploadsRoute.POST(jsonRequest(`${ORIGIN}/api/uploads/config`, "POST", garbage), {})).status).toBe(400);

    const ok = await uploadsRoute.POST(jsonRequest(`${ORIGIN}/api/uploads/config`, "POST", { limits: { maxFileSize: 20 } }), {});
    expect(ok.status).toBe(200);
    expect(onDisk().limits.maxFileSize).toBe(20);
  });

  it("reste réservé aux administrateurs", async () => {
    state.session = user;
    const settingsRoute = await import("@/app/api/settings/config/route");
    const uploadsRoute = await import("@/app/api/uploads/config/route");
    expect((await settingsRoute.PUT(jsonRequest(`${ORIGIN}/api/settings/config`, "PUT", {}), {})).status).toBe(403);
    expect((await uploadsRoute.POST(jsonRequest(`${ORIGIN}/api/uploads/config`, "POST", {}), {})).status).toBe(403);

    // Lecture : un compte ordinaire ne voit pas le dossier du serveur.
    const read = await (await settingsRoute.GET()).json();
    expect(read.storage.path).toBe("");
  });
});

describe("envoi depuis la galerie", () => {
  it("refuse un envoi qui dépasse maxFilesPerUpload", async () => {
    vi.doMock("@/lib/server/config", () => ({
      getServerConfig: async () => ({
        ...defaultConfig,
        limits: { ...defaultConfig.limits, maxFilesPerUpload: 1 },
      }),
    }));
    vi.resetModules();
    state.session = admin;
    const { POST } = await import("@/app/api/gallery/upload/route");
    const form = new FormData();
    form.append("file", new File(["a"], "a.png", { type: "image/png" }));
    form.append("file", new File(["b"], "b.png", { type: "image/png" }));
    const request = new Request(`${ORIGIN}/api/gallery/upload`, { method: "POST", body: form });
    const sized = new Request(request, { headers: { ...Object.fromEntries(request.headers), "content-length": "2048", origin: ORIGIN } });
    const response = await POST(sized as never);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/1 au plus/);
    vi.doUnmock("@/lib/server/config");
  });
});
