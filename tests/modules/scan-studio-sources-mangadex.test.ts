import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbortedError, SourceError, type SourceContext } from "@/modules/scan-studio/lib/server/sources/adapter";
import { POLITENESS, PoliteFetcher, type Clock, type TransportRequest, type TransportResponse } from "@/modules/scan-studio/lib/server/sources/fetcher";
import { mangadexAdapter } from "@/modules/scan-studio/lib/server/sources/mangadex";

const ID = "33ea9f97-cb60-4e8c-9b47-8f6ecf9a50af";
const LINK = new URL(`https://mangadex.org/chapter/${ID}`);
const NODE = "https://node7.example-athome.net";
const HASH = "2ed0f3c65185bb957af0f7bc35174817";
const FILES = ["1-aaaa.png", "2-bbbb.png", "3-cccc.jpg"];

// ─── Réponses de la forme de celles de l'API, écrites à la main ──

function chapterBody(attributes: Record<string, unknown> = {}, relationships?: unknown[]) {
  return {
    result: "ok",
    response: "entity",
    data: {
      id: ID,
      type: "chapter",
      attributes: {
        volume: "2",
        chapter: "12.5",
        title: "Un titre d'essai",
        translatedLanguage: "en",
        externalUrl: null,
        isUnavailable: false,
        publishAt: "2026-01-01T00:00:00+00:00",
        version: 3,
        pages: FILES.length,
        ...attributes,
      },
      relationships: relationships ?? [
        { id: "0a42a1d2-0000-4000-8000-000000000001", type: "scanlation_group", attributes: { name: "Équipe d'essai" } },
        { id: "58bc83a0-0000-4000-8000-000000000002", type: "manga", attributes: { title: { "ja-ro": "Shiken no Series" }, altTitles: [{ en: "Test Series" }] } },
        { id: "11111111-0000-4000-8000-000000000003", type: "user" },
      ],
    },
  };
}

const serverBody = (baseUrl = NODE, files = FILES) => ({ result: "ok", baseUrl, chapter: { hash: HASH, data: files, dataSaver: files.map((file) => `s-${file}`) } });

const notFoundBody = { result: "error", errors: [{ id: "770a6444", status: 404, title: "not_found_http_exception", detail: `Chapter \`${ID}\` not found.`, context: null }] };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): TransportResponse => ({
  status,
  headers: { "content-type": "application/json", ...headers },
  body: Buffer.from(JSON.stringify(body)),
});
const image = (bytes = 1234, headers: Record<string, string> = {}): TransportResponse => ({ status: 200, headers: { "content-type": "image/png", ...headers }, body: Buffer.alloc(bytes, 7) });

type Route = (request: TransportRequest, count: number) => TransportResponse;

/** L'adaptateur, branché sur un faux MangaDex : chaque chemin a sa réponse, tout appel imprévu fait échouer le test. */
function setup(routes: { chapter?: Route; server?: Route; image?: Route; report?: Route; manga?: Route }) {
  let time = 1_800_000_000_000;
  const sleeps: number[] = [];
  const clock: Clock = {
    now: () => time,
    sleep: async (milliseconds, signal) => {
      if (signal?.aborted) throw new AbortedError();
      sleeps.push(milliseconds);
      time += milliseconds;
    },
  };
  const calls: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] = [];
  const counts = { chapter: 0, server: 0, image: 0, report: 0, manga: 0 };
  const fetcher = new PoliteFetcher({
    hosts: [...mangadexAdapter.hosts, ...(mangadexAdapter.requestHosts ?? [])],
    clock,
    transport: async (request) => {
      const { hostname, pathname } = request.url;
      calls.push({ url: request.url.toString(), method: request.method, headers: request.headers, body: request.body ? JSON.parse(request.body.toString()) : undefined });
      time += 40;
      const pick = (name: keyof typeof counts) => {
        const route = routes[name];
        if (!route) throw new Error(`Appel imprévu : ${request.url}`);
        return route(request, counts[name]++);
      };
      if (hostname === "api.mangadex.org" && pathname === `/chapter/${ID}`) return pick("chapter");
      if (hostname === "api.mangadex.org" && pathname === `/at-home/server/${ID}`) return pick("server");
      if (hostname === "api.mangadex.network" && pathname === "/report") return pick("report");
      // La série : sans réponse prévue, MangaDex ne la connaît pas, et l'import se passe de couverture.
      if (hostname === "api.mangadex.org" && pathname.startsWith("/manga/")) return routes.manga ? pick("manga") : json({ result: "error" }, 404);
      if (pathname.includes(`/data/${HASH}/`)) return pick("image");
      throw new Error(`Appel imprévu : ${request.url}`);
    },
  });
  const logs: string[] = [];
  const controller = new AbortController();
  const context: SourceContext = { fetcher, signal: controller.signal, log: (message) => logs.push(message) };
  return { context, fetcher, calls, counts, sleeps, logs, controller };
}

