import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbortedError, SourceError, type SourceAdapter, type SourceContext } from "@/modules/scan-studio/lib/server/sources/adapter";
import { POLITENESS, PoliteFetcher, hostMatches, type Clock, type TransportRequest, type TransportResponse } from "@/modules/scan-studio/lib/server/sources/fetcher";
import { cocomicAdapter, createMadaraAdapter } from "@/modules/scan-studio/lib/server/sources/madara";
import { detect } from "@/modules/scan-studio/lib/server/sources/registry";

const ORIGIN = "https://cocomic.co";
const LINK = new URL(`${ORIGIN}/manga/the-quiet-harbor/chapter-28/`);
const CDN = "http://cdn2.cocomic.co//www/wwwroot/manga_0123abcd/chapter_28";

// ─── Pages de la forme de celles du thème, écrites à la main ─────

/** Une image du lecteur : l'adresse est précédée d'espaces et de retours à la ligne, comme le thème l'écrit. */
const image = (rank: number, address: string) =>
  `<div class="page-break no-gaps">\n<img id="image-${rank}" data-src="\n\t\t\t ${address}" class="wp-manga-chapter-img img-responsive lazyload-ordered effect-fade">\n</div>`;

function chapterPage(images: string[], options: { active?: string; cover?: string | null; breadcrumb?: boolean; lang?: string } = {}) {
  const cover = options.cover === undefined ? `<meta property="og:image" content="${ORIGIN}/wp-content/uploads/2026/01/quiet-harbor-cover.jpg"/>` : (options.cover ?? "");
  const breadcrumb =
    options.breadcrumb === false
      ? ""
      : `<ol class="breadcrumb"><li> <a href="${ORIGIN}/"> Home </a></li><li> <a href="${ORIGIN}/manga/the-quiet-harbor/"> The Quiet Harbor\n </a></li><li class="active"> ${options.active ?? "Chapter 28"}</li></ol>`;
  return `<!DOCTYPE html><html lang="${options.lang ?? "en-US"}"><head>
    <title>The Quiet Harbor - Chapter 28 - Example Comics</title>
    <meta property="og:site_name" content="Example Comics"/>
    <meta property="og:title" content="The Quiet Harbor - Chapter 28 - Example Comics"/>
    ${cover}
  </head><body class="wp-manga-template-default single single-wp-manga wp-theme-madara wp-manga-page reading-manga">
    <img class="img-responsive" src="${ORIGIN}/wp-content/uploads/logo.png" alt="Example Comics">
    ${breadcrumb}
    <h1 id="chapter-heading"> <a class="back" href="${ORIGIN}/manga/the-quiet-harbor/"><i class="fa fa-chevron-left"></i></a> ${options.active ?? "Chapter 28"} </h1>
    <div class="reading-content">${images.join("\n")}</div>
    <div class="modal" id="form-login"><form><input type="text" name="log"><input type="password" name="pwd"><a href="${ORIGIN}/wp-login.php?action=lostpassword">Lost your password?</a></form></div>
    <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
  </body></html>`;
}

const PAGES = [image(0, `${CDN}/chap_28_1.jpg`), image(1, `${CDN}/chap_28_2.jpg`), image(2, `${CDN}/chap_28_3.jpg`)];

const html = (body: string, status = 200, headers: Record<string, string> = {}): TransportResponse => ({
  status,
  headers: { "content-type": "text/html; charset=UTF-8", ...headers },
  body: Buffer.from(body),
});

