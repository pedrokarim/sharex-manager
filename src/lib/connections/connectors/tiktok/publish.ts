/**
 * Publication d'une vidéo sur TikTok (dossier 07e, § 5).
 *
 * 1. Initialisation : `POST /v2/post/publish/inbox/video/init/` (brouillon,
 *    `video.upload`) ou `POST /v2/post/publish/video/init/` (publication
 *    directe, `video.publish`, après une relecture de `creator_info`), avec
 *    `source_info.source = FILE_UPLOAD`, la taille, la taille d'un morceau et
 *    leur nombre. TikTok rend `publish_id` et une adresse d'envoi valable une
 *    heure.
 * 2. Envoi des morceaux, dans l'ordre, par `PUT` sur cette adresse
 *    (`Content-Range: bytes début-fin/total`) : 206 tant qu'il en manque, 201
 *    à la fin. Chaque morceau est lu sur le disque à son tour, jamais le
 *    fichier entier. Une coupure ou une erreur 5xx fait réessayer le même
 *    morceau ; une adresse expirée (403), inconnue (404) ou un décalage (416)
 *    fait repartir d'une nouvelle initialisation.
 * 3. Suivi : `POST /v2/post/publish/status/fetch/` jusqu'à
 *    `SEND_TO_USER_INBOX` (brouillon livré) ou `PUBLISH_COMPLETE`. Entre deux
 *    lectures, la main est rendue à la file (`PublishPending`).
 *
 * L'état de reprise garde `publish_id`, l'adresse d'envoi et le prochain
 * morceau : après un redémarrage, l'envoi reprend où il en était, sans
 * nouvelle initialisation tant que l'adresse vaut.
 */

import fs from "node:fs";
import type { PublishContext, PublishFileSource, PublishOutcome } from "../../types";
import { ServiceError } from "../../errors";
import { mimeTypeOfName } from "../../limits";
import { TIKTOK_WEB, fetchTiktokUser, profileUrl, tiktokError, tiktokRequest } from "./api";
import { INBOX_NOTE, PRIVACY_LABELS, queryCreatorInfo, readTiktokOptions, type TiktokOptions } from "./options";

/** Morceaux : 5 Mo au moins, 64 Mo au plus, le dernier jusqu'à 128 Mo, 1 à 1 000, dans l'ordre. */
export const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
export const MAX_CHUNKS = 1000;
/** Taille d'un morceau choisie ici : assez petite pour la mémoire, assez grande pour peu d'appels. */
export const CHUNK_BYTES = 10 * 1024 * 1024;
/** L'adresse d'envoi vaut une heure ; on la renouvelle un peu avant. */
export const UPLOAD_URL_TTL_MS = 55 * 60_000;
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];
/** Lecture du statut : toutes les cinq secondes pendant le traitement (30 lectures par minute permises). */
export const STATUS_POLL_MS = 5000;
/** Publication directe faite, adresse publique attendue après la modération : une lecture par minute, quinze au plus. */
export const MODERATION_POLL_MS = 60_000;
export const MODERATION_MAX_POLLS = 15;

export interface ChunkPlan {
  chunkSize: number;
  count: number;
}

/**
 * Découpage demandé par TikTok : un seul morceau (de la taille du fichier)
 * jusqu'à `preferred`, sinon des morceaux de `preferred`, le dernier
 * gardant le reste (`total_chunk_count` = taille ÷ morceau, arrondi en
 * dessous).
 */
export function planChunks(total: number, preferred = CHUNK_BYTES): ChunkPlan {
  if (!Number.isFinite(total) || total <= 0) throw new Error("Le fichier à publier est vide.");
  const size = Math.min(Math.max(preferred, MIN_CHUNK_BYTES), MAX_CHUNK_BYTES);
  if (total <= size) return { chunkSize: total, count: 1 };
  const count = Math.floor(total / size);
  if (count > MAX_CHUNKS) throw new Error("Vidéo trop lourde pour TikTok : 1 000 morceaux au plus.");
  return { chunkSize: size, count };
}

/** Octets du morceau `index` (de 0) : le dernier va jusqu'à la fin du fichier. */
export function chunkRange(plan: ChunkPlan, total: number, index: number): { start: number; end: number } {
  const start = index * plan.chunkSize;
  const end = index === plan.count - 1 ? total - 1 : start + plan.chunkSize - 1;
  return { start, end };
}

