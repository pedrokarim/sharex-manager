import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbortedError, SourceError, type SourceAdapter, type SourceContext } from "@/modules/scan-studio/lib/server/sources/adapter";
import { POLITENESS, PoliteFetcher, USER_AGENT, hostMatches, type Clock, type TransportRequest, type TransportResponse } from "@/modules/scan-studio/lib/server/sources/fetcher";
import { lelscanfrAdapter } from "@/modules/scan-studio/lib/server/sources/lelscanfr";
import { detect } from "@/modules/scan-studio/lib/server/sources/registry";

const ORIGIN = "https://www.lelscanfr.com";
const LINK = new URL(`${ORIGIN}/manga/baie-tranquille/12.5`);
const STORAGE = `${ORIGIN}/storage/content/baie-tranquille/12.5`;

// ─── Pages de la forme de celles du site, écrites à la main ──────

const image = (rank: number, file: string, lazy = true) =>
  lazy
    ? `<img class="lazyload chapter-image w-full" data-id="${rank}" data-src="${STORAGE}/${file}" width="1190" height="1692" alt="page" />`
    : `<img class="chapter-image w-full" data-id="${rank}" src="${STORAGE}/${file}" width="1190" height="1692" fetchpriority="high" loading="eager" alt="page" />`;

function chapterPage(images: string[], options: { title?: string; heading?: string } = {}) {
  return `<!DOCTYPE html><html lang="fr" dir="ltr"><head>
    <title>${options.title ?? "lelscanfr | Scan La Baie Tranquille 12.5 VF Lecture en Ligne"}</title>
    <link rel="canonical" href="${ORIGIN}/manga/baie-tranquille/12.5">
  </head><body>
    <img class="max-w-[120px]" src="${ORIGIN}/storage/site/logo.png" alt="logo" />
    <h2 class="text-lg font-bold"> ${options.heading ?? "La Baie Tranquille - Chapitre 12.5 <span></span>"}</h2>
    <span>Tous les chapitres sont dans <a class="text-black" href="${ORIGIN}/manga/baie-tranquille">La Baie Tranquille</a></span>
    <div id="chapter-container">${images.join("\n")}</div>
    <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
  </body></html>`;
}

const PAGES = [image(0, "aa01.webp", false), image(1, "aa02.webp"), image(2, "aa03.webp")];

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

describe("LelscanFR : reconnaissance des liens", () => {
  it("reconnaît un lien de chapitre, avec ou sans www, barre finale ou paramètres de suivi", () => {
    expect(kindOf(`${ORIGIN}/manga/baie-tranquille/12.5`)).toBe("lelscanfr");
    expect(kindOf("https://lelscanfr.com/manga/baie-tranquille/12/")).toBe("lelscanfr");
    expect(detect(`${ORIGIN}/manga/baie-tranquille/12?utm_source=discord&fbclid=abc`).url.toString()).toBe(`${ORIGIN}/manga/baie-tranquille/12`);
  });

  it("une fiche de série, l'accueil ou une autre page ne sont pas des chapitres", () => {
    expect(kindOf(`${ORIGIN}/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga/baie-tranquille`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga/baie-tranquille/`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/manga/baie-tranquille/12/extra`)).toBe("not-a-chapter");
    expect(kindOf(`${ORIGIN}/storage/content/baie-tranquille/12/aa01.webp`)).toBe("not-a-chapter");
  });

  it("un autre sous-domaine ou un domaine qui ressemble n'est pas le site", () => {
    expect(kindOf("https://cdn.lelscanfr.com/manga/baie-tranquille/12")).toBe("unsupported");
    expect(kindOf("https://www.lelscanfr.com.example.net/manga/baie-tranquille/12")).toBe("unsupported");
  });
});

