/**
 * Suites de publication YouTube (dossier 01 ter, § 6 ; dossier 07, § 8.9) :
 * premier commentaire, sous-titres et miniature d'une vidéo publiée.
 *
 * D'après la référence de l'API YouTube Data v3 (pages mises à jour le
 * 14/09/2026, vérifiées le 12/10/2026) :
 * - `commentThreads.insert` : portée `youtube.force-ssl`, 50 unités ; corps
 *   `snippet.channelId`, `snippet.videoId`,
 *   `snippet.topLevelComment.snippet.textOriginal`. L'API ne sait pas
 *   épingler un commentaire : le résultat donne son lien, pour l'épingler à
 *   la main dans YouTube.
 * - `captions.insert` : portée `youtube.force-ssl` (ou `youtubepartner`),
 *   400 unités, fichier de 100 Mo au plus, `snippet.videoId`,
 *   `snippet.language`, `snippet.name` (150 caractères au plus).
 * - `thumbnails.set` : portées `youtube.upload`, `youtube`,
 *   `youtube.force-ssl` ou `youtubepartner`, environ 50 unités, JPEG ou PNG de
 *   50 Mo au plus ; refusé (403) si la chaîne n'a pas le droit aux miniatures
 *   personnalisées (chaîne non validée).
 *
 * Le commentaire attend que la vidéo soit publique ou non répertoriée : une
 * vidéo programmée est reprise à sa date de mise en ligne, une vidéo privée
 * est revue toutes les six heures. Sous-titres et miniature se posent sur
 * une vidéo privée sans attendre.
 */

import fs from "fs";
import type { FollowUpContext, FollowUpOutcome } from "../../types";
import { ServiceError } from "../../errors";
import { mimeTypeOfName } from "../../limits";
import { YOUTUBE_UPLOAD_API, getVideo, videoUrl, youtubeRequest } from "./api";

/** Une vidéo privée sans date est revue toutes les six heures. */
const PRIVATE_RECHECK_MS = 6 * 60 * 60 * 1000;
/** Marge après la date de mise en ligne, le temps que YouTube bascule la visibilité. */
const SCHEDULE_MARGIN_MS = 2 * 60 * 1000;
export const COMMENT_MAX_CHARS = 10_000;
export const CAPTION_MAX_BYTES = 100 * 1024 * 1024;
export const THUMBNAIL_MAX_BYTES = 50 * 1024 * 1024;
export const THUMBNAIL_TYPES = ["image/jpeg", "image/png"];
/** Formats de sous-titres que YouTube lit (le cœur n'en produit qu'un : SRT). */
export const CAPTION_FORMATS = ["srt", "vtt", "sbv"];

const commentUrl = (videoId: string, commentId: string) => `${videoUrl(videoId)}&lc=${encodeURIComponent(commentId)}`;

interface ThreadResource {
  id?: string;
  snippet?: { topLevelComment?: { id?: string; snippet?: { textOriginal?: string; authorChannelId?: { value?: string } } } };
}

/**
 * Commentaire déjà posté par la chaîne avec ce texte (réponse perdue lors
 * d'un passage précédent) ; `null` si aucun, ou si la lecture échoue.
 */
async function findOwnComment(context: FollowUpContext, videoId: string, text: string): Promise<string | null> {
  try {
    const body = await youtubeRequest<{ items?: ThreadResource[] }>(context, "commentThreads.list", "commentThreads", {
      query: { part: "snippet", videoId, maxResults: 20, order: "time", textFormat: "plainText" },
    });
    const match = (body.items ?? []).find((thread) => {
      const comment = thread.snippet?.topLevelComment;
      return comment?.snippet?.authorChannelId?.value === context.externalId && comment.snippet.textOriginal?.trim() === text.trim();
    });
    return match?.snippet?.topLevelComment?.id ?? match?.id ?? null;
  } catch {
    return null;
  }
}

const PIN_NOTE = "L’API YouTube ne sait pas épingler un commentaire : ouvrez le lien pour l’épingler à la main.";

