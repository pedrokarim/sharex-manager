/**
 * Champs de publication Facebook, validation des options et limites
 * (dossier 07a, § 5.1, § 7 et § 8).
 *
 * - Reel de Page : 3 à 90 s, rapport de 16:9 à 9:16, public seulement,
 *   30 par Page sur 24 h glissantes ;
 * - vidéo de Page : 1 s à 40 min, 2 Go au plus, publique ou brouillon ;
 * - photo : 4 Mo au plus (au-delà, réencodée en JPEG par le connecteur) ;
 * - programmation : Meta publie quatre fourchettes (Reel 29 jours, vidéo
 *   6 mois, fil 30 ou 75 jours) ; on applique partout la plus stricte,
 *   de 10 minutes à 29 jours.
 *
 * Aucune longueur de titre ni de texte n'est documentée par Meta : 255 et
 * 10 000 caractères sont des bornes internes, par prudence.
 */

import type { AccountQuota, PostPrivacy, PublishField, PublishLimits, PublishSource, ShortFormNote } from "../../types";
import { truncateChars } from "../../templates";

export const TITLE_MAX_CHARS = 255;
export const MESSAGE_MAX_CHARS = 10_000;
export const LINK_MAX_CHARS = 2000;

export const REEL_MIN_MS = 3_000;
export const REEL_MAX_MS = 90_000;
export const VIDEO_MIN_MS = 1_000;
export const VIDEO_MAX_MS = 40 * 60 * 1000;
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
/** Rapports acceptés : de 9:16 à 16:9. */
export const RATIO_MIN = 9 / 16;
export const RATIO_MAX = 16 / 9;

export const SCHEDULE_MIN_MS = 10 * 60 * 1000;
export const SCHEDULE_MAX_MS = 29 * 24 * 60 * 60 * 1000;

/** Reels publiés par l'API : 30 par Page sur 24 h glissantes. */
export const REELS_PER_DAY = 30;
export const REEL_QUOTA_METHOD = "video_reels.publish";

export type VideoFormat = "auto" | "reel" | "video";

export interface FacebookOptions {
  /** Pour une vidéo : point d'entrée retenu (jamais « auto » après validation). */
  format?: "reel" | "video";
  title?: string;
  /** Description d'une vidéo, légende d'une image. */
  description?: string;
  /** Lien joint à un message. */
  link?: string;
  /** « public » : publiée ; « private » : brouillon (vidéo seulement). */
  privacy?: Extract<PostPrivacy, "public" | "private">;
  /** Date de publication programmée (ISO). */
  scheduledAt?: string;
  /** Reel déclaré comme généré par IA. */
  aiGenerated?: boolean;
}

export const FACEBOOK_PUBLISH_FIELDS: PublishField[] = [
  { key: "title", kind: "text", label: "Titre", role: "title", maxLength: TITLE_MAX_CHARS, sourceKinds: ["video"] },
  {
    key: "description",
    kind: "textarea",
    label: "Description",
    // Le texte affiché avec la vidéo ou la photo dans le fil de la Page (`description`, `caption`).
    role: "caption",
    maxLength: MESSAGE_MAX_CHARS,
    sourceKinds: ["video", "image"],
    help: "Les mots-clés # vont ici : Facebook n’a pas de champ de tags.",
  },
  { key: "link", kind: "text", label: "Lien", maxLength: LINK_MAX_CHARS, sourceKinds: ["text"], help: "Adresse jointe au message, facultative." },
  {
    key: "format",
    kind: "select",
    label: "Format",
    sourceKinds: ["video"],
    defaultValue: "auto",
    choices: [
      { value: "auto", label: "Automatique" },
      { value: "reel", label: "Reel" },
      { value: "video", label: "Vidéo de la Page" },
    ],
    help: "Automatique : Reel pour une vidéo verticale ou carrée de 3 à 90 secondes, vidéo de la Page sinon.",
  },
  {
    key: "privacy",
    kind: "select",
    label: "Visibilité",
    role: "privacy",
    sourceKinds: ["video"],
    defaultValue: "public",
    choices: [
      { value: "public", label: "Publique" },
      { value: "private", label: "Brouillon (non publiée)" },
    ],
    help: "Une Page est publique : seul le brouillon reste invisible.",
  },
  {
    key: "scheduledAt",
    kind: "datetime",
    label: "Programmer",
    role: "scheduledAt",
    help: "Entre 10 minutes et 29 jours à partir de maintenant ; vide : publication immédiate.",
  },
  {
    key: "aiGenerated",
    kind: "toggle",
    label: "Contenu généré par IA",
    role: "syntheticMedia",
    sourceKinds: ["video"],
    defaultValue: false,
    help: "Déclaré à Facebook pour un Reel.",
  },
];