describe("LelscanFR : ce qu'un lien désigne", () => {
  it("lit la série, le numéro, la langue et les pages en une seule requête", async () => {
    const { context, calls } = setup(lelscanfrAdapter, () => html(chapterPage(PAGES)));
    const chapter = await lelscanfrAdapter.resolve(LINK, context);
    expect(chapter.info).toEqual({ series: "La Baie Tranquille", chapterNumber: "12.5", language: "fr", pageCount: 3 });
    expect(chapter.pages).toEqual([
      { index: 0, url: `${STORAGE}/aa01.webp` },
      { index: 1, url: `${STORAGE}/aa02.webp` },
      { index: 2, url: `${STORAGE}/aa03.webp` },
    ]);
    expect(calls.map((call) => call.url)).toEqual([`${ORIGIN}/manga/baie-tranquille/12.5`]);
    // L'agent de l'application, et rien qui ressemble à un navigateur ou à un compte.
    expect(calls[0].headers["user-agent"]).toBe(USER_AGENT);
    expect(Object.keys(calls[0].headers).sort()).toEqual(["accept", "user-agent"]);
  });

  it("l'aperçu rend les mêmes informations, sans rien télécharger d'autre", async () => {
    const { context, calls } = setup(lelscanfrAdapter, () => html(chapterPage(PAGES)));
    expect(await lelscanfrAdapter.describe!(LINK, context)).toEqual({ series: "La Baie Tranquille", chapterNumber: "12.5", language: "fr", pageCount: 3 });
    expect(calls).toHaveLength(1);
  });

  it("demande l'adresse du chapitre, sans ce qui a été collé avec", async () => {
    const { context, calls } = setup(lelscanfrAdapter, () => html(chapterPage(PAGES)));
    await lelscanfrAdapter.resolve(new URL("https://lelscanfr.com/manga/Baie-Tranquille/12.5/?page=3#commentaires"), context);
    expect(calls[0].url).toBe(`${ORIGIN}/manga/baie-tranquille/12.5`);
  });

  it("range les pages d'après `data-id`, quel que soit l'ordre du document", async () => {
    const { context } = setup(lelscanfrAdapter, () => html(chapterPage([image(2, "c.webp"), image(0, "a.webp", false), image(10, "k.webp"), image(1, "b.webp")])));
    const chapter = await lelscanfrAdapter.resolve(LINK, context);
    expect(chapter.pages.map((page) => page.url.split("/").pop())).toEqual(["a.webp", "b.webp", "c.webp", "k.webp"]);
  });

  it("sans rang fiable, garde l'ordre du document, et ne compte pas deux fois une image", async () => {
    const images = [
      `<img class="chapter-image" src="/storage/content/baie-tranquille/12.5/z.webp">`,
      `<img class="lazyload chapter-image" data-id="0" data-src="/storage/content/baie-tranquille/12.5/a.webp">`,
      `<noscript><img class="chapter-image" src="/storage/content/baie-tranquille/12.5/a.webp"></noscript>`,
    ];
    const { context } = setup(lelscanfrAdapter, () => html(chapterPage(images)));
    const chapter = await lelscanfrAdapter.resolve(LINK, context);
    // Les adresses relatives sont résolues d'après celle de la page.
    expect(chapter.pages.map((page) => page.url)).toEqual([`${STORAGE}/z.webp`, `${STORAGE}/a.webp`]);
  });

  it("lit le titre du chapitre quand la page en écrit un", async () => {
    const { context } = setup(lelscanfrAdapter, () => html(chapterPage(PAGES, { heading: "La Baie Tranquille - Chapitre 12.5 <span>: Le phare &amp; la brume</span>" })));
    expect((await lelscanfrAdapter.resolve(LINK, context)).info.chapterTitle).toBe("Le phare & la brume");
  });

  it("sans lien vers la série, prend son nom dans le titre, puis dans l'adresse", async () => {
    const strip = (page: string) => page.replace(/<span>Tous les chapitres[\s\S]*?<\/span>/, "");
    const titled = setup(lelscanfrAdapter, () => html(strip(chapterPage(PAGES))));
    expect((await lelscanfrAdapter.resolve(LINK, titled.context)).info.series).toBe("La Baie Tranquille");
    const bare = setup(lelscanfrAdapter, () => html(strip(chapterPage(PAGES, { title: "Lecture" }))));
    expect((await lelscanfrAdapter.resolve(LINK, bare.context)).info.series).toBe("Baie Tranquille");
  });
});

