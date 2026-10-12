import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { buildContactSheet, CONTACT_SHEET } from "@/lib/image-search/contact-sheet";
import { checkImage, downloadImage } from "@/lib/image-search/download";
import { getOpenverseImage, searchOpenverseImages, toCandidate, type OpenverseImage } from "@/lib/image-search/openverse";
import { imageCredit } from "@/lib/image-search/types";

const UUID = (n: number) => `0000000${n}-aaaa-4bbb-8ccc-dddddddddddd`;

function item(n: number, overrides: Partial<OpenverseImage> = {}): OpenverseImage {
  return {
    id: UUID(n),
    title: `Image ${n}`,
    creator: "Auteur",
    license: "by",
    license_version: "4.0",
    license_url: "https://creativecommons.org/licenses/by/4.0/",
    foreign_landing_url: `https://www.flickr.com/photos/x/${n}`,
    url: `https://live.staticflickr.com/${n}.jpg`,
    thumbnail: `https://api.openverse.org/v1/images/${UUID(n)}/thumb/`,
    width: 1600,
    height: 1200,
    filetype: "jpg",
    ...overrides,
  };
}

function jsonFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

const solid = (width: number, height: number, format: "png" | "jpeg" = "png", background = "#2f6bff") =>
  sharp({ create: { width, height, channels: 3, background } })[format]().toBuffer();

describe("image-search : Openverse", () => {
  it("ne garde que CC0, domaine public et CC BY, même si l'API en renvoie d'autres", async () => {
    const fetch = jsonFetch({
      results: [
        item(1, { license: "cc0" }),
        item(2, { license: "pdm" }),
        item(3, { license: "by", license_version: "2.0" }),
        item(4, { license: "by-nc" }),
        item(5, { license: "by-sa" }),
        item(6, { license: "by-nd" }),
        item(7, { license: "by-nc-sa" }),
      ],
    });
    const results = await searchOpenverseImages("mount fuji", { fetch });
    expect(results.map((result) => result.license)).toEqual(["CC0", "Domaine public", "CC BY 2.0"]);
    expect(results.every((result) => result.rights === "free" && result.provider === "openverse")).toBe(true);
    expect(results[0]).toMatchObject({ id: `openverse:${UUID(1)}`, thumbnail: `https://api.openverse.org/v1/images/${UUID(1)}/thumb/` });

    const [url, init] = fetch.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(params.get("license")).toBe("cc0,pdm,by");
    expect(params.get("q")).toBe("mount fuji");
    expect(new Headers(init?.headers).get("user-agent")).toMatch(/ShareX-Manager/);
  });

  it("écarte les SVG, les images trop petites, le contenu pour adultes et les adresses non https", async () => {
    const fetch = jsonFetch({
      results: [
        item(1, { filetype: "svg", url: "https://upload.wikimedia.org/a.svg" }),
        item(2, { width: 400, height: 300 }),
        item(3, { mature: true }),
        item(4, { url: "http://example.com/x.jpg" }),
        item(5, { id: "../../etc" }),
        item(6),
      ],
    });
    const results = await searchOpenverseImages("volcano", { fetch, minShortSide: 640 });
    expect(results.map((result) => result.id)).toEqual([`openverse:${UUID(6)}`]);
  });

  it("traduit les erreurs de l'API en français", async () => {
    await expect(searchOpenverseImages("volcano", { fetch: jsonFetch({}, 429) })).rejects.toThrow("limite");
    await expect(searchOpenverseImages("volcano", { fetch: jsonFetch({}, 500) })).rejects.toThrow("HTTP 500");
  });

  it("relit une image par son identifiant et refuse une licence NC", async () => {
    const ok = await getOpenverseImage(UUID(1), { fetch: jsonFetch(item(1, { license: "cc0" })) });
    expect(ok.imageUrl).toBe("https://live.staticflickr.com/1.jpg");
    await expect(getOpenverseImage(UUID(1), { fetch: jsonFetch(item(1, { license: "by-nc" })) })).rejects.toThrow("CC0");
    await expect(getOpenverseImage("pas-un-uuid", { fetch: jsonFetch({}) })).rejects.toThrow("invalide");
  });

  it("compose la mention « Titre – Auteur, licence, page source »", () => {
    const candidate = toCandidate(item(1))!;
    expect(imageCredit(candidate)).toBe("Image 1 – Auteur, CC BY 4.0, https://www.flickr.com/photos/x/1");
    expect(imageCredit({ title: "Fuji", license: "CC0" })).toBe("Fuji, CC0");
  });
});

describe("image-search : téléchargement contrôlé", () => {
  it("accepte une image assez grande et la réencode", async () => {
    const image = await checkImage(await solid(900, 700, "jpeg"));
    expect(image).toMatchObject({ format: "jpeg", extension: "jpg", width: 900, height: 700 });
    expect((await sharp(image.buffer).metadata()).format).toBe("jpeg");
  });

  it("refuse une image trop petite", async () => {
    await expect(checkImage(await solid(800, 500))).rejects.toThrow("trop petite");
  });

  it("refuse un SVG, même annoncé comme une image", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200"/></svg>');
    await expect(checkImage(svg)).rejects.toThrow("SVG");
    const fetchImage = async () => ({ b64: svg.toString("base64"), mimeType: "image/png", name: "x.png" });
    await expect(downloadImage("https://example.com/x.png", { fetchImage })).rejects.toThrow("SVG");
  });

  it("refuse un GIF animé et un fichier qui n'est pas une image", async () => {
    // Deux images différentes : l'encodeur fusionnerait deux images identiques.
    const frames = [await solid(700, 700, "png", "#ff4f9a"), await solid(700, 700, "png", "#2f6bff")];
    const gif = await sharp(frames, { join: { animated: true } }).gif().toBuffer();
    await expect(checkImage(gif)).rejects.toThrow("animées");
    await expect(checkImage(Buffer.from("<html>pas une image</html>"))).rejects.toThrow("pas une image");
  });

  it("refuse une adresse interne avant toute requête", async () => {
    await expect(downloadImage("http://127.0.0.1:3000/x.png")).rejects.toThrow("adresse interne");
    await expect(downloadImage("http://[::ffff:169.254.169.254]/latest/")).rejects.toThrow("adresse interne");
  });
});

describe("image-search : planche contact", () => {
  it("assemble les images sur deux colonnes", async () => {
    const tiles = await Promise.all([solid(800, 600), solid(600, 900), solid(1000, 1000)]);
    const { cell, gap } = CONTACT_SHEET;
    const sheet = await sharp(await buildContactSheet(tiles)).metadata();
    expect(sheet).toMatchObject({ format: "png", width: 2 * cell + 3 * gap, height: 2 * cell + 3 * gap });
    const pair = await sharp(await buildContactSheet(tiles.slice(0, 2))).metadata();
    expect(pair.height).toBe(cell + 2 * gap);
  });

  it("refuse une planche vide et s'arrête à quatre images", async () => {
    await expect(buildContactSheet([])).rejects.toThrow();
    const tiles = await Promise.all(Array.from({ length: 6 }, () => solid(700, 700)));
    const sheet = await sharp(await buildContactSheet(tiles)).metadata();
    expect(sheet.height).toBe(2 * CONTACT_SHEET.cell + 3 * CONTACT_SHEET.gap);
  });
});
