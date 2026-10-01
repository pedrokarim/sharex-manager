/**
 * Moteurs de recherche inversée interrogés depuis le serveur.
 *
 * Chaque moteur reçoit l'image et rend des correspondances au même format.
 * Trois familles :
 * - trace.moe et IQDB répondent sans clé ;
 * - SauceNAO exige une clé (gratuite) ;
 * - Google Lens et Yandex n'ont pas d'API ouverte : leurs résultats ne
 *   s'intègrent qu'en passant par SerpApi, qui lit l'image par une adresse
 *   publique.
 * Une réponse d'un site tiers est une donnée étrangère : tout est borné, et
 * rien n'est repris sans avoir été converti en texte simple.
 */

import type { EngineId, EngineResult, KeyName, Match, MatchLink } from "../types";

const TIMEOUT_MS = 30_000;
const MAX_MATCHES = 12;
const USER_AGENT = "ShareX-Manager reverse-search";

/** Image envoyée aux moteurs : JPEG ou PNG de taille raisonnable. */
export interface Probe {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface EngineContext {
  probe: Probe;
  keys: Partial<Record<KeyName, string>>;
  /** Fournit une adresse publique de l'image, quand le moteur en a besoin. */
  publicUrl: () => Promise<string>;
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: "error" | "needs-key" = "error"
  ) {
    super(message);
  }
}

type Outcome = { matches: Match[]; message?: string };
type Engine = (context: EngineContext) => Promise<Outcome>;

// ─── Outils ──────────────────────────────────────────────────────

const text = (value: unknown, max = 300): string | undefined => {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
};

/** Adresse http(s) valide, ou rien. Un moteur ne nous fait pas afficher un `javascript:`. */
function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function link(label: string, value: unknown): MatchLink[] {
  const url = httpUrl(value);
  return url ? [{ label, url }] : [];
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new EngineError(timedOut ? "Le moteur met trop de temps à répondre." : "Le moteur est injoignable.");
  }
}

function imageForm(probe: Probe, field: string, extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  form.append(field, new Blob([new Uint8Array(probe.buffer)], { type: probe.mimeType }), probe.fileName);
  return form;
}

// ─── trace.moe ───────────────────────────────────────────────────

/** Sous ce seuil, trace.moe lui-même tient le résultat pour douteux. */
const TRACE_MOE_THRESHOLD = 0.87;

const clock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
};

const traceMoe: Engine = async ({ probe, keys }) => {
  const response = await request("https://api.trace.moe/search?anilistInfo&cutBorders", {
    method: "POST",
    headers: { "Content-Type": probe.mimeType, ...(keys.tracemoe ? { "x-trace-key": keys.tracemoe } : {}) },
    body: new Uint8Array(probe.buffer),
  });
  if (response.status === 402 || response.status === 429) {
    throw new EngineError("Quota trace.moe atteint pour l’instant. Réessayez plus tard, ou ajoutez une clé.");
  }
  const data = (await response.json().catch(() => null)) as any;
  if (!response.ok || !data || data.error) {
    throw new EngineError(text(data?.error) ?? `trace.moe a répondu HTTP ${response.status}.`);
  }

  const matches: Match[] = (Array.isArray(data.result) ? data.result : []).slice(0, MAX_MATCHES).map((entry: any) => {
    const anime = typeof entry.anilist === "object" && entry.anilist ? entry.anilist : {};
    const title = text(anime.title?.romaji) ?? text(anime.title?.english) ?? text(anime.title?.native) ?? text(entry.filename) ?? "Anime inconnu";
    const native = text(anime.title?.native);
    const episode = text(entry.episode);
    const similarity = Number(entry.similarity) || 0;
    const facts = [text(anime.format), anime.seasonYear ? String(anime.seasonYear) : undefined].filter(Boolean);
    return {
      title,
      subtitle: [native && native !== title ? native : undefined, ...facts].filter(Boolean).join(" · ") || undefined,
      detail: [episode ? `Épisode ${episode}` : undefined, Number.isFinite(entry.from) ? `à ${clock(entry.from)}` : undefined]
        .filter(Boolean)
        .join(", "),
      similarity,
      thumbnail: httpUrl(entry.image),
      preview: httpUrl(entry.video),
      links: [
        ...link("AniList", anime.siteUrl ?? (anime.id ? `https://anilist.co/anime/${anime.id}` : undefined)),
        ...link("MyAnimeList", anime.idMal ? `https://myanimelist.net/anime/${anime.idMal}` : undefined),
      ],
      tags: Array.isArray(anime.genres) ? anime.genres.slice(0, 4).map((genre: unknown) => text(genre, 40)).filter(Boolean) : undefined,
      adult: Boolean(anime.isAdult),
      weak: similarity < TRACE_MOE_THRESHOLD,
    } satisfies Match;
  });

  const quota = Number(data.quota);
  const used = Number(data.quotaUsed);
  return {
    matches,
    message: Number.isFinite(quota) && Number.isFinite(used) ? `${Math.max(0, quota - used)} recherches restantes ce mois-ci` : undefined,
  };
};

