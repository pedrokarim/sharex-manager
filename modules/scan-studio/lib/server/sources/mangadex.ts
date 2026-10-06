/**
 * Adaptateur MangaDex, par son API publique seulement (`api.mangadex.org`).
 *
 * Ce que la documentation officielle demande (https://api.mangadex.org/docs/,
 * lue le 06/10/2026) et ce que ce fichier en fait :
 *
 * - « Limitations and Requirements » (`/docs/2-limitations/`) : un `User-Agent`
 *   présent et sincère, aucun en-tête `Via` ; environ 5 requêtes par seconde et
 *   par adresse au plus ; `GET /at-home/server/{id}` limité à 40 par minute ;
 *   au dépassement, HTTP 429, puis un bannissement temporaire en HTTP 403 si
 *   l'on insiste. Ici : une requête par seconde et par domaine au plus, l'une
 *   après l'autre ; un 429 est attendu le temps que le site indique ; un 403
 *   arrête tout, sans nouvelle tentative ;
 * - « Retrieving a chapter » (`/docs/04-chapter/retrieving-chapter/`) : les
 *   pages se lisent à `baseUrl/data/hash/fichier`, d'après
 *   `GET /at-home/server/{id}` ; l'adresse de base n'est garantie qu'un quart
 *   d'heure et se redemande ensuite ; aucun en-tête d'authentification ne part
 *   vers les serveurs d'images ; chaque image lue sur un serveur dont l'adresse
 *   ne contient pas « mangadex.org » fait l'objet d'un compte rendu, réussie ou
 *   non, à `POST https://api.mangadex.network/report`. Tout cela est fait dans
 *   `fetchPage` ;
 * - règles d'usage (accueil de la documentation) : créditer MangaDex et les
 *   équipes de traduction, ni publicité ni service payant. L'aperçu et l'import
 *   affichent le site et l'équipe créditée ; le module est un atelier privé.
 *
 * Un chapitre que MangaDex ne fait que signaler (`externalUrl` : il se lit chez
 * l'éditeur), qu'il a retiré (`isUnavailable`) ou qui n'a aucune page n'est pas
 * lisible par l'API : l'adaptateur répond `unavailable` et n'essaie rien
 * d'autre.
 */

import { SourceError, type ChapterInfo, type ResolvedChapter, type SourceAdapter, type SourceContext, type SourcePage } from "./adapter";
import type { PoliteResponse } from "./fetcher";

const API = "https://api.mangadex.org";
const REPORT_URL = "https://api.mangadex.network/report";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** `/chapter/<identifiant>`, suivi ou non du numéro de la page ouverte dans le lecteur. */
const CHAPTER_PATH = new RegExp(`^/chapter/(${UUID})(?:/\\d+)?/?$`, "i");

/** Nom de fichier tel que l'API les donne : rien qui puisse changer de dossier ou de domaine. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
const HASH = /^[A-Za-z0-9]{8,128}$/;
const SERIES_ID = new RegExp(`^${UUID}$`);
/** Nom de fichier d'une couverture : un identifiant et son extension d'image. */
const COVER_FILE = /^[A-Za-z0-9-]{8,80}\.(?:jpe?g|png|gif|webp)$/i;

/** L'adresse de base expire : on la redemande au plus tant de fois par chapitre, jamais en boucle. */
const MAX_BASE_REFRESHES = 2;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 300): string | undefined => {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  return clean || undefined;
};

const outdated = (detail: string) =>
  new SourceError("adapter-outdated", `La réponse de MangaDex n’a plus la forme attendue (${detail}). L’adaptateur est à revoir avant de réessayer.`);

function chapterIdOf(url: URL): string {
  const match = CHAPTER_PATH.exec(url.pathname);
  if (!match) throw new SourceError("not-a-chapter", "Un lien de chapitre MangaDex a la forme https://mangadex.org/chapter/<identifiant>.");
  return match[1].toLowerCase();
}

/** Les statuts que le client rend sans les interpréter, traduits en cas d'erreur. */
function assertOk(response: PoliteResponse, what: string) {
  if (response.status >= 200 && response.status < 300) return;
  if (response.status === 404) throw new SourceError("not-found", "MangaDex ne connaît pas ce chapitre : il a pu être supprimé, ou le lien est incomplet.");
  if (response.status === 403) {
    throw new SourceError("rate-limited", "MangaDex refuse pour l’instant les requêtes de ce serveur (HTTP 403). Rien n’est retenté : attendez avant de recommencer.");
  }
  if (response.status === 401 || response.status === 451) {
    throw new SourceError("unavailable", `MangaDex ne sert pas ce chapitre à un visiteur anonyme (HTTP ${response.status}).`);
  }
  throw new SourceError("site-error", `MangaDex a répondu HTTP ${response.status} (${what}).`);
}

/** Titre d'une série : l'anglais s'il existe, sinon le premier donné. */
function seriesTitle(attributes: unknown): string | undefined {
  if (!isRecord(attributes) || !isRecord(attributes.title)) return undefined;
  return text(attributes.title.en) ?? Object.values(attributes.title).map((value) => text(value)).find(Boolean);
}

