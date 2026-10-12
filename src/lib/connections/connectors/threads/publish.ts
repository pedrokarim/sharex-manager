/**
 * Publication Threads par conteneur (dossier 07c, § 5).
 *
 * Threads ne reçoit jamais le fichier : il le télécharge depuis un lien
 * public temporaire de l'instance. Toute publication suit deux étapes :
 *
 * 1. `POST /<profil>/threads` crée un conteneur (texte, image ou vidéo) ;
 * 2. une fois le conteneur prêt (`FINISHED`), `POST /<profil>/threads_publish`
 *    le publie. Cet appel n'est pas rejouable : avant de le refaire, on relit
 *    toujours l'état du conteneur (`PUBLISHED` : déjà fait).
 *
 * Meta conseille d'attendre une trentaine de secondes avant de publier, et
 * d'interroger l'état une fois par minute, cinq minutes au plus. Entre deux
 * lectures, la main est rendue à la file (`PublishPending`), qui passe au
 * travail suivant et rappelle `publish` à l'heure dite. L'état de reprise
 * (`saveProgress`) garde l'identifiant du conteneur et les lectures déjà
 * faites : après un redémarrage, on reprend où l'on en était, sans doublon.
 */

import fs from "node:fs";
import { isPublishPending, type PublishContext, type PublishFileSource, type PublishOutcome, type PublishPending } from "../../types";
import { QuotaExceededError, ReconnectRequiredError } from "../../errors";
import { mimeTypeOfName } from "../../limits";
import { THREADS_WEB, getThreadsMedia, mediaUrl, readPublishingLimit, recentThreadsMedia, threadsRequest } from "./api";
import { IMAGE_MAX_BYTES, IMAGE_MAX_WIDTH, IMAGE_MIME_TYPES, publishedText, readThreadsOptions, type ThreadsOptions } from "./options";

/** Attente conseillée avant la première lecture de l'état d'un média. */
export const FIRST_WAIT_MS = 30_000;
/** Lecture de l'état : une fois par minute. */
export const POLL_INTERVAL_MS = 60_000;
/** Lecture de l'état d'un message seul : il n'y a rien à traiter, on repasse vite. */
export const TEXT_POLL_INTERVAL_MS = 5_000;
/** Lectures au plus : cinq minutes (recommandation de Meta), dix pour une vidéo. */
const MAX_POLLS = { text: 6, image: 5, video: 10 } as const;
/** Une publication retrouvée doit dater d'après la création du conteneur, à deux minutes près. */
const CLOCK_SKEW_MS = 2 * 60 * 1000;

type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED";

/** État de reprise propre à Threads. */
interface ThreadsResume {
  containerId?: string;
  /** Création du conteneur (millisecondes), pour retrouver la publication. */
  createdAt?: number;
  /** Lien public servi à Threads pour ce conteneur. */
  linkId?: string;
  /** Identifiant de la publication, dès que `threads_publish` l'a rendu. */
  mediaId?: string;
  /** Lectures de l'état déjà faites pendant le traitement de ce conteneur. */
  polls?: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  FAILED_DOWNLOADING_VIDEO: "Threads n’a pas pu télécharger le fichier.",
  FAILED_PROCESSING_AUDIO: "Threads n’a pas pu traiter le son de la vidéo (AAC, 48 kHz au plus, mono ou stéréo).",
  FAILED_PROCESSING_VIDEO: "Threads n’a pas pu traiter la vidéo (MP4 ou MOV, H.264 ou HEVC).",
  INVALID_ASPEC_RATIO: "Format refusé par Threads : le rapport largeur / hauteur doit rester entre 0,01:1 et 10:1.",
  INVALID_BIT_RATE: "Débit refusé par Threads : 100 Mb/s au plus pour l’image, 128 kb/s pour le son.",
  INVALID_DURATION: "Durée refusée par Threads : cinq minutes au plus.",
  INVALID_FRAME_RATE: "Cadence refusée par Threads : entre 23 et 60 images par seconde.",
  INVALID_AUDIO_CHANNELS: "Son refusé par Threads : mono ou stéréo seulement.",
  INVALID_AUDIO_CHANNEL_LAYOUT: "Disposition des canaux du son refusée par Threads.",
  UNKNOWN: "Threads a refusé le média sans en donner la raison.",
};

