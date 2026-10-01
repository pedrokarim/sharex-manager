import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempShare, readTempShare, revokeTempShare } from "@/lib/temp-share";
import { parseIqdb, runEngine } from "@/modules/reverse-search/lib/engines";
import { ENGINES, bestMatchOf, engineInfo, engineLink, type EngineResult } from "@/modules/reverse-search/lib/types";

const probe = { buffer: Buffer.from("image"), mimeType: "image/jpeg", fileName: "image.jpg" };
const context = (keys = {}) => ({ probe, keys, publicUrl: async () => "https://exemple.test/image.jpg" });

const reply = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("recherche inversée : catalogue", () => {
  it("déclare ses fonctions et ne garde aucune clé hors des administrateurs", () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "modules/reverse-search/module.json"), "utf8"));
    const entry = fs.readFileSync(path.join(process.cwd(), "modules/reverse-search/index.process.ts"), "utf8");
    for (const name of Object.keys(config.functions)) {
      expect(config.functions[name]).toBe("user");
      expect(entry).toMatch(new RegExp(`export async function ${name}\\b`));
    }
    // Enregistrer une clé d'API reste réservé aux administrateurs.
    expect(entry).toMatch(/export async function saveKey\b/);
    expect(config.functions.saveKey).toBeUndefined();
  });

  it("construit le lien de chaque moteur vers sa propre page de résultats", () => {
    const url = "https://img.exemple.test/a b.png?x=1";
    for (const engine of ENGINES) {
      const link = engineLink(engine, url);
      expect(link.startsWith("https://")).toBe(true);
      expect(link).not.toContain("{url}");
    }
    expect(engineLink(engineInfo("google")!, url)).toBe(
      "https://lens.google.com/uploadbyurl?url=https%3A%2F%2Fimg.exemple.test%2Fa%20b.png%3Fx%3D1"
    );
    expect(engineLink(engineInfo("ascii2d")!, "https://img.exemple.test/a.png")).toBe(
      "https://ascii2d.net/search/url/https://img.exemple.test/a.png"
    );
  });

  it("retient la meilleure correspondance sûre, tous moteurs confondus", () => {
    const result = (engine: EngineResult["engine"], matches: EngineResult["matches"]): EngineResult => ({
      engine,
      status: "ok",
      matches,
      durationMs: 1,
      ranAt: 1,
    });
    const best = bestMatchOf({
      tracemoe: result("tracemoe", [{ title: "Douteux", similarity: 0.99, weak: true, links: [] }, { title: "Sûr", similarity: 0.91, links: [] }]),
      iqdb: result("iqdb", [{ title: "Danbooru", similarity: 0.95, links: [] }]),
      saucenao: { ...result("saucenao", []), status: "needs-key" },
    });
    expect(best).toEqual({ engine: "iqdb", title: "Danbooru", similarity: 0.95 });
    expect(bestMatchOf({})).toBeUndefined();
  });
});

