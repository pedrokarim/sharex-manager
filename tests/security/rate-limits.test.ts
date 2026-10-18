import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Limites de débit : envois par clé API (429 lisible par ShareX, avec
 * `Retry-After`), affichages d'images et API publique par adresse, aucune
 * case commune aux requêtes sans adresse, table bornée en mémoire.
 */

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => null } },
  trustedOrigins: ["https://sxm.example.test"],
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/utils/db", () => ({ logDb: { createLog: vi.fn() } }));
vi.mock("@/lib/upload", () => ({ handleFileUpload: async () => ({ success: false, error: "non utilisé" }) }));
vi.mock("@/lib/sse", () => ({ gallerySSEManager: { broadcast: () => {}, getClientCount: () => 0 } }));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-rate-limits-"));
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

const rateLimit = await import("@/lib/rate-limit");
const guards = await import("@/lib/security/rate-limits");
const settings = await import("@/lib/security/settings");
const store = await import("@/lib/api-key-store");
store.setApiKeysPath(path.join(directory, "api-keys.json"));
settings.setSecuritySettingsPath(path.join(directory, "security.json"));

const ORIGIN = "https://sxm.example.test";

function withIp(ip?: string): Headers {
  return new Headers(ip ? { "x-real-ip": ip } : {});
}

beforeEach(() => {
  rateLimit.resetRateLimits();
  fs.rmSync(path.join(directory, "security.json"), { force: true });
  fs.rmSync(path.join(directory, "api-keys.json"), { force: true });
  settings.setSecuritySettingsPath(path.join(directory, "security.json"));
});

describe("envois par clé API", () => {
  async function upload(secret: string) {
    const { POST } = await import("@/app/api/upload/route");
    return POST(new Request(`${ORIGIN}/api/upload`, { method: "POST", headers: { "x-api-key": secret } }) as never);
  }

  it("répond 429 avec Retry-After et un message JSON au-delà de la limite horaire de la clé", async () => {
    settings.updateSecuritySettings({ apiKeys: { uploadsPerHour: 2 } });
    const permissions = { uploadImages: true, uploadText: false, uploadFiles: false };
    const first = await store.createApiKey({ name: "a", permissions, expiresAt: null, createdBy: "alice" });
    const second = await store.createApiKey({ name: "b", permissions, expiresAt: null, createdBy: "alice" });

    // Sans taille annoncée : refusé (411), mais compté.
    expect((await upload(first.secret)).status).toBe(411);
    expect((await upload(first.secret)).status).toBe(411);
    const limited = await upload(first.secret);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = await limited.json();
    expect(body.error).toMatch(/2 envois par heure/);

    // Une autre clé a son propre compteur.
    expect((await upload(second.secret)).status).toBe(411);
  });

  it("le niveau de l'écran Sécurité s'applique quand il est plus strict que la limite de la clé", () => {
    settings.updateSecuritySettings({ apiKeys: { uploadsPerHour: 10_000 }, rateLimits: { level: "strict" } });
    expect(settings.getRateLimits().uploadsPerKeyPerHour).toBe(60);
  });
});

describe("sans adresse attestée", () => {
  it("ne partage pas le compteur d'un visiteur, et passe par un plafond global plus large", () => {
    const options = { max: 2, windowMs: 60_000 };
    expect(rateLimit.checkIpRateLimit("scope", withIp("203.0.113.5"), options).allowed).toBe(true);
    expect(rateLimit.checkIpRateLimit("scope", withIp("203.0.113.5"), options).allowed).toBe(true);
    expect(rateLimit.checkIpRateLimit("scope", withIp("203.0.113.5"), options).allowed).toBe(false);

    // Les requêtes sans adresse ne sont pas bloquées par ce visiteur…
    for (let i = 0; i < 2 * rateLimit.UNKNOWN_IP_FACTOR; i++) {
      expect(rateLimit.checkIpRateLimit("scope", withIp(), options).allowed).toBe(true);
    }
    // … mais leur plafond global finit par s'appliquer.
    expect(rateLimit.checkIpRateLimit("scope", withIp(), options).allowed).toBe(false);
    // Et un autre visiteur n'en pâtit pas.
    expect(rateLimit.checkIpRateLimit("scope", withIp("203.0.113.6"), options).allowed).toBe(true);
  });

  it("ignore un X-Forwarded-For déclaratif : sans X-Real-IP, c'est le plafond global", () => {
    const options = { max: 1, windowMs: 60_000 };
    const spoofed = new Headers({ "x-forwarded-for": "198.51.100.1" });
    for (let i = 0; i < rateLimit.UNKNOWN_IP_FACTOR; i++) {
      expect(rateLimit.checkIpRateLimit("xff", spoofed, options).allowed).toBe(true);
    }
    expect(rateLimit.checkIpRateLimit("xff", spoofed, options).allowed).toBe(false);
  });
});

describe("table bornée", () => {
  it("ne garde jamais plus de MAX_ENTRIES compteurs", () => {
    for (let i = 0; i < rateLimit.MAX_ENTRIES + 500; i++) {
      rateLimit.checkRateLimit(`flood:${i}`, { max: 5, windowMs: 60_000 });
    }
    expect(rateLimit.rateLimitEntryCount()).toBeLessThanOrEqual(rateLimit.MAX_ENTRIES);
    // Le compteur le plus récent est toujours là.
    rateLimit.checkRateLimit("flood:last", { max: 1, windowMs: 60_000 });
    expect(rateLimit.checkRateLimit("flood:last", { max: 1, windowMs: 60_000 }).allowed).toBe(false);
  });
});

describe("API publique et images", () => {
  it("limite l'API publique par adresse selon le niveau choisi", () => {
    settings.updateSecuritySettings({ rateLimits: { level: "strict" } });
    const max = settings.getRateLimits().publicApiPerIpPerMinute;
    const request = () => new Request(`${ORIGIN}/api/public/catalog`, { headers: { "x-real-ip": "203.0.113.9" } });
    for (let i = 0; i < max; i++) expect(guards.limitPublicApi(request())).toBeNull();
    const refused = guards.limitPublicApi(request());
    expect(refused?.status).toBe(429);
    expect(Number(refused?.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Une autre adresse passe.
    expect(
      guards.limitPublicApi(new Request(`${ORIGIN}/api/public/catalog`, { headers: { "x-real-ip": "203.0.113.10" } }))
    ).toBeNull();
  });

  it("garde une limite d'affichage d'images plus large que celle de l'API", () => {
    for (const level of ["relaxed", "normal", "strict"] as const) {
      settings.updateSecuritySettings({ rateLimits: { level } });
      const limits = settings.getRateLimits();
      expect(limits.imageViewsPerIpPerMinute).toBeGreaterThan(limits.publicApiPerIpPerMinute);
    }
    const request = () => new Request(`${ORIGIN}/img.png`, { headers: { "x-real-ip": "203.0.113.11" } });
    const max = settings.getRateLimits().imageViewsPerIpPerMinute;
    for (let i = 0; i < max; i++) expect(guards.limitImageView(request())).toBeNull();
    expect(guards.limitImageView(request())?.status).toBe(429);
  });
});