function readResume(context: PublishContext): ThreadsResume {
  const resume = context.resume ?? {};
  const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  return {
    containerId: text(resume.containerId),
    createdAt: typeof resume.createdAt === "number" ? resume.createdAt : undefined,
    linkId: text(resume.linkId),
    mediaId: text(resume.mediaId),
    polls: typeof resume.polls === "number" && resume.polls > 0 ? resume.polls : undefined,
  };
}

function throwIfAborted(context: PublishContext) {
  if (context.signal.aborted) throw new DOMException("Publication annulée", "AbortError");
}

/** Octets déjà lus par Threads sur le lien public, pour la progression. */
function bytesRead(context: PublishContext, linkId?: string): number {
  if (!linkId) return 0;
  const read = context.publicLinkAccesses(linkId).reduce((sum, access) => sum + (access.method === "GET" ? access.bytes : 0), 0);
  return Math.min(read, context.source.bytes);
}

// ─── Fichier servi à Threads ──────────────────────────────────────

/**
 * Convertit une image en JPEG sRGB de 1 440 px de large au plus et de 8 Mo
 * au plus, qualité réduite par paliers si besoin. Rend le poids obtenu.
 */
export async function convertImageToJpeg(input: string, output: string, maxBytes = IMAGE_MAX_BYTES): Promise<number> {
  const { default: sharp } = await import("sharp");
  for (const quality of [90, 82, 74, 66, 58, 50]) {
    await sharp(input, { animated: false })
      .rotate()
      .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
      // Le JPEG n'a pas de transparence : fond blanc, comme Threads l'afficherait.
      .flatten({ background: "#ffffff" })
      .toColorspace("srgb")
      .jpeg({ quality, mozjpeg: true })
      .toFile(output);
    const size = fs.statSync(output).size;
    if (size <= maxBytes) return size;
  }
  throw new Error("Image trop lourde pour Threads, même convertie en JPEG : 8 Mo au plus.");
}

/** Lien public vers le fichier à publier ; une image hors format ou trop lourde est d'abord convertie. */
async function linkForMedia(context: PublishContext): Promise<{ url: string; id: string }> {
  const source = context.source as PublishFileSource;
  if (source.kind === "image") {
    const mime = source.mimeType ?? mimeTypeOfName(source.file);
    const size = fs.statSync(context.filePath).size;
    if (!mime || !IMAGE_MIME_TYPES.includes(mime) || size > IMAGE_MAX_BYTES) {
      const derived = context.tempFile("jpg");
      await convertImageToJpeg(context.filePath, derived);
      return context.publicLink(undefined, { derivedFile: derived, contentType: "image/jpeg" });
    }
  }
  return context.publicLink();
}

// ─── Conteneur ────────────────────────────────────────────────────

/** Paramètres de création du conteneur. */
export function containerParams(context: PublishContext, options: ThreadsOptions, mediaUrlValue?: string): Record<string, string | boolean | undefined> {
  const source = context.source;
  const text = publishedText(source, options);
  if (source.kind === "text") {
    return { media_type: "TEXT", text, topic_tag: options.topicTag, link_attachment: options.linkAttachment };
  }
  const media = source.kind === "video" ? { media_type: "VIDEO", video_url: mediaUrlValue } : { media_type: "IMAGE", image_url: mediaUrlValue };
  return {
    ...media,
    text: text || undefined,
    topic_tag: options.topicTag,
    alt_text: options.altText,
    ...(options.spoiler ? { is_spoiler_media: true } : {}),
  };
}

async function containerStatus(context: PublishContext, containerId: string): Promise<{ status: ContainerStatus; errorMessage?: string }> {
  const body = await threadsRequest<{ status?: string; error_message?: string }>(context, "threads.status", encodeURIComponent(containerId), {
    query: { fields: "id,status,error_message" },
  });
  const status = (["IN_PROGRESS", "FINISHED", "PUBLISHED", "ERROR", "EXPIRED"] as const).find((value) => value === body?.status) ?? "IN_PROGRESS";
  return { status, errorMessage: body?.error_message };
}

