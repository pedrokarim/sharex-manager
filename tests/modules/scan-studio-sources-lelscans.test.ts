import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbortedError, SourceError, type SourceAdapter, type SourceContext } from "@/modules/scan-studio/lib/server/sources/adapter";
import { POLITENESS, PoliteFetcher, hostMatches, type Clock, type TransportRequest, type TransportResponse } from "@/modules/scan-studio/lib/server/sources/fetcher";
import { lelscansAdapter } from "@/modules/scan-studio/lib/server/sources/lelscans";
import { detect } from "@/modules/scan-studio/lib/server/sources/registry";

const ORIGIN = "https://lelscans.net";
const LINK = new URL(`${ORIGIN}/scan-baie-tranquille/204`);

// ─── Pages de la forme de celles du site, écrites à la main ──────

/** L'extension change d'une page à l'autre : elle ne se devine pas. */
const FILES: Record<string, string> = { "1": "1.png", "2": "2.jpg", "3": "3.png" };

function readerPage(shown: string, options: { numbers?: string[]; image?: string | null; title?: string; cover?: string | null } = {}) {
  const numbers = options.numbers ?? Object.keys(FILES);
  const image = options.image === undefined ? `<img src="/mangas/baie-tranquille/204/${FILES[shown]}?v=fr1700000000" alt="lecture en ligne page ${shown}"  />` : (options.image ?? "");
  const cover = options.cover === undefined ? '<meta property="og:image" content="/mangas/baie-tranquille/thumb_cover.jpg" />' : (options.cover ?? "");
  return `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head>
    <title>${options.title ?? `Scan La Baie Tranquille 204 Page ${shown}`}</title>
    <meta http-equiv="Content-Type" content="text/html;charset=ISO-8859-1" />
    ${cover}
    <meta property="og:title" content="La Baie Tranquille 204 lecture en ligne scan" />
  </head><body>
    <div id="image">${image}</div>
    <div id="navigation">
      <a href="${ORIGIN}/scan-baie-tranquille/204" class="lien-chapitre" title="Scan La Baie Tranquille 204" ></a>
      <a href="${ORIGIN}/scan-baie-tranquille/204/2">Prec</a>
      ${numbers.map((number) => `<a href="${ORIGIN}/scan-baie-tranquille/204/${number}"${number === shown ? ' class="active"' : ""}>${number}</a>`).join("")}
      <a href="${ORIGIN}/scan-baie-tranquille/205">Suiv</a>
      <a href="${ORIGIN}/scan-baie-tranquille/203/1">1</a>
    </div>
    <ul><li><img src="/mangas/autre-serie/thumb_cover.jpg" alt="Autre Série"></li><li><img src="/mangas/baie-tranquille/thumb_cover.jpg" alt="La Baie Tranquille"></li></ul>
  </body></html>`;
}

const html = (body: string, status = 200, headers: Record<string, string> = {}): TransportResponse => ({
  status,
  headers: { "content-type": "text/html; charset=UTF-8", ...headers },
  body: Buffer.from(body),
});
const picture = (bytes: number, type = "image/png"): TransportResponse => ({ status: 200, headers: { "content-type": type }, body: Buffer.alloc(bytes, 7) });

/** Le faux site : chaque page du lecteur montre son image, chaque image pèse son numéro en kilo-octets. */
function site(request: TransportRequest): TransportResponse {
  const reader = /^\/scan-baie-tranquille\/204(?:\/(\d+))?$/.exec(request.url.pathname);
  if (reader) return html(readerPage(reader[1] ?? "1"));
  const file = /^\/mangas\/baie-tranquille\/204\/((\d+)\.(png|jpg))$/.exec(request.url.pathname);
  if (file && FILES[file[2]] === file[1]) return picture(Number(file[2]) * 1000, file[3] === "jpg" ? "image/jpeg" : "image/png");
  return html("<html><head><title>404</title></head><body></body></html>", 404);
}

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
  const calls: { url: string; at: number; headers: Record<string, string> }[] = [];
  const fetcher = new PoliteFetcher({
    hosts: declared,
    minDelayMs: adapter.minDelayMs,
    clock,
    transport: async (request) => {
      if (!declared.some((host) => hostMatches(host, request.url.hostname))) throw new Error(`Domaine non déclaré appelé : ${request.url}`);
      calls.push({ url: request.url.toString(), at: time, headers: request.headers });
      time += 40;
      return respond(request, calls.length - 1);
    },
  });
  const controller = new AbortController();
  const context: SourceContext = { fetcher, signal: controller.signal, log: () => undefined };
  return { context, calls, sleeps, controller };
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

const kindOf = (link: string) => {
  try {
    return detect(link).adapter.id;
  } catch (error) {
    return error instanceof SourceError ? error.kind : "invalide";
  }
};

beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("fetch réel appelé pendant un test")));
});

describe("Lelscans : reconnaissance des liens", () => {
  it("reconnaît un lien de chapitre, avec ou sans numéro de page, www ou paramètres de suivi", () => {
    expect(kindOf(`${ORIGIN}/scan-baie-tranquille/204`)).toBe("lelscans");
    expect(kindOf(`${ORIGIN}/scan-baie-tranquille/204/17`)).toBe("lelscans");
    expect(kindOf("https://www.lelscans.net/scan-baie-tranquille/204/")).toBe("lelscans");
    expect(detect(`${ORIGIN}/scan-baie-tranquille/204/3?utm_campaign=x&gclid=y`).url.toString()).toBe(`${ORIGIN}/scan-baie-tranquille/204/3`);
  });

  it("une fiche de série, l'accueil ou une image ne sont pas des chapitres", () => {
    expect(kindOf(`${ORIGIN}/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/lecture-en-ligne-baie-tranquille.php`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/scan-baie-tranquille`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/scan-baie-tranquille/204/3/4`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/mangas/baie-tranquille/204/1.png`)).toBe("not-a-chapter");
  });

  it("un autre sous-domaine ou un domaine qui ressemble n'est pas le site", () => {
    expect(kindOf("https://img.lelscans.net/scan-baie-tranquille/204")).toBe("unsupported");
    expect(kindOf("https://lelscans.net.example.org/scan-baie-tranquille/204")).toBe("unsupported");
  });
});

describe("Lelscans : ce qu'un lien désigne", () => {
  it("lit la série, le numéro, la couverture et la liste des pages en une seule requête", async () => {
    const { context, calls } = setup(lelscansAdapter, site);
    const chapter = await lelscansAdapter.resolve(LINK, context);
    expect(chapter.info).toEqual({
      series: "La Baie Tranquille",
      chapterNumber: "204",
      language: "fr",
      seriesCoverUrl: `${ORIGIN}/mangas/baie-tranquille/thumb_cover.jpg`,
      pageCount: 3,
    });
    // Chaque page est désignée par sa page du lecteur : l'adresse de l'image s'y lira.
    expect(chapter.pages).toEqual([
      { index: 0, url: `${ORIGIN}/scan-baie-tranquille/204/1` },
      { index: 1, url: `${ORIGIN}/scan-baie-tranquille/204/2` },
      { index: 2, url: `${ORIGIN}/scan-baie-tranquille/204/3` },
    ]);
    expect(calls.map((call) => call.url)).toEqual([`${ORIGIN}/scan-baie-tranquille/204`]);
    expect(Object.keys(calls[0].headers).sort()).toEqual(["accept", "user-agent"]);
  });

  it("l'aperçu ne fait qu'une requête", async () => {
    const { context, calls } = setup(lelscansAdapter, site);
    expect((await lelscansAdapter.describe!(new URL(`${ORIGIN}/scan-baie-tranquille/204/3`), context)).pageCount).toBe(3);
    expect(calls.map((call) => call.url)).toEqual([`${ORIGIN}/scan-baie-tranquille/204/3`]);
  });

  it("range les pages par numéro, sans les liens « précédent », « suivant » ni ceux d'un autre chapitre", async () => {
    const { context } = setup(lelscansAdapter, () => html(readerPage("2", { numbers: ["10", "2", "1", "9"], image: '<img src="/mangas/baie-tranquille/204/2.jpg">' })));
    const chapter = await lelscansAdapter.resolve(new URL(`${ORIGIN}/scan-baie-tranquille/204/2`), context);
    expect(chapter.pages.map((page) => page.url.split("/").pop())).toEqual(["1", "2", "9", "10"]);
  });

  it("un chapitre d'une seule page, sans liens numérotés, a une page", async () => {
    const { context } = setup(lelscansAdapter, () => html(readerPage("1", { numbers: [] })));
    const chapter = await lelscansAdapter.resolve(LINK, context);
    expect(chapter.pages).toEqual([{ index: 0, url: `${ORIGIN}/scan-baie-tranquille/204/1` }]);
  });

  it("sans couverture de série dans la page, n'en donne pas", async () => {
    const none = setup(lelscansAdapter, () => html(readerPage("1", { cover: null })));
    expect((await lelscansAdapter.resolve(LINK, none.context)).info.seriesCoverUrl).toBeUndefined();
    // Une image qui n'est pas la couverture d'une série, ou qui est ailleurs, n'est pas retenue.
    const page = setup(lelscansAdapter, () => html(readerPage("1", { cover: '<meta property="og:image" content="/mangas/baie-tranquille/204/1.png" />' })));
    expect((await lelscansAdapter.resolve(LINK, page.context)).info.seriesCoverUrl).toBeUndefined();
    const elsewhere = setup(lelscansAdapter, () => html(readerPage("1", { cover: '<meta property="og:image" content="https://cdn.example.net/mangas/baie-tranquille/thumb_cover.jpg" />' })));
    expect((await lelscansAdapter.resolve(LINK, elsewhere.context)).info.seriesCoverUrl).toBeUndefined();
  });

  it("sans titre lisible, prend le nom de la série dans `og:title`, puis dans l'adresse", async () => {
    const shared = setup(lelscansAdapter, () => html(readerPage("1", { title: "Lecture en ligne" })));
    expect((await lelscansAdapter.resolve(LINK, shared.context)).info.series).toBe("La Baie Tranquille");
    const bare = setup(lelscansAdapter, () => html(readerPage("1", { title: "Lecture en ligne" }).replace(/<meta property="og:title"[^>]*>/, "")));
    expect((await lelscansAdapter.resolve(LINK, bare.context)).info.series).toBe("Baie Tranquille");
  });
});

describe("Lelscans : lecture d'une page, deux requêtes", () => {
  it("lit la page du lecteur puis son image, dont l'extension change d'une page à l'autre", async () => {
    const { context, calls } = setup(lelscansAdapter, site);
    const chapter = await lelscansAdapter.resolve(LINK, context);
    calls.length = 0;

    expect(await lelscansAdapter.fetchPage!(chapter.pages[1], chapter, context)).toHaveLength(2000);
    expect(await lelscansAdapter.fetchPage!(chapter.pages[2], chapter, context)).toHaveLength(3000);
    expect(calls.map((call) => call.url)).toEqual([
      `${ORIGIN}/scan-baie-tranquille/204/2`,
      `${ORIGIN}/mangas/baie-tranquille/204/2.jpg?v=fr1700000000`,
      `${ORIGIN}/scan-baie-tranquille/204/3`,
      `${ORIGIN}/mangas/baie-tranquille/204/3.png?v=fr1700000000`,
    ]);
    // Aucun en-tête `Referer`, ni rien d'un navigateur.
    for (const call of calls) expect(Object.keys(call.headers).sort()).toEqual(["accept", "user-agent"]);
  });

  it("ne relit pas la page du lecteur que `resolve` a déjà lue", async () => {
    const { context, calls } = setup(lelscansAdapter, site);
    const chapter = await lelscansAdapter.resolve(new URL(`${ORIGIN}/scan-baie-tranquille/204/2`), context);
    calls.length = 0;
    expect(await lelscansAdapter.fetchPage!(chapter.pages[1], chapter, context)).toHaveLength(2000);
    expect(calls.map((call) => call.url)).toEqual([`${ORIGIN}/mangas/baie-tranquille/204/2.jpg?v=fr1700000000`]);
  });

  it("espace ses requêtes plus que le délai ordinaire", async () => {
    expect(lelscansAdapter.minDelayMs).toBeGreaterThan(POLITENESS.minDelayMs);
    const { context, calls } = setup(lelscansAdapter, site);
    const chapter = await lelscansAdapter.resolve(LINK, context);
    for (const page of chapter.pages) await lelscansAdapter.fetchPage!(page, chapter, context);
    // Une requête pour la liste, puis deux par page, sauf la page déjà lue.
    expect(calls).toHaveLength(1 + 1 + 2 + 2);
    for (let index = 1; index < calls.length; index++) {
      expect(calls[index].at - calls[index - 1].at - 40).toBeGreaterThanOrEqual(lelscansAdapter.minDelayMs!);
    }
  });

  it("page du lecteur sans image : `adapter-outdated`, sans rien deviner", async () => {
    const { context, calls } = setup(lelscansAdapter, (request) => (request.url.pathname.endsWith("/3") ? html(readerPage("3", { image: '<canvas id="page"></canvas>' })) : site(request)));
    const chapter = await lelscansAdapter.resolve(LINK, context);
    calls.length = 0;
    expect((await failure(lelscansAdapter.fetchPage!(chapter.pages[2], chapter, context))).kind).toBe("adapter-outdated");
    expect(calls.map((call) => call.url)).toEqual([`${ORIGIN}/scan-baie-tranquille/204/3`]);
  });

  it("image refusée par le site : `site-error`", async () => {
    const { context } = setup(lelscansAdapter, (request) => (request.url.pathname.startsWith("/mangas/") ? html("Forbidden", 403) : site(request)));
    const chapter = await lelscansAdapter.resolve(LINK, context);
    expect((await failure(lelscansAdapter.fetchPage!(chapter.pages[0], chapter, context))).kind).toBe("site-error");
  });

  it("image renvoyée vers un domaine non déclaré : `adapter-outdated`, et ce domaine n'est jamais appelé", async () => {
    const { context, calls } = setup(lelscansAdapter, (request) =>
      request.url.pathname.startsWith("/mangas/") ? { status: 302, headers: { location: "https://stock.example.net/204/1.png" }, body: Buffer.alloc(0) } : site(request)
    );
    const chapter = await lelscansAdapter.resolve(LINK, context);
    const error = await failure(lelscansAdapter.fetchPage!(chapter.pages[0], chapter, context));
    expect(error.kind).toBe("adapter-outdated");
    expect(error.message).toContain("stock.example.net");
    expect(calls.every((call) => new URL(call.url).hostname === "lelscans.net")).toBe(true);
  });

  it("vérification du navigateur au milieu d'un chapitre : `unavailable`", async () => {
    const challenge = "<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={};</script></body></html>";
    const { context } = setup(lelscansAdapter, (request) => (request.url.pathname.endsWith("/2") ? html(challenge, 403, { "cf-mitigated": "challenge" }) : site(request)));
    const chapter = await lelscansAdapter.resolve(LINK, context);
    expect((await failure(lelscansAdapter.fetchPage!(chapter.pages[1], chapter, context))).kind).toBe("unavailable");
  });

  it("s'arrête net quand l'import est annulé", async () => {
    const environment = setup(lelscansAdapter, site);
    const chapter = await lelscansAdapter.resolve(LINK, environment.context);
    environment.calls.length = 0;
    environment.controller.abort();
    await expect(lelscansAdapter.fetchPage!(chapter.pages[1], chapter, environment.context)).rejects.toBeInstanceOf(AbortedError);
    expect(environment.calls).toHaveLength(0);
  });
});

describe("Lelscans : ce qui empêche de lire", () => {
  it("vérification du navigateur : `unavailable`, sans nouvelle tentative", async () => {
    const challenge = "<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={};</script></body></html>";
    for (const status of [403, 503]) {
      const { context, calls } = setup(lelscansAdapter, () => html(challenge, status));
      const error = await failure(lelscansAdapter.resolve(LINK, context));
      expect(error.kind, String(status)).toBe("unavailable");
      expect(error.message).toContain("vérification du navigateur");
      expect(calls).toHaveLength(1);
    }
  });

  it("chapitre inconnu (404) : `not-found`", async () => {
    const { context, calls } = setup(lelscansAdapter, () => html("<html><body>404</body></html>", 404));
    expect((await failure(lelscansAdapter.resolve(LINK, context))).kind).toBe("not-found");
    expect(calls).toHaveLength(1);
  });

  it("lien renvoyé vers l'accueil : `not-found`", async () => {
    const { context } = setup(lelscansAdapter, (request) => (request.url.pathname === "/" ? html("<html><body><h1>Accueil</h1></body></html>") : { status: 301, headers: { location: "/" }, body: Buffer.alloc(0) }));
    expect((await failure(lelscansAdapter.resolve(LINK, context))).kind).toBe("not-found");
  });

  it("trop de requêtes (429) : `rate-limited`, après l'attente indiquée", async () => {
    const { context, calls, sleeps } = setup(lelscansAdapter, () => html("Too Many Requests", 429, { "retry-after": "5" }));
    expect((await failure(lelscansAdapter.resolve(LINK, context))).kind).toBe("rate-limited");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
    expect(sleeps.filter((wait) => wait >= 5000)).toHaveLength(POLITENESS.retries);
  });

  it("panne (5xx) : `site-error`", async () => {
    const { context } = setup(lelscansAdapter, () => html("<html><head><title>500</title></head></html>", 500));
    expect((await failure(lelscansAdapter.resolve(LINK, context))).kind).toBe("site-error");
  });

  it("page de chapitre dont la structure a changé : `adapter-outdated`", async () => {
    const { context } = setup(lelscansAdapter, () => html(readerPage("1", { image: '<canvas id="page"></canvas>' })));
    expect((await failure(lelscansAdapter.resolve(LINK, context))).kind).toBe("adapter-outdated");
  });

  it("page sans rien d'un chapitre : `unavailable`", async () => {
    const { context } = setup(lelscansAdapter, () => html("<html><head><title>Lelscans</title></head><body><p>Ce chapitre n'est plus proposé sur le site.</p></body></html>"));
    expect((await failure(lelscansAdapter.resolve(LINK, context))).kind).toBe("unavailable");
  });

  it("image du lecteur sur un domaine non déclaré : elle n'est pas retenue, et ce domaine n'est jamais appelé", async () => {
    const { context, calls } = setup(lelscansAdapter, () => html(readerPage("1", { image: '<img src="https://stock.example.net/mangas/baie-tranquille/204/1.png">' })));
    expect((await failure(lelscansAdapter.resolve(LINK, context))).kind).toBe("adapter-outdated");
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual(["lelscans.net"]);
  });
});
