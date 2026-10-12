/**
 * Contrat des textes de publication d'un export (dossier 01 ter, § 4 et § 5),
 * partagé par le serveur (rangement, résolution, assistant) et l'interface
 * (fiche d'un export, écran Publier).
 */

import type { ClipExport } from "../engine/types";

/** Les sortes de textes libres d'une publication. */
export type PostTextKind = "title" | "description" | "caption" | "firstComment";

export const POST_TEXT_KINDS: readonly PostTextKind[] = ["title", "description", "caption", "firstComment"];

/** Un jeu complet de textes. */
export interface PostTexts {
  /** Titre de la vidéo. */
  title: string;
  /** Texte long sous la vidéo : liens, crédits, chapitres. */
  description: string;
  /** Texte court affiché avec le média dans un fil. */
  caption: string;
  /** Premier commentaire, posé juste après la publication. */
  firstComment: string;
  /** Mots-dièse visibles, sans « # ». */
  hashtags: string[];
  /** Mots-clés cachés (YouTube). */
  tags: string[];
}

/** Les textes rangés avec un export. */
export interface ExportPost {
  base: PostTexts;
  /** Par identifiant de connecteur (`youtube`, `instagram`…), seulement ce qui diffère du texte commun. */
  variants: Record<string, Partial<PostTexts>>;
  /** Champs proposés par l'assistant et pas encore relus, sous la forme `<connecteur|base>.<champ>`. */
  unreviewed?: string[];
  updatedAt: number;
}

/** Couverture d'un export : une image du clip, ou une image de la galerie. */
export interface ExportCover {
  file: string;
  /** Instant de l'image dans le clip ; absent pour une image de la galerie. */
  atMs?: number;
  width: number;
  height: number;
}

export function emptyPostTexts(): PostTexts {
  return { title: "", description: "", caption: "", firstComment: "", hashtags: [], tags: [] };
}

/**
 * Où vont les hashtags d'un service : ajoutés en fin de description, de
 * légende ou de premier commentaire, dans un champ à part (Instagram), un
 * seul comme sujet (Threads), ou nulle part. Réglable par la marque, service
 * par service (`BrandPublishing.serviceTemplates`).
 */
export type HashtagRule = "description" | "caption" | "firstComment" | "field" | "topic" | "none";

export const HASHTAG_RULES: readonly HashtagRule[] = ["description", "caption", "firstComment", "field", "topic", "none"];

/** Les sortes de textes d'un jeu, listes comprises. */
export type PostTextField = keyof PostTexts;

export const POST_TEXT_FIELDS: readonly PostTextField[] = ["title", "description", "caption", "firstComment", "hashtags", "tags"];

/** Une cible de publication (`publishExport`) : un compte, et ce que l'écran choisit pour lui. */
export interface PublishTarget {
  accountId: string;
  /** Options du service ; elles l'emportent sur celles calculées par le serveur à partir des textes de l'export. */
  options?: Record<string, unknown>;
  publishAt?: number;
  /**
   * Suites de publication : `false` en retire une ; un texte remplace le
   * premier commentaire calculé. Absentes : tout ce que l'export permet.
   */
  followUps?: { comment?: string | false; subtitles?: boolean; cover?: boolean };
}

/** Ce que la fiche d'un export reçoit (`getExport`). */
export interface ExportDetails {
  export: ClipExport;
  /** Projet d'origine : absent s'il a été supprimé. */
  project: { exists: boolean; name?: string; updatedAt?: number; brandKitId?: string };
  /** Le projet a été modifié depuis le rendu. */
  projectChanged: boolean;
  brand: { id: string; name: string } | null;
  /** Règles des hashtags choisies par la marque, par service ; les autres suivent `defaultHashtagRule`. */
  hashtagRules: Record<string, HashtagRule>;
}