/** Message d'un conteneur refusé ; un fichier jamais lu désigne le proxy plutôt que le média. */
function containerFailure(context: PublishContext, resume: ThreadsResume, code?: string): Error {
  const known = code ? ERROR_MESSAGES[code] : undefined;
  const neverRead = resume.linkId && context.publicLinkAccesses(resume.linkId).length === 0;
  if (code === "FAILED_DOWNLOADING_VIDEO" || (!known && neverRead)) {
    return new Error(
      neverRead
        ? "Threads n’a jamais pu lire le fichier : l’adresse publique de l’instance (/api/connections/media/) doit être joignable depuis Internet, sans défi anti-robots."
        : "Threads n’a pas pu télécharger le fichier jusqu’au bout : réessayez."
    );
  }
  return new Error(known ?? `Threads a refusé le média${code ? ` (${code.replace(/[^A-Z_]/g, "").slice(0, 60)})` : ""}.`);
}

/**
 * La publication de ce conteneur existe-t-elle déjà ? La lecture d'un
 * conteneur ne rend pas l'identifiant de la publication : on la cherche parmi
 * les publications récentes du profil, au même texte et au même type.
 */
async function findPublished(context: PublishContext, resume: ThreadsResume): Promise<{ externalId: string; url: string } | null> {
  const createdAt = resume.createdAt ?? Date.now() - 24 * 60 * 60 * 1000;
  const expectedText = publishedText(context.source, readThreadsOptions(context.options)).replace(/\s+/g, " ").trim();
  const expectedType = context.source.kind === "text" ? "TEXT_POST" : context.source.kind === "video" ? "VIDEO" : "IMAGE";
  const candidates = (await recentThreadsMedia(context, (createdAt - CLOCK_SKEW_MS) / 1000))
    .filter((media) => media?.id && media.media_type === expectedType)
    .filter((media) => (media.text ?? "").replace(/\s+/g, " ").trim() === expectedText)
    .sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")));
  const match = candidates[0];
  return match ? { externalId: String(match.id), url: mediaUrl(match) } : null;
}

/** Adresse de la publication obtenue. */
async function resultFor(context: PublishContext, mediaId: string): Promise<{ externalId: string; url: string }> {
  try {
    return { externalId: mediaId, url: mediaUrl(await getThreadsMedia(context, mediaId)) };
  } catch {
    // La publication existe : une adresse approximative vaut mieux qu'un échec.
    return { externalId: mediaId, url: THREADS_WEB };
  }
}

/** Vérifie le budget réel de publication du profil chez Threads (250 sur 24 heures glissantes). */
async function assertPublishingBudget(context: PublishContext) {
  let limit: { used: number; total: number } | null = null;
  try {
    limit = await readPublishingLimit(context);
  } catch (error) {
    if (error instanceof QuotaExceededError || error instanceof ReconnectRequiredError) throw error;
    // Lecture impossible : le compte local du cœur et Threads lui-même trancheront.
    return;
  }
  if (limit && limit.used >= limit.total) {
    throw new QuotaExceededError(
      `Threads : ${limit.used} publications sur ${limit.total} permises en 24 heures pour ce profil. La publication reprendra d’elle-même.`,
      Date.now() + 60 * 60 * 1000,
      "posts",
      "account"
    );
  }
}

/** Crée le conteneur et range son identifiant dans l'état de reprise. */
async function createContainer(context: PublishContext, options: ThreadsOptions): Promise<ThreadsResume> {
  await assertPublishingBudget(context);
  throwIfAborted(context);
  let link: { url: string; id: string } | undefined;
  if (context.source.kind !== "text") link = await linkForMedia(context);
  const body = await threadsRequest<{ id?: string }>(context, "threads.create", `${encodeURIComponent(context.externalId)}/threads`, {
    method: "POST",
    form: containerParams(context, options, link?.url),
  });
  if (!body?.id) throw new Error("Threads n’a pas rendu d’identifiant de conteneur.");
  const resume: ThreadsResume = { containerId: String(body.id), createdAt: Date.now(), linkId: link?.id };
  context.saveProgress({ ...resume }, 0);
  return resume;
}

/** Rend la main à la file pendant le traitement : elle rappellera `publish` dans `ms`. */
function later(context: PublishContext, resume: ThreadsResume, ms: number): PublishPending {
  context.saveProgress({ ...resume }, bytesRead(context, resume.linkId));
  return { pending: true, retryAfterMs: ms, note: "Threads traite le média avant de le publier." };
}

