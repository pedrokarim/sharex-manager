/**
 * Ce que partagent les adaptateurs qui lisent les pages ordinaires d'un site
 * (`lelscanfr.ts`, `lelscans.ts`, `madara.ts`, `wordpress-reader.ts`) : lire
 * une page par le client poli, traduire sa réponse en cas d'erreur, et dire
 * pourquoi une page n'a pas les images attendues.
 *
 * La règle tient ici en un seul endroit : une vérification du navigateur, une
 * page de connexion ou une demande de confirmation d'âge donnent
 * `unavailable`, avec un message qui dit que le module ne passe pas outre.
 * Rien n'est retenté, rien n'est essayé autrement.
 */

import { SourceError, type ResolvedChapter, type SourceContext, type SourcePage } from "./adapter";
import type { PoliteResponse } from "./fetcher";
import { detectBarrier, detectWall, isEmptyPage, type Barrier } from "./html";

/** Une page lue chez un site. */
export interface ReaderPage {
  /** Adresse finale, redirections suivies. */
  url: URL;
  html: string;
}

/** Le message de chaque barrière : ce que le site demande, et que le module ne le fait pas. */
export function barrierError(barrier: Barrier, siteName: string): SourceError {
  if (barrier === "challenge") {
    return new SourceError(
      "unavailable",
      `${siteName} demande une vérification du navigateur (page d’attente ou captcha) avant de servir cette page. Le module ne la contourne pas : ce chapitre n’est pas importable par son lien tant qu’elle est en place.`
    );
  }
  if (barrier === "login") {
    return new SourceError("unavailable", `${siteName} demande un compte pour lire cette page. Le module ne se connecte à aucun site : ce chapitre n’est pas importable par son lien.`);
  }
  return new SourceError(
    "unavailable",
    `${siteName} demande de confirmer son âge ou d’avoir un compte avant de montrer cette page. Le module ne passe pas outre : ce chapitre n’est pas importable par son lien.`
  );
}

/** Le texte d'une réponse, d'après le jeu de caractères que le site annonce ; UTF-8 sinon. */
function decodeBody(response: PoliteResponse): string {
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(response.headers["content-type"] ?? "")?.[1]?.toLowerCase() ?? "utf-8";
  return response.body.toString(charset === "iso-8859-1" || charset === "latin1" || charset === "windows-1252" ? "latin1" : "utf-8");
}

/**
 * Lit une page HTML du site. Une seule requête (le client poli gère délais et
 * tentatives) ; tout ce qui n'est pas la page attendue devient un cas d'erreur :
 *
 * - vérification du navigateur, page de connexion → `unavailable` ;
 * - 404 ou 410 → `not-found` ;
 * - 401, 403, 451 → `unavailable` ;
 * - 429 → `rate-limited`, panne → `site-error` (levées par le client poli).
 */
export async function fetchReaderPage(address: string | URL, context: SourceContext, siteName: string): Promise<ReaderPage> {
  const response = await context.fetcher.request(address, { kind: "html", signal: context.signal });
  const html = decodeBody(response);

  const barrier = detectBarrier({ status: response.status, headers: response.headers, html, url: response.url });
  if (barrier) throw barrierError(barrier, siteName);

  if (response.status === 404 || response.status === 410) {
    throw new SourceError("not-found", `${siteName} ne connaît pas ce chapitre (HTTP ${response.status}) : il a pu être retiré, ou le lien est incomplet.`);
  }
  if (response.status === 401 || response.status === 403 || response.status === 451) {
    throw new SourceError("unavailable", `${siteName} ne sert pas cette page à un visiteur anonyme (HTTP ${response.status}). Rien n’est tenté pour passer outre.`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SourceError("site-error", `${siteName} a répondu HTTP ${response.status}.`);
  }
  return { url: new URL(response.url), html };
}

/**
 * L'erreur d'une page servie normalement, mais sans image de chapitre.
 * `looksLikeChapter` : la page a-t-elle encore l'allure d'une page de chapitre
 * du site ? Si oui, c'est sa structure qui a changé (`adapter-outdated`) ; sinon
 * le chapitre n'est pas lisible ici (`unavailable`).
 */
export function noImagesError(page: ReaderPage, siteName: string, looksLikeChapter: boolean): SourceError {
  // Un texte qui demande un compte l'emporte : une page réservée garde l'allure d'une page de chapitre.
  const told = detectWall(page.html, { captcha: false });
  if (told) return barrierError(told, siteName);
  if (looksLikeChapter) return outdated(siteName, "la page du chapitre ne contient plus d’images là où l’adaptateur les lit");
  const wall = detectWall(page.html);
  if (wall) return barrierError(wall, siteName);
  if (isEmptyPage(page.html)) return new SourceError("unavailable", `${siteName} a rendu une page vide pour ce lien.`);
  return new SourceError("unavailable", `${siteName} n’affiche aucune page de chapitre à cette adresse : le chapitre a pu être retiré ou déplacé.`);
}

export const outdated = (siteName: string, detail: string) =>
  new SourceError("adapter-outdated", `La page de ${siteName} n’a plus la forme attendue (${detail}). L’adaptateur est à revoir avant de réessayer.`);

/**
 * Vérifie que toutes les images d'un chapitre sont sur un domaine que
 * l'adaptateur a déclaré. Un autre domaine dit que le site a changé de serveur
 * d'images : on le signale, on ne l'ajoute pas en silence.
 */
export function assertDeclaredHosts(addresses: string[], context: SourceContext, siteName: string) {
  for (const address of addresses) {
    const host = new URL(address).hostname;
    if (!context.fetcher.isAllowed(host)) throw outdated(siteName, `images servies par « ${host} », un domaine que l’adaptateur n’a pas déclaré`);
  }
}

/** Les pages d'un chapitre, d'après leurs adresses dans l'ordre de lecture. */
export const toPages = (addresses: string[]): SourcePage[] => addresses.map((url, index) => ({ index, url }));

/** L'adresse d'une couverture, seulement si elle est sur un domaine déclaré. */
export function declaredCover(address: string | undefined, context: SourceContext): string | undefined {
  if (!address) return undefined;
  try {
    return context.fetcher.isAllowed(new URL(address).hostname) ? address : undefined;
  } catch {
    return undefined;
  }
}

/** Un numéro de chapitre lu dans une adresse : « 86-5 » ou « 86_5 » donnent « 86.5 ». */
export function chapterNumberOf(raw: string | undefined): string | undefined {
  const match = /\d+(?:[-_.]\d+)?/.exec(raw ?? "");
  return match ? match[0].replace(/[-_]/, ".").slice(0, 20) : undefined;
}

/** Échappe un texte pour le placer dans une expression régulière. */
export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Un chapitre résolu, sans champ vide. */
export function chapterOf(info: { series?: string; chapterNumber?: string; chapterTitle?: string; language?: string; seriesCoverUrl?: string }, pages: SourcePage[]): ResolvedChapter {
  return {
    info: {
      ...(info.series ? { series: info.series } : {}),
      ...(info.chapterNumber ? { chapterNumber: info.chapterNumber } : {}),
      ...(info.chapterTitle ? { chapterTitle: info.chapterTitle } : {}),
      ...(info.language ? { language: info.language } : {}),
      ...(info.seriesCoverUrl ? { seriesCoverUrl: info.seriesCoverUrl } : {}),
      pageCount: pages.length,
    },
    pages,
  };
}
