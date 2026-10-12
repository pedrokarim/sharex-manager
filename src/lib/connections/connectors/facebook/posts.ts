/**
 * Photos, messages et gestion des publications d'une Page (dossier 07a, § 6,
 * § 5.4 et § 9).
 *
 * - Photo : `POST /{page-id}/photos`, fichier en `multipart/form-data` ; plus
 *   de 4 Mo, ou un format que Facebook ne prend pas, et l'image est réencodée
 *   en JPEG par `sharp` dans un fichier temporaire du cœur.
 * - Message : `POST /{page-id}/feed` avec `message` et `link`.
 * - Liste : `GET /{page-id}/published_posts`, 100 au plus par appel.
 * - Modification : seulement le texte, et seulement d'une publication créée
 *   par l'application (règle de Meta) ; suppression : `DELETE /{id}`.
 */

import fs from "fs";
import type { ConnectorContext, PostPatch, PostSummary, ProcessingStatus, PublishContext } from "../../types";
import { mimeTypeOfName } from "../../limits";
import { type FacebookOptions, MESSAGE_MAX_CHARS, PHOTO_MAX_BYTES, scheduleFor } from "./metadata";
import { authFromContext, facebookUrl, graphRequest } from "./graph";
import { type VideoStatusBody, readVideoStatus, videoAddress } from "./reels";

/** Formats que Facebook reçoit tels quels (référence de `/{page-id}/photos`). */
const DIRECT_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/bmp", "image/tiff"]);
const JPEG_QUALITIES = [90, 82, 74, 66];
const RESIZE_WIDTHS = [4096, 3072, 2048];

/** État de reprise d'une photo ou d'un message : l'heure de l'appel, pour retrouver la publication. */
export interface PostResume {
  kind: "post";
  startedAt: number;
  message: string;
}

/** Image prête à envoyer : le fichier d'origine, ou une copie JPEG de moins de 4 Mo. */
export async function preparePhoto(context: PublishContext): Promise<{ path: string; type: string }> {
  const source = context.source;
  const type = (source.kind === "image" && (source.mimeType ?? mimeTypeOfName(source.file))) || "application/octet-stream";
  const size = fs.statSync(context.filePath).size;
  if (size <= PHOTO_MAX_BYTES && DIRECT_PHOTO_TYPES.has(type)) return { path: context.filePath, type };

  const { default: sharp } = await import("sharp");
  const output = context.tempFile("jpg");
  for (const width of [undefined, ...RESIZE_WIDTHS]) {
    for (const quality of JPEG_QUALITIES) {
      let pipeline = sharp(context.filePath, { animated: false }).rotate();
      if (width) pipeline = pipeline.resize({ width, height: width, fit: "inside", withoutEnlargement: true });
      // Fond blanc : la transparence n'existe pas en JPEG.
      await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality }).toFile(output);
      if (fs.statSync(output).size <= PHOTO_MAX_BYTES) return { path: output, type: "image/jpeg" };
    }
  }
  throw new Error("Impossible de ramener l’image sous 4 Mo, la limite de Facebook.");
}

/** Publie une photo sur la Page ; rend l'identifiant de la publication. */
export async function publishPhoto(context: PublishContext, options: FacebookOptions): Promise<{ externalId: string; url: string }> {
  const photo = await preparePhoto(context);
  const bytes = await fs.promises.readFile(photo.path);
  const schedule = scheduleFor(options);
  const form = new FormData();
  form.set("source", new Blob([new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)], { type: photo.type }), photo.type === "image/jpeg" ? "photo.jpg" : "photo");
  const message = options.description ?? "";
  context.saveProgress({ kind: "post", startedAt: Date.now(), message } satisfies PostResume, 0);
  const auth = await authFromContext(context);
  const body = await graphRequest<{ id?: string | number; post_id?: string | number }>(auth, `${encodeURIComponent(context.externalId)}/photos`, {
    method: "POST",
    form,
    params: {
      caption: message || undefined,
      published: schedule ? false : undefined,
      scheduled_publish_time: schedule ?? undefined,
    },
    signal: context.signal,
  });
  const id = body.post_id ?? body.id;
  if (id === undefined) throw new Error("Facebook n’a pas rendu l’identifiant de la photo.");
  context.saveProgress(undefined, context.source.bytes);
  return { externalId: String(id), url: facebookUrl(String(id)) };
}