/** État de reprise propre à TikTok. */
interface TiktokResume {
  publishId?: string;
  uploadUrl?: string;
  uploadUrlAt?: number;
  total?: number;
  chunkSize?: number;
  count?: number;
  /** Prochain morceau à envoyer. */
  next?: number;
  /** Tous les morceaux sont reçus : il ne reste qu'à suivre le statut. */
  uploaded?: boolean;
  /** Publication comptée dans le quota du compte pour ce travail. */
  charged?: boolean;
  /** Lectures du statut après `PUBLISH_COMPLETE`, en attendant l'adresse publique. */
  moderationPolls?: number;
}

function readResume(context: PublishContext): TiktokResume {
  const resume = (context.resume ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);
  return {
    publishId: text(resume.publishId),
    uploadUrl: text(resume.uploadUrl),
    uploadUrlAt: count(resume.uploadUrlAt),
    total: count(resume.total),
    chunkSize: count(resume.chunkSize),
    count: count(resume.count),
    next: count(resume.next),
    uploaded: resume.uploaded === true,
    charged: resume.charged === true,
    moderationPolls: count(resume.moderationPolls),
  };
}

/** Erreur passagère d'un morceau : on le renvoie après une attente. */
class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

/** L'adresse d'envoi n'est plus utilisable : il faut une nouvelle initialisation. */
class RestartUpload extends Error {}

const isNetworkError = (error: unknown) =>
  error instanceof RetryableError || error instanceof TypeError || (error instanceof Error && /network|socket|ECONN|ETIMEDOUT|EPIPE|fetch failed|terminated/i.test(error.message));

// ─── Initialisation ──────────────────────────────────────────────

async function initUpload(context: PublishContext, options: TiktokOptions, total: number, plan: ChunkPlan, charge: boolean) {
  const sourceInfo = { source: "FILE_UPLOAD", video_size: total, chunk_size: plan.chunkSize, total_chunk_count: plan.count };
  if (options.mode === "inbox") {
    return tiktokRequest<{ publish_id?: string; upload_url?: string }>(context, "/v2/post/publish/inbox/video/init/", {
      method: "POST",
      body: { source_info: sourceInfo },
      ...(charge ? { quotaMethod: "tiktok.inbox" } : {}),
      signal: context.signal,
    });
  }
  // Publication directe : l'état du compte est relu juste avant, comme TikTok le demande.
  const info = await queryCreatorInfo(context);
  if (!options.privacy || !(info.privacy_level_options ?? []).includes(options.privacy)) {
    throw new ServiceError(
      400,
      `TikTok ne propose plus la visibilité « ${options.privacy ? PRIVACY_LABELS[options.privacy] : "?"} » pour ce compte : relisez le compte dans l’écran Publier.`,
      "privacy_level_option_mismatch"
    );
  }
  const maxSeconds = Number(info.max_video_post_duration_sec);
  const durationMs = (context.source as PublishFileSource).durationMs ?? 0;
  if (maxSeconds > 0 && durationMs > maxSeconds * 1000) {
    throw new ServiceError(400, `Vidéo trop longue pour ce compte TikTok : ${maxSeconds} secondes au plus.`, "duration_check_failed");
  }
  return tiktokRequest<{ publish_id?: string; upload_url?: string }>(context, "/v2/post/publish/video/init/", {
    method: "POST",
    body: {
      post_info: {
        ...(options.caption ? { title: options.caption } : {}),
        privacy_level: options.privacy,
        // Une interaction coupée par le compte reste coupée, quoi que dise l'option.
        disable_comment: !options.allowComment || info.comment_disabled === true,
        disable_duet: !options.allowDuet || info.duet_disabled === true,
        disable_stitch: !options.allowStitch || info.stitch_disabled === true,
        brand_content_toggle: options.brandContent,
        brand_organic_toggle: options.brandOrganic,
        is_aigc: options.aigc,
      },
      source_info: sourceInfo,
    },
    ...(charge ? { quotaMethod: "tiktok.direct" } : {}),
    signal: context.signal,
  });
}

// ─── Envoi d'un morceau ──────────────────────────────────────────