async function failure(promise: Promise<unknown>): Promise<SourceError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SourceError) return error;
    throw error;
  }
  throw new Error("L'appel aurait dû échouer.");
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("fetch réel appelé pendant un test")));
});

describe("MangaDex : ce qu'un lien désigne", () => {
  it("lit la série, le numéro, le titre, la langue, l'équipe et le nombre de pages en une requête", async () => {
    const { context, calls } = setup({ chapter: () => json(chapterBody()) });
    const info = await mangadexAdapter.describe!(LINK, context);
    expect(info).toEqual({
      series: "Shiken no Series",
      chapterNumber: "12.5",
      chapterTitle: "Un titre d'essai",
      language: "en",
      credit: "Équipe d'essai",
      pageCount: 3,
    });
    // L'aperçu ne dépense pas la requête, plus limitée, qui donne l'adresse des pages.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://api.mangadex.org/chapter/${ID}?includes[]=manga&includes[]=scanlation_group`);
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(calls[0].headers.cookie).toBeUndefined();
  });

  it("préfère le titre anglais de la série, et se passe de ce que le site ne donne pas", async () => {
    const english = setup({
      chapter: () => json(chapterBody({ title: null, chapter: null }, [{ id: "x", type: "manga", attributes: { title: { ja: "日本語", en: "English Title" } } }])),
    });
    expect(await mangadexAdapter.describe!(LINK, english.context)).toEqual({ series: "English Title", language: "en", pageCount: 3 });

    const bare = setup({ chapter: () => json(chapterBody({}, [])) });
    const info = await mangadexAdapter.describe!(LINK, bare.context);
    expect(info.series).toBeUndefined();
    expect(info.credit).toBeUndefined();
  });

  it("accepte le lien du lecteur ouvert sur une page", async () => {
    const { context, calls } = setup({ chapter: () => json(chapterBody()) });
    await mangadexAdapter.describe!(new URL(`https://mangadex.org/chapter/${ID.toUpperCase()}/7`), context);
    expect(calls[0].url).toContain(`/chapter/${ID}?`);
  });

  it("chapitre inconnu : `not-found`, sans nouvelle tentative", async () => {
    const { context, calls } = setup({ chapter: () => json(notFoundBody, 404) });
    expect((await failure(mangadexAdapter.describe!(LINK, context))).kind).toBe("not-found");
    expect(calls).toHaveLength(1);
  });

  it("chapitre hébergé chez l'éditeur : `unavailable`, et rien d'autre n'est tenté", async () => {
    const { context, calls } = setup({ chapter: () => json(chapterBody({ externalUrl: "https://editeur.example.com/lire/12", pages: 0 })) });
    const error = await failure(mangadexAdapter.resolve(LINK, context));
    expect(error.kind).toBe("unavailable");
    expect(error.message).toContain("editeur.example.com");
    // Ni la liste des pages, ni le site de l'éditeur ne sont appelés.
    expect(calls).toHaveLength(1);
  });

  it("chapitre retiré ou sans page : `unavailable`", async () => {
    const removed = setup({ chapter: () => json(chapterBody({ isUnavailable: true })) });
    expect((await failure(mangadexAdapter.resolve(LINK, removed.context))).kind).toBe("unavailable");
    expect(removed.calls).toHaveLength(1);

    const empty = setup({ chapter: () => json(chapterBody({ pages: 0 })) });
    expect((await failure(mangadexAdapter.describe!(LINK, empty.context))).kind).toBe("unavailable");

    const noFiles = setup({ chapter: () => json(chapterBody()), server: () => json(serverBody(NODE, [])) });
    expect((await failure(mangadexAdapter.resolve(LINK, noFiles.context))).kind).toBe("unavailable");
  });

  it("trop de requêtes : attend ce que MangaDex indique, puis s'arrête en `rate-limited`", async () => {
    const { context, calls, sleeps } = setup({ chapter: () => json({ result: "error" }, 429, { "retry-after": "3" }) });
    const error = await failure(mangadexAdapter.describe!(LINK, context));
    expect(error.kind).toBe("rate-limited");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
    // Chaque attente vaut au moins le délai indiqué par le site.
    expect(sleeps.filter((wait) => wait >= 3000)).toHaveLength(POLITENESS.retries);
  });

  it("bannissement temporaire (HTTP 403) : `rate-limited`, sans insister", async () => {
    const { context, calls } = setup({ chapter: () => json({ result: "error" }, 403) });
    expect((await failure(mangadexAdapter.describe!(LINK, context))).kind).toBe("rate-limited");
    expect(calls).toHaveLength(1);
  });

  it("réponse d'une autre forme : `adapter-outdated`", async () => {
    const shapes: unknown[] = [
      {},
      { result: "ok" },
      { result: "ok", data: { type: "manga", attributes: { pages: 3 } } },
      { result: "ok", data: { type: "chapter" } },
      { result: "ok", data: { type: "chapter", attributes: { pages: "3" } } },
      { result: "ok", data: { type: "chapter", attributes: { pages: -1 } } },
      [],
      "ok",
    ];
    for (const shape of shapes) {
      const { context } = setup({ chapter: () => json(shape) });
      expect((await failure(mangadexAdapter.describe!(LINK, context))).kind, JSON.stringify(shape)).toBe("adapter-outdated");
    }
  });

  it("panne de l'API : `site-error` après des tentatives comptées", async () => {
    const { context, calls } = setup({ chapter: () => json({}, 503) });
    expect((await failure(mangadexAdapter.describe!(LINK, context))).kind).toBe("site-error");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
  });
});