/** L'adaptateur, branché sur un faux site. Un appel vers un domaine non déclaré fait échouer le test. */
function setup(adapter: SourceAdapter, respond: (request: TransportRequest, index: number) => TransportResponse) {
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
  const declared = [...adapter.hosts, ...(adapter.requestHosts ?? [])];
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetcher = new PoliteFetcher({
    hosts: declared,
    minDelayMs: adapter.minDelayMs,
    clock,
    transport: async (request) => {
      if (!declared.some((host) => hostMatches(host, request.url.hostname))) throw new Error(`Domaine non déclaré appelé : ${request.url}`);
      calls.push({ url: request.url.toString(), headers: request.headers });
      time += 40;
      return respond(request, calls.length - 1);
    },
  });
  const controller = new AbortController();
  const context: SourceContext = { fetcher, signal: controller.signal, log: () => undefined };
  return { context, fetcher, calls, sleeps, controller };
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

const kindOf = (link: string, adapters?: SourceAdapter[]) => {
  try {
    return detect(link, adapters).adapter.id;
  } catch (error) {
    return error instanceof SourceError ? error.kind : "invalide";
  }
};

beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("fetch réel appelé pendant un test")));
});

describe("Madara : reconnaissance des liens", () => {
  it("reconnaît un lien de chapitre, avec ou sans barre finale, tome ou paramètres de suivi", () => {
    expect(kindOf(`${ORIGIN}/manga/the-quiet-harbor/chapter-28/`)).toBe("cocomic");
    expect(kindOf("https://www.cocomic.co/manga/the-quiet-harbor/chapter-28")).toBe("cocomic");
    expect(kindOf(`${ORIGIN}/manga/the-quiet-harbor/volume-2/chapter-28-5/`)).toBe("cocomic");
    expect(detect(`${ORIGIN}/manga/the-quiet-harbor/chapter-28/?utm_source=x&fbclid=y`).url.toString()).toBe(`${ORIGIN}/manga/the-quiet-harbor/chapter-28/`);
  });

  it("une fiche de série, l'accueil, un flux ou une liste ne sont pas des chapitres", () => {
    expect(kindOf(`${ORIGIN}/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga/the-quiet-harbor/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga/the-quiet-harbor/feed/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga/the-quiet-harbor/ajax/chapters/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/genres/drama/page-2/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/wp-content/uploads/2026/01/quiet-harbor-cover.jpg`)).toBe("not-a-chapter");
  });

  it("un autre sous-domaine ou un domaine qui ressemble n'est pas le site", () => {
    // Le serveur d'images est appelé, mais ses liens ne sont pas ceux qu'on colle.
    expect(kindOf("https://cdn2.cocomic.co/manga/the-quiet-harbor/chapter-28/")).toBe("unsupported");
    expect(kindOf("https://cocomic.co.example.org/manga/the-quiet-harbor/chapter-28/")).toBe("unsupported");
  });
});

