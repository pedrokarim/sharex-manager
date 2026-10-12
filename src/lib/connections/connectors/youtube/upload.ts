/**
 * Envoi reprenable d'une vidéo à YouTube (dossier 07, § 8.5).
 *
 * 1. Ouverture de la session : `POST …/videos?uploadType=resumable`, corps
 *    JSON des métadonnées ; Google rend l'URI de session dans `Location`,
 *    enregistrée dans l'état de reprise du travail.
 * 2. Envoi par blocs de 8 Mio (multiple de 256 Kio) lus un à un sur le
 *    disque : le fichier n'est jamais chargé entier en mémoire.
 * 3. Coupure ou erreur 5xx : on demande où en est Google (`PUT` vide,
 *    `Content-Range: bytes *\/<taille>`), on lit l'en-tête `Range` et on
 *    reprend au bon octet, après une attente de 1, 2, 4, 8 puis 16 s. Une
 *    session expirée (404 ou 410) fait repartir du début.
 * 4. Fin : la réponse contient la ressource vidéo.
 */

import fs from "fs";
import type { PublishContext } from "../../types";
import { QuotaExceededError, ServiceError } from "../../errors";
import { YOUTUBE_UPLOAD_API, videoUrl, youtubeError } from "./api";
import { type YoutubeOptions, videoResource } from "./metadata";

export const CHUNK_SIZE = 8 * 1024 * 1024;
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

interface UploadResume {
  sessionUri?: string;
  total?: number;
  /** `videos.insert` déjà compté dans le quota pour ce travail. */
  charged?: boolean;
}

type ChunkOutcome = { type: "complete"; id: string } | { type: "offset"; offset: number } | { type: "expired" };

/** Erreur passagère : on réessaie après une attente. */
class RetryableError extends Error {}

function isRetryable(error: unknown): boolean {
  if (error instanceof RetryableError) return true;
  if (error instanceof QuotaExceededError) return false;
  if (error instanceof ServiceError) return false;
  if (error instanceof Error && error.name === "AbortError") return false;
  // `fetch` lève une TypeError sur une coupure réseau.
  return error instanceof TypeError || (error instanceof Error && /network|socket|ECONN|ETIMEDOUT|EPIPE|fetch failed/i.test(error.message));
}

/** Prochain octet à envoyer, d'après l'en-tête `Range: bytes=0-<dernier reçu>`. */
export function nextOffsetFromRange(range: string | null): number {
  const match = range?.match(/bytes=0-(\d+)/);
  return match ? Number(match[1]) + 1 : 0;
}

async function readVideoId(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) throw new Error("YouTube n’a pas rendu l’identifiant de la vidéo.");
  return body.id;
}

async function openSession(context: PublishContext, options: YoutubeOptions, total: number, charge: boolean): Promise<string> {
  if (charge) context.chargeQuota("videos.insert");
  const token = await context.getAccessToken();
  const response = await fetch(`${YOUTUBE_UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.value}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(total),
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(videoResource(options)),
    signal: context.signal,
  });
  if (response.status >= 500) throw new RetryableError(`YouTube indisponible (HTTP ${response.status}).`);
  if (!response.ok) throw await youtubeError(response, "videos.insert");
  const location = response.headers.get("location");
  if (!location || !location.startsWith("https://")) throw new Error("YouTube n’a pas ouvert de session d’envoi.");
  return location;
}

function interpret(response: Response, total: number): Promise<ChunkOutcome> | ChunkOutcome {
  if (response.status === 200 || response.status === 201) return readVideoId(response).then((id) => ({ type: "complete" as const, id }));
  if (response.status === 308) return { type: "offset", offset: Math.min(nextOffsetFromRange(response.headers.get("range")), total) };
  if (response.status === 404 || response.status === 410) return { type: "expired" };
  if (response.status >= 500 || response.status === 408 || response.status === 429 || response.status === 401) {
    throw new RetryableError(`Envoi interrompu par YouTube (HTTP ${response.status}).`);
  }
  return youtubeError(response, "videos.insert").then((error) => {
    throw error;
  });
}

async function queryStatus(context: PublishContext, sessionUri: string, total: number): Promise<ChunkOutcome> {
  const token = await context.getAccessToken();
  const response = await fetch(sessionUri, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token.value}`, "Content-Length": "0", "Content-Range": `bytes */${total}` },
    signal: context.signal,
  });
  return interpret(response, total);
}

async function sendChunk(
  context: PublishContext,
  handle: fs.promises.FileHandle,
  sessionUri: string,
  offset: number,
  total: number,
  chunkSize: number
): Promise<ChunkOutcome> {
  const length = Math.min(chunkSize, total - offset);
  const buffer = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await handle.read(buffer, read, length - read, offset + read);
    if (bytesRead === 0) throw new Error("Le fichier a changé pendant l’envoi.");
    read += bytesRead;
  }
  const token = await context.getAccessToken();
  const response = await fetch(sessionUri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token.value}`,
      "Content-Type": "video/mp4",
      "Content-Length": String(length),
      "Content-Range": `bytes ${offset}-${offset + length - 1}/${total}`,
    },
    body: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    signal: context.signal,
  });
  return interpret(response, total);
}

/** Envoie la vidéo et rend son identifiant chez YouTube. */
export async function uploadVideo(
  context: PublishContext,
  options: YoutubeOptions,
  chunkSize = CHUNK_SIZE
): Promise<{ externalId: string; url: string }> {
  if (chunkSize % (256 * 1024) !== 0) throw new Error("La taille d’un bloc doit être un multiple de 256 Kio.");
  const total = fs.statSync(context.filePath).size;
  if (total === 0) throw new Error("Le fichier à publier est vide.");

  const previous = (context.resume ?? {}) as UploadResume;
  let charged = previous.charged === true;
  let sessionUri = previous.sessionUri && previous.total === total ? previous.sessionUri : undefined;
  // Une session reprise : on demande d'abord à Google où il en est.
  let offset: number | null = sessionUri ? null : 0;
  let failures = 0;

  const save = (bytes: number) => context.saveProgress(sessionUri ? { sessionUri, total, charged } : { charged }, bytes);

  const handle = await fs.promises.open(context.filePath, "r");
  try {
    for (;;) {
      context.signal.throwIfAborted();
      try {
        if (!sessionUri) {
          sessionUri = await openSession(context, options, total, !charged);
          charged = true;
          offset = 0;
          save(0);
        }
        const outcome = offset === null ? await queryStatus(context, sessionUri, total) : await sendChunk(context, handle, sessionUri, offset, total, chunkSize);
        if (outcome.type === "complete") {
          context.saveProgress(undefined, total);
          return { externalId: outcome.id, url: videoUrl(outcome.id) };
        }
        if (outcome.type === "expired") {
          // Session expirée : on repart du début avec une nouvelle session.
          sessionUri = undefined;
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
          throw new Error("Envoi interrompu après plusieurs essais : la connexion avec YouTube ne tient pas. « Reprendre » repartira de là où il s’est arrêté.");
        }
        await context.sleep(RETRY_DELAYS_MS[failures++]);
        // Après une coupure, on ne sait plus ce que Google a reçu : on le lui demande.
        offset = sessionUri ? null : 0;
      }
    }
  } finally {
    await handle.close();
  }
}
