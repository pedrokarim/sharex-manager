/**
 * Envoi d'un Reel de Page (dossier 07a, § 5.2), avec le jeton de Page :
 *
 * 1. `POST /{page-id}/video_reels` avec `upload_phase=start` → `video_id` ;
 * 2. le fichier, lu en flux depuis le disque, envoyé à
 *    `rupload.facebook.com/video-upload/{version}/{video-id}` avec les
 *    en-têtes `offset` et `file_size` ;
 * 3. reprise après coupure : `GET /{video-id}?fields=status` donne
 *    `uploading_phase.bytes_transfered` (orthographe de Meta), et la suite du
 *    fichier repart de là ; une session expirée repart de l'étape 1 ;
 * 4. `upload_phase=finish` avec `video_state` (`PUBLISHED`, `DRAFT`,
 *    `SCHEDULED`), `description`, `title`, `scheduled_publish_time`.
 *
 * Le quota local (30 Reels par Page sur 24 h glissantes) est compté à
 * l'ouverture : une Page au bout de sa limite n'envoie rien pour rien.
 */

import fs from "fs";
import { Readable } from "stream";
import type { ConnectorContext, PublishContext } from "../../types";
import { readJsonKeepingIds } from "../../json";
import { type FacebookOptions, REEL_QUOTA_METHOD, scheduleFor } from "./metadata";
import { RETRY_DELAYS_MS, RUPLOAD_API, RetryableError, authFromContext, facebookUrl, graphError, graphRequest, isRetryable } from "./graph";

/** État de reprise d'un Reel, rangé par la file. */
export interface ReelResume {
  kind: "reel";
  videoId?: string;
  total: number;
  /** Quota local déjà compté pour ce travail. */
  charged?: boolean;
  /** Fichier entièrement reçu par Facebook. */
  uploaded?: boolean;
  /** Appel `finish` lancé : la publication a pu aboutir sans réponse. */
  finishing?: boolean;
}

export interface VideoStatusBody {
  id?: string;
  permalink_url?: string;
  status?: {
    video_status?: string;
    uploading_phase?: { status?: string; bytes_transfered?: number | string };
    processing_phase?: { status?: string; error?: { message?: string } };
    publishing_phase?: { status?: string; publish_status?: string; publish_time?: number | string };
  };
}

/** États d'une vidéo qui obligent à repartir de zéro. */
const DEAD_STATUSES = new Set(["expired", "upload_failed", "error"]);

export async function readVideoStatus(context: ConnectorContext, videoId: string, fields = "status"): Promise<VideoStatusBody> {
  const auth = await authFromContext(context);
  return graphRequest<VideoStatusBody>(auth, encodeURIComponent(videoId), { params: { fields } });
}

/** Lit la suite du fichier en flux, sans la charger en mémoire. */
function fileStream(filePath: string, start: number): ReadableStream<Uint8Array> {
  return Readable.toWeb(fs.createReadStream(filePath, { start })) as unknown as ReadableStream<Uint8Array>;
}

async function startSession(context: PublishContext): Promise<string> {
  const auth = await authFromContext(context);
  const body = await graphRequest<{ video_id?: string | number }>(auth, `${encodeURIComponent(context.externalId)}/video_reels`, {
    method: "POST",
    params: { upload_phase: "start" },
    signal: context.signal,
  });
  if (!body.video_id) throw new Error("Facebook n’a pas ouvert d’envoi de Reel.");
  return String(body.video_id);
}

type UploadOutcome = { type: "done" } | { type: "offset"; offset: number } | { type: "restart" };

/** Envoie le fichier à partir de `offset`. */
async function sendFrom(context: PublishContext, videoId: string, offset: number, total: number): Promise<UploadOutcome> {
  const auth = await authFromContext(context);
  let response: Response;
  try {
    response = await fetch(`${RUPLOAD_API}/${encodeURIComponent(videoId)}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${auth.token}`,
        offset: String(offset),
        file_size: String(total),
        "Content-Type": "application/octet-stream",
        "Content-Length": String(total - offset),
      },
      body: fileStream(context.filePath, offset),
      signal: context.signal,
      // Corps en flux : exigé par `fetch` sous Node.
      duplex: "half",
    } as RequestInit & { duplex: "half" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new RetryableError("Envoi du Reel interrompu : la connexion avec Facebook a été coupée.");
  }
  const body = (await readJsonKeepingIds(response)) as { success?: boolean; debug_info?: { type?: string; message?: string }; error?: unknown } | null;
  if (response.ok && body?.success) return { type: "done" };
  const type = body?.debug_info?.type;
  // Décalage refusé : on redemande où en est Facebook.
  if (type === "OffsetInvalidError" || type === "PartialRequestError") throw new RetryableError(`Envoi du Reel à reprendre (${type}).`);
  if (type === "ProcessingFailedError") return { type: "restart" };
  throw graphError(response.status, body, response.headers);
}

