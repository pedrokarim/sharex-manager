/**
 * Suites de publication Facebook (dossier 01 ter, § 6 ; dossier 07a) :
 * premier commentaire, sous-titres et miniature d'une vidéo de la Page.
 *
 * D'après la référence de la Graph API (vérifiée le 12/10/2026) :
 * - `POST /{object-id}/comments` (`message`) : jeton de Page d'une personne
 *   qui a la tâche MODERATE sur la Page, autorisation
 *   `pages_manage_engagement` ; accepté sur une publication, une photo ou
 *   une vidéo de la Page. Aucune longueur maximale n'est documentée.
 * - `POST /{video-id}/captions` (`captions_file`) : fichier SRT nommé
 *   `nom.<locale>.srt` (`fr_FR`), 200 Ko au plus ; il suffit de gérer la
 *   Page qui possède la vidéo (déjà le cas avec `pages_manage_posts`).
 * - `POST /{video-id}/thumbnails` (`source`, `is_preferred`) : autorisations
 *   `pages_read_user_content`, `pages_manage_engagement` et
 *   `pages_show_list`, image de 10 Mo au plus ; le guide des Reels y renvoie
 *   pour la couverture d'un Reel.
 *
 * Le commentaire attend la mise en ligne : une vidéo programmée est reprise
 * à sa date, un brouillon est revu toutes les six heures.
 */

import fs from "fs";
import type { FollowUpContext, FollowUpOutcome } from "../../types";
import { mimeTypeOfName } from "../../limits";
import { GraphError, authFromContext, graphRequest } from "./graph";
import type { FacebookOptions } from "./metadata";

/** Aucune longueur n'est documentée par Meta : borne interne prudente. */
export const COMMENT_MAX_CHARS = 8000;
export const CAPTION_MAX_BYTES = 200 * 1000;
export const THUMBNAIL_MAX_BYTES = 10 * 1024 * 1024;
export const THUMBNAIL_TYPES = ["image/jpeg", "image/png"];

const DRAFT_RECHECK_MS = 6 * 60 * 60 * 1000;
const SCHEDULE_MARGIN_MS = 2 * 60 * 1000;
/** Les captions refusent une langue déjà présente sur la vidéo. */
const LOCALE_EXISTS = 482;

/** Une vidéo a un identifiant seul ; une publication du fil, « page_post ». */
const isVideoId = (id: string) => /^\d+$/.test(id);

/** Attente avant de commenter : brouillon, ou publication programmée. */
function notYetPublished(options: FacebookOptions): FollowUpOutcome | null {
  if (options.privacy === "private") {
    return { pending: true, retryAfterMs: DRAFT_RECHECK_MS, note: "Brouillon : le commentaire attend la publication de la vidéo." };
  }
  const scheduled = options.scheduledAt ? Date.parse(options.scheduledAt) : NaN;
  if (Number.isFinite(scheduled) && scheduled > Date.now()) {
    return { pending: true, retryAt: scheduled + SCHEDULE_MARGIN_MS, note: "Publication programmée : le commentaire sera posé à sa mise en ligne." };
  }
  return null;
}

/** Commentaire de la Page déjà posté avec ce texte (réponse perdue) ; `null` sinon. */
async function findOwnComment(context: FollowUpContext, target: string, text: string): Promise<string | null> {
  try {
    const auth = await authFromContext(context);
    const body = await graphRequest<{ data?: { id?: string | number; message?: string; from?: { id?: string | number } }[] }>(auth, `${encodeURIComponent(target)}/comments`, {
      params: { fields: "id,message,from", limit: 25, order: "reverse_chronological" },
    });
    const match = (body.data ?? []).find((comment) => String(comment.from?.id ?? "") === context.externalId && (comment.message ?? "").trim() === text.trim());
    return match?.id !== undefined ? String(match.id) : null;
  } catch {
    return null;
  }
}

