/**
 * Famille « article WordPress » : les sites WordPress qui publient un chapitre
 * comme un article dont le contenu est une suite d'images, servies par un
 * serveur d'images donné. Souvent des sites consacrés à une seule série.
 *
 * Ce que ces sites ont en commun :
 *
 * - un lien de chapitre se termine par `<série>-chapter-<numéro>/`, à la
 *   racine ou sous un seul dossier (`/manga/`, `/comic/`) ;
 * - UNE page HTML porte tout le chapitre : ses images sont de simples balises
 *   `<img>`, dans l'ordre de lecture, toutes sur le serveur d'images du site ;
 * - le titre de l'article est « <série> Chapter <numéro> ».
 *
 * Les images du chapitre se reconnaissent à leur domaine (`imageHosts`) : le
 * logo, les bannières et les vignettes du thème sont ailleurs et sont ignorés.
 *
 * ─── Ajouter un site de cette famille ────────────────────────────
 *
 * Une déclaration en bas de ce fichier, sur le modèle de celle qui s'y
 * trouve, et une ligne dans `registry.ts`. Avant cela, vérifier d'une seule
 * requête que la page d'un chapitre a bien cette forme, et que le site la sert
 * sans vérification du navigateur ni compte.
 */

import type { ChapterInfo, ResolvedChapter, SourceAdapter, SourceContext } from "./adapter";
import { SourceError } from "./adapter";
import { hostMatches } from "./fetcher";
import { cleanText, findElements, hasClass, humanizeSlug, imageAddresses, metaContent, pageLanguage, pageTitle } from "./html";
import { chapterNumberOf, chapterOf, fetchReaderPage, noImagesError, toPages, type ReaderPage } from "./reader";

export interface WordpressReaderOptions {
  /** Identifiant stable, en minuscules. */
  id: string;
  name: string;
  homepage: string;
  /** Domaines des liens de chapitre. `*.exemple.org` couvre tout sous-domaine. */
  hosts: string[];
  /** Domaines qui servent les images des chapitres : seules ces images sont des pages. */
  imageHosts: string[];
  example: string;
  /** Nom de la série quand le site n'en publie qu'une et que la page ne le dit pas. */
  series?: string;
  /** Langue des chapitres quand la page ne la déclare pas ; « en » par défaut. */
  language?: string;
  notes?: string;
  minDelayMs?: number;
}

/** `/<série>-chapter-<numéro>/`, à la racine ou sous un seul dossier. Le numéro peut avoir une partie : « 86-5 ». */
const CHAPTER_PATH = /^(?:\/[a-z0-9_-]{1,40})?\/((?:[a-z0-9_]+-)*?)chapter-(\d+(?:[-_.]\d+)?)(?:-[a-z0-9_-]{1,80})?\/?$/i;
/** « <série> Chapter <numéro> », suivi ou non d'un titre. */
const HEADING = /^(.*?)\s*\bchapter\s+\d+(?:[.-]\d+)?\b\s*(?:[-:–]\s*(.+))?$/i;

export function createWordpressReaderAdapter(options: WordpressReaderOptions): SourceAdapter {
  const { name } = options;

  const partsOf = (url: URL): { seriesSlug: string; number: string } => {
    const match = CHAPTER_PATH.exec(url.pathname);
    if (!match) throw new SourceError("not-a-chapter", `Un lien de chapitre ${name} a la forme de celui-ci : ${options.example}`);
    return { seriesSlug: match[1].replace(/-$/, ""), number: chapterNumberOf(match[2]) ?? match[2] };
  };

  /** Le titre de l'article : `h1.entry-title`, sinon le premier `h1`, sinon le premier morceau de `og:title`. */
  const heading = (page: ReaderPage): string | undefined => {
    const headings = findElements(page.html, "h1").filter((entry) => entry.text);
    const title = (headings.find((entry) => hasClass(entry, "entry-title")) ?? headings[0])?.text;
    if (title) return title;
    const shared = metaContent(page.html, "og:title") ?? pageTitle(page.html);
    const site = metaContent(page.html, "og:site_name");
    // « <série> Chapter <numéro> - <nom du site> » : on s'arrête au nom du site.
    const cut = shared && site && shared.endsWith(site) ? shared.slice(0, -site.length).replace(/\s*[-|–—]\s*$/, "") : shared;
    return cut ? (/^(.*?\bchapter\s+\d+(?:[.-]\d+)?)\b/i.exec(cut)?.[1] ?? cut) : undefined;
  };

  async function resolve(url: URL, context: SourceContext): Promise<ResolvedChapter> {
    const { seriesSlug, number } = partsOf(url);
    // L'adresse telle qu'elle a été collée, sans paramètres ni ancre : le sous-domaine du site peut changer.
    const page = await fetchReaderPage(`${url.origin}${url.pathname}`, context, name);
    if (!CHAPTER_PATH.test(page.url.pathname)) {
      throw new SourceError("not-found", `${name} renvoie ce lien vers une autre page que celle d’un chapitre : le chapitre a pu être retiré.`);
    }

    const images = imageAddresses(page.html, page.url, (_tag, address) => options.imageHosts.some((host) => hostMatches(host, address.hostname)));
    if (images.length === 0) {
      const looksLikeChapter = /\bentry-content\b|\bentry-title\b|\bsingle-(?:post|comic|manga|chapter)\b/i.test(page.html);
      throw noImagesError(page, name, looksLikeChapter);
    }

    const parsed = HEADING.exec(heading(page) ?? "");
    return chapterOf(
      {
        series: cleanText(parsed?.[1], 200) ?? options.series ?? humanizeSlug(seriesSlug),
        chapterNumber: number,
        chapterTitle: cleanText(parsed?.[2], 200),
        language: pageLanguage(page.html) ?? options.language ?? "en",
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
    requestHosts: options.imageHosts,
    example: options.example,
    notes:
      options.notes ??
      "Par les pages ordinaires du site, sans compte : une page par chapitre, puis ses images l’une après l’autre. Si le site demande une vérification du navigateur ou un compte, l’import s’arrête : rien n’est contourné.",
    ...(options.minDelayMs ? { minDelayMs: options.minDelayMs } : {}),
    match: (url) => CHAPTER_PATH.test(url.pathname),
    describe,
    resolve,
  };
}

// ─── Les sites de cette famille ──────────────────────────────────

/**
 * mushokutensei-manga.com (vérifié le 06/10/2026, une requête, sans défi ni
 * compte). Le préfixe du domaine (« w7 ») change avec le temps : tout
 * sous-domaine est reconnu. La page charge le script Turnstile de Cloudflare
 * pour d'autres fonctions (commentaires) ; elle est servie sans vérification.
 * Elle ne montre pas de couverture de série.
 */
export const mushokuTenseiMangaAdapter = createWordpressReaderAdapter({
  id: "mushokutensei-manga",
  name: "Mushoku Tensei Manga Online",
  homepage: "https://w7.mushokutensei-manga.com/",
  hosts: ["w7.mushokutensei-manga.com", "mushokutensei-manga.com", "*.mushokutensei-manga.com"],
  imageHosts: ["img.mangarchive.com"],
  example: "https://w7.mushokutensei-manga.com/manga/mushoku-tensei-chapter-86/",
  series: "Mushoku Tensei",
  language: "en",
});
