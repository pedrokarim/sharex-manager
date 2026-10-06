/**
 * Famille « Madara » : les sites WordPress construits avec le thème de lecture
 * Madara, très répandu. Ils ont tous la même page de chapitre, et c'est elle
 * que cet adaptateur lit.
 *
 * Ce que ces sites ont en commun :
 *
 * - un lien de chapitre a la forme `/manga/<série>/<chapitre>/` (le premier
 *   dossier varie d'un site à l'autre : `seriesBases`) ;
 * - UNE page HTML porte tout le chapitre quand le lecteur est en mode
 *   « liste », ce que le paramètre ordinaire `?style=list` demande (c'est celui
 *   que pose le sélecteur de mode de lecture du site) ;
 * - chaque page est une balise `<img class="wp-manga-chapter-img">`, son
 *   adresse dans `data-src` (ou `src`), souvent précédée d'espaces et de
 *   retours à la ligne ;
 * - le fil d'Ariane donne le nom de la série, et `og:image` est la couverture
 *   de la série (la page d'un chapitre est, pour WordPress, celle de sa série).
 *
 * Ce que l'adaptateur ne fait pas : lire un chapitre réservé (compte, achat)
 * ou dont les images sont protégées par une extension de chiffrement. Il
 * répond `unavailable`.
 *
 * ─── Ajouter un site de cette famille ────────────────────────────
 *
 * Une déclaration en bas de ce fichier, sur le modèle de celle qui s'y
 * trouve, et une ligne dans `registry.ts`. Avant cela, vérifier d'une seule
 * requête que la page d'un chapitre a bien cette forme, que le site la sert
 * sans vérification du navigateur ni compte, et relever le domaine de ses
 * images pour `requestHosts`.
 */

import type { ChapterInfo, ResolvedChapter, SourceAdapter, SourceContext } from "./adapter";
import { SourceError } from "./adapter";
import { cleanText, findElements, hasClass, humanizeSlug, imageAddresses, metaContent, metaImage, pageLanguage, pageTitle } from "./html";
import { assertDeclaredHosts, chapterNumberOf, chapterOf, declaredCover, escapeRegExp, fetchReaderPage, noImagesError, toPages, type ReaderPage } from "./reader";

export interface MadaraOptions {
  /** Identifiant stable, en minuscules. */
  id: string;
  name: string;
  homepage: string;
  /** Domaines des liens de chapitre. */
  hosts: string[];
  /** Domaines qui servent les images, quand ce ne sont pas ceux du site. */
  requestHosts?: string[];
  example: string;
  notes?: string;
  /** Premier dossier des liens : « manga » par défaut. */
  seriesBases?: string[];
  /** Langue des chapitres quand la page ne la déclare pas ; « en » par défaut. */
  language?: string;
  minDelayMs?: number;
}