describe("Madara : ce qu'un lien désigne", () => {
  it("lit la série, le numéro, la langue, la couverture et les pages en une seule requête", async () => {
    const { context, calls } = setup(cocomicAdapter, () => html(chapterPage(PAGES)));
    const chapter = await cocomicAdapter.resolve(LINK, context);
    expect(chapter.info).toEqual({
      series: "The Quiet Harbor",
      chapterNumber: "28",
      language: "en",
      seriesCoverUrl: `${ORIGIN}/wp-content/uploads/2026/01/quiet-harbor-cover.jpg`,
      pageCount: 3,
    });
    // Les espaces et retours à la ligne en tête d'adresse sont retirés, l'ordre est celui du document.
    expect(chapter.pages).toEqual([
      { index: 0, url: `${CDN}/chap_28_1.jpg` },
      { index: 1, url: `${CDN}/chap_28_2.jpg` },
      { index: 2, url: `${CDN}/chap_28_3.jpg` },
    ]);
    // Le mode « liste » du lecteur : tout le chapitre dans une page.
    expect(calls.map((call) => call.url)).toEqual([`${ORIGIN}/manga/the-quiet-harbor/chapter-28/?style=list`]);
    expect(Object.keys(calls[0].headers).sort()).toEqual(["accept", "user-agent"]);
  });

  it("l'aperçu rend les mêmes informations en une requête", async () => {
    const { context, calls } = setup(cocomicAdapter, () => html(chapterPage(PAGES)));
    expect((await cocomicAdapter.describe!(LINK, context)).pageCount).toBe(3);
    expect(calls).toHaveLength(1);
  });

  it("lit `src` quand l'image n'est pas paresseuse, et ne compte pas deux fois son double `<noscript>`", async () => {
    const images = [
      `<img id="image-0" src="https://cdn2.cocomic.co/a/1.jpg" class="wp-manga-chapter-img">`,
      `<img id="image-1" src="data:image/gif;base64,AAAA" data-src=" https://cdn2.cocomic.co/a/2.jpg" class="wp-manga-chapter-img"><noscript><img src="https://cdn2.cocomic.co/a/2.jpg" class="wp-manga-chapter-img"></noscript>`,
      `<img id="image-2" data-src="/wp-content/uploads/WP-manga/data/a/3.jpg" class='wp-manga-chapter-img img-responsive'>`,
    ];
    const { context } = setup(cocomicAdapter, () => html(chapterPage(images)));
    const chapter = await cocomicAdapter.resolve(LINK, context);
    expect(chapter.pages.map((page) => page.url)).toEqual(["https://cdn2.cocomic.co/a/1.jpg", "https://cdn2.cocomic.co/a/2.jpg", `${ORIGIN}/wp-content/uploads/WP-manga/data/a/3.jpg`]);
  });

  it("lit le titre du chapitre et un numéro à partie", async () => {
    const { context } = setup(cocomicAdapter, () => html(chapterPage(PAGES, { active: "Chapter 28.5 - The lighthouse &amp; the fog" })));
    const info = (await cocomicAdapter.resolve(new URL(`${ORIGIN}/manga/the-quiet-harbor/chapter-28-5/`), context)).info;
    expect(info.chapterNumber).toBe("28.5");
    expect(info.chapterTitle).toBe("The lighthouse & the fog");
  });

  it("sans fil d'Ariane, prend le nom de la série dans le titre ; sans couverture déclarée, n'en donne pas", async () => {
    const { context } = setup(cocomicAdapter, () => html(chapterPage(PAGES, { breadcrumb: false, cover: '<meta property="og:image" content="https://covers.example.net/quiet.jpg"/>', lang: "fr-FR" })));
    const info = (await cocomicAdapter.resolve(LINK, context)).info;
    expect(info.series).toBe("The Quiet Harbor");
    expect(info.seriesCoverUrl).toBeUndefined();
    // La page dit sa langue : elle l'emporte sur celle de la déclaration.
    expect(info.language).toBe("fr");
  });
});

describe("Madara : les images", () => {
  it("suit le renvoi du serveur d'images vers la même adresse en https", async () => {
    const { context, fetcher, calls } = setup(cocomicAdapter, (request) => {
      if (request.url.hostname !== "cdn2.cocomic.co") return html(chapterPage(PAGES));
      if (request.url.protocol === "http:") return { status: 301, headers: { location: request.url.toString().replace("http:", "https:") }, body: Buffer.alloc(0) };
      return { status: 200, headers: { "content-type": "image/jpeg" }, body: Buffer.alloc(900, 3) };
    });
    const chapter = await cocomicAdapter.resolve(LINK, context);
    calls.length = 0;
    // Sans `fetchPage`, l'import fait un simple GET de l'adresse de la page.
    expect(cocomicAdapter.fetchPage).toBeUndefined();
    const response = await fetcher.request(chapter.pages[0].url, { kind: "image" });
    expect(response.body).toHaveLength(900);
    expect(calls.map((call) => call.url)).toEqual([`${CDN}/chap_28_1.jpg`, `${CDN.replace("http:", "https:")}/chap_28_1.jpg`]);
  });

  it("renvoi vers un domaine non déclaré : `adapter-outdated`, et ce domaine n'est jamais appelé", async () => {
    const { context, fetcher, calls } = setup(cocomicAdapter, (request) =>
      request.url.hostname === "cdn2.cocomic.co" ? { status: 301, headers: { location: "https://stock.example.net/chap_28_1.jpg" }, body: Buffer.alloc(0) } : html(chapterPage(PAGES))
    );
    const chapter = await cocomicAdapter.resolve(LINK, context);
    const error = await failure(fetcher.request(chapter.pages[0].url, { kind: "image" }));
    expect(error.kind).toBe("adapter-outdated");
    expect(error.message).toContain("stock.example.net");
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual(["cocomic.co", "cdn2.cocomic.co"]);
  });

  it("images sur un domaine non déclaré : `adapter-outdated` dès la lecture de la page", async () => {
    const { context, calls } = setup(cocomicAdapter, () => html(chapterPage([image(0, "https://cdn9.example.net/chap_28_1.jpg")])));
    const error = await failure(cocomicAdapter.resolve(LINK, context));
    expect(error.kind).toBe("adapter-outdated");
    expect(error.message).toContain("cdn9.example.net");
    expect(calls).toHaveLength(1);
  });
});