/** Publie un message (avec un lien facultatif) ; rend l'identifiant de la publication. */
export async function publishText(context: PublishContext, options: FacebookOptions): Promise<{ externalId: string; url: string }> {
  if (context.source.kind !== "text") throw new Error("Un message est attendu.");
  const message = context.source.text.trim();
  const schedule = scheduleFor(options);
  context.saveProgress({ kind: "post", startedAt: Date.now(), message } satisfies PostResume, 0);
  const auth = await authFromContext(context);
  const body = await graphRequest<{ id?: string | number }>(auth, `${encodeURIComponent(context.externalId)}/feed`, {
    method: "POST",
    params: {
      message,
      link: options.link,
      published: schedule ? false : undefined,
      scheduled_publish_time: schedule ?? undefined,
    },
    signal: context.signal,
  });
  if (body.id === undefined) throw new Error("Facebook n’a pas rendu l’identifiant de la publication.");
  context.saveProgress(undefined, 0);
  return { externalId: String(body.id), url: facebookUrl(String(body.id)) };
}

// ─── Lecture et gestion ───────────────────────────────────────────

interface PostEntry {
  id?: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  is_published?: boolean;
  scheduled_publish_time?: number | string;
}

const POST_FIELDS = "id,message,created_time,permalink_url,full_picture,status_type,is_published,scheduled_publish_time";

function toPost(entry: PostEntry): PostSummary {
  const message = entry.message ?? "";
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  const scheduled = Number(entry.scheduled_publish_time);
  return {
    id: String(entry.id),
    title: firstLine.length > 100 ? `${firstLine.slice(0, 99)}…` : firstLine,
    description: message,
    tags: [],
    thumbnailUrl: entry.full_picture?.startsWith("https://") ? entry.full_picture : undefined,
    url: facebookUrl(entry.permalink_url || String(entry.id)),
    privacy: entry.is_published === false ? "private" : "public",
    publishedAt: entry.created_time ? new Date(entry.created_time).toISOString() : undefined,
    publishAt: scheduled > 0 ? new Date(scheduled * 1000).toISOString() : undefined,
  };
}

/** Dernières publications de la Page (50 par défaut, 100 au plus par appel). */
export async function listPagePosts(context: ConnectorContext, limit = 50): Promise<PostSummary[]> {
  context.chargeQuota("published_posts.list");
  const auth = await authFromContext(context);
  const body = await graphRequest<{ data?: PostEntry[] }>(auth, `${encodeURIComponent(context.externalId)}/published_posts`, {
    params: { fields: POST_FIELDS, limit: Math.min(Math.max(1, limit), 100) },
  });
  return (body.data ?? []).filter((entry) => entry.id).map(toPost);
}

async function readPost(context: ConnectorContext, id: string): Promise<PostSummary> {
  const auth = await authFromContext(context);
  return toPost(await graphRequest<PostEntry>(auth, encodeURIComponent(id), { params: { fields: POST_FIELDS } }));
}

/** Modifie le texte d'une publication créée par l'application. */
export async function updatePagePost(context: ConnectorContext, id: string, patch: PostPatch): Promise<PostSummary> {
  if (patch.privacy !== undefined || patch.publishAt !== undefined) {
    throw new Error("Facebook ne permet pas de changer la visibilité ni la date d’une publication existante.");
  }
  if (patch.tags !== undefined || patch.categoryId !== undefined) throw new Error("Facebook n’a ni tags ni catégorie.");
  const message = patch.description ?? patch.title;
  if (message === undefined) return readPost(context, id);
  context.chargeQuota("post.update");
  const auth = await authFromContext(context);
  await graphRequest(auth, encodeURIComponent(id), { method: "POST", params: { message: message.slice(0, MESSAGE_MAX_CHARS) } });
  return readPost(context, id);
}