async function sendChunk(context: PublishContext, handle: fs.promises.FileHandle, resume: Required<Pick<TiktokResume, "uploadUrl" | "total" | "chunkSize" | "count">>, index: number, contentType: string): Promise<"partial" | "complete"> {
  const { start, end } = chunkRange({ chunkSize: resume.chunkSize, count: resume.count }, resume.total, index);
  const length = end - start + 1;
  const buffer = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await handle.read(buffer, read, length - read, start + read);
    if (bytesRead === 0) throw new Error("Le fichier a changé pendant l’envoi.");
    read += bytesRead;
  }
  const response = await fetch(resume.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(length), "Content-Range": `bytes ${start}-${end}/${resume.total}` },
    body: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    signal: context.signal,
  });
  if (response.status === 201) return "complete";
  if (response.status === 206 || (response.ok && index < resume.count - 1)) return "partial";
  if (response.ok) return "complete";
  if (response.status === 403 || response.status === 404 || response.status === 416) throw new RestartUpload(`Envoi à reprendre depuis le début (HTTP ${response.status}).`);
  if (response.status >= 500 || response.status === 408 || response.status === 429) throw new RetryableError(`Envoi interrompu par TikTok (HTTP ${response.status}).`);
  throw tiktokError(response.status, await response.json().catch(() => null));
}

// ─── Suivi du statut ─────────────────────────────────────────────

const FAIL_REASONS: Record<string, string> = {
  file_format_check_failed: "Format refusé par TikTok (MP4, MOV ou WebM ; H.264, H.265, VP8 ou VP9).",
  duration_check_failed: "Durée refusée par TikTok pour ce compte.",
  frame_rate_check_failed: "Cadence refusée par TikTok : entre 23 et 60 images par seconde.",
  picture_size_check_failed: "Dimensions refusées par TikTok : côtés entre 360 et 4 096 px.",
  internal: "TikTok a rencontré une erreur interne : « Reprendre » renverra la vidéo.",
  video_pull_failed: "TikTok n’a pas pu télécharger la vidéo.",
  publish_cancelled: "La publication a été annulée chez TikTok.",
  auth_removed: "Le compte a retiré l’autorisation de l’application chez TikTok : reconnectez-le.",
  spam_risk_too_many_posts: "Ce compte TikTok a atteint sa limite de publications sur 24 heures.",
  spam_risk_user_banned_from_posting: "TikTok interdit pour l’instant à ce compte de publier par l’API.",
  spam_risk_text: "TikTok a refusé le texte de la publication.",
  spam_risk: "TikTok a refusé la publication (risque d’abus).",
};

interface StatusBody {
  status?: string;
  fail_reason?: string;
  /** Orthographe de l'API. */
  publicaly_available_post_id?: (string | number)[];
  uploaded_bytes?: number;
}

async function followStatus(context: PublishContext, resume: TiktokResume, options: TiktokOptions): Promise<PublishOutcome> {
  const body = await tiktokRequest<StatusBody>(context, "/v2/post/publish/status/fetch/", { method: "POST", body: { publish_id: resume.publishId }, signal: context.signal });
  const status = body.status ?? "";
  if (status === "FAILED") {
    // L'envoi est perdu chez TikTok : « Reprendre » repartira d'une nouvelle initialisation.
    context.saveProgress({ charged: resume.charged }, 0);
    const reason = String(body.fail_reason ?? "");
    throw new ServiceError(422, FAIL_REASONS[reason] ?? `TikTok a refusé la vidéo${reason ? ` (${reason.replace(/[^a-z_]/gi, "").slice(0, 60)})` : ""}.`, reason || undefined);
  }
  if (status === "SEND_TO_USER_INBOX" || (options.mode === "inbox" && status === "PUBLISH_COMPLETE")) {
    context.saveProgress(undefined, context.source.bytes);
    return { externalId: resume.publishId!, url: "", note: INBOX_NOTE };
  }
  if (status === "PUBLISH_COMPLETE") {
    const postId = (body.publicaly_available_post_id ?? []).map(String).find((id) => /^\d+$/.test(id));
    const handle = postId || options.privacy === "SELF_ONLY" || (resume.moderationPolls ?? 0) >= MODERATION_MAX_POLLS ? await usernameOf(context) : undefined;
    if (postId) {
      context.saveProgress(undefined, context.source.bytes);
      return { externalId: postId, url: handle ? `${profileUrl(handle)}/video/${postId}` : `${TIKTOK_WEB}/`, note: "Publiée sur TikTok." };
    }
    // Une vidéo privée n'a jamais d'adresse publique ; une autre l'obtient après la modération.
    const polls = resume.moderationPolls ?? 0;
    if (options.privacy !== "SELF_ONLY" && polls < MODERATION_MAX_POLLS) {
      context.saveProgress({ ...resume, moderationPolls: polls + 1 }, context.source.bytes);
      return { pending: true, retryAfterMs: MODERATION_POLL_MS, note: "Publiée : TikTok la vérifie avant de la montrer, cela peut prendre quelques minutes." };
    }
    context.saveProgress(undefined, context.source.bytes);
    return {
      externalId: resume.publishId!,
      url: handle ? profileUrl(handle) : "",
      note: options.privacy === "SELF_ONLY" ? "Publiée sur TikTok, visible de vous seul." : "Publiée sur TikTok ; son adresse publique n’est pas encore connue (vérification de TikTok en cours).",
    };
  }
  // PROCESSING_UPLOAD, PROCESSING_DOWNLOAD : TikTok traite encore la vidéo.
  return { pending: true, retryAfterMs: STATUS_POLL_MS, note: "TikTok traite la vidéo…" };
}