describe("recherche inversée : IQDB", () => {
  const html = `
<div id='pages' class='pages'><div><table><tr><th>Your image</th></tr><tr><td class='image'><img src='/thu/thu_1.jpg' alt="[IMG]"></td></tr><tr><td>425×600</td></tr></table></div>
<div><table><tr><th>Best match</th></tr><tr><td class='image'><a href="http://www.zerochan.net/4004083"><img src='/zerochan/6/d/b/6d.jpg' alt="Rating: s Tags: Long Hair, Sousou no Frieren, Frieren" title="x" width='106' height='150'></a></td></tr><tr><td><img alt="icon" src="/icon/zerochan.ico" class="service-icon">Zerochan</td></tr><tr><td>1280×1809 [Safe]</td></tr><tr><td>95% similarity</td></tr></table></div>
<div><table><tr><th>Additional match</th></tr><tr><td class='image'><a href="//danbooru.donmai.us/posts/6620020"><img src='/danbooru/c/f/3/cf.jpg' alt="Rating: e Score: 1 Tags: 1boy 2girls black_coat frieren" title="x"></a></td></tr><tr><td><img alt="icon" src="/icon/danbooru.ico" class="service-icon">Danbooru <span class="el"><a href="//gelbooru.com/index.php?page=post&amp;s=list&amp;md5=cf"><img alt="icon" src="/icon/gelbooru.png" class="service-icon">Gelbooru</a></span></td></tr><tr><td>1800×2108 [Explicit]</td></tr><tr><td>58% similarity</td></tr></table></div>
<div id='more1' style='display: none'><div class='pages'>
<div><table><tr><td class='image'><a href="https://yande.re/post/show/1207726"><img src='/moe.imouto/2/2/f/22.jpg' alt="Rating: s Score: 3 Tags: dress elf" title="x" width='150' height='94'></a></td></tr><tr><td><img alt="icon" src="/icon/yandere.ico" class="service-icon">yande.re</td></tr><tr><td>3388×2112 [Safe]</td></tr><tr><td>43% similarity</td></tr></table></div>
<div><table><tr><td class='image'><a href="javascript:alert(1)"><img src='/x.jpg' alt=""></a></td></tr><tr><td>1×1 [Safe]</td></tr><tr><td>99% similarity</td></tr></table></div>
</div></div>`;

  it("lit les correspondances de la page de résultats", () => {
    const matches = parseIqdb(html);
    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({
      title: "Image sur Zerochan",
      subtitle: "Long Hair, Sousou no Frieren, Frieren",
      detail: "1280 × 1809",
      similarity: 0.95,
      thumbnail: "https://iqdb.org/zerochan/6/d/b/6d.jpg",
      links: [{ label: "Zerochan", url: "http://www.zerochan.net/4004083" }],
      adult: false,
      weak: false,
    });
    expect(matches[1]).toMatchObject({ title: "Image sur Danbooru", subtitle: "1boy, 2girls, black coat, frieren", adult: true, weak: false });
    expect(matches[1].links).toEqual([
      { label: "Danbooru", url: "https://danbooru.donmai.us/posts/6620020" },
      { label: "Gelbooru", url: "https://gelbooru.com/index.php?page=post&s=list&md5=cf" },
    ]);
    // Hors des rubriques « match », IQDB lui-même ne garantit rien.
    expect(matches[2]).toMatchObject({ title: "Image sur yande.re", weak: true });
  });

  it("ignore l'image envoyée et tout lien qui n'est pas une adresse web", () => {
    const urls = parseIqdb(html).flatMap((match) => match.links.map((link) => link.url));
    expect(urls.every((url) => /^https?:\/\//.test(url))).toBe(true);
    expect(parseIqdb("<html>rien</html>")).toEqual([]);
  });
});

describe("recherche inversée : moteurs", () => {
  it("met au même format une réponse de trace.moe, et marque ce qui est sous le seuil", async () => {
    const fetchMock = vi.fn(async () =>
      reply({
        quota: 100,
        quotaUsed: 3,
        error: "",
        result: [
          {
            anilist: { id: 154587, idMal: 52991, title: { romaji: "Sousou no Frieren", native: "葬送のフリーレン" }, format: "TV", seasonYear: 2023, genres: ["Adventure", "Drama"], isAdult: false, siteUrl: "https://anilist.co/anime/154587" },
            episode: 3,
            from: 754.2,
            similarity: 0.97,
            video: "https://api.trace.moe/video/abc",
            image: "https://api.trace.moe/image/abc",
          },
          { anilist: { title: {} }, filename: "inconnu.mp4", similarity: 0.44, image: "javascript:alert(1)" },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await runEngine("tracemoe", context());
    expect(result.status).toBe("ok");
    expect(result.message).toBe("97 recherches restantes ce mois-ci");
    expect(result.matches[0]).toMatchObject({
      title: "Sousou no Frieren",
      subtitle: "葬送のフリーレン · TV · 2023",
      detail: "Épisode 3, à 12:34",
      similarity: 0.97,
      preview: "https://api.trace.moe/video/abc",
      weak: false,
    });
    expect(result.matches[0].links.map((link) => link.label)).toEqual(["AniList", "MyAnimeList"]);
    expect(result.matches[1]).toMatchObject({ title: "inconnu.mp4", weak: true, thumbnail: undefined });
    // L'image part en corps de requête, sans clé quand il n'y en a pas.
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-trace-key"]).toBeUndefined();
  });

  it("ne contacte pas SauceNAO sans clé, et le dit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await runEngine("saucenao", context());
    expect(result.status).toBe("needs-key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("met au même format une réponse de SauceNAO", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          header: { status: 0, minimum_similarity: 55, short_remaining: 3, long_remaining: 96 },
          results: [
            {
              header: { similarity: "93.12", thumbnail: "https://img1.saucenao.com/res/pixiv/1.jpg", index_name: "Index #5: Pixiv Images - 1_p0.jpg" },
              data: { ext_urls: ["https://www.pixiv.net/artworks/1"], title: "フリーレン", member_name: "artiste" },
            },
            { header: { similarity: "31.5", index_name: "Index #9: Danbooru - x.jpg", hidden: 1 }, data: { creator: ["a", "b"], source: "https://x.com/a/status/1" } },
          ],
        })
      )
    );
    const result = await runEngine("saucenao", context({ saucenao: "clé" }));
    expect(result.status).toBe("ok");
    expect(result.message).toBe("96 recherches restantes aujourd’hui, 3 dans les trente secondes");
    expect(result.matches[0]).toMatchObject({
      title: "フリーレン",
      subtitle: "artiste",
      detail: "Pixiv Images",
      similarity: 0.9312,
      links: [{ label: "pixiv.net", url: "https://www.pixiv.net/artworks/1" }],
      weak: false,
    });
    expect(result.matches[1]).toMatchObject({ subtitle: "a, b", adult: true, weak: true });
  });

  it("rapporte un refus de SauceNAO sans lever", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ header: { status: -1, message: "The anonymous account type does not permit API usage." } })));
    const result = await runEngine("saucenao", context({ saucenao: "clé" }));
    expect(result).toMatchObject({ status: "error", message: "The anonymous account type does not permit API usage." });
  });

  it("interroge Google Lens par SerpApi avec l'adresse publique de l'image", async () => {
    const fetchMock = vi.fn(async () =>
      reply({ visual_matches: [{ title: "Une page", link: "https://exemple.test/page", source: "Exemple", thumbnail: "https://exemple.test/t.jpg" }, { title: "Sans lien" }] })
    );
    vi.stubGlobal("fetch", fetchMock);
    expect((await runEngine("google", context())).status).toBe("needs-key");
    const result = await runEngine("google", context({ serpapi: "clé" }));
    expect(result.matches).toEqual([
      { title: "Une page", subtitle: "Exemple", detail: undefined, thumbnail: "https://exemple.test/t.jpg", links: [{ label: "exemple.test", url: "https://exemple.test/page" }] },
    ]);
    const called = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(called.searchParams.get("engine")).toBe("google_lens");
    expect(called.searchParams.get("url")).toBe("https://exemple.test/image.jpg");
  });

  it("traduit une panne en résultat, et refuse un moteur sans intégration", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("réseau"))));
    expect(await runEngine("iqdb", context())).toMatchObject({ status: "error", message: "Le moteur est injoignable." });
    expect((await runEngine("tineye", context())).status).toBe("error");
  });
});

