/**
 * Métadonnées d'une vidéo YouTube : champs de la fenêtre de publication,
 * validation des options reçues et limites de l'API (dossier 07, § 8.6).
 *
 * - titre : 100 caractères, sans `<` ni `>` ;
 * - description : 5 000 octets, sans `<` ni `>` ;
 * - tags : 500 caractères au total (un tag qui contient une espace compte
 *   deux guillemets de plus, chaque séparation une virgule) ;
 * - `status.privacyStatus` toujours envoyé : sans lui, YouTube publie en public ;
 * - `status.publishAt` seulement pour une vidéo privée.
 */

import type { PostPrivacy, PublishField, PublishSource } from "../../types";
import { fitTags, stripAngleBrackets, truncateBytes, truncateChars } from "../../templates";

export const TITLE_MAX_CHARS = 100;
export const DESCRIPTION_MAX_BYTES = 5000;
export const TAGS_MAX_TOTAL = 500;
export const DEFAULT_CATEGORY = "22";

export const PRIVACY_CHOICES: { value: PostPrivacy; label: string }[] = [
  { value: "private", label: "Privée" },
  { value: "unlisted", label: "Non répertoriée" },
  { value: "public", label: "Publique" },
];

/** Catégories assignables aux vidéos (région FR), avec leur libellé français. */
export const CATEGORY_CHOICES: { value: string; label: string }[] = [
  { value: "1", label: "Film et animation" },
  { value: "2", label: "Autos et véhicules" },
  { value: "10", label: "Musique" },
  { value: "15", label: "Animaux" },
  { value: "17", label: "Sport" },
  { value: "19", label: "Voyages et événements" },
  { value: "20", label: "Jeux vidéo" },
  { value: "22", label: "People et blogs" },
  { value: "23", label: "Humour" },
  { value: "24", label: "Divertissement" },
  { value: "25", label: "Actualités et politique" },
  { value: "26", label: "Vie pratique et style" },
  { value: "27", label: "Éducation" },
  { value: "28", label: "Science et technologie" },
  { value: "29", label: "Associations et activisme" },
];

export const YOUTUBE_PUBLISH_FIELDS: PublishField[] = [
  { key: "title", kind: "text", label: "Titre", role: "title", maxLength: TITLE_MAX_CHARS, required: true },
  { key: "description", kind: "textarea", label: "Description", role: "description", maxLength: DESCRIPTION_MAX_BYTES, maxBytes: DESCRIPTION_MAX_BYTES },
  { key: "tags", kind: "tags", label: "Tags", role: "tags", maxTotal: TAGS_MAX_TOTAL },
  { key: "categoryId", kind: "select", label: "Catégorie", role: "category", choices: CATEGORY_CHOICES, defaultValue: DEFAULT_CATEGORY },
  { key: "privacy", kind: "select", label: "Visibilité", role: "privacy", choices: PRIVACY_CHOICES, defaultValue: "private" },
  {
    key: "publishAt",
    kind: "datetime",
    label: "Programmer la publication",
    role: "scheduledAt",
    help: "La vidéo reste privée jusqu’à cette date, puis devient publique.",
  },
  {
    key: "containsSyntheticMedia",
    kind: "toggle",
    label: "Contenu synthétique réaliste",
    role: "syntheticMedia",
    help: "À cocher si le clip montre des images ou une voix générées qui pourraient passer pour réelles.",
  },
  {
    key: "madeForKids",
    kind: "toggle",
    label: "Conçue pour les enfants",
    role: "madeForKids",
    help: "Faux par défaut ; à cocher seulement si la vidéo s’adresse aux enfants.",
    defaultValue: false,
  },
];

/** Longueur des tags telle que YouTube la compte. */
export function youtubeTagsLength(tags: string[]): number {
  return tags.reduce((total, tag, index) => total + tag.length + (/\s/.test(tag) ? 2 : 0) + (index > 0 ? 1 : 0), 0);
}

export function sanitizeTitle(value: unknown): string {
  return truncateChars(stripAngleBrackets(String(value ?? "")).replace(/\s+/g, " ").trim(), TITLE_MAX_CHARS);
}

export function sanitizeDescription(value: unknown): string {
  return truncateBytes(stripAngleBrackets(String(value ?? "")).trim(), DESCRIPTION_MAX_BYTES);
}

export function sanitizeTags(value: unknown): string[] {
  return fitTags(value, TAGS_MAX_TOTAL, youtubeTagsLength);
}

const isPrivacy = (value: unknown): value is PostPrivacy => value === "private" || value === "unlisted" || value === "public";

export interface YoutubeOptions {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacy: PostPrivacy;
  publishAt?: string;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  defaultLanguage?: string;
}

/** Valide et complète les options reçues de la fenêtre de publication. */
export function normalizeYoutubeOptions(input: unknown, source: PublishSource, now = Date.now()): YoutubeOptions {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const title = sanitizeTitle(raw.title) || sanitizeTitle(source.name) || "Sans titre";
  const categoryId = typeof raw.categoryId === "string" && /^\d{1,3}$/.test(raw.categoryId) ? raw.categoryId : DEFAULT_CATEGORY;
  let privacy: PostPrivacy = isPrivacy(raw.privacy) ? raw.privacy : "private";

  let publishAt: string | undefined;
  if (raw.publishAt !== undefined && raw.publishAt !== null && raw.publishAt !== "") {
    const date = new Date(String(raw.publishAt));
    if (Number.isNaN(date.getTime())) throw new Error("Date de programmation invalide.");
    if (date.getTime() < now + 60_000) throw new Error("La date de programmation doit être dans le futur.");
    publishAt = date.toISOString();
    // Une vidéo programmée reste privée jusqu'à sa date : c'est la seule
    // visibilité que YouTube accepte avec `publishAt`.
    privacy = "private";
  }

  const language = typeof raw.defaultLanguage === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(raw.defaultLanguage) ? raw.defaultLanguage : undefined;

  return {
    title,
    description: sanitizeDescription(raw.description),
    tags: sanitizeTags(raw.tags),
    categoryId,
    privacy,
    publishAt,
    madeForKids: raw.madeForKids === true,
    containsSyntheticMedia: raw.containsSyntheticMedia === true,
    defaultLanguage: language,
  };
}

/** Corps de `videos.insert` (parties `snippet` et `status`). */
export function videoResource(options: YoutubeOptions) {
  return {
    snippet: {
      title: options.title,
      description: options.description,
      ...(options.tags.length ? { tags: options.tags } : {}),
      categoryId: options.categoryId,
      ...(options.defaultLanguage ? { defaultLanguage: options.defaultLanguage, defaultAudioLanguage: options.defaultLanguage } : {}),
    },
    status: {
      // Toujours envoyée : sans elle, YouTube publie en public.
      privacyStatus: options.privacy,
      ...(options.publishAt && options.privacy === "private" ? { publishAt: options.publishAt } : {}),
      selfDeclaredMadeForKids: options.madeForKids,
      containsSyntheticMedia: options.containsSyntheticMedia,
    },
  };
}
