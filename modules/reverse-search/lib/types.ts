/**
 * Recherche inversée : formats partagés entre le serveur et les pages, et
 * catalogue des moteurs. Aucun import serveur ici.
 */

import type { Brand } from "@/components/brand-logo";

export type EngineId = "tracemoe" | "saucenao" | "iqdb" | "google" | "yandex" | "tineye" | "ascii2d" | "bing";

/** Clés d'API connues du module. */
export type KeyName = "saucenao" | "tracemoe" | "serpapi";

export interface EngineInfo {
  id: EngineId;
  name: string;
  brand: Brand;
  /** Ce que le moteur sait retrouver, en une ligne. */
  description: string;
  /**
   * Résultats intégrés à la page :
   * - `free` : oui, sans rien configurer ;
   * - une clé : oui, une fois cette clé renseignée ;
   * - `none` : non, le moteur ne s'ouvre que dans un onglet.
   */
  inline: "free" | KeyName | "none";
  /** Adresse de la recherche sur le site du moteur ; `{url}` reçoit l'adresse publique de l'image. */
  linkTemplate: string;
}

export const ENGINES: EngineInfo[] = [
  {
    id: "tracemoe",
    name: "trace.moe",
    brand: "tracemoe",
    description: "Scènes d’anime : retrouve l’épisode et la minute exacte.",
    inline: "free",
    linkTemplate: "https://trace.moe/?url={url}",
  },
  {
    id: "saucenao",
    name: "SauceNAO",
    brand: "saucenao",
    description: "Illustrations, manga et anime : Pixiv, Danbooru, X, MangaDex…",
    inline: "saucenao",
    linkTemplate: "https://saucenao.com/search.php?url={url}",
  },
  {
    id: "iqdb",
    name: "IQDB",
    brand: "iqdb",
    description: "Illustrations des galeries à étiquettes : Danbooru, Gelbooru, Zerochan, yande.re…",
    inline: "free",
    linkTemplate: "https://iqdb.org/?url={url}",
  },
  {
    id: "google",
    name: "Google Lens",
    brand: "google",
    description: "Recherche généraliste : pages, produits, lieux, images proches.",
    inline: "serpapi",
    linkTemplate: "https://lens.google.com/uploadbyurl?url={url}",
  },
  {
    id: "yandex",
    name: "Yandex",
    brand: "yandex",
    description: "Recherche généraliste, souvent la meilleure pour les visages et les photos.",
    inline: "serpapi",
    linkTemplate: "https://yandex.com/images/search?rpt=imageview&url={url}",
  },
  {
    id: "tineye",
    name: "TinEye",
    brand: "tineye",
    description: "Copies exactes d’une image et leur plus ancienne apparition.",
    inline: "none",
    linkTemplate: "https://tineye.com/search?url={url}",
  },
  {
    id: "ascii2d",
    name: "ascii2d",
    brand: "ascii2d",
    description: "Illustrations japonaises : Pixiv, X, par couleurs ou par traits.",
    inline: "none",
    linkTemplate: "https://ascii2d.net/search/url/{url}",
  },
  {
    id: "bing",
    name: "Bing",
    brand: "bing",
    description: "Recherche visuelle généraliste de Microsoft.",
    inline: "none",
    linkTemplate: "https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:{url}",
  },
];

export const ENGINE_IDS = ENGINES.map((engine) => engine.id);

export function engineInfo(id: string): EngineInfo | undefined {
  return ENGINES.find((engine) => engine.id === id);
}

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === "string" && ENGINE_IDS.includes(value as EngineId);
}

/** Lien d'un moteur vers sa propre page de résultats, pour une image d'adresse publique. */
export function engineLink(engine: EngineInfo, publicUrl: string): string {
  // ascii2d attend l'adresse telle quelle dans le chemin ; les autres, un paramètre encodé.
  return engine.linkTemplate.replace("{url}", engine.id === "ascii2d" ? publicUrl : encodeURIComponent(publicUrl));
}

export interface MatchLink {
  label: string;
  url: string;
}

/** Une correspondance, quel que soit le moteur. */
export interface Match {
  title: string;
  /** Auteur, titre original, site… */
  subtitle?: string;
  /** Épisode et minute, dimensions… */
  detail?: string;
  /** De 0 à 1. Absent quand le moteur ne chiffre pas ses résultats. */
  similarity?: number;
  thumbnail?: string;
  /** Extrait vidéo de la scène (trace.moe). */
  preview?: string;
  links: MatchLink[];
  tags?: string[];
  /** Contenu pour adultes : la vignette est floutée tant qu'on ne la demande pas. */
  adult?: boolean;
  /** Sous le seuil que le moteur lui-même juge fiable. */
  weak?: boolean;
}

export type EngineStatus = "ok" | "empty" | "error" | "needs-key";

export interface EngineResult {
  engine: EngineId;
  status: EngineStatus;
  matches: Match[];
  /** Message d'erreur, ou précision utile (quota restant…). */
  message?: string;
  durationMs: number;
  ranAt: number;
}

export interface QueryImage {
  name: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
  /** D'où vient l'image. */
  origin: "device" | "gallery" | "link";
  /** Nom du fichier dans la galerie, quand elle en vient. */
  galleryFile?: string;
}

/** Une recherche : l'image interrogée et ce que chaque moteur a répondu. */
export interface SearchRecord {
  id: string;
  createdAt: number;
  /** Recherche éphémère : jamais écrite sur le disque, absente de l'historique. */
  ephemeral: boolean;
  query: QueryImage;
  results: Partial<Record<EngineId, EngineResult>>;
}

/** Une recherche telle que la page l'affiche. */
export interface SearchView extends SearchRecord {
  /** Aperçu de l'image interrogée : URL du module, ou `data:` pour une recherche éphémère. */
  preview: string;
}

export interface BestMatch {
  engine: EngineId;
  title: string;
  similarity?: number;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  name: string;
  preview: string;
  engines: EngineId[];
  best?: BestMatch;
  matchCount: number;
}

export interface Catalogue {
  engines: (EngineInfo & {
    /** Les résultats peuvent s'afficher dans la page, tout de suite. */
    inlineReady: boolean;
  })[];
  keys: Record<KeyName, { configured: boolean; fromEnv: boolean }>;
}

/** La meilleure correspondance fiable d'une recherche, tous moteurs confondus. */
export function bestMatchOf(results: SearchRecord["results"]): BestMatch | undefined {
  let best: BestMatch | undefined;
  for (const result of Object.values(results)) {
    if (!result || result.status !== "ok") continue;
    const match = result.matches.find((entry) => !entry.weak);
    if (!match) continue;
    // Un résultat chiffré l'emporte sur un résultat qui ne l'est pas.
    if (!best || (match.similarity ?? 0) > (best.similarity ?? 0)) {
      best = { engine: result.engine, title: match.title, similarity: match.similarity };
    }
  }
  return best;
}

export function formatSimilarity(similarity?: number): string | null {
  if (similarity === undefined) return null;
  return `${Math.round(similarity * 100)} %`;
}