describe("MangaDex : la liste des pages", () => {
  it("construit les adresses dans l'ordre de l'API, en qualité d'origine, sans rien télécharger", async () => {
    const { context, calls, fetcher } = setup({ chapter: () => json(chapterBody()), server: () => json(serverBody()) });
    expect(fetcher.isAllowed("node7.example-athome.net")).toBe(false);
    const chapter = await mangadexAdapter.resolve(LINK, context);
    expect(chapter.pages).toEqual(FILES.map((file, index) => ({ index, url: `${NODE}/data/${HASH}/${file}` })));
    expect(chapter.info.pageCount).toBe(3);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([`/chapter/${ID}`, `/at-home/server/${ID}`, "/manga/58bc83a0-0000-4000-8000-000000000002"]);
    // Sans couverture connue, l'import s'en passe.
    expect(chapter.info.seriesCoverUrl).toBeUndefined();
    // Le serveur d'images que l'API désigne devient appelable, lui seul.
    expect(fetcher.isAllowed("node7.example-athome.net")).toBe(true);
    expect(fetcher.isAllowed("autre.example-athome.net")).toBe(false);
  });

  it("donne la couverture principale de la série, en vignette, quand MangaDex la connaît", async () => {
    const manga = () => json({ result: "ok", data: { id: "58bc83a0-0000-4000-8000-000000000002", type: "manga", relationships: [{ type: "author" }, { type: "cover_art", attributes: { fileName: "26dd2770-d383-42e9-a42b-32765a4d99c8.png" } }] } });
    const { context } = setup({ chapter: () => json(chapterBody()), server: () => json(serverBody()), manga });
    const chapter = await mangadexAdapter.resolve(LINK, context);
    expect(chapter.info.seriesCoverUrl).toBe("https://uploads.mangadex.org/covers/58bc83a0-0000-4000-8000-000000000002/26dd2770-d383-42e9-a42b-32765a4d99c8.png.512.jpg");
  });

  it("ignore un nom de couverture qui ne ressemble pas à un fichier d'image", async () => {
    const manga = () => json({ result: "ok", data: { relationships: [{ type: "cover_art", attributes: { fileName: "../../etc/passwd" } }] } });
    const { context } = setup({ chapter: () => json(chapterBody()), server: () => json(serverBody()), manga });
    expect((await mangadexAdapter.resolve(LINK, context)).info.seriesCoverUrl).toBeUndefined();
  });

  it("le nombre de pages est celui de la liste reçue", async () => {
    const { context } = setup({ chapter: () => json(chapterBody({ pages: 9 })), server: () => json(serverBody()) });
    expect((await mangadexAdapter.resolve(LINK, context)).info.pageCount).toBe(3);
  });

  it("liste des pages d'une autre forme : `adapter-outdated`", async () => {
    const shapes: unknown[] = [
      { result: "ok", baseUrl: NODE },
      { result: "ok", baseUrl: NODE, chapter: { hash: HASH } },
      { result: "ok", baseUrl: NODE, chapter: { hash: HASH, data: [1, 2] } },
      { result: "ok", baseUrl: NODE, chapter: { hash: "../..", data: FILES } },
      { result: "ok", baseUrl: NODE, chapter: { hash: HASH, data: ["../../etc/passwd"] } },
      { result: "ok", baseUrl: NODE, chapter: { hash: HASH, data: ["https://ailleurs.example.com/x.png"] } },
      { result: "ok", baseUrl: "http://node7.example-athome.net", chapter: { hash: HASH, data: FILES } },
      { result: "ok", baseUrl: "pas une adresse", chapter: { hash: HASH, data: FILES } },
      { result: "ok", chapter: { hash: HASH, data: FILES } },
    ];
    for (const shape of shapes) {
      const { context } = setup({ chapter: () => json(chapterBody()), server: () => json(shape) });
      expect((await failure(mangadexAdapter.resolve(LINK, context))).kind, JSON.stringify(shape)).toBe("adapter-outdated");
    }
  });
});

