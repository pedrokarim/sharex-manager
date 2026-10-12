/**
 * Envoi d'une vidéo de Page par morceaux (dossier 07a, § 5.3), avec le jeton
 * de Page, d'après la référence v26.0 de `POST /{page-id}/videos` :
 *
 * 1. `upload_phase=start` et `file_size` → `upload_session_id`, `video_id`,
 *    `start_offset`, `end_offset` ;
 * 2. `upload_phase=transfer` : le morceau `[start_offset, end_offset)` lu sur
 *    le disque, en `video_file_chunk` ; Facebook rend le morceau suivant,
 *    jusqu'à `start_offset == end_offset` ;
 * 3. `upload_phase=finish` avec titre, description, publication, brouillon ou
 *    programmation.
 *
 * Reprise : le morceau qui commence au dernier `start_offset` enregistré est
 * renvoyé ; l'erreur 1363037 (« décalage invalide ») porte le bon décalage ;
 * 1363041 (session expirée) fait repartir du début.
 *
 * La voie que le guide de Meta met en avant (Resumable Upload API) exige un
 * jeton utilisateur, qui expire au bout de 60 jours : elle n'est pas employée.
 */

import fs from "fs";
import type { PublishContext } from "../../types";
import { type FacebookOptions, scheduleFor } from "./metadata";
import { GraphError, RETRY_DELAYS_MS, authFromContext, graphRequest, isRetryable } from "./graph";
import { videoAddress } from "./reels";

/** État de reprise d'une vidéo de Page, rangé par la file. */
export interface VideoResume {
  kind: "video";
  total: number;
  sessionId?: string;
  videoId?: string;
  startOffset?: number;
  endOffset?: number;
  finishing?: boolean;
}

interface PhaseBody {
  upload_session_id?: string | number;
  video_id?: string | number;
  start_offset?: string | number;
  end_offset?: string | number;
  success?: boolean;
}

const OFFSET_INVALID = 1363037;
const SESSION_EXPIRED = 1363041;

/** Décalages portés par une erreur 1363037 (objet, ou chaîne JSON). */
function offsetsFromError(error: GraphError): { start: number; end: number } | null {
  let data = error.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const fields = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const start = Number(fields.start_offset);
  const end = Number(fields.end_offset);
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

const isCode = (error: unknown, code: number) => error instanceof GraphError && (error.code === code || error.subcode === code);

async function readChunk(handle: fs.promises.FileHandle, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
  const length = end - start;
  const buffer = new Uint8Array(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await handle.read(buffer, read, length - read, start + read);
    if (bytesRead === 0) throw new Error("Le fichier a changé pendant l’envoi.");
    read += bytesRead;
  }
  return buffer;
}

/** Publie une vidéo sur la Page et rend son identifiant chez Facebook. */
export async function publishPageVideo(context: PublishContext, options: FacebookOptions): Promise<{ externalId: string; url: string }> {
  const total = fs.statSync(context.filePath).size;
  if (total === 0) throw new Error("Le fichier à publier est vide.");
  const previous = context.resume?.kind === "video" && context.resume.total === total ? (context.resume as unknown as VideoResume) : null;
  const resume: VideoResume = previous ? { ...previous } : { kind: "video", total };
  const path = `${encodeURIComponent(context.externalId)}/videos`;
  const save = () => context.saveProgress({ ...resume }, resume.finishing ? total : (resume.startOffset ?? 0));
  let failures = 0;
  let restarts = 0;

  const handle = await fs.promises.open(context.filePath, "r");
  try {
    while (!resume.finishing) {
      context.signal.throwIfAborted();
      try {
        if (!resume.sessionId) {
          const auth = await authFromContext(context);
          const body = await graphRequest<PhaseBody>(auth, path, { method: "POST", params: { upload_phase: "start", file_size: total }, signal: context.signal });
          if (!body.upload_session_id || !body.video_id) throw new Error("Facebook n’a pas ouvert d’envoi de vidéo.");
          resume.sessionId = String(body.upload_session_id);
          resume.videoId = String(body.video_id);
          resume.startOffset = Number(body.start_offset ?? 0);
          resume.endOffset = Number(body.end_offset ?? total);
          save();
        }
        const start = resume.startOffset ?? 0;
        const end = Math.min(resume.endOffset ?? total, total);
        if (start >= end) {
          resume.finishing = true;
          save();
          break;
        }
        const chunk = await readChunk(handle, start, end);
        const form = new FormData();
        form.set("upload_phase", "transfer");
        form.set("upload_session_id", resume.sessionId);
        form.set("start_offset", String(start));
        form.set("video_file_chunk", new Blob([chunk], { type: "application/octet-stream" }), "chunk");
        const auth = await authFromContext(context);
        const body = await graphRequest<PhaseBody>(auth, path, { method: "POST", form, signal: context.signal });
        resume.startOffset = Number(body.start_offset);
        resume.endOffset = Number(body.end_offset);
        if (!Number.isFinite(resume.startOffset) || !Number.isFinite(resume.endOffset)) throw new Error("Facebook n’a pas rendu la suite de l’envoi.");
        if (resume.startOffset > start) failures = 0;
        save();
      } catch (error) {
        if (isCode(error, OFFSET_INVALID)) {
          const offsets = offsetsFromError(error as GraphError);
          if (offsets && failures < RETRY_DELAYS_MS.length) {
            failures += 1;
            resume.startOffset = offsets.start;
            resume.endOffset = offsets.end;
            save();
            continue;
          }
        }
        if (isCode(error, SESSION_EXPIRED)) {
          if (++restarts > 2) throw new Error("Facebook a fermé la session d’envoi plusieurs fois : réessayez plus tard.");
          resume.sessionId = undefined;
          resume.videoId = undefined;
          resume.startOffset = 0;
          resume.endOffset = undefined;
          save();
          continue;
        }
        if (!isRetryable(error)) throw error;
        if (failures >= RETRY_DELAYS_MS.length) {
          throw new Error("Envoi de la vidéo interrompu après plusieurs essais : la connexion avec Facebook ne tient pas. « Reprendre » repartira de là où il s’est arrêté.");
        }
        await context.sleep(RETRY_DELAYS_MS[failures++]);
      }
    }
  } finally {
    await handle.close();
  }

  const schedule = scheduleFor(options);
  const draft = options.privacy === "private";
  for (let attempt = 0; ; attempt += 1) {
    try {
      const auth = await authFromContext(context);
      await graphRequest<PhaseBody>(auth, path, {
        method: "POST",
        params: {
          upload_phase: "finish",
          upload_session_id: resume.sessionId,
          title: options.title,
          description: options.description,
          published: draft || schedule ? false : undefined,
          scheduled_publish_time: !draft && schedule ? schedule : undefined,
          unpublished_content_type: draft ? "DRAFT" : schedule ? "SCHEDULED" : undefined,
        },
        signal: context.signal,
      });
      break;
    } catch (error) {
      if (!isRetryable(error) || attempt >= RETRY_DELAYS_MS.length - 1) throw error;
      await context.sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  context.saveProgress(undefined, total);
  return { externalId: resume.videoId!, url: await videoAddress(context, resume.videoId!) };
}
