/**
 * Images trouvées plutôt que générées : le vocabulaire partagé par la
 * recherche (Openverse, le web), le téléchargement contrôlé et la planche
 * contact. Un module qui s'en sert (Clip Studio) reprend la même forme dans
 * son propre contrat.
 */

/** Où une image a été trouvée. */
export type ImageProvider = "openverse" | "web";

/** Une image candidate, avant import dans les médias d'un module. */
export interface ImageCandidate {
  /** Identifiant stable : `openverse:<id>` ou `web:<fichier>`. */
  id: string;
  provider: ImageProvider;
  /** Vignette affichable par le navigateur. */
  thumbnail: string;
  title: string;
  creator?: string;
  /** « CC0 », « CC BY 4.0 », « Domaine public » ou « Droits à vérifier ». */
  license: string;
  licenseUrl?: string;
  /** Page d'où vient l'image, à citer. */
  sourcePage?: string;
  width?: number;
  height?: number;
  rights: "free" | "unverified";
}

/** Mention d'une image : « Titre – Auteur, licence, page source », chaque partie facultative. */
export function imageCredit(image: Pick<ImageCandidate, "title" | "creator" | "license" | "sourcePage">): string {
  const head = [image.title?.trim(), image.creator?.trim()].filter(Boolean).join(" – ");
  return [head, image.license?.trim(), image.sourcePage].filter(Boolean).join(", ");
}

/** Lien http(s) seulement, borné : une adresse venue d'ailleurs s'affiche en lien cliquable. */
export function httpUrl(value: unknown, { httpsOnly = false } = {}): string | undefined {
  if (typeof value !== "string" || value.length > 2000) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) return undefined;
    if (url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