/**
 * État du conteneur une fois prêt (`FINISHED`), `PUBLISHED` s'il l'est déjà.
 * Encore en traitement : la main est rendue à la file (`PublishPending`),
 * les lectures faites sont comptées dans l'état de reprise.
 */
async function waitForContainer(
  context: PublishContext,
  resume: ThreadsResume,
  fresh: boolean
): Promise<"FINISHED" | "PUBLISHED" | "EXPIRED" | PublishPending> {
  const kind = context.source.kind === "text" ? "text" : context.source.kind === "video" ? "video" : "image";
  const interval = kind === "text" ? TEXT_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
  if (fresh && kind !== "text") return later(context, resume, FIRST_WAIT_MS);
  throwIfAborted(context);
  const { status, errorMessage } = await containerStatus(context, resume.containerId!);
  if (status === "FINISHED" || status === "PUBLISHED" || status === "EXPIRED") {
    resume.polls = undefined;
    return status;
  }
  if (status === "ERROR") {
    const failure = containerFailure(context, resume, errorMessage);
    // Conteneur perdu : un nouvel essai repartira du début.
    context.saveProgress(undefined, 0);
    throw failure;
  }
  const polls = (resume.polls ?? 0) + 1;
  if (polls >= MAX_POLLS[kind]) {
    // « Réessayer » reprendra une attente complète, avec le même conteneur.
    resume.polls = undefined;
    context.saveProgress({ ...resume }, bytesRead(context, resume.linkId));
    throw new Error("Threads traite encore le média : réessayez plus tard, le conteneur reste valable 24 heures.");
  }
  resume.polls = polls;
  return later(context, resume, interval);
}

/** Publie le contenu du travail sur Threads ; voir l'en-tête du fichier. */
export async function publishToThreads(context: PublishContext): Promise<PublishOutcome> {
  if (context.source.kind === "carousel") throw new Error("Threads : la publication d’un carrousel n’est pas encore prise en charge.");
  const options = readThreadsOptions(context.options);
  let resume = readResume(context);

  // Publication déjà obtenue : il ne manquait que son adresse.
  if (resume.mediaId) return resultFor(context, resume.mediaId);

  let fresh = false;
  if (!resume.containerId) {
    resume = await createContainer(context, options);
    fresh = true;
  }

  let status = await waitForContainer(context, resume, fresh);
  if (status === "EXPIRED") {
    // Non publié en 24 heures : on recrée le conteneur (et le lien public).
    context.revokePublicUrls(resume.linkId);
    resume = await createContainer(context, options);
    status = await waitForContainer(context, resume, true);
    if (status === "EXPIRED") throw new Error("Le conteneur Threads a expiré aussitôt créé : réessayez plus tard.");
  }
  // Encore en traitement : la file reviendra, l'état de reprise est enregistré.
  if (isPublishPending(status)) return status;

  if (status === "PUBLISHED") {
    const found = await findPublished(context, resume);
    if (found) return found;
    throw new Error("Threads indique que cette publication a déjà été faite, mais elle est introuvable sur le profil : vérifiez sur Threads avant de réessayer.");
  }

  // Prêt : Threads a fini de lire le fichier, le lien public peut se fermer.
  if (resume.linkId) context.revokePublicUrls(resume.linkId);
  context.saveProgress({ ...resume }, context.source.bytes);
  throwIfAborted(context);
  const published = await threadsRequest<{ id?: string }>(context, "threads_publish", `${encodeURIComponent(context.externalId)}/threads_publish`, {
    method: "POST",
    form: { creation_id: resume.containerId },
  });
  if (!published?.id) throw new Error("Threads n’a pas rendu l’identifiant de la publication.");
  const mediaId = String(published.id);
  context.saveProgress({ ...resume, mediaId }, context.source.bytes);
  return resultFor(context, mediaId);
}

/**
 * Avant de republier un travail déjà tenté : la publication existe-t-elle ?
 * Seul un conteneur publié compte ; un conteneur en cours ou prêt est repris
 * par `publishToThreads`.
 */
export async function findExistingThreadsPost(context: PublishContext): Promise<{ externalId: string; url: string } | null> {
  const resume = readResume(context);
  if (resume.mediaId) return resultFor(context, resume.mediaId);
  if (!resume.containerId || context.source.kind === "carousel") return null;
  const { status } = await containerStatus(context, resume.containerId);
  return status === "PUBLISHED" ? findPublished(context, resume) : null;
}
