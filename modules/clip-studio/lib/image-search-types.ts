/**
 * Contrat de « Trouver avant de générer » (dossier 01, étape 9), partagé par
 * le serveur (recherche, téléchargement, choix) et l'interface (fenêtre
 * « Créer », onglet « Trouver » du panneau Médias, publication).
 */

/** Ce que l'assistant fait des illustrations. */
export type ImageSourceMode = "find-then-generate" | "find" | "generate" | "none";

export const IMAGE_SOURCE_MODES: readonly ImageSourceMode[] = ["find-then-generate", "find", "generate", "none"];

/** Où une image a été trouvée. */
export type ImageProvider = "openverse" | "web";

/**
 * Ce que l'on cherche : une illustration (plein cadre, derrière le texte) ou
 * une icône (icône d'appli, logo, avatar officiel, posée à côté d'un nom).
 */
export type FoundImageKind = "illustration" | "icon";

/** Une image candidate, avant import dans les médias du module. */
export interface FoundImage {
  /** Identifiant stable de la candidate : `openverse:<id>` ou `web:<fichier>`. */
  id: string;
  provider: ImageProvider;
  /** Vignette affichable par le navigateur (Openverse, ou fichier local de `data/found/`). */
  thumbnail: string;
  title: string;
  creator?: string;
  /** « CC0 », « CC BY 4.0 », « Domaine public », ou « Droits à vérifier ». */
  license: string;
  licenseUrl?: string;
  /** Page d'où vient l'image, à citer. */
  sourcePage?: string;
  width?: number;
  height?: number;
  rights: "free" | "unverified";
  /** Icône ou logo officiel ; absent : une illustration. */
  kind?: "icon";
}

/** Une image trouvée et importée : un média du module, prêt pour un projet. */
export interface ImportedImage {
  file: string;
  url: string;
  ref: string;
  name: string;
  width: number;
  height: number;
  credit: string;
  rights: "free" | "unverified";
  /** Icône ou logo officiel ; absent : une illustration. */
  kind?: "icon";
}

/** Source retenue pour un segment, affichée dans le suivi de l'assistant ; « pexels », « pixabay », « wikimedia » : une vidéo. */
export type SegmentImageSource = "openverse" | "web" | "pexels" | "pixabay" | "wikimedia" | "generated" | "none";

export const FOUND_LIMITS = {
  /** Petit côté minimal d'une image retenue, en pixels. */
  minShortSide: 640,
  /** Petit côté minimal d'une icône ou d'un logo : ils sont montrés petits. */
  iconMinShortSide: 128,
  /** Candidates examinées par segment. */
  candidatesPerSegment: 4,
  /** Recherches web lancées en même temps. */
  webConcurrency: 5,
  /** Durée de vie d'une candidate téléchargée non importée. */
  foundTtlMs: 24 * 60 * 60 * 1000,
} as const;
