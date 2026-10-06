/**
 * Le registre des adaptateurs, et la reconnaissance d'un lien.
 *
 * Ajouter un site, c'est écrire son fichier (voir `adapter.ts`) ou, s'il est
 * d'une famille connue, sa déclaration dans le fichier de la famille, puis
 * ajouter une ligne à `ADAPTERS`. Rien d'autre.
 */

import { SourceError, type SourceAdapter } from "./adapter";
import { hostMatches } from "./fetcher";
import { lelscanfrAdapter } from "./lelscanfr";
import { lelscansAdapter } from "./lelscans";
import { cocomicAdapter } from "./madara";
import { mangadexAdapter } from "./mangadex";
import { mushokuTenseiMangaAdapter } from "./wordpress-reader";

/** Les adaptateurs connus, dans l'ordre où la page « Sources » les présente. */
export const ADAPTERS: SourceAdapter[] = [mangadexAdapter, lelscanfrAdapter, lelscansAdapter, mushokuTenseiMangaAdapter, cocomicAdapter];

export function getAdapter(id: unknown, adapters: SourceAdapter[] = ADAPTERS): SourceAdapter | undefined {
  return typeof id === "string" ? adapters.find((adapter) => adapter.id === id) : undefined;
}

const MAX_LINK_LENGTH = 2000;

/** Paramètres de suivi publicitaire : ils ne désignent rien, on les retire. */
const TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "yclid", "ref", "ref_src", "si", "spm"]);
const isTrackingParameter = (name: string) => name.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(name.toLowerCase());

/**
 * Met un lien collé au propre : espaces retirés, http ou https exigé, sans
 * identifiants, paramètres de suivi ôtés. Lève une erreur ordinaire (pas un
 * cas de source) quand le texte n'est pas un lien.
 */
export function normalizeLink(raw: unknown): URL {
  const invalid = () => new Error("Lien invalide : collez l’adresse complète d’un chapitre, en http ou https.");
  if (typeof raw !== "string") throw invalid();
  const text = raw.trim();
  if (!text || text.length > MAX_LINK_LENGTH || /[\s\u0000-\u001f\u007f]/.test(text)) throw invalid();

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw invalid();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw invalid();
  if (url.username || url.password || !url.hostname.includes(".")) throw invalid();

  for (const name of [...url.searchParams.keys()]) {
    if (isTrackingParameter(name)) url.searchParams.delete(name);
  }
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  return url;
}

export interface DetectedLink {
  adapter: SourceAdapter;
  /** Le lien, mis au propre. */
  url: URL;
}

/**
 * Reconnaît le site d'un lien. Deux refus distincts : `unsupported` quand
 * aucun adaptateur ne connaît ce site, `not-a-chapter` quand le site est connu
 * mais que le lien ne désigne pas un chapitre. Aucune requête n'est faite.
 */
export function detect(raw: unknown, adapters: SourceAdapter[] = ADAPTERS): DetectedLink {
  const url = normalizeLink(raw);
  const owner = adapters.find((adapter) => adapter.hosts.some((host) => hostMatches(host, url.hostname)));
  if (!owner) {
    throw new SourceError("unsupported", `Aucun adaptateur ne reconnaît « ${url.hostname} ». La page « Sources » liste les sites gérés.`);
  }
  if (!owner.match(url)) {
    throw new SourceError("not-a-chapter", `Ce lien mène bien à ${owner.name}, mais pas à un chapitre. Exemple de lien attendu : ${owner.example}`);
  }
  return { adapter: owner, url };
}
