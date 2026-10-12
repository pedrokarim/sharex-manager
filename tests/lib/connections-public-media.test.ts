import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import {
  countPublicLinks,
  createPublicLink,
  linkAccesses,
  newTempFilePath,
  publicMediaStatus,
  purgePublicLinks,
  revokeLinksForJob,
  revokePublicLink,
  servePublicMedia,
} from "@/lib/connections/public-media";

const saved = { ...process.env };
let root: string;
let filePath: string;
let content: Buffer;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-media-"));
  setDataRoot(path.join(root, "data"));
  process.env.AUTH_URL = "https://sxm.example.org/";
  content = randomBytes(10_000);
  filePath = path.join(root, "exports", "clip.mp4");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

/** Jeton (avec extension) d'une adresse de lien public. */
const tokenOf = (url: string) => url.split("/api/connections/media/")[1];
const get = (token: string, headers: Record<string, string> = {}, now?: number) =>
  servePublicMedia(new Request(`https://sxm.example.org/api/connections/media/${token}`, { headers }), token, now);
const head = (token: string) => servePublicMedia(new Request(`https://sxm.example.org/api/connections/media/${token}`, { method: "HEAD" }), token);
const disk = () => fs.readFileSync(path.join(root, "data", "public-media.json"), "utf-8");

/** Aucun en-tête ni corps ne doit contenir le chemin du fichier. */
async function expectNoPathLeak(response: Response) {
  const text = [...response.headers.entries()].map(([key, value]) => `${key}: ${value}`).join("\n");
  const body = response.headers.get("content-type")?.startsWith("application/json") ? await response.clone().text() : "";
  for (const fragment of [root, filePath, "exports", "clip.mp4"]) {
    expect(text).not.toContain(fragment);
    expect(body).not.toContain(fragment);
  }
}