export async function removePagePost(context: ConnectorContext, id: string): Promise<void> {
  context.chargeQuota("post.delete");
  const auth = await authFromContext(context);
  await graphRequest(auth, encodeURIComponent(id), { method: "DELETE" });
}

// ─── Suivi et reprise ─────────────────────────────────────────────

const isPostId = (id: string) => id.includes("_");
const phaseDone = (status?: string) => status === "complete" || status === "completed";

/**
 * Suivi du traitement d'une vidéo ; une photo ou un message est en ligne dès
 * la réponse. L'envoi est déjà fini : la file suit à côté, sans bloquer le
 * travail suivant, et l'adresse définitive (`permalink_url`), que Facebook ne
 * donne parfois qu'après le traitement, remplace celle rendue par l'envoi.
 */
export async function facebookProcessing(context: ConnectorContext, externalId: string): Promise<ProcessingStatus> {
  if (isPostId(externalId)) return { done: true };
  const body = await readVideoStatus(context, externalId, "status,permalink_url");
  const status = body.status ?? {};
  const failure = status.processing_phase?.error?.message;
  if (status.video_status === "error" || status.video_status === "upload_failed" || status.video_status === "expired") {
    return { done: true, failed: `Facebook a refusé la vidéo (${status.video_status})${failure ? ` : ${failure.slice(0, 200)}` : "."}` };
  }
  const publishing = status.publishing_phase;
  if (publishing?.publish_status === "error") return { done: true, failed: "Facebook n’a pas pu publier la vidéo." };
  const privacy = publishing?.publish_status === "draft" ? "private" : publishing?.publish_status ? "public" : undefined;
  const done = status.video_status === "ready" || (phaseDone(status.processing_phase?.status) && (!publishing || phaseDone(publishing.status)));
  const final = done && body.permalink_url ? { result: { externalId, url: facebookUrl(body.permalink_url) } } : {};
  return { done, ...(privacy ? { privacy } : {}), ...final };
}

/**
 * Avant de republier un travail déjà tenté : la publication existe-t-elle ?
 * - Reel ou vidéo dont l'appel `finish` est parti : la vidéo a commencé
 *   d'être traitée ou publiée ;
 * - photo ou message : une publication récente de la Page porte le même texte
 *   (une publication programmée n'apparaît pas dans cette liste).
 */
export async function findExistingPost(context: PublishContext): Promise<{ externalId: string; url: string } | null> {
  const resume = context.resume ?? {};
  if ((resume.kind === "reel" || resume.kind === "video") && resume.finishing && typeof resume.videoId === "string") {
    let body: VideoStatusBody;
    try {
      body = await readVideoStatus(context, resume.videoId);
    } catch {
      return null;
    }
    const status = body.status ?? {};
    const published = status.publishing_phase?.publish_status && status.publishing_phase.publish_status !== "error";
    const started = status.processing_phase?.status && status.processing_phase.status !== "not_started";
    if (published || (resume.kind === "video" && started)) return { externalId: resume.videoId, url: await videoAddress(context, resume.videoId) };
    return null;
  }
  if (resume.kind === "post" && typeof resume.startedAt === "number" && typeof resume.message === "string" && resume.message) {
    const since = resume.startedAt - 2 * 60 * 1000;
    const posts = await listPagePosts(context, 25);
    const found = posts.find((post) => post.description.trim() === resume.message && (!post.publishedAt || Date.parse(post.publishedAt) >= since));
    return found ? { externalId: found.id, url: found.url } : null;
  }
  return null;
}