describe("Madara : ce qui empêche de lire", () => {
  it("vérification du navigateur : `unavailable`, sans nouvelle tentative, avec un message qui le dit", async () => {
    const challenge = "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={};</script></body></html>";
    for (const status of [403, 503]) {
      const { context, calls } = setup(cocomicAdapter, () => html(challenge, status, { "cf-mitigated": "challenge" }));
      const error = await failure(cocomicAdapter.resolve(LINK, context));
      expect(error.kind, String(status)).toBe("unavailable");
      expect(error.message).toContain("vérification du navigateur");
      expect(calls).toHaveLength(1);
    }
  });

  it("la fenêtre de connexion ordinaire du thème n'est pas prise pour une page réservée", async () => {
    const { context } = setup(cocomicAdapter, () => html(chapterPage(PAGES)));
    expect((await cocomicAdapter.resolve(LINK, context)).pages).toHaveLength(3);
  });

  it("chapitre réservé aux comptes : `unavailable`", async () => {
    const locked = chapterPage(['<div class="content-blocked login-required"><p>You must be logged in to read this chapter.</p></div>']);
    const { context, calls } = setup(cocomicAdapter, () => html(locked));
    const error = await failure(cocomicAdapter.resolve(LINK, context));
    expect(error.kind).toBe("unavailable");
    expect(calls).toHaveLength(1);
  });

  it("images protégées par chiffrement : `unavailable`, rien n'est désembrouillé", async () => {
    const protectedPage = chapterPage(['<div id="chapter-protector-data">x</div><script id="chapter-protector-data">var chapter_data = "…";</script>']);
    const { context } = setup(cocomicAdapter, () => html(protectedPage));
    const error = await failure(cocomicAdapter.resolve(LINK, context));
    expect(error.kind).toBe("unavailable");
    expect(error.message).toContain("ne passe pas outre");
  });

  it("renvoi vers la page de connexion : `unavailable`", async () => {
    const { context } = setup(cocomicAdapter, (request) =>
      request.url.pathname === "/wp-login.php" ? html("<html><head><title>Log In</title></head><body><form></form></body></html>") : { status: 302, headers: { location: "/wp-login.php?redirect_to=x" }, body: Buffer.alloc(0) }
    );
    const error = await failure(cocomicAdapter.resolve(LINK, context));
    expect(error.kind).toBe("unavailable");
    expect(error.message).toContain("compte");
  });

  it("chapitre inconnu (404) : `not-found` ; renvoi vers la fiche de la série : `not-found`", async () => {
    const missing = setup(cocomicAdapter, () => html("<html><head><title>Page not found</title></head><body></body></html>", 404));
    expect((await failure(cocomicAdapter.resolve(LINK, missing.context))).kind).toBe("not-found");
    expect(missing.calls).toHaveLength(1);

    const moved = setup(cocomicAdapter, (request) =>
      request.url.pathname === "/manga/the-quiet-harbor/" ? html("<html><body><h1>The Quiet Harbor</h1></body></html>") : { status: 301, headers: { location: "/manga/the-quiet-harbor/" }, body: Buffer.alloc(0) }
    );
    expect((await failure(cocomicAdapter.resolve(LINK, moved.context))).kind).toBe("not-found");
  });

  it("trop de requêtes (429) : `rate-limited`, après l'attente indiquée", async () => {
    const { context, calls, sleeps } = setup(cocomicAdapter, () => html("Too Many Requests", 429, { "retry-after": "3" }));
    expect((await failure(cocomicAdapter.resolve(LINK, context))).kind).toBe("rate-limited");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
    expect(sleeps.filter((wait) => wait >= 3000)).toHaveLength(POLITENESS.retries);
  });

  it("panne (5xx) : `site-error`", async () => {
    const { context } = setup(cocomicAdapter, () => html("<html><head><title>502</title></head></html>", 502));
    expect((await failure(cocomicAdapter.resolve(LINK, context))).kind).toBe("site-error");
  });

  it("page de chapitre dont la structure a changé : `adapter-outdated`", async () => {
    const changed = chapterPage([`<img class="reader-image" src="https://cdn2.cocomic.co/a/1.jpg">`]);
    const { context } = setup(cocomicAdapter, () => html(changed));
    expect((await failure(cocomicAdapter.resolve(LINK, context))).kind).toBe("adapter-outdated");
  });

  it("page sans rien d'un chapitre : `unavailable`", async () => {
    const { context } = setup(cocomicAdapter, () => html("<html><head><title>Example Comics</title></head><body><p>This chapter is no longer offered on the site.</p></body></html>"));
    expect((await failure(cocomicAdapter.resolve(LINK, context))).kind).toBe("unavailable");
  });
});