export const FACEBOOK_LIMITS: PublishLimits = {
  video: {
    mimeTypes: ["video/mp4", "video/quicktime"],
    maxBytes: VIDEO_MAX_BYTES,
    minDurationMs: VIDEO_MIN_MS,
    maxDurationMs: VIDEO_MAX_MS,
    aspectRatio: { min: RATIO_MIN, max: RATIO_MAX },
  },
  // Pas de poids maximal : une image de plus de 4 Mo, ou dans un autre format, est réencodée en JPEG.
  image: { mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff"] },
  text: { maxLength: MESSAGE_MAX_CHARS },
};

export const FACEBOOK_SHORT_FORM: ShortFormNote = {
  maxSeconds: REEL_MAX_MS / 1000,
  verticalNote: "Vertical ou carré et de 90 secondes au plus : publié comme Reel de la Page.",
  horizontalNote: "Horizontal ou plus long : publié comme vidéo de la Page.",
};

/** Quota propre à chaque Page : 30 Reels sur 24 h glissantes, compté à l'ouverture de l'envoi. */
export const FACEBOOK_ACCOUNT_QUOTA: AccountQuota = {
  buckets: [{ id: "reels", label: "Reels publiés", limit: REELS_PER_DAY }],
  windowMs: 24 * 60 * 60 * 1000,
  cost: (method) => (method === REEL_QUOTA_METHOD ? { bucket: "reels", units: 1 } : null),
};

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const cleanText = (value: unknown, max: number) => (typeof value === "string" ? truncateChars(value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim(), max) : "");

/** Un Reel convient-il à cette vidéo ? Raison du refus sinon. */
export function reelProblem(source: PublishSource): string | null {
  if (source.kind !== "video") return "Un Reel est une vidéo.";
  if (source.durationMs !== undefined && source.durationMs > 0) {
    if (source.durationMs < REEL_MIN_MS) return "Un Reel dure 3 secondes au moins.";
    if (source.durationMs > REEL_MAX_MS) return "Un Reel dure 90 secondes au plus : choisissez « Vidéo de la Page ».";
  }
  if (source.width && source.height && source.width > source.height) return "Un Reel est vertical ou carré : choisissez « Vidéo de la Page ».";
  return null;
}

/** Choix automatique : Reel pour une vidéo verticale ou carrée de 3 à 90 s, vidéo de la Page sinon. */
export function chooseFormat(requested: VideoFormat, source: PublishSource): "reel" | "video" {
  if (requested === "reel" || requested === "video") return requested;
  const known = source.kind === "video" && Boolean(source.width && source.height && source.durationMs);
  return known && !reelProblem(source) ? "reel" : "video";
}

function parseDate(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const time = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) throw new Error("Date de programmation invalide.");
  return time;
}

/**
 * Valide les options reçues de l'interface. `now` vaut `null` à la
 * publication : les bornes de programmation ont été vérifiées à la mise en
 * file, et une date dépassée entre-temps est traitée par `scheduleFor`.
 */
export function normalizeFacebookOptions(input: unknown, source: PublishSource, now: number | null = Date.now()): FacebookOptions {
  if (source.kind === "carousel") throw new Error("Facebook : la publication de plusieurs fichiers à la fois n’est pas encore prise en charge.");
  const options = record(input);
  const result: FacebookOptions = {};

  const scheduled = parseDate(options.scheduledAt);
  if (scheduled !== null) {
    if (now !== null && scheduled < now + SCHEDULE_MIN_MS) throw new Error("Facebook ne programme qu’au moins 10 minutes à l’avance.");
    if (now !== null && scheduled > now + SCHEDULE_MAX_MS) throw new Error("Facebook ne programme pas au-delà de 29 jours.");
    result.scheduledAt = new Date(scheduled).toISOString();
  }

  if (source.kind === "text") {
    const link = cleanText(options.link, LINK_MAX_CHARS);
    if (link) {
      let url: URL;
      try {
        url = new URL(link);
      } catch {
        throw new Error("Le lien n’est pas une adresse web valide.");
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Le lien doit commencer par https:// ou http://.");
      result.link = url.toString();
    }
    return result;
  }

  const description = cleanText(options.description, MESSAGE_MAX_CHARS);
  if (description) result.description = description;
  if (source.kind === "image") return result;

  const requested = options.format === "reel" || options.format === "video" ? options.format : "auto";
  const format = chooseFormat(requested, source);
  if (format === "reel") {
    const problem = reelProblem(source);
    if (problem) throw new Error(problem);
  }
  result.format = format;
  const title = cleanText(options.title, TITLE_MAX_CHARS);
  if (title) result.title = title;
  result.privacy = options.privacy === "private" ? "private" : "public";
  if (result.privacy === "private" && result.scheduledAt) throw new Error("Une vidéo programmée ne peut pas rester en brouillon : choisissez « Publique ».");
  if (options.aiGenerated === true && format === "reel") result.aiGenerated = true;
  return result;
}

/**
 * Horodatage Unix (secondes) à envoyer à Facebook, ou `null` pour publier
 * tout de suite : une date passée, ou trop proche pour être acceptée par
 * Facebook (la file a pu attendre), devient une publication immédiate.
 */
export function scheduleFor(options: FacebookOptions, now = Date.now()): number | null {
  if (!options.scheduledAt) return null;
  const time = Date.parse(options.scheduledAt);
  if (!Number.isFinite(time) || time < now + SCHEDULE_MIN_MS + 30_000) return null;
  return Math.floor(time / 1000);
}