// ─── SauceNAO ────────────────────────────────────────────────────

const firstText = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const found = text(Array.isArray(value) ? value.filter((entry) => typeof entry === "string").join(", ") : value);
    if (found) return found;
  }
  return undefined;
};

const sauceNao: Engine = async ({ probe, keys }) => {
  if (!keys.saucenao) {
    throw new EngineError("SauceNAO demande une clé d’API (gratuite) pour intégrer ses résultats.", "needs-key");
  }
  const response = await request("https://saucenao.com/search.php", {
    method: "POST",
    body: imageForm(probe, "file", { output_type: "2", numres: String(MAX_MATCHES), db: "999", api_key: keys.saucenao }),
  });
  if (response.status === 429) throw new EngineError("Limite SauceNAO atteinte. Réessayez dans trente secondes.");
  if (response.status === 403) throw new EngineError("SauceNAO refuse cette clé d’API.", "needs-key");
  const data = (await response.json().catch(() => null)) as any;
  const header = data?.header ?? {};
  if (!data || Number(header.status) < 0) {
    throw new EngineError(text(header.message)?.replace(/<[^>]+>/g, "") ?? `SauceNAO a répondu HTTP ${response.status}.`);
  }

  const minimum = Number(header.minimum_similarity) || 55;
  const matches: Match[] = (Array.isArray(data.results) ? data.results : []).slice(0, MAX_MATCHES).map((entry: any) => {
    const info = entry.header ?? {};
    const details = entry.data ?? {};
    const similarity = Number(info.similarity) || 0;
    const index = text(info.index_name)?.replace(/^Index #\d+:\s*/, "").replace(/\s*-\s*[^-]*$/, "");
    const urls: unknown[] = Array.isArray(details.ext_urls) ? details.ext_urls : [];
    const links = [
      ...urls.slice(0, 4).flatMap((url) => {
        const valid = httpUrl(url);
        return valid ? [{ label: hostOf(valid), url: valid }] : [];
      }),
      ...link("Source", typeof details.source === "string" && /^https?:/.test(details.source) ? details.source : undefined),
    ];
    const part = text(details.part);
    return {
      title: firstText(details.title, details.eng_name, details.jp_name, details.source, details.material, index) ?? "Sans titre",
      subtitle: firstText(details.member_name, details.author_name, details.creator, details.author, details.user_name, details.twitter_user_handle),
      detail: [index, part ? `partie ${part}` : undefined, text(details.est_time)].filter(Boolean).join(" · ") || undefined,
      similarity: similarity / 100,
      thumbnail: httpUrl(info.thumbnail),
      links,
      tags: firstText(details.characters)?.split(/,\s*/).slice(0, 4),
      adult: Boolean(info.hidden),
      weak: similarity < minimum,
    } satisfies Match;
  });

  const short = Number(header.short_remaining);
  const long = Number(header.long_remaining);
  return {
    matches,
    message: Number.isFinite(long) ? `${long} recherches restantes aujourd’hui${Number.isFinite(short) ? `, ${short} dans les trente secondes` : ""}` : undefined,
  };
};

// ─── IQDB ────────────────────────────────────────────────────────

/** IQDB refuse au-delà de 8 Mo. */
const IQDB_MAX_BYTES = 8 * 1024 * 1024;

/**
 * IQDB n'a pas d'API : on lit sa page de résultats. Chaque correspondance est
 * un petit tableau (titre de rubrique, vignette liée, service, dimensions,
 * similarité).
 */
export function parseIqdb(html: string): Match[] {
  const matches: Match[] = [];
  for (const table of html.match(/<table>[\s\S]*?<\/table>/g) ?? []) {
    const heading = /<th>([^<]*)<\/th>/.exec(table)?.[1] ?? "";
    if (/your image|no relevant/i.test(heading)) continue;
    const href = httpUrl(decodeEntities(/<td class='image'><a href="([^"]+)"/.exec(table)?.[1] ?? ""));
    const similarity = Number(/(\d+)% similarity/.exec(table)?.[1]);
    if (!href || !Number.isFinite(similarity)) continue;

    const thumbnail = /<img src='([^']+)'/.exec(table)?.[1];
    const alt = decodeEntities(/alt="([^"]*)"/.exec(table)?.[1] ?? "");
    const service = text(decodeEntities(/class="service-icon">([^<]+)</.exec(table)?.[1] ?? ""), 40) ?? hostOf(href);
    const size = /(\d+)×(\d+) \[(\w+)\]/.exec(table);
    // Zerochan sépare ses étiquettes par des virgules, les autres par des espaces.
    const rawTags = /Tags: (.*)$/.exec(alt)?.[1] ?? "";
    const tags = rawTags
      .split(rawTags.includes(",") ? /,\s*/ : /\s+/)
      .map((tag) => tag.replace(/_/g, " ").trim())
      .filter(Boolean);
    // Les autres services qui hébergent la même image.
    const others = [...table.matchAll(/<span class="el"><a href="([^"]+)">(?:<img[^>]*>)?([^<]+)<\/a>/g)].flatMap((found) =>
      link(found[2].trim(), decodeEntities(found[1]))
    );

    matches.push({
      // IQDB ne donne pas de titre : le site où l'image se trouve en tient lieu.
      title: `Image sur ${service}`,
      subtitle: tags.slice(0, 6).join(", ") || undefined,
      detail: size ? `${size[1]} × ${size[2]}` : undefined,
      similarity: similarity / 100,
      thumbnail: thumbnail ? httpUrl(new URL(thumbnail, "https://iqdb.org").toString()) : undefined,
      links: [{ label: service, url: href }, ...others],
      adult: size ? /explicit|ero/i.test(size[3]) : false,
      // « Best match » et « Additional match » sont les résultats que IQDB juge sûrs.
      weak: !/^(best|additional) match/i.test(heading),
    });
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
}