describe("Madara : un autre site de la famille tient en une déclaration", () => {
  const other = createMadaraAdapter({
    id: "example-madara",
    name: "Example Toons",
    homepage: "https://toons.example.org/",
    hosts: ["toons.example.org"],
    requestHosts: ["img.toons.example.org"],
    example: "https://toons.example.org/webtoon/quiet-harbor/chapitre-3/",
    seriesBases: ["webtoon", "manga"],
    language: "fr",
    minDelayMs: 2500,
  });

  it("reconnaît ses liens, sous ses propres dossiers", () => {
    expect(kindOf(other.example, [other])).toBe("example-madara");
    expect(kindOf("https://toons.example.org/manga/quiet-harbor/chapitre-3/", [other])).toBe("example-madara");
    expect(kindOf("https://toons.example.org/comic/quiet-harbor/chapitre-3/", [other])).toBe("not-a-chapter");
    expect(other.minDelayMs).toBe(2500);
    expect(other.requestHosts).toEqual(["img.toons.example.org"]);
  });

  it("lit un chapitre de la même façon", async () => {
    const page = `<html><head><title>Quiet Harbor - Chapitre 3 - Example Toons</title></head><body class="wp-manga-page">
      <ol class="breadcrumb"><li><a href="/webtoon/quiet-harbor/">Quiet Harbor</a></li><li class="active">Chapitre 3</li></ol>
      <div class="reading-content"><img class="wp-manga-chapter-img" data-src="https://img.toons.example.org/qh/3/01.webp"><img class="wp-manga-chapter-img" data-src="https://img.toons.example.org/qh/3/02.webp"></div>
    </body></html>`;
    const { context, calls } = setup(other, () => html(page));
    const chapter = await other.resolve(new URL(other.example), context);
    expect(chapter.info).toEqual({ series: "Quiet Harbor", chapterNumber: "3", language: "fr", pageCount: 2 });
    expect(calls.map((call) => call.url)).toEqual(["https://toons.example.org/webtoon/quiet-harbor/chapitre-3/?style=list"]);
  });
});
