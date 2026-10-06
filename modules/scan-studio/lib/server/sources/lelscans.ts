/**
 * Adaptateur lelscans.net, par ses pages ordinaires.
 *
 * Ce que le site sert à un visiteur anonyme (vérifié le 06/10/2026, une
 * requête, sans défi ni compte ; son `robots.txt` laisse lire les pages du
 * lecteur) :
 *
 * - un lien a la forme `/scan-<série>/<chapitre>/<page>`, la page pouvant
 *   manquer ;
 * - une page du lecteur ne montre qu'UNE image
 *   (`<img src="/mangas/<série>/<chapitre>/<n>.<ext>?v=…">`, adresse relative)
 *   et porte un lien vers chaque page du chapitre ;
 * - l'extension de l'image peut changer d'une page à l'autre : l'adresse d'une
 *   image ne se devine pas, elle se lit dans la page du lecteur qui la montre.
 *
 * D'où deux requêtes par page : `resolve` lit une page du lecteur pour avoir
 * la liste des pages, puis `fetchPage` lit, pour chacune, sa page du lecteur
 * puis son image. Pour ne pas peser deux fois plus sur le site, le délai entre
 * deux requêtes est relevé (`minDelayMs`). L'image de la page que `resolve` a
 * déjà lue n'est pas redemandée au lecteur.
 *
 * `og:image` est la couverture de la série (`/mangas/<série>/thumb_cover.jpg`) :
 * elle illustre le dossier, sans requête de plus pour la trouver.
 */

import type { ChapterInfo, ResolvedChapter, SourceAdapter, SourceContext, SourcePage } from "./adapter";
import { SourceError } from "./adapter";
import { cleanText, findElements, humanizeSlug, imageAddresses, metaContent, metaImage, pageLanguage, pageTitle } from "./html";
import { chapterOf, declaredCover, escapeRegExp, fetchReaderPage, noImagesError, outdated, type ReaderPage } from "./reader";

const NAME = "Lelscans";
const ORIGIN = "https://lelscans.net";

/** `/scan-<série>/<chapitre>` ou `/scan-<série>/<chapitre>/<page>`. */
const CHAPTER_PATH = /^\/scan-([a-z0-9][a-z0-9_-]{0,150})\/(\d[0-9a-z._-]{0,19})(?:\/(\d{1,4}))?\/?$/i;
/** L'image d'une page : `/mangas/<série>/<chapitre>/<fichier>`. Les couvertures sont un étage plus haut. */
const PAGE_IMAGE_PATH = /^\/mangas\/[^/]+\/[^/]+\/[^/]+\.(?:png|jpe?g|webp|gif)$/i;
const COVER_PATH = /^\/mangas\/[^/]+\/[^/]*cover[^/]*\.(?:png|jpe?g|webp|gif)$/i;

function partsOf(url: URL): { slug: string; chapter: string; page?: string } {
  const match = CHAPTER_PATH.exec(url.pathname);
  if (!match) throw new SourceError("not-a-chapter", `Un lien de chapitre ${NAME} a la forme ${ORIGIN}/scan-<série>/<chapitre>.`);
  return { slug: match[1].toLowerCase(), chapter: match[2], page: match[3] };
}

const readerAddress = (slug: string, chapter: string, page?: string) => `${ORIGIN}/scan-${slug}/${chapter}${page ? `/${page}` : ""}`;

/** L'image que montre une page du lecteur. */
function shownImage(page: ReaderPage, context: SourceContext): string | undefined {
  return imageAddresses(page.html, page.url, (_tag, address) => PAGE_IMAGE_PATH.test(address.pathname) && context.fetcher.isAllowed(address.hostname))[0];
}

/**
 * Les pages du chapitre, d'après les liens numérotés du lecteur. Les liens
 * « précédent » et « suivant » mènent aux mêmes adresses : seuls comptent ceux
 * dont le texte est le numéro de la page.
 */
function pageNumbers(page: ReaderPage, slug: string, chapter: string): string[] {
  const pattern = new RegExp(`^/scan-${escapeRegExp(slug)}/${escapeRegExp(chapter)}/(\\d{1,4})/?$`, "i");
  const numbers: string[] = [];
  for (const link of findElements(page.html, "a")) {
    if (!link.attributes.href) continue;
    let path: string;
    try {
      path = new URL(link.attributes.href.trim(), page.url).pathname;
    } catch {
      continue;
    }
    const number = pattern.exec(path)?.[1];
    if (number && link.text === number && !numbers.includes(number)) numbers.push(number);
  }
  return numbers.sort((left, right) => Number(left) - Number(right));
}