/** Premier commentaire, une fois la vidéo publique ou non répertoriée. */
export async function postYoutubeComment(context: FollowUpContext, text: string): Promise<FollowUpOutcome> {
  const videoId = context.result.externalId;
  const video = await getVideo(context, videoId, "status");
  const status = video.status ?? {};
  if (status.privacyStatus === "private" || !status.privacyStatus) {
    const publishAt = status.publishAt ? Date.parse(status.publishAt) : NaN;
    if (Number.isFinite(publishAt) && publishAt > Date.now()) {
      return { pending: true, retryAt: publishAt + SCHEDULE_MARGIN_MS, note: "Vidéo programmée : le commentaire sera posé à sa mise en ligne." };
    }
    return { pending: true, retryAfterMs: PRIVATE_RECHECK_MS, note: "Vidéo privée : le commentaire attend qu’elle soit publique ou non répertoriée." };
  }
  if (context.attempt > 1) {
    const existing = await findOwnComment(context, videoId, text);
    if (existing) return { externalId: existing, url: commentUrl(videoId, existing), note: PIN_NOTE };
  }
  let thread: ThreadResource;
  try {
    thread = await youtubeRequest<ThreadResource>(context, "commentThreads.insert", "commentThreads", {
      method: "POST",
      query: { part: "snippet" },
      json: { snippet: { channelId: context.externalId, videoId, topLevelComment: { snippet: { textOriginal: text } } } },
    });
  } catch (error) {
    if (error instanceof ServiceError && error.reason === "commentsDisabled") {
      return { skipped: true, note: "Les commentaires sont désactivés sur cette vidéo (vidéo pour enfants, ou réglage de la chaîne)." };
    }
    throw error;
  }
  const commentId = thread.snippet?.topLevelComment?.id ?? thread.id;
  if (!commentId) return { url: videoUrl(videoId), note: PIN_NOTE };
  return { externalId: commentId, url: commentUrl(videoId, commentId), note: PIN_NOTE };
}

/** Nom de la piste : la langue en clair (« Français »), 150 caractères au plus. */
export function captionName(language: string): string {
  try {
    const name = new Intl.DisplayNames(["fr"], { type: "language" }).of(language);
    if (name) return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 150);
  } catch {
    // Code inconnu : il sert de nom.
  }
  return language.slice(0, 150);
}

/** Corps `multipart/related` : métadonnées JSON, puis le fichier. */
function multipart(metadata: unknown, file: Buffer, type: string): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const boundary = `sxm-${Math.random().toString(36).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${type}\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body: new Uint8Array(body), contentType: `multipart/related; boundary=${boundary}` };
}

/** Sous-titres de la vidéo (`captions.insert`), publiés tout de suite (pas en brouillon). */
export async function uploadYoutubeSubtitles(context: FollowUpContext, subtitles: { path: string; language: string }): Promise<FollowUpOutcome> {
  const size = fs.statSync(subtitles.path).size;
  if (size === 0) throw new Error("Le fichier de sous-titres est vide.");
  if (size > CAPTION_MAX_BYTES) throw new Error("Le fichier de sous-titres dépasse 100 Mo, la limite de YouTube.");
  const videoId = context.result.externalId;
  const { body, contentType } = multipart(
    { snippet: { videoId, language: subtitles.language, name: captionName(subtitles.language), isDraft: false } },
    fs.readFileSync(subtitles.path),
    "application/octet-stream"
  );
  try {
    const caption = await youtubeRequest<{ id?: string }>(context, "captions.insert", "captions", {
      method: "POST",
      base: YOUTUBE_UPLOAD_API,
      query: { part: "snippet", uploadType: "multipart" },
      headers: { "Content-Type": contentType },
      body,
    });
    return { ...(caption?.id ? { externalId: caption.id } : {}), url: `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/translations` };
  } catch (error) {
    if (error instanceof ServiceError && error.reason === "captionExists") {
      return { skipped: true, note: "La vidéo a déjà une piste de sous-titres dans cette langue : elle n’a pas été remplacée." };
    }
    throw error;
  }
}

/** Miniature de la vidéo (`thumbnails.set`). */
export async function setYoutubeThumbnail(context: FollowUpContext, cover: { path: string; mimeType?: string }): Promise<FollowUpOutcome> {
  const type = cover.mimeType ?? mimeTypeOfName(cover.path);
  if (!type || !THUMBNAIL_TYPES.includes(type)) throw new Error("YouTube n’accepte qu’une miniature JPEG ou PNG.");
  const size = fs.statSync(cover.path).size;
  if (size > THUMBNAIL_MAX_BYTES) throw new Error("La miniature dépasse 50 Mo, la limite de YouTube.");
  const videoId = context.result.externalId;
  try {
    await youtubeRequest(context, "thumbnails.set", "thumbnails/set", {
      method: "POST",
      base: YOUTUBE_UPLOAD_API,
      query: { videoId, uploadType: "media" },
      headers: { "Content-Type": type },
      body: new Uint8Array(fs.readFileSync(cover.path)),
    });
  } catch (error) {
    if (error instanceof ServiceError && error.status === 403) {
      throw new ServiceError(
        403,
        "YouTube refuse la miniature personnalisée : la chaîne doit être validée (youtube.com/verify) pour en avoir le droit.",
        error.reason
      );
    }
    throw error;
  }
  return { url: videoUrl(videoId) };
}
