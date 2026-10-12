/**
 * Champs de publication Threads, validation des options et limites du
 * service (dossier 07c, § 6 et 7).
 *
 * - texte : 500 caractères, un émoji comptant pour ses octets UTF-8 ;
 * - cinq liens différents au plus (texte et `link_attachment` ensemble),
 *   sinon `THREADS_API__LINK_LIMIT_EXCEEDED` depuis le 22/12/2025 ;
 * - sujet : 1 à 50 caractères, ni `.` ni `&`, un seul par publication ;
 * - texte alternatif : 1 000 caractères, image et vidéo seulement ;
 * - `link_attachment` : message seul uniquement.
 */

import type { PublishField, PublishLimits, PublishSource } from "../../types";
import { countText } from "../../limits";
import { truncateChars } from "../../templates";

export const TEXT_MAX = 500;
export const TOPIC_MAX = 50;
export const ALT_TEXT_MAX = 1000;
export const LINKS_MAX = 5;
/** Image : 8 Mo au plus ; au-delà, ou dans un autre format, le connecteur la convertit en JPEG. */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Threads ramène toute image à 1 440 px de large : inutile d'envoyer plus. */
export const IMAGE_MAX_WIDTH = 1440;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];

export const THREADS_LIMITS: PublishLimits = {
  // Pas de format ni de poids imposés : le connecteur convertit ce qui ne convient pas.
  image: { aspectRatio: { min: 0.1, max: 10 } },
  video: {
    mimeTypes: ["video/mp4", "video/quicktime"],
    maxBytes: 1_000_000_000,
    maxDurationMs: 300_000,
    maxWidth: 1920,
    aspectRatio: { min: 0.01, max: 10 },
  },
  text: { maxLength: TEXT_MAX, count: "emoji-bytes" },
};

export const THREADS_PUBLISH_FIELDS: PublishField[] = [
  {
    key: "text",
    kind: "textarea",
    label: "Texte",
    role: "caption",
    maxLength: TEXT_MAX,
    sourceKinds: ["image", "video"],
    help: "500 caractères au plus ; un émoji compte pour plusieurs. La première adresse devient l’aperçu du lien.",
  },
  {
    key: "topicTag",
    kind: "text",
    label: "Sujet",
    role: "topic",
    maxLength: TOPIC_MAX,
    help: "Un seul sujet, sans « . » ni « & ».",
  },
  {
    key: "linkAttachment",
    kind: "text",
    label: "Lien en aperçu",
    maxLength: 2000,
    sourceKinds: ["text"],
    help: "Adresse affichée en carte ; à défaut, Threads prend la première adresse du message.",
  },
  {
    key: "altText",
    kind: "textarea",
    label: "Texte alternatif",
    maxLength: ALT_TEXT_MAX,
    sourceKinds: ["image", "video"],
    help: "Décrit le média pour les personnes aveugles ou malvoyantes.",
  },
  {
    key: "spoiler",
    kind: "toggle",
    label: "Masquer le média (divulgâcheur)",
    sourceKinds: ["image", "video"],
    defaultValue: false,
  },
];

export interface ThreadsOptions {
  /** Légende d'une image ou d'une vidéo ; le message d'un texte seul est dans la source. */
  text?: string;
  topicTag?: string;
  linkAttachment?: string;
  altText?: string;
  spoiler: boolean;
}

/** Adresse web, avec ou sans protocole (Threads compte « www.exemple.com » comme un lien). */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"«»]+/giu;

/** Forme comparable d'une adresse : sans protocole, sans ponctuation finale ni barre oblique finale. */
function normalizeLink(url: string): string {
  return url
    .replace(/[.,;:!?)\]}'’]+$/u, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** Nombre de liens tel que Threads le compte : adresses uniques du texte, plus le lien en aperçu s'il diffère. */
export function countLinks(text: string, linkAttachment?: string): number {
  const links = new Set((text.match(URL_PATTERN) ?? []).map(normalizeLink).filter(Boolean));
  if (linkAttachment) links.add(normalizeLink(linkAttachment));
  return links.size;
}

/** Texte publié : retours à la ligne normalisés, espaces de bord retirées. */
export function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** Sujet accepté par Threads, ou `undefined`. Un « # » de tête est retiré. */
export function sanitizeTopic(value: unknown): string | undefined {
  const topic = String(value ?? "")
    .replace(/^#+/, "")
    .replace(/[.&]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return topic ? truncateChars(topic, TOPIC_MAX).replace(/…$/, "").trim() || undefined : undefined;
}

function sanitizeLink(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Lien en aperçu invalide : donnez une adresse complète (https://…).");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Lien en aperçu invalide : seules les adresses web sont acceptées.");
  return url.toString();
}

/** Texte publié pour une source : le message d'un texte seul, la légende sinon. */
export function publishedText(source: PublishSource, options: ThreadsOptions): string {
  return source.kind === "text" ? cleanText(source.text) : (options.text ?? "");
}

/** Valide et complète les options reçues de la fenêtre de publication. */
export function normalizeThreadsOptions(input: unknown, source: PublishSource): ThreadsOptions {
  if (source.kind === "carousel") throw new Error("Threads : la publication d’un carrousel n’est pas encore prise en charge.");
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const media = source.kind !== "text";
  const options: ThreadsOptions = { spoiler: media && raw.spoiler === true };

  if (media) {
    const caption = cleanText(raw.text);
    if (caption) {
      const used = countText(caption, "emoji-bytes");
      if (used > TEXT_MAX) throw new Error(`Le texte fait ${used.toLocaleString("fr-FR")} caractères pour Threads (un émoji en compte plusieurs) : ${TEXT_MAX} au plus.`);
      options.text = caption;
    }
    const alt = cleanText(raw.altText);
    if (alt) options.altText = truncateChars(alt, ALT_TEXT_MAX);
  } else {
    options.linkAttachment = sanitizeLink(raw.linkAttachment);
  }

  const topic = sanitizeTopic(raw.topicTag);
  if (topic) options.topicTag = topic;

  const links = countLinks(publishedText(source, options), options.linkAttachment);
  if (links > LINKS_MAX) throw new Error(`Threads refuse plus de ${LINKS_MAX} liens différents dans une publication (ici ${links}).`);
  return options;
}

/** Relit des options déjà validées (état rangé dans le travail). */
export function readThreadsOptions(options: Record<string, unknown>): ThreadsOptions {
  const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  return {
    text: text(options.text),
    topicTag: text(options.topicTag),
    linkAttachment: text(options.linkAttachment),
    altText: text(options.altText),
    spoiler: options.spoiler === true,
  };
}
