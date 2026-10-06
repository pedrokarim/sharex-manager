import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ uploads: "" }));
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => shared.uploads }));

import { AbortedError, type SourceAdapter } from "@/modules/scan-studio/lib/server/sources/adapter";
import type { Clock, TransportResponse } from "@/modules/scan-studio/lib/server/sources/fetcher";
import { ICON_SIZE, findDeclaredIcons, normalizeIcon } from "@/modules/scan-studio/lib/server/sources/icons";
import { SourceHub } from "@/modules/scan-studio/lib/server/sources/index";
import { setDataRoot } from "@/modules/scan-studio/lib/store";

let root = "";
const iconPath = () => path.join(root, "data", "sources", "icons", "example.png");

const adapter: SourceAdapter = {
  id: "example",
  name: "Example Reader",
  homepage: "https://reader.example.org/",
  hosts: ["reader.example.org"],
  requestHosts: ["static.example.org"],
  example: "https://reader.example.org/c/42",
  notes: "Site d’essai.",
  match: (url) => url.pathname.startsWith("/c/"),
  resolve: async () => ({ info: { pageCount: 0 }, pages: [] }),
};

async function png(side: number, color = { r: 240, g: 80, b: 40 }): Promise<Buffer> {
  return sharp({ create: { width: side, height: side, channels: 4, background: { ...color, alpha: 1 } } }).png().toBuffer();
}

/** Un `.ico` qui range une image PNG, comme le font les sites pour leurs grandes tailles. */
function ico(image: Buffer): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt32LE(image.length, 6 + 8);
  header.writeUInt32LE(22, 6 + 12);
  return Buffer.concat([header, image]);
}

const respond = (body: Buffer | string, type: string, status = 200): TransportResponse => ({ status, headers: { "content-type": type }, body: Buffer.from(body) });

const HOME = `<!doctype html><html><head>
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/favicon.ico" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel='icon' type='image/png' sizes='32x32' href='/icons/32.png'>
  <link rel="apple-touch-icon" href="/icons/apple-180.png" />
  <link rel="icon" sizes="512x512" href="https://ailleurs.example.com/512.png" />
  <link rel="stylesheet" href="/app.css" />
</head><body></body></html>`;

const MANIFEST = JSON.stringify({
  name: "Example Reader",
  icons: [
    { src: "/icons/pwa-64.png", sizes: "64x64", type: "image/png" },
    { src: "https://static.example.org/pwa-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icons/logo.svg", sizes: "any", type: "image/svg+xml" },
  ],
});