async function describe(url: URL, context: SourceContext): Promise<ChapterInfo> {
  return (await readChapter(url, context)).info;
}

/** Ce que MangaDex dit d'un chapitre, et l'identifiant de sa série. */
async function readChapter(url: URL, context: SourceContext): Promise<{ info: ChapterInfo; seriesId?: string }> {
  const id = chapterIdOf(url);
  const { response, data } = await context.fetcher.json(`${API}/chapter/${id}?includes[]=manga&includes[]=scanlation_group`, { signal: context.signal });
  assertOk(response, "lecture du chapitre");

  if (!isRecord(data) || data.result !== "ok" || !isRecord(data.data)) throw outdated("chapitre sans « data »");
  const attributes = data.data.attributes;
  if (data.data.type !== "chapter" || !isRecord(attributes)) throw outdated("chapitre sans attributs");
  if (typeof attributes.pages !== "number" || !Number.isInteger(attributes.pages) || attributes.pages < 0) throw outdated("nombre de pages absent");

  const relationships = Array.isArray(data.data.relationships) ? data.data.relationships.filter(isRecord) : [];
  const groups = relationships.filter((entry) => entry.type === "scanlation_group").flatMap((entry) => (isRecord(entry.attributes) ? (text(entry.attributes.name, 80) ?? []) : []));

  const info: ChapterInfo = {
    series: seriesTitle(relationships.find((entry) => entry.type === "manga")?.attributes),
    chapterNumber: text(attributes.chapter, 20),
    chapterTitle: text(attributes.title),
    language: text(attributes.translatedLanguage, 12),
    credit: groups.length > 0 ? groups.slice(0, 5).join(", ") : undefined,
    pageCount: attributes.pages,
  };

  // Rien de tout cela ne se contourne : ces chapitres ne sont pas servis par l'API.
  const external = text(attributes.externalUrl, 500);
  if (external) {
    let host = "un autre site";
    try {
      host = new URL(external).hostname;
    } catch {
      // Adresse illisible : le message reste général.
    }
    throw new SourceError("unavailable", `MangaDex ne fait que signaler ce chapitre : il se lit chez son éditeur (${host}), pas ici.`);
  }
  if (attributes.isUnavailable === true) throw new SourceError("unavailable", "MangaDex a retiré les pages de ce chapitre.");
  if (info.pageCount === 0) throw new SourceError("unavailable", "MangaDex n’a aucune page pour ce chapitre.");
  const series = relationships.find((entry) => entry.type === "manga")?.id;
  return { info, seriesId: typeof series === "string" && SERIES_ID.test(series) ? series : undefined };
}

/** Demande où lire les pages, et autorise le serveur d'images que l'API désigne. */
async function imageServer(id: string, context: SourceContext): Promise<{ baseUrl: string; hash: string; files: string[] }> {
  const { response, data } = await context.fetcher.json(`${API}/at-home/server/${id}`, { signal: context.signal });
  assertOk(response, "adresse des pages");

  if (!isRecord(data) || data.result !== "ok" || !isRecord(data.chapter)) throw outdated("serveur d’images sans « chapter »");
  const { hash, data: files } = data.chapter;
  if (typeof hash !== "string" || !HASH.test(hash)) throw outdated("empreinte du chapitre absente");
  if (!Array.isArray(files) || !files.every((file): file is string => typeof file === "string" && FILE_NAME.test(file))) throw outdated("liste des pages illisible");

  let base: URL;
  try {
    base = new URL(String(data.baseUrl));
  } catch {
    throw outdated("adresse du serveur d’images illisible");
  }
  if (base.protocol !== "https:" || base.username || base.password) throw outdated("adresse du serveur d’images inattendue");

  // Le serveur d'images change d'un chapitre à l'autre : c'est l'API qui le désigne.
  context.fetcher.allowHost(base.hostname);
  return { baseUrl: base.toString().replace(/\/$/, ""), hash, files };
}

const pageUrl = (baseUrl: string, hash: string, file: string) => `${baseUrl}/data/${hash}/${file}`;

/** Ce que `resolve` garde pour `fetchPage` : de quoi redemander l'adresse de base. */
interface MangadexChapter extends ResolvedChapter {
  chapterId: string;
  refreshes: number;
}

/**
 * Couverture principale de la série, telle que la documentation de MangaDex la
 * décrit : le nom du fichier est dans la relation `cover_art` de la série, et
 * l'image se lit sur `uploads.mangadex.org`, ici dans sa vignette de 512 px.
 * Rien de tout cela n'est indispensable : au moindre doute, pas de couverture.
 */
