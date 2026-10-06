import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbortedError, SourceError, type SourceAdapter, type SourceContext } from "@/modules/scan-studio/lib/server/sources/adapter";
import { POLITENESS, PoliteFetcher, hostMatches, type Clock, type TransportRequest, type TransportResponse } from "@/modules/scan-studio/lib/server/sources/fetcher";
import { detect } from "@/modules/scan-studio/lib/server/sources/registry";
import { createWordpressReaderAdapter, mushokuTenseiMangaAdapter as adapter } from "@/modules/scan-studio/lib/server/sources/wordpress-reader";

const ORIGIN = "https://w7.mushokutensei-manga.com";
const LINK = new URL(`${ORIGIN}/manga/quiet-harbor-chapter-86/`);
const IMAGES = "https://img.mangarchive.com/images/Quiet Harbor - Long Title";
const ENCODED = "https://img.mangarchive.com/images/Quiet%20Harbor%20-%20Long%20Title";

// ─── Pages de la forme de celles du site, écrites à la main ──────

/** Attributs entre apostrophes, adresse avec des espaces, comme le site les écrit. */
const image = (file: string, loading = "lazy") => `<img loading='${loading}' src='${IMAGES}/${file}' alt='Quiet Harbor Chapter 86 image'>`;

function chapterPage(images: string[], options: { heading?: string | null; origin?: string } = {}) {
  const origin = options.origin ?? ORIGIN;
  const heading = options.heading === null ? "" : `<h1 class="entry-title">${options.heading ?? "Quiet Harbor Chapter 86"}</h1>`;
  return `<!DOCTYPE html><html lang="en-US" prefix="og: https://ogp.me/ns#"><head>
    <title>Quiet Harbor Chapter 86 - Quiet Harbor Manga Online</title>
    <meta property="og:title" content="Quiet Harbor Chapter 86 - Quiet Harbor Manga Online" />
    <meta property="og:site_name" content="Quiet Harbor Manga Online" />
    <link rel="canonical" href="${origin}/manga/quiet-harbor-chapter-86/" />
  </head><body class="comic-template-default single single-comic postid-406">
    <img src="${origin}/wp-content/uploads/logo.png" alt="logo">
    <header class="entry-header">${heading}</header>
    <div class="entry-content">
      <div class="separator">${images.join("</div>\n<div class=\"separator\">")}</div>
    </div>
    <form id="commentform"><div class="cf-turnstile" data-sitekey="x"></div></form>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" id="turnstile-js"></script>
  </body></html>`;
}

const PAGES = [image("aaa1.webp", "eager"), image("bbb2.webp"), image("ccc3.webp")];

const html = (body: string, status = 200, headers: Record<string, string> = {}): TransportResponse => ({
  status,
  headers: { "content-type": "text/html; charset=UTF-8", ...headers },
  body: Buffer.from(body),
});