describe("liens temporaires", () => {
  const png = Buffer.from("fausse image");

  it("prête une adresse imprévisible, puis l'éteint", () => {
    const first = createTempShare(png, "image/png");
    const second = createTempShare(png, "image/png");
    expect(first.token).not.toBe(second.token);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(first.expiresAt - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000);
    expect(readTempShare(first.token)?.buffer.equals(png)).toBe(true);
    revokeTempShare(first.token);
    expect(readTempShare(first.token)).toBeNull();
    revokeTempShare(second.token);
  });

  it("expire tout seul", () => {
    vi.useFakeTimers();
    try {
      const { token } = createTempShare(png, "image/jpeg", 60_000);
      vi.advanceTimersByTime(59_000);
      expect(readTempShare(token)).not.toBeNull();
      vi.advanceTimersByTime(2_000);
      expect(readTempShare(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ne prête d'adresse qu'à une image, et borne le nombre de liens", () => {
    expect(() => createTempShare(png, "text/html")).toThrow();
    expect(() => createTempShare(Buffer.alloc(0), "image/png")).toThrow();
    const tokens = Array.from({ length: 45 }, () => createTempShare(png, "image/png").token);
    expect(readTempShare(tokens[0])).toBeNull();
    expect(readTempShare(tokens[44])).not.toBeNull();
    tokens.forEach(revokeTempShare);
  });
});
