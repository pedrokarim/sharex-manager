/**
 * Champs de publication Instagram, validation des options et assemblage de
 * la légende (dossier 07b, § 7).
 *
 * - légende : 2 200 caractères, 30 hashtags, 20 mentions ;
 * - les hashtags de la marque s'ajoutent en fin de légende, comptés dans ces
 *   limites ; le texte est coupé avant eux si besoin, jamais au milieu d'un
 *   hashtag ;
 * - pas de titre, de visibilité ni de programmation dans l'API : une
 *   publication est publique dès `media_publish` ; la file tient la date.
 */

import type { PublishField, PublishSource } from "../../types";
import { truncateChars } from "../../templates";

export const CAPTION_MAX_CHARS = 2200;
export const CAPTION_MAX_HASHTAGS = 30;
export const CAPTION_MAX_MENTIONS = 20;
export const ALT_TEXT_MAX_CHARS = 1000;
/** Place laissée aux hashtags ajoutés, pour que le texte garde l'essentiel de la légende. */
const HASHTAGS_MAX_CHARS = 600;

export type CoverChoice = "start" | "middle" | "end" | "custom";
export type TrialChoice = "none" | "manual" | "auto";

export const COVER_CHOICES: { value: CoverChoice; label: string }[] = [
  { value: "start", label: "Première image" },
  { value: "middle", label: "Image du milieu" },
  { value: "end", label: "Image à 1 s de la fin" },
  { value: "custom", label: "Couverture du clip (si elle est fournie)" },
];

export const TRIAL_CHOICES: { value: TrialChoice; label: string }[] = [
  { value: "none", label: "Normale" },
  { value: "manual", label: "Essai, validation à la main" },
  { value: "auto", label: "Essai, validation automatique" },
];

export const INSTAGRAM_PUBLISH_FIELDS: PublishField[] = [
  {
    key: "caption",
    kind: "textarea",
    label: "Légende",
    role: "caption",
    maxLength: CAPTION_MAX_CHARS,
    help: "2 200 caractères, 30 hashtags et 20 mentions au plus, hashtags ajoutés compris.",
  },
  { key: "hashtags", kind: "tags", label: "Hashtags", role: "hashtags", maxTotal: HASHTAGS_MAX_CHARS },
  {
    key: "shareToFeed",
    kind: "toggle",
    label: "Afficher aussi dans le fil",
    defaultValue: true,
    sourceKinds: ["video"],
    help: "Le Reel apparaît dans le fil et dans l’onglet Reels ; Instagram choisit seul ce qu’il met en avant.",
  },
  { key: "cover", kind: "select", label: "Couverture", role: "cover", choices: COVER_CHOICES, defaultValue: "start", sourceKinds: ["video"] },
  {
    key: "trial",
    kind: "select",
    label: "Diffusion",
    choices: TRIAL_CHOICES,
    defaultValue: "none",
    sourceKinds: ["video"],
    help: "Un Reel d’essai est montré d’abord aux personnes qui ne vous suivent pas.",
  },
  { key: "altText", kind: "text", label: "Texte alternatif", maxLength: ALT_TEXT_MAX_CHARS, sourceKinds: ["image"] },
  {
    key: "aiGenerated",
    kind: "toggle",
    label: "Contenu généré par IA",
    role: "syntheticMedia",
    help: "Ajoute l’étiquette « Infos IA » d’Instagram.",
  },
];

export interface InstagramOptions {
  /** Légende finale, hashtags compris. */
  caption: string;
  shareToFeed: boolean;
  cover: CoverChoice;
  /** Image de la vidéo prise pour couverture, en millisecondes. */
  thumbOffsetMs: number;
  trial: TrialChoice;
  altText?: string;
  aiGenerated: boolean;
}

const HASHTAG = /(?:^|[^\p{L}\p{N}_&])#[\p{L}\p{N}_]+/gu;
const MENTION = /(?:^|[^\p{L}\p{N}_])@[A-Za-z0-9._]+/gu;

export const countHashtags = (text: string) => (text.match(HASHTAG) ?? []).length;
export const countMentions = (text: string) => (text.match(MENTION) ?? []).length;
const length = (text: string) => Array.from(text).length;