/** Octets déjà reçus par Facebook, ou `restart` si la session est perdue. */
async function receivedBytes(context: PublishContext, videoId: string, total: number): Promise<UploadOutcome> {
  const status = (await readVideoStatus(context, videoId)).status;
  if (status?.video_status && DEAD_STATUSES.has(status.video_status)) return { type: "restart" };
  const received = Number(status?.uploading_phase?.bytes_transfered ?? 0) || 0;
  if (received >= total || status?.uploading_phase?.status === "complete" || status?.uploading_phase?.status === "completed") return { type: "done" };
  return { type: "offset", offset: Math.max(0, Math.min(received, total)) };
}

async function finish(context: PublishContext, videoId: string, options: FacebookOptions) {
  const auth = await authFromContext(context);
  const schedule = scheduleFor(options);
  const state = options.privacy === "private" ? "DRAFT" : schedule ? "SCHEDULED" : "PUBLISHED";
  return graphRequest<{ success?: boolean; post_id?: string | number }>(auth, `${encodeURIComponent(context.externalId)}/video_reels`, {
    method: "POST",
    params: {
      upload_phase: "finish",
      video_id: videoId,
      video_state: state,
      description: options.description,
      title: options.title,
      scheduled_publish_time: state === "SCHEDULED" ? schedule! : undefined,
      is_ai_generated: options.aiGenerated ? true : undefined,
    },
    signal: context.signal,
  });
}

/** Adresse de la vidéo : `permalink_url` si Facebook la donne déjà, sinon l'adresse de l'identifiant. */
export async function videoAddress(context: ConnectorContext, videoId: string, postId?: string): Promise<string> {
  try {
    const body = await readVideoStatus(context, videoId, "permalink_url");
    if (body.permalink_url) return facebookUrl(body.permalink_url);
  } catch {
    // Pas encore lisible : l'adresse de la publication ou de la vidéo suffit.
  }
  return facebookUrl(postId ?? videoId);
}

/** Publie un Reel et rend l'identifiant de la vidéo chez Facebook. */
export async function publishReel(context: PublishContext, options: FacebookOptions): Promise<{ externalId: string; url: string }> {
  const total = fs.statSync(context.filePath).size;
  if (total === 0) throw new Error("Le fichier à publier est vide.");
  const previous = context.resume?.kind === "reel" && context.resume.total === total ? (context.resume as unknown as ReelResume) : null;
  const resume: ReelResume = previous ? { ...previous } : { kind: "reel", total };
  const save = (bytes: number) => context.saveProgress({ ...resume }, bytes);
  // Session reprise : on demande d'abord à Facebook ce qu'il a reçu.
  let offset: number | null = resume.videoId && !resume.uploaded ? null : 0;
  let failures = 0;
  let restarts = 0;

  while (!resume.uploaded) {
    context.signal.throwIfAborted();
    try {
      if (!resume.videoId) {
        if (!resume.charged) {
          context.chargeQuota(REEL_QUOTA_METHOD);
          resume.charged = true;
        }
        resume.videoId = await startSession(context);
        offset = 0;
        save(0);
      }
      const outcome = offset === null ? await receivedBytes(context, resume.videoId, total) : await sendFrom(context, resume.videoId, offset, total);
      if (outcome.type === "done") {
        resume.uploaded = true;
        save(total);
        break;
      }
      if (outcome.type === "restart") {
        if (++restarts > 2) throw new Error("Facebook refuse le fichier de ce Reel après plusieurs essais : vérifiez son format (MP4, H.264, 24 à 60 images par seconde).");
        resume.videoId = undefined;
        offset = 0;
        save(0);
        continue;
      }
      if (offset !== null && outcome.offset > offset) failures = 0;
      offset = outcome.offset;
      save(offset);
    } catch (error) {
      if (!isRetryable(error)) throw error;
      if (failures >= RETRY_DELAYS_MS.length) {
        throw new Error("Envoi du Reel interrompu après plusieurs essais : la connexion avec Facebook ne tient pas. « Reprendre » repartira de là où il s’est arrêté.");
      }
      await context.sleep(RETRY_DELAYS_MS[failures++]);
      offset = resume.videoId ? null : 0;
    }
  }

  resume.finishing = true;
  save(total);
  const videoId = resume.videoId!;
  let result: { post_id?: string | number } | undefined;
  for (let attempt = 0; ; attempt += 1) {
    try {
      result = await finish(context, videoId, options);
      break;
    } catch (error) {
      if (!isRetryable(error) || attempt >= RETRY_DELAYS_MS.length - 1) throw error;
      await context.sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  context.saveProgress(undefined, total);
  return { externalId: videoId, url: await videoAddress(context, videoId, result?.post_id !== undefined ? String(result.post_id) : undefined) };
}