describe("LelscanFR : ce qui empêche de lire", () => {
  it("vérification du navigateur : `unavailable`, sans nouvelle tentative, avec un message qui le dit", async () => {
    const challenge = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={};</script></body></html>';
    for (const status of [403, 503]) {
      const { context, calls } = setup(lelscanfrAdapter, () => html(challenge, status, { "cf-mitigated": "challenge" }));
      const error = await failure(lelscanfrAdapter.resolve(LINK, context));
      expect(error.kind, String(status)).toBe("unavailable");
      expect(error.message).toContain("vérification du navigateur");
      expect(error.message).toContain("ne la contourne pas");
      expect(calls).toHaveLength(1);
    }
  });

  it("page de connexion : `unavailable`", async () => {
    const { context, calls } = setup(lelscanfrAdapter, (request) =>
      request.url.pathname === "/login" ? html("<html><head><title>Connexion</title></head><body><form><input type='password'></form></body></html>") : { status: 302, headers: { location: "/login" }, body: Buffer.alloc(0) }
    );
    const error = await failure(lelscanfrAdapter.resolve(LINK, context));
    expect(error.kind).toBe("unavailable");
    expect(error.message).toContain("compte");
    expect(calls).toHaveLength(2);
  });

  it("chapitre inconnu (404) : `not-found`, sans nouvelle tentative", async () => {
    const { context, calls } = setup(lelscanfrAdapter, () => html("<html><head><title>404</title></head><body>Introuvable</body></html>", 404));
    expect((await failure(lelscanfrAdapter.resolve(LINK, context))).kind).toBe("not-found");
    expect(calls).toHaveLength(1);
  });

  it("lien renvoyé vers la fiche de la série : `not-found`", async () => {
    const { context } = setup(lelscanfrAdapter, (request) =>
      request.url.pathname === "/manga/baie-tranquille" ? html("<html><body><h1>La Baie Tranquille</h1></body></html>") : { status: 302, headers: { location: "/manga/baie-tranquille" }, body: Buffer.alloc(0) }
    );
    expect((await failure(lelscanfrAdapter.resolve(LINK, context))).kind).toBe("not-found");
  });

  it("trop de requêtes (429) : attend ce que le site indique, puis `rate-limited`", async () => {
    const { context, calls, sleeps } = setup(lelscanfrAdapter, () => html("Too Many Requests", 429, { "retry-after": "4" }));
    expect((await failure(lelscanfrAdapter.resolve(LINK, context))).kind).toBe("rate-limited");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
    expect(sleeps.filter((wait) => wait >= 4000)).toHaveLength(POLITENESS.retries);
  });

  it("panne (5xx) : `site-error` après des tentatives comptées", async () => {
    const { context, calls } = setup(lelscanfrAdapter, () => html("<html><head><title>502 Bad Gateway</title></head></html>", 502));
    expect((await failure(lelscanfrAdapter.resolve(LINK, context))).kind).toBe("site-error");
    expect(calls).toHaveLength(POLITENESS.retries + 1);
  });

  it("page de chapitre dont la structure a changé : `adapter-outdated`", async () => {
    const changed = chapterPage([`<img class="reader-page" src="${STORAGE}/aa01.webp">`]);
    const { context } = setup(lelscanfrAdapter, () => html(changed));
    expect((await failure(lelscanfrAdapter.resolve(LINK, context))).kind).toBe("adapter-outdated");
  });

  it("page sans rien d'un chapitre : `unavailable`", async () => {
    const { context } = setup(lelscanfrAdapter, () => html("<html><head><title>lelscanfr</title></head><body><p>Ce chapitre n'est plus proposé sur le site.</p></body></html>"));
    expect((await failure(lelscanfrAdapter.resolve(LINK, context))).kind).toBe("unavailable");
  });

  it("images sur un domaine non déclaré : `adapter-outdated`, et ce domaine n'est jamais appelé", async () => {
    const moved = chapterPage([`<img class="chapter-image" data-id="0" src="https://images.example.net/baie/1.webp">`]);
    const { context, calls } = setup(lelscanfrAdapter, () => html(moved));
    const error = await failure(lelscanfrAdapter.resolve(LINK, context));
    expect(error.kind).toBe("adapter-outdated");
    expect(error.message).toContain("images.example.net");
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual(["www.lelscanfr.com"]);
  });

  it("refuse un lien qui n'est pas celui d'un chapitre, sans rien appeler", async () => {
    const { context, calls } = setup(lelscanfrAdapter, () => html(chapterPage(PAGES)));
    expect((await failure(lelscanfrAdapter.resolve(new URL(`${ORIGIN}/manga/baie-tranquille`), context))).kind).toBe("not-a-chapter");
    expect(calls).toHaveLength(0);
  });
});

describe("LelscanFR : déclaration", () => {
  it("ne déclare que ses propres domaines", () => {
    expect(lelscanfrAdapter.hosts).toEqual(["www.lelscanfr.com", "lelscanfr.com"]);
    expect(lelscanfrAdapter.requestHosts).toBeUndefined();
    expect(lelscanfrAdapter.fetchPage).toBeUndefined();
    expect(lelscanfrAdapter.match(new URL(lelscanfrAdapter.example))).toBe(true);
  });
});