const iqdb: Engine = async ({ probe }) => {
  if (probe.buffer.length > IQDB_MAX_BYTES) throw new EngineError("Image trop lourde pour IQDB (8 Mo au plus).");
  const response = await request("https://iqdb.org/", { method: "POST", body: imageForm(probe, "file") });
  if (!response.ok) throw new EngineError(`IQDB a répondu HTTP ${response.status}.`);
  const html = await response.text();
  const failure = /<div class="err">([\s\S]*?)<\/div>/.exec(html)?.[1];
  if (failure) throw new EngineError(text(failure.replace(/<[^>]+>/g, " ")) ?? "IQDB a refusé l’image.");
  return { matches: parseIqdb(html) };
};

// ─── Google Lens et Yandex, par SerpApi ──────────────────────────

async function serpApi(engine: string, context: EngineContext, extra: Record<string, string>): Promise<any> {
  if (!context.keys.serpapi) {
    throw new EngineError("Ce moteur n’a pas d’API ouverte : ses résultats s’intègrent avec une clé SerpApi.", "needs-key");
  }
  const params = new URLSearchParams({ engine, url: await context.publicUrl(), api_key: context.keys.serpapi, ...extra });
  const response = await request(`https://serpapi.com/search.json?${params.toString()}`);
  if (response.status === 401) throw new EngineError("SerpApi refuse cette clé.", "needs-key");
  if (response.status === 429) throw new EngineError("Quota SerpApi atteint.");
  const data = (await response.json().catch(() => null)) as any;
  if (!data) throw new EngineError(`SerpApi a répondu HTTP ${response.status}.`);
  // SerpApi signale aussi « aucun résultat » par ce champ : ce n'est pas une panne.
  if (data.error && !/hasn't returned any results|no results/i.test(String(data.error))) {
    throw new EngineError(text(data.error) ?? "SerpApi a renvoyé une erreur.");
  }
  return data;
}

function webMatch(entry: any): Match | null {
  const url = httpUrl(entry?.link);
  if (!url) return null;
  const image = entry.original_image ?? entry.image;
  return {
    title: text(entry.title) ?? hostOf(url),
    subtitle: text(entry.source) ?? text(entry.displayed_link) ?? hostOf(url),
    detail: text(entry.snippet, 200),
    thumbnail: httpUrl(entry.thumbnail) ?? httpUrl(typeof image === "string" ? image : image?.link),
    links: [{ label: hostOf(url), url }],
  };
}

const webMatches = (...lists: unknown[]): Match[] =>
  lists
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .map(webMatch)
    .filter((match): match is Match => match !== null)
    .slice(0, MAX_MATCHES);

const googleLens: Engine = async (context) => {
  const data = await serpApi("google_lens", context, { hl: "fr" });
  return { matches: webMatches(data.visual_matches) };
};

const yandex: Engine = async (context) => {
  const data = await serpApi("yandex_images", context, {});
  return { matches: webMatches(data.image_results, data.similar_images, data.images_results) };
};

// ─── Exécution ───────────────────────────────────────────────────

const INLINE: Partial<Record<EngineId, Engine>> = {
  tracemoe: traceMoe,
  saucenao: sauceNao,
  iqdb,
  google: googleLens,
  yandex,
};

export const hasInlineEngine = (id: EngineId) => id in INLINE;

/** Interroge un moteur. Ne lève jamais : un échec est un résultat comme un autre. */
export async function runEngine(id: EngineId, context: EngineContext): Promise<EngineResult> {
  const started = Date.now();
  const done = (partial: Pick<EngineResult, "status" | "matches" | "message">): EngineResult => ({
    engine: id,
    durationMs: Date.now() - started,
    ranAt: started,
    ...partial,
  });
  const engine = INLINE[id];
  if (!engine) return done({ status: "error", matches: [], message: "Ce moteur ne s’ouvre que dans un onglet." });
  try {
    const { matches, message } = await engine(context);
    return done({ status: matches.length > 0 ? "ok" : "empty", matches, message });
  } catch (error) {
    if (error instanceof EngineError) return done({ status: error.status, matches: [], message: error.message });
    console.error(`[reverse-search] ${id} :`, error);
    return done({ status: "error", matches: [], message: "Réponse du moteur illisible." });
  }
}
