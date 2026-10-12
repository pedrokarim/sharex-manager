/**
 * Premier commentaire Threads : une réponse du profil à sa propre
 * publication (dossier 01 ter, § 6 ; dossier 07c).
 *
 * D'après la documentation de l'API Threads (vérifiée le 12/10/2026) :
 * - une réponse est un conteneur comme un autre (`POST /me/threads`,
 *   `media_type=TEXT`, `text`, `reply_to_id` = la publication), publié par
 *   `POST /<profil>/threads_publish` ; Meta conseille d'attendre une
 *   trentaine de secondes avant de publier un conteneur ;
 * - le guide « Retrieve and Manage Replies » demande `threads_manage_replies`
 *   pour les appels POST sur les réponses, alors que la page « Create
 *   Replies » se contente d'être l'auteur de la publication d'origine : on
 *   demande la portée, par prudence ;
 * - 1 000 réponses par profil sur 24 heures glissantes (`reply_config` de
 *   `threads_publishing_limit`) ; le texte suit la limite d'une publication,
 *   500 caractères.
 *
 * Le conteneur est rangé dans l'état de reprise : un nouveau passage relit
 * son état avant de publier, jamais de réponse en double.
 */

import type { FollowUpContext, FollowUpOutcome } from "../../types";
import { THREADS_WEB, getThreadsMedia, mediaUrl, threadsRequest } from "./api";

/** Une réponse publiée compte dans le quota des réponses (1 000 sur 24 heures). */
export const REPLY_QUOTA_METHOD = "threads_reply";
/** Lecture de l'état d'un conteneur de texte : rien à traiter, on repasse vite. */
const TEXT_POLL_MS = 5_000;
const MAX_POLLS = 12;

interface ReplyResume {
  containerId?: string;
  polls?: number;
  replyId?: string;
}

async function replyResult(context: FollowUpContext, replyId: string): Promise<FollowUpOutcome> {
  try {
    return { externalId: replyId, url: mediaUrl(await getThreadsMedia(context, replyId)) };
  } catch {
    return { externalId: replyId, url: context.result.url || THREADS_WEB };
  }
}

/** Réponse du profil à sa propre publication. */
export async function postThreadsReply(context: FollowUpContext, text: string): Promise<FollowUpOutcome> {
  const resume: ReplyResume = { ...((context.resume ?? {}) as ReplyResume) };
  if (resume.replyId) return replyResult(context, resume.replyId);

  if (!resume.containerId) {
    const body = await threadsRequest<{ id?: string }>(context, "threads.create", "me/threads", {
      method: "POST",
      form: { media_type: "TEXT", text, reply_to_id: context.result.externalId },
    });
    if (!body?.id) throw new Error("Threads n’a pas rendu d’identifiant de conteneur pour la réponse.");
    resume.containerId = String(body.id);
    resume.polls = 0;
    context.saveProgress({ ...resume });
  }

  const status = await threadsRequest<{ status?: string; error_message?: string }>(context, "threads.status", encodeURIComponent(resume.containerId), {
    query: { fields: "id,status,error_message" },
  });
  if (status?.status === "PUBLISHED") {
    // Publié lors d'un passage dont la réponse s'est perdue : l'identifiant n'est pas relu.
    context.saveProgress(undefined);
    return { url: context.result.url, note: "Réponse publiée ; son identifiant n’a pas pu être relu." };
  }
  if (status?.status === "ERROR" || status?.status === "EXPIRED") {
    // Conteneur perdu : le prochain passage en recrée un.
    context.saveProgress(undefined);
    throw new Error(`Threads a refusé la réponse${status.error_message ? ` (${String(status.error_message).replace(/[^A-Z_]/g, "").slice(0, 60)})` : ""}.`);
  }
  if (status?.status !== "FINISHED") {
    const polls = (resume.polls ?? 0) + 1;
    if (polls > MAX_POLLS) {
      context.saveProgress(undefined);
      throw new Error("Threads traite encore la réponse : nouvel essai plus tard.");
    }
    context.saveProgress({ ...resume, polls });
    return { pending: true, retryAfterMs: TEXT_POLL_MS, note: "Threads prépare la réponse." };
  }

  const published = await threadsRequest<{ id?: string }>(context, REPLY_QUOTA_METHOD, `${encodeURIComponent(context.externalId)}/threads_publish`, {
    method: "POST",
    form: { creation_id: resume.containerId },
  });
  if (!published?.id) throw new Error("Threads n’a pas rendu l’identifiant de la réponse.");
  const replyId = String(published.id);
  context.saveProgress({ ...resume, replyId });
  return replyResult(context, replyId);
}