async function seriesCover(seriesId: string | undefined, context: SourceContext): Promise<string | undefined> {
  if (!seriesId) return undefined;
  try {
    const { response, data } = await context.fetcher.json(`${API}/manga/${seriesId}?includes[]=cover_art`, { signal: context.signal });
    if (response.status !== 200 || !isRecord(data) || !isRecord(data.data) || !Array.isArray(data.data.relationships)) return undefined;
    const cover = data.data.relationships.filter(isRecord).find((entry) => entry.type === "cover_art");
    const fileName = isRecord(cover?.attributes) ? cover.attributes.fileName : undefined;
    if (typeof fileName !== "string" || !COVER_FILE.test(fileName)) return undefined;
    return `https://uploads.mangadex.org/covers/${seriesId}/${fileName}.512.jpg`;
  } catch (error) {
    context.log(`couverture de la série non lue : ${error instanceof Error ? error.message : "erreur"}`);
    return undefined;
  }
}

async function resolve(url: URL, context: SourceContext): Promise<MangadexChapter> {
  const id = chapterIdOf(url);
  const { info, seriesId } = await readChapter(url, context);
  const server = await imageServer(id, context);
  if (server.files.length === 0) throw new SourceError("unavailable", "MangaDex n’a aucune page pour ce chapitre.");
  const seriesCoverUrl = await seriesCover(seriesId, context);
  return {
    chapterId: id,
    refreshes: 0,
    info: { ...info, pageCount: server.files.length, ...(seriesCoverUrl ? { seriesCoverUrl } : {}) },
    pages: server.files.map((file, index) => ({ index, url: pageUrl(server.baseUrl, server.hash, file) })),
  };
}

/**
 * Compte rendu demandé par MangaDex pour chaque image lue sur un serveur du
 * réseau MangaDex@Home, réussie ou non. Un seul envoi, sans nouvelle
 * tentative ; s'il échoue, l'import continue.
 */
async function report(context: SourceContext, body: { url: string; success: boolean; bytes: number; duration: number; cached: boolean }) {
  if (new URL(body.url).hostname.includes("mangadex.org")) return;
  try {
    await context.fetcher.request(REPORT_URL, { kind: "any", json: body, retries: 0, signal: context.signal });
  } catch (error) {
    if (context.signal.aborted) throw error;
    context.log(`compte rendu MangaDex@Home non remis : ${error instanceof Error ? error.message : "erreur"}`);
  }
}

async function fetchPage(page: SourcePage, resolved: ResolvedChapter, context: SourceContext): Promise<Buffer> {
  const chapter = resolved as MangadexChapter;
  for (;;) {
    const url = page.url;
    const startedAt = Date.now();
    let failure: SourceError;
    try {
      // Aucun en-tête d'authentification : le client n'en envoie jamais. Une seule
      // tentative par adresse : en cas d'échec, c'est un autre serveur qu'on demande.
      const response = await context.fetcher.request(url, { kind: "image", retries: 0, signal: context.signal });
      const ok = response.status >= 200 && response.status < 300;
      await report(context, {
        url,
        success: ok,
        bytes: response.body.length,
        duration: response.durationMs,
        cached: (response.headers["x-cache"] ?? "").toUpperCase().startsWith("HIT"),
      });
      if (ok) return response.body;
      failure = new SourceError("site-error", `Le serveur d’images a répondu HTTP ${response.status} pour la page ${page.index + 1}.`);
    } catch (error) {
      if (context.signal.aborted || !(error instanceof SourceError)) throw error;
      // Mis de côté par le client : demander une autre adresse ne ferait qu'insister.
      if (error.kind === "rate-limited") throw error;
      await report(context, { url, success: false, bytes: 0, duration: Date.now() - startedAt, cached: false });
      failure = error;
    }

    if (chapter.refreshes >= MAX_BASE_REFRESHES || typeof chapter.chapterId !== "string") throw failure;
    chapter.refreshes++;
    context.log(`page ${page.index + 1} : échec, nouvelle adresse demandée à MangaDex (${chapter.refreshes}/${MAX_BASE_REFRESHES})`);
    const server = await imageServer(chapter.chapterId, context);
    if (server.files.length !== chapter.pages.length) throw new SourceError("site-error", "Le chapitre a changé chez MangaDex pendant l’import. Relancez-le.");
    // Les pages restantes se liront, elles aussi, à la nouvelle adresse.
    server.files.forEach((file, index) => {
      chapter.pages[index].url = pageUrl(server.baseUrl, server.hash, file);
    });
  }
}

export const mangadexAdapter: SourceAdapter = {
  id: "mangadex",
  name: "MangaDex",
  homepage: "https://mangadex.org/",
  hosts: ["mangadex.org", "www.mangadex.org"],
  requestHosts: ["api.mangadex.org", "api.mangadex.network", "uploads.mangadex.org"],
  example: "https://mangadex.org/chapter/33ea9f97-cb60-4e8c-9b47-8f6ecf9a50af",
  notes:
    "Par l’API publique de MangaDex, sans compte. Les chapitres que MangaDex ne fait que signaler (ils se lisent chez leur éditeur) ou qu’il a retirés ne sont pas importables. Ses règles : créditer MangaDex et l’équipe de traduction, ni publicité ni service payant. Une requête par seconde au plus.",
  match: (url) => CHAPTER_PATH.test(url.pathname),
  describe,
  resolve,
  fetchPage,
};