describe("MangaDex : lecture d'une page", () => {
  async function resolved(routes: Parameters<typeof setup>[0]) {
    const environment = setup({ chapter: () => json(chapterBody()), server: () => json(serverBody()), ...routes });
    const chapter = await mangadexAdapter.resolve(LINK, environment.context);
    environment.calls.length = 0;
    return { ...environment, chapter };
  }

  it("lit l'image sans en-tête d'authentification, puis rend compte au réseau MangaDex@Home", async () => {
    const { context, chapter, calls } = await resolved({ image: () => image(2048, { "x-cache": "HIT, node" }), report: () => json({ result: "ok" }) });
    const buffer = await mangadexAdapter.fetchPage!(chapter.pages[0], chapter, context);
    expect(buffer).toHaveLength(2048);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([`GET ${NODE}/data/${HASH}/${FILES[0]}`, "POST https://api.mangadex.network/report"]);
    expect(Object.keys(calls[0].headers).sort()).toEqual(["accept", "user-agent"]);
    expect(calls[1].body).toEqual({ url: `${NODE}/data/${HASH}/${FILES[0]}`, success: true, bytes: 2048, duration: 40, cached: true });
  });

  it("`cached` est faux quand le serveur ne dit pas HIT", async () => {
    const { context, chapter, calls } = await resolved({ image: () => image(10, { "x-cache": "MISS" }), report: () => json({}) });
    await mangadexAdapter.fetchPage!(chapter.pages[1], chapter, context);
    expect(calls[1].body).toMatchObject({ success: true, cached: false, bytes: 10 });
  });

  it("aucun compte rendu pour une image servie par un domaine de mangadex.org", async () => {
    const { context, calls } = setup({ chapter: () => json(chapterBody()), server: () => json(serverBody("https://uploads.mangadex.org")), image: () => image() });
    const chapter = await mangadexAdapter.resolve(LINK, context);
    calls.length = 0;
    await mangadexAdapter.fetchPage!(chapter.pages[0], chapter, context);
    expect(calls.map((call) => call.url)).toEqual([`https://uploads.mangadex.org/data/${HASH}/${FILES[0]}`]);
  });

  it("un compte rendu qui échoue n'arrête pas l'import, et n'est pas retenté", async () => {
    const { context, chapter, counts, logs } = await resolved({ image: () => image(), report: () => json({}, 500) });
    expect(await mangadexAdapter.fetchPage!(chapter.pages[0], chapter, context)).toHaveLength(1234);
    expect(counts.report).toBe(1);
    expect(logs.join(" ")).toContain("compte rendu");
  });

  it("image en échec : compte rendu de l'échec, nouvelle adresse demandée, pages restantes mises à jour", async () => {
    const other = "https://node9.example-athome.net";
    const { context, chapter, calls, counts } = await resolved({
      server: (_request, count) => json(serverBody(count === 0 ? NODE : other)),
      image: (request) => (request.url.hostname === "node7.example-athome.net" ? { status: 404, headers: { "content-type": "text/plain" }, body: Buffer.from("not found") } : image(500)),
      report: () => json({}),
    });
    const buffer = await mangadexAdapter.fetchPage!(chapter.pages[1], chapter, context);
    expect(buffer).toHaveLength(500);

    const reports = calls.filter((call) => call.method === "POST").map((call) => call.body);
    expect(reports).toEqual([
      { url: `${NODE}/data/${HASH}/${FILES[1]}`, success: false, bytes: 9, duration: 40, cached: false },
      { url: `${other}/data/${HASH}/${FILES[1]}`, success: true, bytes: 500, duration: 40, cached: false },
    ]);
    expect(counts.server).toBe(2);
    expect(chapter.pages.map((page) => page.url)).toEqual(FILES.map((file) => `${other}/data/${HASH}/${file}`));
  });

  it("ne redemande une adresse qu'un nombre compté de fois : pas de boucle", async () => {
    const { context, chapter, counts } = await resolved({ image: () => ({ status: 403, headers: {}, body: Buffer.alloc(0) }), report: () => json({}) });
    const error = await failure(mangadexAdapter.fetchPage!(chapter.pages[0], chapter, context));
    expect(error.kind).toBe("site-error");
    // Trois lectures au plus : l'adresse d'origine, puis deux renouvellements.
    expect(counts.image).toBe(3);
    expect(counts.server).toBe(1 + 2);
    expect(counts.report).toBe(3);

    // Le quota de renouvellements vaut pour tout le chapitre : la page suivante n'en obtient pas d'autres.
    await failure(mangadexAdapter.fetchPage!(chapter.pages[1], chapter, context));
    expect(counts.image).toBe(4);
    expect(counts.server).toBe(3);
  });

  it("s'arrête net quand l'import est annulé", async () => {
    const environment = await resolved({ image: () => image(), report: () => json({}) });
    environment.controller.abort();
    await expect(mangadexAdapter.fetchPage!(environment.chapter.pages[0], environment.chapter, environment.context)).rejects.toBeInstanceOf(AbortedError);
    expect(environment.calls).toHaveLength(0);
  });
});

describe("MangaDex : déclaration", () => {
  it("ne reconnaît que les liens de chapitre de mangadex.org", () => {
    expect(mangadexAdapter.match(LINK)).toBe(true);
    expect(mangadexAdapter.match(new URL(`https://mangadex.org/chapter/${ID}/3`))).toBe(true);
    expect(mangadexAdapter.match(new URL("https://mangadex.org/title/58bc83a0-1808-484e-88b9-17e167469e23"))).toBe(false);
    expect(mangadexAdapter.match(new URL(`https://mangadex.org/chapter/${ID}/3/extra`))).toBe(false);
    expect(mangadexAdapter.hosts).toEqual(["mangadex.org", "www.mangadex.org"]);
    expect(mangadexAdapter.requestHosts).toContain("api.mangadex.org");
    expect(mangadexAdapter.requestHosts).toContain("api.mangadex.network");
  });
});