/** Ce qui suit la série dans une adresse sans être un chapitre. */
const NOT_A_CHAPTER = new Set(["feed", "ajax", "page", "comments", "embed", "amp"]);
/** Marques d'un chapitre que le site ne sert pas ouvertement : images chiffrées, contenu réservé. */
const PROTECTED = /chapter-protector|class\s*=\s*["'][^"']*\b(?:content-blocked|login-required|premium-block)\b/i;
const CHAPTER_LABEL = /^(?:chapter|chapitre|chap|ch|episode|ep)\.?\s*\d+(?:[.-]\d+)?\s*(?:[-:–]\s*(.+))?$/i;

export function createMadaraAdapter(options: MadaraOptions): SourceAdapter {
  const { name } = options;
  const bases = (options.seriesBases ?? ["manga"]).map(escapeRegExp).join("|");
  /** `/<dossier>/<série>/<chapitre>/`, avec parfois un tome entre les deux. */
  const chapterPath = new RegExp(`^/(${bases})/([^/]{1,200})/((?:[^/]{1,80}/)?[^/]{1,120})/?$`, "i");

  const partsOf = (url: URL): { base: string; series: string; chapter: string } | null => {
    const match = chapterPath.exec(url.pathname);
    if (!match) return null;
    const segments = match[3].split("/");
    if (segments.some((segment) => NOT_A_CHAPTER.has(segment.toLowerCase())) || !/\d/.test(segments[segments.length - 1])) return null;
    return { base: match[1], series: match[2], chapter: match[3] };
  };

  const requireParts = (url: URL) => {
    const parts = partsOf(url);
    if (!parts) throw new SourceError("not-a-chapter", `Un lien de chapitre ${name} a la forme de celui-ci : ${options.example}`);
    return parts;
  };

  /** Le nom de la série : le lien du fil d'Ariane vers sa fiche, sinon le début du titre de la page. */
  const seriesName = (page: ReaderPage, base: string, series: string): string | undefined => {
    const wanted = `/${base}/${series}`.toLowerCase();
    for (const link of findElements(page.html, "a")) {
      if (!link.text || !link.attributes.href) continue;
      try {
        if (new URL(link.attributes.href.trim(), page.url).pathname.replace(/\/$/, "").toLowerCase() === wanted) return cleanText(link.text, 200);
      } catch {
        // Lien illisible : au suivant.
      }
    }
    // « <série> - Chapter <numéro> - <nom du site> »
    const title = metaContent(page.html, "og:title") ?? pageTitle(page.html);
    const first = /^(.+?)\s+[-|–—]\s+/.exec(title ?? "")?.[1];
    return cleanText(first, 200) ?? humanizeSlug(series);
  };

  /** Le titre du chapitre, quand le fil d'Ariane ou l'en-tête en écrivent un après « Chapter <numéro> ». */
  const chapterTitle = (page: ReaderPage): string | undefined => {
    const labels = [
      ...findElements(page.html, "li").filter((entry) => hasClass(entry, "active")),
      ...findElements(page.html, "h1").filter((entry) => entry.attributes.id === "chapter-heading"),
    ];
    for (const label of labels) {
      const title = cleanText(CHAPTER_LABEL.exec(label.text ?? "")?.[1], 200);
      if (title) return title;
    }
    return undefined;
  };

  async function resolve(url: URL, context: SourceContext): Promise<ResolvedChapter> {
    const { base, series, chapter } = requireParts(url);
    // Mode « liste » : toutes les images du chapitre dans une seule page.
    const page = await fetchReaderPage(`${url.origin}/${base}/${series}/${chapter}/?style=list`, context, name);
    if (!partsOf(page.url)) {
      throw new SourceError("not-found", `${name} renvoie ce lien vers une autre page que celle d’un chapitre : le chapitre a pu être retiré.`);
    }

    const images = imageAddresses(page.html, page.url, (tag) => hasClass(tag, "wp-manga-chapter-img"));
    if (images.length === 0) {
      if (PROTECTED.test(page.html)) {
        throw new SourceError("unavailable", `${name} réserve ce chapitre ou protège ses images (compte, achat ou chiffrement). Le module ne passe pas outre : ce chapitre n’est pas importable par son lien.`);
      }
      throw noImagesError(page, name, /\breading-content\b|\bwp-manga\b|chapter-heading/i.test(page.html));
    }
    assertDeclaredHosts(images, context, name);

    const slug = chapter.split("/").pop() ?? chapter;
    return chapterOf(
      {
        series: seriesName(page, base, series),
        chapterNumber: chapterNumberOf(/(?:chapter|chapitre|chap|ch|episode|ep)[-_.]?(\d+(?:[-_.]\d+)?)/i.exec(slug)?.[1] ?? slug),
        chapterTitle: chapterTitle(page),
        language: pageLanguage(page.html) ?? options.language ?? "en",
        seriesCoverUrl: declaredCover(metaImage(page.html, page.url), context),
      },
      toPages(images)
    );
  }

  const describe = async (url: URL, context: SourceContext): Promise<ChapterInfo> => (await resolve(url, context)).info;

  return {
    id: options.id,
    name,
    homepage: options.homepage,
    hosts: options.hosts,
    ...(options.requestHosts ? { requestHosts: options.requestHosts } : {}),
    example: options.example,
    notes:
      options.notes ??
      "Par les pages ordinaires du site (thème Madara), sans compte : une page par chapitre, puis ses images l’une après l’autre. Les chapitres réservés ou aux images protégées ne sont pas importables. Si le site demande une vérification du navigateur ou un compte, l’import s’arrête : rien n’est contourné.",
    ...(options.minDelayMs ? { minDelayMs: options.minDelayMs } : {}),
    match: (url) => partsOf(url) !== null,
    describe,
    resolve,
  };
}

// ─── Les sites de cette famille ──────────────────────────────────

/**
 * cocomic.co (vérifié le 06/10/2026, une requête, sans défi ni compte). Les
 * images sont sur `cdn2.cocomic.co`, qui renvoie une fois vers la même adresse
 * en https avant de servir l'image : le client poli suit ce renvoi, puisque le
 * domaine reste le même.
 */
export const cocomicAdapter = createMadaraAdapter({
  id: "cocomic",
  name: "Cocomic",
  homepage: "https://cocomic.co/",
  hosts: ["cocomic.co", "www.cocomic.co"],
  requestHosts: ["cdn2.cocomic.co"],
  example: "https://cocomic.co/manga/the-kingdoms-of-ruin/chapter-28/",
  language: "en",
});