function setup(routes: Record<string, () => TransportResponse | Promise<TransportResponse>>) {
  let time = 1_800_000_000_000;
  const clock: Clock = {
    now: () => time,
    sleep: async (milliseconds, signal) => {
      if (signal?.aborted) throw new AbortedError();
      time += milliseconds;
    },
  };
  const requests: string[] = [];
  const hub = new SourceHub({
    adapters: [adapter],
    clock,
    transport: async (request) => {
      const url = request.url.toString();
      requests.push(url);
      const route = routes[url];
      return route ? route() : respond("introuvable", "text/plain", 404);
    },
  });
  return { hub, requests, advance: (milliseconds: number) => (time += milliseconds) };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-icons-"));
  shared.uploads = path.join(root, "uploads");
  setDataRoot(path.join(root, "data"));
  vi.stubGlobal("fetch", () => Promise.reject(new Error("fetch réel appelé pendant un test")));
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("ce qui est accepté comme icône", () => {
  it("redessine une image en PNG carré de taille fixe", async () => {
    for (const source of [await png(512), await png(16), await sharp(await png(300)).jpeg().toBuffer(), await sharp(await png(96)).webp().toBuffer()]) {
      const metadata = await sharp(await normalizeIcon(source)).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(["png", ICON_SIZE, ICON_SIZE]);
    }
    // Une image qui n'est pas carrée garde ses proportions, sur fond transparent.
    const wide = await sharp({ create: { width: 400, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const metadata = await sharp(await normalizeIcon(wide)).metadata();
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([ICON_SIZE, ICON_SIZE, true]);
  });

  it("lit l'image PNG rangée dans un `.ico`", async () => {
    const metadata = await sharp(await normalizeIcon(ico(await png(256)))).metadata();
    expect([metadata.format, metadata.width]).toEqual(["png", ICON_SIZE]);
  });

  it("lit l'image brute d'un vieux `.ico`, en 32 et en 24 bits, avec sa transparence", async () => {
    // Une icône de 2 × 2, écrite à la main : rouge et vert en haut, bleu et un pixel transparent en bas.
    const pixels = [
      [255, 0, 0, 255], // bas gauche : bleu (les lignes vont de bas en haut, en BGRA)
      [9, 9, 9, 0], // bas droite : transparent
      [0, 0, 255, 255], // haut gauche : rouge
      [0, 255, 0, 255], // haut droite : vert
    ];
    const header = (depth: number) => {
      const dib = Buffer.alloc(40);
      dib.writeUInt32LE(40, 0);
      dib.writeInt32LE(2, 4);
      dib.writeInt32LE(4, 8);
      dib.writeUInt16LE(1, 12);
      dib.writeUInt16LE(depth, 14);
      return dib;
    };
    const deep = Buffer.concat([header(32), Buffer.from(pixels.flat()), Buffer.alloc(8)]);
    // En 24 bits, chaque ligne est complétée à 4 octets, et c'est le masque qui dit la transparence.
    const rows = [pixels.slice(0, 2), pixels.slice(2)].map((row) => Buffer.concat([Buffer.from(row.flatMap((pixel) => pixel.slice(0, 3))), Buffer.alloc(2)]));
    const flat = Buffer.concat([header(24), ...rows, Buffer.from([0b01000000, 0, 0, 0]), Buffer.alloc(4)]);

    for (const image of [deep, flat]) {
      const result = await sharp(await normalizeIcon(ico(image))).raw().toBuffer({ resolveWithObject: true });
      expect([result.info.width, result.info.height]).toEqual([ICON_SIZE, ICON_SIZE]);
      const at = (x: number, y: number) => [...result.data.subarray((y * ICON_SIZE + x) * 4, (y * ICON_SIZE + x) * 4 + 4)];
      const quarter = ICON_SIZE / 4;
      expect(at(quarter, quarter)).toEqual([255, 0, 0, 255]);
      expect(at(3 * quarter, quarter)).toEqual([0, 255, 0, 255]);
      expect(at(quarter, 3 * quarter)).toEqual([0, 0, 255, 255]);
      expect(at(3 * quarter, 3 * quarter)[3]).toBe(0);
    }
  });

  it("refuse ce qui n'est pas une image", async () => {
    const refused: Buffer[] = [
      Buffer.from("<html><body>Page d'erreur</body></html>"),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script><rect width="64" height="64"/></svg>'),
      Buffer.from("GIF89a pas vraiment"),
      Buffer.alloc(0),
      Buffer.alloc(3 * 1024 * 1024, 1),
      // Un `.ico` sans image PNG à l'intérieur.
      ico(Buffer.from("BM bitmap brut, non lu")),
      (await png(64)).subarray(0, 40),
    ];
    for (const buffer of refused) await expect(normalizeIcon(buffer), buffer.subarray(0, 20).toString()).rejects.toThrow();
  });
});

describe("ce qu'une page d'accueil déclare", () => {
  it("relève le manifeste et les icônes, avec leur taille, sans les SVG ni les autres liens", () => {
    const declared = findDeclaredIcons(HOME, "https://reader.example.org/");
    expect(declared.manifest).toBe("https://reader.example.org/manifest.webmanifest");
    expect(declared.icons).toEqual([
      { url: "https://reader.example.org/favicon.ico", size: 0 },
      { url: "https://reader.example.org/icons/32.png", size: 32 },
      { url: "https://reader.example.org/icons/apple-180.png", size: 180 },
      { url: "https://ailleurs.example.com/512.png", size: 512 },
    ]);
    expect(findDeclaredIcons("<p>rien</p>", "https://reader.example.org/")).toEqual({ icons: [], manifest: undefined });
  });
});

describe("icône d'un site", () => {
  it("est lue chez le site la première fois qu'il est listé, puis plus jamais d'elle-même", async () => {
    const big = await png(192);
    const { hub, requests } = setup({
      "https://reader.example.org/": () => respond(HOME, "text/html; charset=utf-8"),
      "https://reader.example.org/manifest.webmanifest": () => respond(MANIFEST, "application/manifest+json"),
      "https://static.example.org/pwa-192.png": () => respond(big, "image/png"),
    });

    const [status] = await hub.listSources();
    expect(status).toMatchObject({ id: "example", name: "Example Reader", homepage: "https://reader.example.org/", hosts: ["reader.example.org"], enabled: true, notes: "Site d’essai." });
    expect(status.iconUrl).toMatch(/^\/api\/modules\/scan-studio\/data\/sources\/icons\/example\.png\?v=\d+$/);
    // Les icônes déclarées d'abord, de la plus petite qui suffit à la plus grande : celle
    // d'Apple (180 px) manque ici, celle du manifeste (192 px) la remplace. Jamais `/favicon.ico`.
    expect(requests).toEqual([
      "https://reader.example.org/",
      "https://reader.example.org/manifest.webmanifest",
      "https://reader.example.org/icons/apple-180.png",
      "https://static.example.org/pwa-192.png",
    ]);

    const stored = await sharp(fs.readFileSync(iconPath())).metadata();
    expect([stored.format, stored.width, stored.height]).toEqual(["png", ICON_SIZE, ICON_SIZE]);

    // Lister de nouveau ne joint plus le site.
    const again = await hub.listSources();
    expect(again[0].iconUrl).toBe(status.iconUrl);
    expect(requests).toHaveLength(4);
  });

  it("n'appelle jamais un domaine que l'adaptateur n'a pas déclaré, même pour une icône", async () => {
    const { hub, requests } = setup({
      "https://reader.example.org/": () => respond('<link rel="icon" sizes="512x512" href="https://ailleurs.example.com/512.png"><link rel="manifest" href="https://ailleurs.example.com/m.json">', "text/html"),
      "https://reader.example.org/favicon.ico": async () => respond(ico(await png(64)), "image/x-icon"),
    });
    const [status] = await hub.listSources();
    expect(status.iconUrl).toBeDefined();
    expect(requests).toEqual(["https://reader.example.org/", "https://reader.example.org/favicon.ico"]);
  });

  it("une mauvaise image est refusée : pas d'icône, et pas de nouvelle tentative à chaque affichage", async () => {
    const { hub, requests, advance } = setup({
      "https://reader.example.org/": () => respond('<link rel="apple-touch-icon" href="/apple.png">', "text/html"),
      "https://reader.example.org/apple.png": () => respond("<html>Accès refusé</html>", "image/png"),
      "https://reader.example.org/favicon.ico": () => respond('<svg xmlns="http://www.w3.org/2000/svg"/>', "image/svg+xml"),
    });
    const [status] = await hub.listSources();
    expect(status.iconUrl).toBeUndefined();
    expect(fs.existsSync(iconPath())).toBe(false);
    expect(requests).toHaveLength(3);

    await hub.listSources();
    await hub.listSources();
    expect(requests).toHaveLength(3);

    // Le lendemain, une seule nouvelle tentative.
    advance(25 * 60 * 60 * 1000);
    await hub.listSources();
    expect(requests).toHaveLength(6);
  });

  it("s'en tient à quelques images : pas le tour de toutes les déclinaisons", async () => {
    const links = Array.from({ length: 12 }, (_, index) => `<link rel="icon" sizes="${200 + index}x${200 + index}" href="/i/${index}.png">`).join("");
    const { hub, requests } = setup({ "https://reader.example.org/": () => respond(links, "text/html") });
    await hub.listSources();
    expect(requests.filter((url) => url.includes("/i/"))).toHaveLength(3);
  });

  it("un administrateur peut la relire ; un échec est dit et l'ancienne icône reste", async () => {
    let working = true;
    const first = await png(128, { r: 10, g: 200, b: 10 });
    const { hub, requests } = setup({
      "https://reader.example.org/favicon.ico": () => (working ? respond(ico(first), "image/x-icon") : respond("panne", "text/plain", 500)),
    });
    const [listed] = await hub.listSources();
    const before = fs.readFileSync(iconPath());

    const refreshed = await hub.refreshSourceIcon("example");
    expect(refreshed.iconUrl).toBeDefined();
    expect(refreshed.iconUrl).not.toBe(listed.iconUrl);
    expect(requests.filter((url) => url.endsWith("/favicon.ico"))).toHaveLength(2);

    working = false;
    await expect(hub.refreshSourceIcon("example")).rejects.toThrow(/icône de Example Reader/);
    expect(fs.readFileSync(iconPath()).equals(before)).toBe(true);
    expect((await hub.listSources())[0].iconUrl).toBe(refreshed.iconUrl);
    await expect(hub.refreshSourceIcon("inconnue")).rejects.toThrow("Source inconnue.");
  });

  it("un adaptateur désactivé n'est pas joint pour son icône", async () => {
    const { hub, requests } = setup({});
    hub.setSourceEnabled("example", false);
    const [status] = await hub.listSources();
    expect(status.enabled).toBe(false);
    expect(status.iconUrl).toBeUndefined();
    expect(requests).toEqual([]);
  });
});