/** Texte affichable : sans caractère de contrôle autre que le saut de ligne. */
function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Hashtag réduit à son mot (sans « # », sans espace), ou vide. */
function tagWord(value: unknown): string {
  return typeof value === "string" ? value.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "") : "";
}

/**
 * Légende finale : texte, puis hashtags absents du texte tant que les limites
 * le permettent. Lève une erreur si le texte seul dépasse 30 hashtags ou
 * 20 mentions ; coupe le texte s'il est trop long.
 */
export function buildCaption(rawText: unknown, rawTags: unknown): string {
  let text = cleanText(rawText);
  const textTags = countHashtags(text);
  if (textTags > CAPTION_MAX_HASHTAGS) throw new Error(`La légende compte ${textTags} hashtags : ${CAPTION_MAX_HASHTAGS} au plus.`);
  const mentions = countMentions(text);
  if (mentions > CAPTION_MAX_MENTIONS) throw new Error(`La légende compte ${mentions} mentions : ${CAPTION_MAX_MENTIONS} au plus.`);

  const present = new Set((text.match(HASHTAG) ?? []).map((tag) => tag.replace(/^[^#]*#/, "").toLowerCase()));
  const kept: string[] = [];
  for (const raw of Array.isArray(rawTags) ? rawTags : []) {
    const word = tagWord(raw);
    const key = word.toLowerCase();
    if (!word || present.has(key)) continue;
    if (textTags + kept.length >= CAPTION_MAX_HASHTAGS) break;
    if (length([...kept, word].map((tag) => `#${tag}`).join(" ")) > HASHTAGS_MAX_CHARS) break;
    present.add(key);
    kept.push(word);
  }
  const suffix = kept.length ? kept.map((tag) => `#${tag}`).join(" ") : "";
  const separator = suffix && text ? "\n\n" : "";
  const room = CAPTION_MAX_CHARS - length(suffix) - length(separator);
  if (length(text) > room) {
    text = truncateChars(text, room);
    // Pas de hashtag coupé en fin de texte : le fragment est retiré.
    text = text.replace(/\s*#[\p{L}\p{N}_]*…$/u, "…");
  }
  return `${text}${separator}${suffix}`;
}

/** Image de la vidéo prise pour couverture, toujours dans `[0, durée[`. */
export function thumbOffsetFor(choice: CoverChoice, durationMs: number | undefined): number {
  const duration = durationMs && durationMs > 0 ? Math.floor(durationMs) : 0;
  if (duration <= 1) return 0;
  const offset = choice === "middle" ? Math.floor(duration / 2) : choice === "end" ? duration - 1000 : 0;
  return Math.min(Math.max(0, offset), duration - 1);
}

const isCover = (value: unknown): value is CoverChoice => COVER_CHOICES.some((choice) => choice.value === value);
const isTrial = (value: unknown): value is TrialChoice => TRIAL_CHOICES.some((choice) => choice.value === value);

/** Valide et complète les options reçues de la fenêtre de publication. */
export function normalizeInstagramOptions(input: unknown, source: PublishSource): InstagramOptions {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  // Relue au moment de publier, une option déjà normalisée ne change pas : la
  // légende y contient déjà les hashtags, et `hashtags` n'y figure plus.
  const caption = buildCaption(raw.caption, raw.hashtags);
  const isVideo = source.kind === "video";
  const hasCover = source.kind === "video" && Boolean(source.cover);
  let cover: CoverChoice = isVideo && isCover(raw.cover) ? raw.cover : "start";
  if (cover === "custom" && !hasCover) cover = "start";
  const durationMs = source.kind === "video" ? source.durationMs : undefined;
  const altText = source.kind === "image" ? truncateChars(cleanText(raw.altText).replace(/\s+/g, " "), ALT_TEXT_MAX_CHARS) : "";
  return {
    caption,
    shareToFeed: isVideo ? raw.shareToFeed !== false : false,
    cover,
    thumbOffsetMs: isVideo ? thumbOffsetFor(cover, durationMs) : 0,
    trial: isVideo && isTrial(raw.trial) ? raw.trial : "none",
    ...(altText ? { altText } : {}),
    aiGenerated: raw.aiGenerated === true,
  };
}