describe("liens publics temporaires", () => {
  test("adresse ASCII tirée d'AUTH_URL, jeton de 256 bits jamais écrit en clair, extension du fichier", () => {
    const link = createPublicLink({ filePath, jobId: "pub-test" });
    expect(link.url).toMatch(/^https:\/\/sxm\.example\.org\/api\/connections\/media\/[A-Za-z0-9_-]{43}\.mp4$/);
    expect(link.expiresAt - Date.now()).toBeGreaterThan(59 * 60_000);
    const token = tokenOf(link.url).replace(/\.mp4$/, "");
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(disk()).not.toContain(token);
  });

  test("lecture entière : type exact, aucun cache, non indexé, contenu intact", async () => {
    const link = createPublicLink({ filePath });
    const response = get(tokenOf(link.url));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(response.headers.get("content-length")).toBe(String(content.length));
    expect(Buffer.from(await response.arrayBuffer()).equals(content)).toBe(true);
    await expectNoPathLeak(response);
  });

  test("`Range` : réponse partielle ; `HEAD` : en-têtes sans corps, non compté ; journal des accès", async () => {
    const link = createPublicLink({ filePath, jobId: "pub-test", maxDownloads: 1 });
    const token = tokenOf(link.url);
    const probe = head(token);
    expect(probe.status).toBe(200);
    expect(probe.headers.get("content-length")).toBe(String(content.length));
    expect(probe.body).toBeNull();
    const partial = get(token, { range: "bytes=100-199", "user-agent": "faux-robot/1.0" });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe(`bytes 100-199/${content.length}`);
    expect(Buffer.from(await partial.arrayBuffer()).equals(content.subarray(100, 200))).toBe(true);
    // Lectures par morceaux : une lecture complète reste permise.
    expect(get(token).status).toBe(200);
    const accesses = linkAccesses("pub-test", link.id);
    expect(accesses.map((entry) => [entry.method, entry.status, entry.bytes])).toEqual([
      ["HEAD", 200, 0],
      ["GET", 206, 100],
      ["GET", 200, content.length],
    ]);
    expect(accesses[1].agent).toBe("faux-robot/1.0");
  });

  test("épuisé : au-delà des lectures permises, 404", async () => {
    const link = createPublicLink({ filePath, maxDownloads: 1 });
    const token = tokenOf(link.url);
    expect(get(token).status).toBe(200);
    const refused = get(token);
    expect(refused.status).toBe(404);
    await expectNoPathLeak(refused);
  });

  test("inconnu, mal formé, expiré, révoqué : la même réponse 404", async () => {
    const link = createPublicLink({ filePath, ttlMs: 60_000 });
    const token = tokenOf(link.url);
    const unknown = get(randomBytes(32).toString("base64url"));
    const malformed = get("../../etc/passwd");
    const expired = get(token, {}, Date.now() + 61_000);
    expect([unknown.status, malformed.status, expired.status]).toEqual([404, 404, 404]);
    const bodies = await Promise.all([unknown, malformed, expired].map((response) => response.text()));
    expect(new Set(bodies).size).toBe(1);
    revokePublicLink(link.id);
    const revoked = get(token);
    expect(revoked.status).toBe(404);
    await expectNoPathLeak(revoked);
  });

  test("révocation par travail ; liens expirés effacés", () => {
    const one = createPublicLink({ filePath, jobId: "pub-a" });
    createPublicLink({ filePath, jobId: "pub-b", ttlMs: 60_000 });
    revokeLinksForJob("pub-a");
    expect(get(tokenOf(one.url)).status).toBe(404);
    expect(countPublicLinks()).toBe(1);
    expect(purgePublicLinks(Date.now() + 120_000)).toBe(0);
    expect(JSON.parse(disk()).links).toHaveLength(0);
  });

  test("fichier dérivé : seulement depuis le dossier temporaire, effacé avec son lien", () => {
    expect(() => createPublicLink({ filePath, ownsFile: true })).toThrow(/tempFile/);
    const derived = newTempFilePath("pub-c", "jpg");
    fs.writeFileSync(derived, Buffer.from("jpeg"));
    const link = createPublicLink({ filePath: derived, ownsFile: true, jobId: "pub-c" });
    expect(link.url.endsWith(".jpg")).toBe(true);
    expect(get(tokenOf(link.url)).headers.get("content-type")).toBe("image/jpeg");
    revokeLinksForJob("pub-c");
    expect(fs.existsSync(derived)).toBe(false);
  });

  test("sans AUTH_URL ou sans fichier : refus clair", () => {
    expect(() => createPublicLink({ filePath: path.join(root, "absent.mp4") })).toThrow(/introuvable/);
    expect(() => createPublicLink({ filePath: "relatif.mp4" })).toThrow(/invalide/);
    delete process.env.AUTH_URL;
    expect(() => createPublicLink({ filePath })).toThrow(/AUTH_URL/);
  });

  test("durée bornée : une minute au moins, vingt-quatre heures au plus", () => {
    const now = Date.now();
    expect(createPublicLink({ filePath, ttlMs: 1, now }).expiresAt).toBe(now + 60_000);
    expect(createPublicLink({ filePath, ttlMs: 7 * 24 * 3600_000, now }).expiresAt).toBe(now + 24 * 3600_000);
  });

  test("joignabilité : adresse locale ou HTTP signalées", () => {
    expect(publicMediaStatus().reachable).toBe(true);
    for (const local of ["http://localhost:3000", "https://192.168.1.20", "https://nas.local", "https://10.0.0.4:8443"]) {
      process.env.AUTH_URL = local;
      expect(publicMediaStatus()).toMatchObject({ reachable: false, reason: expect.stringMatching(/locale/) });
    }
    process.env.AUTH_URL = "http://sxm.example.org";
    expect(publicMediaStatus().reason).toMatch(/HTTPS/);
    delete process.env.AUTH_URL;
    expect(publicMediaStatus().reachable).toBe(false);
  });
});