/** Le nom de la série : « Scan <série> <chapitre> Page <n> » dans le titre, ou le début de `og:title`. */
function seriesName(page: ReaderPage, slug: string, chapter: string): string | undefined {
  const number = escapeRegExp(chapter);
  const titled = new RegExp(`^\\s*Scan\\s+(.+?)\\s+${number}\\b`, "i").exec(pageTitle(page.html) ?? "")?.[1];
  const shared = new RegExp(`^\\s*(.+?)\\s+${number}\\b`, "i").exec(metaContent(page.html, "og:title") ?? "")?.[1];
  return cleanText(titled, 200) ?? cleanText(shared, 200) ?? humanizeSlug(slug);
}

/** Ce que `resolve` garde pour `fetchPage` : les images dont l'adresse est déjà connue, par rang. */
interface LelscansChapter extends ResolvedChapter {
  knownImages: Record<number, string>;
}

async function resolve(url: URL, context: SourceContext): Promise<LelscansChapter> {
  const { slug, chapter, page: asked } = partsOf(url);
  const page = await fetchReaderPage(readerAddress(slug, chapter, asked), context, NAME);
  const landed = CHAPTER_PATH.exec(page.url.pathname);
  if (!landed || landed[2] !== chapter) {
    throw new SourceError("not-found", `${NAME} renvoie ce lien vers une autre page que celle de ce chapitre : il a pu être retiré.`);
  }

  const image = shownImage(page, context);
  let numbers = pageNumbers(page, slug, chapter);
  if (!image) {
    const looksLikeChapter = numbers.length > 0 || /\/mangas\//i.test(page.html) || /^\s*Scan\s.+\d/i.test(pageTitle(page.html) ?? "");
    throw noImagesError(page, NAME, looksLikeChapter);
  }
  // Un chapitre d'une seule page n'a pas forcément de liens numérotés.
  const shown = landed[3] ?? asked ?? numbers[0] ?? "1";
  if (numbers.length === 0) numbers = [shown];

  const pages: SourcePage[] = numbers.map((number, index) => ({ index, url: readerAddress(slug, chapter, number) }));
  const knownImages: Record<number, string> = {};
  const shownIndex = numbers.indexOf(shown);
  if (shownIndex >= 0) knownImages[shownIndex] = image;

  const cover = metaImage(page.html, page.url);
  const resolved = chapterOf(
    {
      series: seriesName(page, slug, chapter),
      chapterNumber: chapter,
      language: pageLanguage(page.html) ?? "fr",
      seriesCoverUrl: cover && COVER_PATH.test(new URL(cover).pathname) ? declaredCover(cover, context) : undefined,
    },
    pages
  );
  return { ...resolved, knownImages };
}

const describe = async (url: URL, context: SourceContext): Promise<ChapterInfo> => (await resolve(url, context)).info;

/**
 * Une page : sa page du lecteur d'abord (`page.url`), pour y lire l'adresse de
 * son image, puis l'image. Deux requêtes, chacune par le client poli.
 */
async function fetchPage(page: SourcePage, resolved: ResolvedChapter, context: SourceContext): Promise<Buffer> {
  let address: string | undefined = (resolved as LelscansChapter).knownImages?.[page.index];
  if (!address) {
    const reader = await fetchReaderPage(page.url, context, NAME);
    address = shownImage(reader, context);
    if (!address) throw outdated(NAME, `la page ${page.index + 1} du lecteur ne montre plus d’image là où l’adaptateur la lit`);
  }
  const response = await context.fetcher.request(address, { kind: "image", signal: context.signal });
  if (response.status < 200 || response.status >= 300) {
    throw new SourceError("site-error", `${NAME} a répondu HTTP ${response.status} pour l’image de la page ${page.index + 1}.`);
  }
  return response.body;
}

export const lelscansAdapter: SourceAdapter = {
  id: "lelscans",
  name: NAME,
  homepage: `${ORIGIN}/`,
  hosts: ["lelscans.net", "www.lelscans.net"],
  example: `${ORIGIN}/scan-one-piece/1046/17`,
  notes:
    "Par les pages ordinaires du site, sans compte. Le lecteur montre une image par page : l’import fait donc deux requêtes par page (la page du lecteur, puis son image), plus espacées qu’ailleurs. Chapitres en français. Si le site demande une vérification du navigateur ou un compte, l’import s’arrête : rien n’est contourné.",
  // Deux requêtes par page : on les espace davantage.
  minDelayMs: 1500,
  match: (url) => CHAPTER_PATH.test(url.pathname),
  describe,
  resolve,
  fetchPage,
};