/** L'adaptateur, branché sur un faux site. Un appel vers un domaine non déclaré fait échouer le test. */
function setup(source: SourceAdapter, respond: (request: TransportRequest, index: number) => TransportResponse) {
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
  const declared = [...source.hosts, ...(source.requestHosts ?? [])];
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetcher = new PoliteFetcher({
    hosts: declared,
    minDelayMs: source.minDelayMs,
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

describe("Article WordPress : reconnaissance des liens", () => {
  it("reconnaît un lien de chapitre, quel que soit le sous-domaine du moment", () => {
    expect(kindOf(`${ORIGIN}/manga/quiet-harbor-chapter-86/`)).toBe("mushokutensei-manga");
    expect(kindOf("https://w12.mushokutensei-manga.com/manga/quiet-harbor-chapter-86")).toBe("mushokutensei-manga");
    expect(kindOf("https://mushokutensei-manga.com/manga/quiet-harbor-chapter-86-5/")).toBe("mushokutensei-manga");
    expect(detect(`${ORIGIN}/manga/quiet-harbor-chapter-86/?utm_source=x&fbclid=y`).url.toString()).toBe(`${ORIGIN}/manga/quiet-harbor-chapter-86/`);
  });

  it("l'accueil, la liste des chapitres ou une autre page ne sont pas des chapitres", () => {
    expect(kindOf(`${ORIGIN}/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/about-us/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga/quiet-harbor-volume-3/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/a/b/quiet-harbor-chapter-86/`)).toBe("not-a-chapter");
  });

  it("un domaine qui ressemble, ou le serveur d'images, n'est pas le site", () => {
    expect(kindOf("https://mushokutensei-manga.com.example.org/manga/quiet-harbor-chapter-86/")).toBe("unsupported");
    expect(kindOf("https://fauxmushokutensei-manga.com/manga/quiet-harbor-chapter-86/")).toBe("unsupported");
    expect(kindOf("https://img.mangarchive.com/manga/quiet-harbor-chapter-86/")).toBe("unsupported");
  });
});

describe("Article WordPress : ce qu'un lien désigne", () => {
  it("lit la série, le numéro, la langue et les pages en une seule requête", async () => {
    const { context, calls } = setup(adapter, () => html(chapterPage(PAGES)));
    const chapter = await adapter.resolve(LINK, context);
    expect(chapter.info).toEqual({ series: "Quiet Harbor", chapterNumber: "86", language: "en", pageCount: 3 });
    // Ordre du document ; les espaces des adresses sont encodés ; le logo du thème n'est pas une page.
    expect(chapter.pages).toEqual([
      { index: 0, url: `${ENCODED}/aaa1.webp` },
      { index: 1, url: `${ENCODED}/bbb2.webp` },
      { index: 2, url: `${ENCODED}/ccc3.webp` },
    ]);
    expect(calls.map((call) => call.url)).toEqual([`${ORIGIN}/manga/quiet-harbor-chapter-86/`]);
    expect(Object.keys(calls[0].headers).sort()).toEqual(["accept", "user-agent"]);
    // La page ne montre pas de couverture de série : l'adaptateur n'en invente pas.
    expect(chapter.info.seriesCoverUrl).toBeUndefined();
  });

  it("le script Turnstile des commentaires ne fait pas prendre la page pour une vérification", async () => {
    const { context } = setup(adapter, () => html(chapterPage(PAGES)));
    expect((await adapter.describe!(LINK, context)).pageCount).toBe(3);
  });

  it("appelle le sous-domaine du lien collé, et suit le site quand il en change", async () => {
    const pasted = setup(adapter, () => html(chapterPage(PAGES, { origin: "https://w9.mushokutensei-manga.com" })));
    await adapter.resolve(new URL("https://w9.mushokutensei-manga.com/manga/quiet-harbor-chapter-86/?x=1#c"), pasted.context);
    expect(pasted.calls.map((call) => call.url)).toEqual(["https://w9.mushokutensei-manga.com/manga/quiet-harbor-chapter-86/"]);

    const moved = setup(adapter, (request) =>
      request.url.hostname === "w7.mushokutensei-manga.com"
        ? { status: 301, headers: { location: "https://w8.mushokutensei-manga.com/manga/quiet-harbor-chapter-86/" }, body: Buffer.alloc(0) }
        : html(chapterPage(PAGES, { origin: "https://w8.mushokutensei-manga.com" }))
    );
    expect((await adapter.resolve(LINK, moved.context)).pages).toHaveLength(3);
    expect(moved.calls.map((call) => new URL(call.url).hostname)).toEqual(["w7.mushokutensei-manga.com", "w8.mushokutensei-manga.com"]);
  });

  it("lit un numéro à partie et le titre du chapitre", async () => {
    const { context } = setup(adapter, () => html(chapterPage(PAGES, { heading: "Quiet Harbor Chapter 86.5: The lighthouse &amp; the fog" })));
    const info = (await adapter.resolve(new URL(`${ORIGIN}/manga/quiet-harbor-chapter-86-5/`), context)).info;
    expect(info.chapterNumber).toBe("86.5");
    expect(info.chapterTitle).toBe("The lighthouse & the fog");
    expect(info.series).toBe("Quiet Harbor");
  });

  it("sans en-tête, prend le nom de la série dans `og:title` ; sans rien, celui de la déclaration", async () => {
    const shared = setup(adapter, () => html(chapterPage(PAGES, { heading: null })));
    expect((await adapter.resolve(LINK, shared.context)).info.series).toBe("Quiet Harbor");
    const bare = setup(adapter, () => html(`<html><body><div class="entry-content">${PAGES.join("")}</div></body></html>`));
    const info = (await adapter.resolve(LINK, bare.context)).info;
    expect(info.series).toBe("Mushoku Tensei");
    expect(info.language).toBe("en");
  });

  it("une apostrophe dans le texte de remplacement ne fait perdre aucune page", async () => {
    const images = [1, 2, 3].map((rank) => `<img loading='lazy' src='${IMAGES}/p${rank}.webp' alt='Harbor's Chapter 86 image 0${rank}'>`);
    const { context } = setup(adapter, () => html(chapterPage(images)));
    expect((await adapter.resolve(LINK, context)).pages.map((page) => page.url)).toEqual([`${ENCODED}/p1.webp`, `${ENCODED}/p2.webp`, `${ENCODED}/p3.webp`]);
  });
});

describe("Article WordPress : ce qui empêche de lire", () => {
  it("vérification du navigateur : `unavailable`, sans nouvelle tentative, avec un message qui le dit", async () => {
    const challenge = "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={};</script></body></html>";
    for (const status of [403, 503]) {
      const { context, calls } = setup(adapter, () => html(challenge, status, { "cf-mitigated": "challenge" }));
      const error = await failure(adapter.resolve(LINK, context));
      expect(error.kind, String(status)).toBe("unavailable");
      expect(error.message).toContain("vérification du navigateur");
      expect(calls).toHaveLength(1);
    }
  });

  it("mur de captcha à la place du chapitre : `unavailable`", async () => {
    const wall = '<html><head><title>Quiet Harbor Manga Online</title></head><body><form><p>Confirm you are human.</p><div class="cf-turnstile" data-sitekey="x"></div></form></body></html>';
    const { context, calls } = setup(adapter, () => html(wall));
    const error = await failure(adapter.resolve(LINK, context));
    expect(error.kind).toBe("unavailable");
    expect(error.message).toContain("vérification du navigateur");
    expect(calls).toHaveLength(1);
  });

  it("accès refusé sans explication (403) : `unavailable`, rien n'est tenté", async () => {
    const { context, calls } = setup(adapter, () => html("<html><head><title>403 Forbidden</title></head><body>Forbidden</body></html>", 403));
    expect((await failure(adapter.resolve(LINK, context))).kind).toBe("unavailable");
    expect(calls).toHaveLength(1);
  });

  it("chapitre inconnu (404) : `not-found` ; renvoi vers l'accueil : `not-found`", async () => {
    const missing = setup(adapter, () => html("<html><head><title>Page not found</title></head><body></body></html>", 404));
    expect((await failure(adapter.resolve(LINK, missing.context))).kind).toBe("not-found");
    expect(missing.calls).toHaveLength(1);

    const moved = setup(adapter, (request) => (request.url.pathname === "/" ? html("<html><body><h1>Accueil</h1></body></html>") : { status: 302, headers: { location: "/" }, body: Buffer.alloc(0) }));
    expect((await failure(adapter.resolve(LINK, moved.context))).kind).toBe("not-found");
  });

  it("trop de requêtes (429) : `rate-limited`, après l'attente indiquée", async () => {
    const { context, calls, sleeps } = setup(adapter, () => html("Too Many Requests", 429, { "retry-after": "6" }));
    expect((await failure(adapter.resolve(LINK, context))).kind).toBe("rate-limited");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
    expect(sleeps.filter((wait) => wait >= 6000)).toHaveLength(POLITENESS.retries);
  });

  it("panne (5xx) : `site-error`", async () => {
    const { context } = setup(adapter, () => html("<html><head><title>500</title></head></html>", 500));
    expect((await failure(adapter.resolve(LINK, context))).kind).toBe("site-error");
  });

  it("article dont les images ont changé de serveur : `adapter-outdated`, et ce serveur n'est jamais appelé", async () => {
    const changed = chapterPage([`<img loading='lazy' src='https://cdn.example.net/images/p1.webp'>`]);
    const { context, calls } = setup(adapter, () => html(changed));
    expect((await failure(adapter.resolve(LINK, context))).kind).toBe("adapter-outdated");
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual(["w7.mushokutensei-manga.com"]);
  });

  it("page sans rien d'un chapitre : `unavailable`", async () => {
    const { context } = setup(adapter, () => html("<html><head><title>Quiet Harbor Manga Online</title></head><body><p>This chapter is no longer offered on the site.</p></body></html>"));
    expect((await failure(adapter.resolve(LINK, context))).kind).toBe("unavailable");
  });

  it("renvoi vers un domaine non déclaré : `adapter-outdated`, et ce domaine n'est jamais appelé", async () => {
    const { context, calls } = setup(adapter, () => ({ status: 301, headers: { location: "https://quiet-harbor.example.net/manga/quiet-harbor-chapter-86/" }, body: Buffer.alloc(0) }));
    const error = await failure(adapter.resolve(LINK, context));
    expect(error.kind).toBe("adapter-outdated");
    expect(error.message).toContain("quiet-harbor.example.net");
    expect(calls).toHaveLength(1);
  });
});

describe("Article WordPress : un autre site de la famille tient en une déclaration", () => {
  const other = createWordpressReaderAdapter({
    id: "example-reader",
    name: "Quiet Harbor Online",
    homepage: "https://quiet-harbor.example.org/",
    hosts: ["quiet-harbor.example.org"],
    imageHosts: ["cdn.example.net", "*.images.example.net"],
    example: "https://quiet-harbor.example.org/quiet-harbor-chapter-3/",
    language: "fr",
  });

  it("reconnaît ses liens, à la racine du site", () => {
    expect(kindOf(other.example, [other])).toBe("example-reader");
    expect(kindOf("https://quiet-harbor.example.org/", [other])).toBe("not-a-chapter");
    expect(kindOf("https://w2.quiet-harbor.example.org/quiet-harbor-chapter-3/", [other])).toBe("unsupported");
    expect(other.requestHosts).toEqual(["cdn.example.net", "*.images.example.net"]);
  });

  it("lit un chapitre de la même façon, sur ses propres serveurs d'images", async () => {
    const page = `<html><body class="single-post"><h1 class="entry-title">Quiet Harbor Chapter 3</h1><div class="entry-content">
      <img src="https://cdn.example.net/qh/3/01.jpg"><img data-src="https://s2.images.example.net/qh/3/02.jpg" src="data:image/gif;base64,AAAA"><img src="https://ads.example.com/banner.gif">
    </div></body></html>`;
    const { context } = setup(other, () => html(page));
    const chapter = await other.resolve(new URL(other.example), context);
    expect(chapter.info).toEqual({ series: "Quiet Harbor", chapterNumber: "3", language: "fr", pageCount: 2 });
    expect(chapter.pages.map((entry) => entry.url)).toEqual(["https://cdn.example.net/qh/3/01.jpg", "https://s2.images.example.net/qh/3/02.jpg"]);
  });
});