/** Pseudo du compte, pour l'adresse de la vidéo (absent sans `user.info.profile`). */
async function usernameOf(context: PublishContext): Promise<string | undefined> {
  try {
    const token = await context.getAccessToken();
    return (await fetchTiktokUser(token.value)).username?.trim() || undefined;
  } catch {
    return undefined;
  }
}

// ─── Publication ─────────────────────────────────────────────────

/**
 * Publie (ou reprend) une vidéo : initialisation, morceaux, puis suivi du
 * statut. Sert aussi de `continuePublish` : tout part de l'état de reprise.
 */
export async function publishToTiktok(context: PublishContext, chunkBytes = CHUNK_BYTES): Promise<PublishOutcome> {
  const options = readTiktokOptions(context.options);
  let resume = readResume(context);
  if (resume.publishId && resume.uploaded) return followStatus(context, resume, options);

  const total = fs.statSync(context.filePath).size;
  if (total === 0) throw new Error("Le fichier à publier est vide.");
  const source = context.source as PublishFileSource;
  const contentType = source.mimeType ?? mimeTypeOfName(source.file) ?? "video/mp4";
  const save = (bytes: number) => context.saveProgress({ ...resume }, bytes);

  const handle = await fs.promises.open(context.filePath, "r");
  try {
    let failures = 0;
    for (;;) {
      context.signal.throwIfAborted();
      const fresh = resume.uploadUrl && resume.uploadUrlAt && Date.now() - resume.uploadUrlAt < UPLOAD_URL_TTL_MS && resume.total === total;
      if (!resume.publishId || !fresh) {
        const plan = planChunks(total, chunkBytes);
        const init = await initUpload(context, options, total, plan, !resume.charged);
        if (!init.publish_id || !init.upload_url?.startsWith("https://")) throw new Error("TikTok n’a pas ouvert d’envoi.");
        resume = { publishId: init.publish_id, uploadUrl: init.upload_url, uploadUrlAt: Date.now(), total, chunkSize: plan.chunkSize, count: plan.count, next: 0, charged: true };
        save(0);
      }
      const current = { uploadUrl: resume.uploadUrl!, total, chunkSize: resume.chunkSize!, count: resume.count! };
      try {
        let index = resume.next ?? 0;
        let outcome: "partial" | "complete" = "partial";
        while (index < current.count) {
          context.signal.throwIfAborted();
          outcome = await sendChunk(context, handle, current, index, contentType);
          index += 1;
          failures = 0;
          resume = { ...resume, next: index };
          save(Math.min(chunkRange(current, total, index - 1).end + 1, total));
          if (outcome === "complete") break;
        }
        resume = { ...resume, uploaded: true, uploadUrl: undefined };
        save(total);
        break;
      } catch (error) {
        if (error instanceof RestartUpload) {
          // Adresse expirée ou envoi perdu chez TikTok : nouvelle initialisation, sans recompter le quota.
          resume = { charged: resume.charged };
          save(0);
          if (failures++ >= RETRY_DELAYS_MS.length) throw new Error("TikTok refuse l’envoi après plusieurs essais : « Reprendre » repartira du début.");
          continue;
        }
        if (!isNetworkError(error)) throw error;
        if (failures >= RETRY_DELAYS_MS.length) {
          throw new Error("Envoi interrompu après plusieurs essais : la connexion avec TikTok ne tient pas. « Reprendre » repartira du dernier morceau reçu.");
        }
        await context.sleep(RETRY_DELAYS_MS[failures++]);
      }
    }
  } finally {
    await handle.close();
  }
  // Le traitement commence chez TikTok : première lecture du statut peu après.
  return { pending: true, retryAfterMs: STATUS_POLL_MS, note: options.mode === "inbox" ? "Vidéo reçue : TikTok la prépare pour la boîte de réception…" : "Vidéo reçue : TikTok la traite…" };
}
