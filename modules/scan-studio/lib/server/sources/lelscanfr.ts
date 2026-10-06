/**
 * Adaptateur lelscanfr.com, par ses pages ordinaires.
 *
 * Ce que le site sert à un visiteur anonyme (vérifié le 06/10/2026, une
 * requête, sans défi ni compte ; son `robots.txt` laisse lire les pages du
 * lecteur) :
 *
 * - un lien de chapitre a la forme `/manga/<série>/<chapitre>`, et UNE page
 *   HTML porte tout le chapitre ;
 * - chaque page du chapitre est une balise `<img class="… chapter-image …">` :
 *   la première a son adresse dans `src`, les suivantes (chargées à la demande)
 *   dans `data-src`, et `data-id` donne leur rang ;
 * - les images sont sur le même domaine (`/storage/content/…`) et se lisent
 *   sans en-tête `Referer`.
 *
 * Le nom de la série est celui du lien vers sa fiche, le numéro vient de
 * l'adresse. La page ne montre aucune couverture : l'adaptateur n'en donne pas.
 */

import type { ChapterInfo, ResolvedChapter, SourceAdapter, SourceContext } from "./adapter";
import { SourceError } from "./adapter";
import { cleanText, findElements, findTags, hasClass, humanizeSlug, imageAddress, pageLanguage, pageTitle } from "./html";
import { assertDeclaredHosts, chapterOf, escapeRegExp, fetchReaderPage, noImagesError, toPages, type ReaderPage } from "./reader";

const NAME = "LelscanFR";
const ORIGIN = "https://www.lelscanfr.com";

/** `/manga/<série>/<chapitre>` : le chapitre est un numéro, parfois suivi d'une partie (« 59.1 »). */
const CHAPTER_PATH = /^\/manga\/([a-z0-9][a-z0-9_-]{0,150})\/(\d[0-9a-z._-]{0,19})\/?$/i;

function partsOf(url: URL): { slug: string; chapter: string } {
  const match = CHAPTER_PATH.exec(url.pathname);
  if (!match) throw new SourceError("not-a-chapter", `Un lien de chapitre ${NAME} a la forme ${ORIGIN}/manga/<série>/<chapitre>.`);
  return { slug: match[1].toLowerCase(), chapter: match[2] };
}

/** Les images du chapitre, dans l'ordre de `data-id` quand chaque image en porte un, sinon dans celui du document. */
function chapterImages(page: ReaderPage): string[] {
  const found: { address: string; rank: number }[] = [];
  const seen = new Set<string>();
  for (const tag of findTags(page.html, "img")) {
    if (!hasClass(tag, "chapter-image")) continue;
    const address = imageAddress(tag, page.url);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    const rank = /^\d{1,5}$/.test(tag.attributes["data-id"] ?? "") ? Number(tag.attributes["data-id"]) : Number.NaN;
    found.push({ address, rank });
  }
  const ranked = found.every((entry) => Number.isFinite(entry.rank)) && new Set(found.map((entry) => entry.rank)).size === found.length;
  if (ranked) found.sort((left, right) => left.rank - right.rank);
  return found.map((entry) => entry.address);
}

/** Le nom de la série : le texte du lien vers sa fiche, sinon le titre de la page, sinon son adresse. */
function seriesName(page: ReaderPage, slug: string, chapter: string): string | undefined {
  for (const link of findElements(page.html, "a")) {
    if (!link.text || !link.attributes.href) continue;
    try {
      if (new URL(link.attributes.href.trim(), page.url).pathname.replace(/\/$/, "").toLowerCase() === `/manga/${slug}`) return cleanText(link.text, 200);
    } catch {
      // Lien illisible : au suivant.
    }
  }
  // « lelscanfr | Scan <série> <chapitre> VF Lecture en Ligne »
  const titled = new RegExp(`\\bScan\\s+(.+?)\\s+${escapeRegExp(chapter)}\\b`, "i").exec(pageTitle(page.html) ?? "")?.[1];
  return cleanText(titled, 200) ?? humanizeSlug(slug);
}

/** Le titre du chapitre, quand la page en écrit un après « Chapitre <numéro> ». */
function chapterTitle(page: ReaderPage, chapter: string): string | undefined {
  const pattern = new RegExp(`\\bChapitre\\s+${escapeRegExp(chapter)}\\s*[-:–]?\\s*(.+)$`, "i");
  for (const heading of findElements(page.html, "h2")) {
    const title = cleanText(pattern.exec(heading.text ?? "")?.[1], 200);
    if (title) return title;
  }
  return undefined;
}

async function resolve(url: URL, context: SourceContext): Promise<ResolvedChapter> {
  const { slug, chapter } = partsOf(url);
  // L'adresse du chapitre, sans rien de ce qui a pu être collé avec (paramètres, ancre).
  const page = await fetchReaderPage(`${ORIGIN}/manga/${slug}/${chapter}`, context, NAME);
  if (!CHAPTER_PATH.test(page.url.pathname)) {
    throw new SourceError("not-found", `${NAME} renvoie ce lien vers une autre page que celle d’un chapitre : le chapitre a pu être retiré.`);
  }

  const images = chapterImages(page);
  if (images.length === 0) {
    const looksLikeChapter = /chapter-image|\/storage\/content\//i.test(page.html) || /\bScan\b.*\bLecture en Ligne\b/i.test(pageTitle(page.html) ?? "");
    throw noImagesError(page, NAME, looksLikeChapter);
  }
  assertDeclaredHosts(images, context, NAME);

  return chapterOf(
    {
      series: seriesName(page, slug, chapter),
      chapterNumber: chapter,
      chapterTitle: chapterTitle(page, chapter),
      language: pageLanguage(page.html) ?? "fr",
    },
    toPages(images)
  );
}

const describe = async (url: URL, context: SourceContext): Promise<ChapterInfo> => (await resolve(url, context)).info;

export const lelscanfrAdapter: SourceAdapter = {
  id: "lelscanfr",
  name: NAME,
  homepage: `${ORIGIN}/`,
  hosts: ["www.lelscanfr.com", "lelscanfr.com"],
  example: `${ORIGIN}/manga/kumo-desu-ga-nani-ka/59.1`,
  notes:
    "Par les pages ordinaires du site, sans compte : une page par chapitre, puis ses images l’une après l’autre. Chapitres en français. Si le site demande une vérification du navigateur ou un compte, l’import s’arrête : rien n’est contourné.",
  match: (url) => CHAPTER_PATH.test(url.pathname),
  describe,
  resolve,
};