/** Premier commentaire sous la publication, posté par la Page. */
export async function postFacebookComment(context: FollowUpContext, text: string): Promise<FollowUpOutcome> {
  const waiting = notYetPublished(context.options as FacebookOptions);
  if (waiting) return waiting;
  const target = context.result.externalId;
  if (context.attempt > 1) {
    const existing = await findOwnComment(context, target, text);
    if (existing) return { externalId: existing, url: context.result.url };
  }
  context.chargeQuota("comment.create");
  const auth = await authFromContext(context);
  const body = await graphRequest<{ id?: string | number }>(auth, `${encodeURIComponent(target)}/comments`, { method: "POST", params: { message: text } });
  return { ...(body.id !== undefined ? { externalId: String(body.id) } : {}), url: context.result.url };
}

/** Locale de Facebook (`fr_FR`) d'après un code BCP 47 (« fr », « en-US »). */
export function facebookLocale(language: string): string {
  const [base, region] = language.replace(/_/g, "-").split("-");
  const lang = (base ?? "").toLowerCase();
  const DEFAULT_REGIONS: Record<string, string> = { en: "US", fr: "FR", es: "ES", pt: "BR", de: "DE", it: "IT", nl: "NL", ja: "JP", ko: "KR", zh: "CN", ar: "AR", sv: "SE", da: "DK", nb: "NO", el: "GR", uk: "UA", cs: "CZ", he: "IL", hi: "IN", vi: "VN" };
  const country = region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : (DEFAULT_REGIONS[lang] ?? lang.toUpperCase());
  return `${lang}_${country}`;
}

/** Sous-titres d'une vidéo de la Page (fichier SRT). */
export async function uploadFacebookSubtitles(context: FollowUpContext, subtitles: { path: string; language: string }): Promise<FollowUpOutcome> {
  const videoId = context.result.externalId;
  if (!isVideoId(videoId)) return { skipped: true, note: "Cette publication n’est pas une vidéo : pas de sous-titres." };
  const bytes = fs.readFileSync(subtitles.path);
  if (bytes.length === 0) throw new Error("Le fichier de sous-titres est vide.");
  if (bytes.length > CAPTION_MAX_BYTES) throw new Error("Le fichier de sous-titres dépasse 200 Ko, la limite de Facebook.");
  const locale = facebookLocale(subtitles.language);
  const form = new FormData();
  // Facebook lit la langue dans le nom du fichier : « nom.fr_FR.srt ».
  form.set("captions_file", new Blob([new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)], { type: "application/octet-stream" }), `subtitles.${locale}.srt`);
  context.chargeQuota("video.captions");
  const auth = await authFromContext(context);
  try {
    await graphRequest(auth, `${encodeURIComponent(videoId)}/captions`, { method: "POST", form });
  } catch (error) {
    if (error instanceof GraphError && error.code === LOCALE_EXISTS) {
      return { skipped: true, note: "La vidéo a déjà des sous-titres dans cette langue : ils n’ont pas été remplacés." };
    }
    throw error;
  }
  return { url: context.result.url };
}

/** Miniature (couverture) préférée d'une vidéo ou d'un Reel de la Page. */
export async function setFacebookThumbnail(context: FollowUpContext, cover: { path: string; mimeType?: string }): Promise<FollowUpOutcome> {
  const videoId = context.result.externalId;
  if (!isVideoId(videoId)) return { skipped: true, note: "Cette publication n’est pas une vidéo : pas de miniature à changer." };
  const type = cover.mimeType ?? mimeTypeOfName(cover.path);
  if (!type || !THUMBNAIL_TYPES.includes(type)) throw new Error("Facebook n’accepte ici qu’une miniature JPEG ou PNG.");
  const bytes = fs.readFileSync(cover.path);
  if (bytes.length > THUMBNAIL_MAX_BYTES) throw new Error("La miniature dépasse 10 Mo, la limite de Facebook.");
  const form = new FormData();
  form.set("source", new Blob([new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)], { type }), type === "image/png" ? "cover.png" : "cover.jpg");
  context.chargeQuota("video.thumbnails");
  const auth = await authFromContext(context);
  await graphRequest(auth, `${encodeURIComponent(videoId)}/thumbnails`, { method: "POST", form, params: { is_preferred: true } });
  return { url: context.result.url };
}
