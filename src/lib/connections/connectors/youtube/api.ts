/**
 * Appels à l'API YouTube Data v3 : liste et gestion des vidéos, bannière et
 * filigrane de la chaîne. Chaque appel est compté dans les quotas avant
 * d'être fait. Les jetons ne sont jamais journalisés ni recopiés dans un
 * message d'erreur.
 */

import type { AccessToken, ConnectorContext, PostPatch, PostPrivacy, PostSummary, WatermarkTiming } from "../../types";
import { QuotaExceededError, ServiceError } from "../../errors";
import { youtubeCost, youtubeQuota } from "./quota";
import { sanitizeDescription, sanitizeTags, sanitizeTitle } from "./metadata";

export const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";

/** Raisons d'erreur de Google qui signifient « quota du jour épuisé ». */
const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded", "uploadLimitExceeded"]);

const REASON_MESSAGES: Record<string, string> = {
  insufficientPermissions: "Droits insuffisants : reconnectez le compte avec le jeu de portées « Tout ».",
  forbidden: "YouTube refuse cette action pour ce compte.",
  videoNotFound: "Vidéo introuvable sur YouTube.",
  channelNotFound: "Chaîne introuvable sur YouTube.",
  invalidPublishAt: "Date de programmation refusée : elle doit être dans le futur et la vidéo doit être privée.",
  invalidTitle: "Titre refusé par YouTube.",
  invalidDescription: "Description refusée par YouTube.",
  invalidTags: "Tags refusés par YouTube.",
  invalidCategoryId: "Catégorie refusée par YouTube.",
  bannerAlbumFull: "L’album des bannières de la chaîne est plein : supprimez d’anciennes bannières dans YouTube Studio.",
  mediaBodyRequired: "Image manquante.",
  youtubeSignupRequired: "Ce compte Google n’a pas de chaîne YouTube.",
  commentsDisabled: "Les commentaires sont désactivés sur cette vidéo.",
  commentTextTooLong: "Commentaire trop long pour YouTube.",
  ineligibleAccount: "Ce compte YouTube doit être rattaché à un compte Google pour commenter.",
  captionExists: "La vidéo a déjà une piste de sous-titres dans cette langue.",
  invalidImage: "Image de miniature refusée par YouTube.",
  // Profil, sections et playlists.
  channelTitleUpdateForbidden: "YouTube ne permet pas de changer le nom de la chaîne par son API.",
  brandingValidationError: "YouTube a refusé une valeur du profil (description, mots-clés, langue, pays ou bande-annonce).",
  defaultLanguageNotSetError: "Choisissez d’abord la langue de la chaîne : YouTube l’exige avant les traductions.",
  localizationValidationError: "YouTube a refusé une traduction du profil.",
  channelForbidden: "YouTube refuse cette modification pour cette chaîne.",
  notEditable: "YouTube ne permet pas de modifier cette section.",
  channelSectionForbidden: "YouTube refuse cette modification des sections de la chaîne.",
  channelSectionNotFound: "Section introuvable sur YouTube.",
  playlistNotFound: "Playlist introuvable sur YouTube.",
  playlistIsPrivate: "Une section ne peut pas afficher une playlist privée.",
  playlistForbidden: "YouTube refuse cette modification de playlist.",
  playlistOperationUnsupported: "YouTube ne permet pas de modifier cette playlist.",
  invalidPlaylistSnippet: "Titre ou description de playlist refusé par YouTube.",
  playlistTitleRequired: "Le titre de la playlist est obligatoire.",
  playlistContainsMaximumNumberOfVideos: "La playlist contient déjà le nombre maximal de vidéos.",
  uploadRateLimitExceeded: "Trop de miniatures envoyées récemment : nouvel essai plus tard.",
};

/** Lit l'erreur d'une réponse de Google et la convertit en erreur affichable. */
export async function youtubeError(response: Response, method: string): Promise<Error> {
  let reason: string | undefined;
  let detail = "";
  try {
    const body = (await response.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    reason = body?.error?.errors?.[0]?.reason;
    detail = String(body?.error?.message ?? "").replace(/<[^>]*>/g, "").slice(0, 200);
  } catch {
    // Corps illisible : le statut suffit.
  }
  if (reason && QUOTA_REASONS.has(reason)) {
    const { bucket } = youtubeCost(method);
    return new QuotaExceededError(
      reason === "uploadLimitExceeded"
        ? "YouTube refuse de nouveaux envois aujourd’hui pour cette chaîne : réessayez après la remise à zéro."
        : "Quota du jour de l’API YouTube épuisé : réessayez après la remise à zéro (minuit, heure du Pacifique).",
      youtubeQuota.nextReset(Date.now()),
      reason === "uploadLimitExceeded" ? "uploads" : bucket
    );
  }
  if (response.status === 401) {
    return new ServiceError(401, "YouTube a refusé le jeton d’accès : reconnectez le compte.", reason);
  }
  const known = reason ? REASON_MESSAGES[reason] : undefined;
  return new ServiceError(
    response.status,
    known ?? `YouTube a refusé la demande (HTTP ${response.status}${reason ? `, ${reason}` : ""})${detail ? ` : ${detail}` : "."}`,
    reason
  );
}

interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  base?: string;
}

function buildUrl(base: string, path: string, query: RequestOptions["query"] = {}) {
  const url = new URL(`${base}/${path}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  return url.toString();
}

/**
 * Appel authentifié. `quotaMethod` est le nom de la méthode dans la table des
 * quotas (« videos.list »…), compté avant l'appel.
 */
export async function youtubeRequest<T>(context: ConnectorContext, quotaMethod: string, path: string, options: RequestOptions = {}): Promise<T> {
  context.chargeQuota(quotaMethod);
  const token = await context.getAccessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token.value}`, Accept: "application/json", ...(options.headers ?? {}) };
  let body = options.body;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json; charset=UTF-8";
    body = JSON.stringify(options.json);
  }
  const response = await fetch(buildUrl(options.base ?? YOUTUBE_API, path, options.query), {
    method: options.method ?? "GET",
    headers,
    body,
  });
  if (!response.ok) throw await youtubeError(response, quotaMethod);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ─── Chaîne ───────────────────────────────────────────────────────

interface ChannelResource {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  brandingSettings?: Record<string, unknown> & { image?: Record<string, unknown> };
}

/** Identité de la chaîne liée au jeton (`channels.list?mine=true`). */
export async function fetchChannelProfile(token: AccessToken, chargeQuota: (method: string) => void) {
  chargeQuota("channels.list");
  const response = await fetch(buildUrl(YOUTUBE_API, "channels", { part: "snippet", mine: true }), {
    headers: { Authorization: `Bearer ${token.value}`, Accept: "application/json" },
  });
  if (!response.ok) throw await youtubeError(response, "channels.list");
  const body = (await response.json()) as { items?: ChannelResource[] };
  const channel = body.items?.[0];
  if (!channel?.id) {
    throw new Error("Ce compte Google n’a pas de chaîne YouTube : créez-la, ou choisissez le compte de marque qui la porte.");
  }
  const thumbnails = channel.snippet?.thumbnails ?? {};
  const handle = channel.snippet?.customUrl;
  return {
    externalId: channel.id,
    name: channel.snippet?.title || channel.id,
    handle: handle || undefined,
    avatarUrl: thumbnails.medium?.url ?? thumbnails.default?.url ?? thumbnails.high?.url,
    url: handle ? `https://www.youtube.com/${handle.startsWith("@") ? handle : `@${handle}`}` : `https://www.youtube.com/channel/${channel.id}`,
  };
}

// ─── Vidéos ───────────────────────────────────────────────────────

interface VideoSnippet {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  publishedAt?: string;
  thumbnails?: Record<string, { url?: string }>;
  [key: string]: unknown;
}

interface VideoStatus {
  privacyStatus?: PostPrivacy;
  publishAt?: string;
  uploadStatus?: string;
  selfDeclaredMadeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  embeddable?: boolean;
  license?: string;
  publicStatsViewable?: boolean;
  [key: string]: unknown;
}

export interface VideoResource {
  id: string;
  snippet?: VideoSnippet;
  status?: VideoStatus;
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  processingDetails?: { processingStatus?: string; processingFailureReason?: string };
}

export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

function toPost(video: VideoResource): PostSummary {
  const thumbnails = video.snippet?.thumbnails ?? {};
  const count = (value?: string) => (value === undefined ? undefined : Number(value));
  return {
    id: video.id,
    title: video.snippet?.title ?? "",
    description: video.snippet?.description ?? "",
    tags: video.snippet?.tags ?? [],
    categoryId: video.snippet?.categoryId,
    thumbnailUrl: thumbnails.medium?.url ?? thumbnails.default?.url,
    url: videoUrl(video.id),
    privacy: video.status?.privacyStatus ?? "private",
    publishedAt: video.snippet?.publishedAt,
    publishAt: video.status?.publishAt,
    views: count(video.statistics?.viewCount),
    likes: count(video.statistics?.likeCount),
    comments: count(video.statistics?.commentCount),
  };
}

export async function getVideo(context: ConnectorContext, id: string, part: string): Promise<VideoResource> {
  const body = await youtubeRequest<{ items?: VideoResource[] }>(context, "videos.list", "videos", { query: { part, id } });
  const video = body.items?.[0];
  if (!video) throw new ServiceError(404, "Vidéo introuvable sur YouTube.", "videoNotFound");
  return video;
}

/** Derniers envois de la chaîne : playlist « uploads », puis détails par lots de 50. */
export async function listUploads(context: ConnectorContext, limit = 50): Promise<PostSummary[]> {
  const channels = await youtubeRequest<{ items?: ChannelResource[] }>(context, "channels.list", "channels", {
    query: { part: "contentDetails", mine: true },
  });
  const playlistId = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) return [];
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await youtubeRequest<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>(
      context,
      "playlistItems.list",
      "playlistItems",
      { query: { part: "contentDetails", playlistId, maxResults: 50, pageToken } }
    );
    for (const item of page.items ?? []) if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < limit);

  const posts: PostSummary[] = [];
  for (let index = 0; index < Math.min(ids.length, limit); index += 50) {
    const batch = ids.slice(index, Math.min(index + 50, limit));
    const body = await youtubeRequest<{ items?: VideoResource[] }>(context, "videos.list", "videos", {
      query: { part: "snippet,status,statistics", id: batch.join(","), maxResults: 50 },
    });
    posts.push(...(body.items ?? []).map(toPost));
  }
  return posts;
}

/**
 * Modifie une vidéo. `videos.update` remplace toute la partie envoyée : on
 * relit d'abord le `snippet` ou le `status` complet et on le renvoie entier,
 * sinon les champs absents (catégorie, langue…) seraient effacés.
 */
export async function updateVideo(context: ConnectorContext, id: string, patch: PostPatch): Promise<PostSummary> {
  const touchesSnippet = ["title", "description", "tags", "categoryId"].some((key) => key in patch);
  const touchesStatus = "privacy" in patch || "publishAt" in patch;
  const parts = [touchesSnippet && "snippet", touchesStatus && "status"].filter(Boolean) as string[];
  if (parts.length === 0) return toPost(await getVideo(context, id, "snippet,status,statistics"));

  const current = await getVideo(context, id, "snippet,status");
  const resource: VideoResource = { id };
  if (touchesSnippet) {
    const snippet = current.snippet ?? {};
    const next: VideoSnippet = {
      title: snippet.title,
      description: snippet.description,
      tags: snippet.tags,
      categoryId: snippet.categoryId,
      defaultLanguage: snippet.defaultLanguage,
      defaultAudioLanguage: snippet.defaultAudioLanguage,
    };
    if (patch.title !== undefined) next.title = sanitizeTitle(patch.title) || snippet.title;
    if (patch.description !== undefined) next.description = sanitizeDescription(patch.description);
    if (patch.tags !== undefined) next.tags = sanitizeTags(patch.tags);
    if (patch.categoryId !== undefined) next.categoryId = String(patch.categoryId);
    // La catégorie est obligatoire pour `videos.update`.
    if (!next.categoryId) next.categoryId = "22";
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    resource.snippet = next;
  }
  if (touchesStatus) {
    const status = current.status ?? {};
    const next: VideoStatus = {
      privacyStatus: status.privacyStatus,
      publishAt: status.publishAt,
      selfDeclaredMadeForKids: status.selfDeclaredMadeForKids,
      containsSyntheticMedia: status.containsSyntheticMedia,
      embeddable: status.embeddable,
      license: status.license,
      publicStatsViewable: status.publicStatsViewable,
    };
    if (patch.privacy) next.privacyStatus = patch.privacy;
    if (patch.publishAt !== undefined) next.publishAt = patch.publishAt ?? undefined;
    // `publishAt` n'est accepté que pour une vidéo privée.
    if (next.publishAt) {
      if (patch.publishAt && !patch.privacy) next.privacyStatus = "private";
      if (next.privacyStatus !== "private") delete next.publishAt;
    }
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    resource.status = next;
  }
  const updated = await youtubeRequest<VideoResource>(context, "videos.update", "videos", {
    method: "PUT",
    query: { part: parts.join(",") },
    json: resource,
  });
  return toPost({ ...current, ...updated, id });
}

export async function deleteVideo(context: ConnectorContext, id: string): Promise<void> {
  await youtubeRequest<void>(context, "videos.delete", "videos", { method: "DELETE", query: { id } });
}

/** État du traitement d'une vidéo envoyée. */
export async function videoProcessing(context: ConnectorContext, id: string) {
  const video = await getVideo(context, id, "processingDetails,status");
  const processing = video.processingDetails?.processingStatus;
  const upload = video.status?.uploadStatus;
  if (upload === "failed" || upload === "rejected" || processing === "failed" || processing === "terminated") {
    return { done: true, failed: `Traitement refusé par YouTube (${processing ?? upload}).`, privacy: video.status?.privacyStatus };
  }
  if (upload === "deleted") return { done: true, failed: "La vidéo a été supprimée sur YouTube.", privacy: video.status?.privacyStatus };
  const done = processing === "succeeded" || upload === "processed" || (processing === undefined && upload !== "uploaded");
  return { done, privacy: video.status?.privacyStatus };
}

// ─── Bannière et filigrane ────────────────────────────────────────

/**
 * Bannière : `channelBanners.insert` avec le PNG, puis `channels.update` avec
 * `brandingSettings.image.bannerExternalUrl`. `channels.update` remplace toute
 * la partie `brandingSettings` : on lit l'existant et on le renvoie complet.
 */
export async function setChannelBanner(context: ConnectorContext, png: Buffer): Promise<void> {
  if (png.length > 6 * 1024 * 1024) throw new Error("La bannière dépasse 6 Mo, la limite de YouTube.");
  const inserted = await youtubeRequest<{ url?: string }>(context, "channelBanners.insert", "channelBanners/insert", {
    method: "POST",
    base: YOUTUBE_UPLOAD_API,
    query: { uploadType: "media" },
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(png),
  });
  if (!inserted?.url) throw new Error("YouTube n’a pas rendu l’adresse de la bannière.");

  const channels = await youtubeRequest<{ items?: ChannelResource[] }>(context, "channels.list", "channels", {
    query: { part: "brandingSettings", mine: true },
  });
  const channel = channels.items?.[0];
  if (!channel?.id) throw new ServiceError(404, "Chaîne introuvable sur YouTube.", "channelNotFound");
  const branding = structuredClone(channel.brandingSettings ?? {});
  branding.image = { ...(branding.image ?? {}), bannerExternalUrl: inserted.url };
  await youtubeRequest(context, "channels.update", "channels", {
    method: "PUT",
    query: { part: "brandingSettings" },
    json: { id: channel.id, brandingSettings: branding },
  });
}

/** Filigrane des vidéos (`watermarks.set`), PNG 150 × 150 conseillé ; YouTube le place en haut à droite. */
export async function setChannelWatermark(context: ConnectorContext, png: Buffer, timing?: WatermarkTiming): Promise<void> {
  if (png.length > 10 * 1024 * 1024) throw new Error("Image du filigrane trop lourde.");
  const effective: WatermarkTiming = timing ?? { type: "offsetFromStart", offsetMs: 0 };
  const metadata = {
    timing: {
      type: effective.type,
      offsetMs: String(Math.max(0, Math.round(effective.offsetMs))),
      ...(effective.durationMs !== undefined ? { durationMs: String(Math.max(1000, Math.round(effective.durationMs))) } : {}),
    },
    position: { type: "corner", cornerPosition: "topRight" },
  };
  const boundary = `sxm-${Math.random().toString(36).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  await youtubeRequest(context, "watermarks.set", "watermarks/set", {
    method: "POST",
    base: YOUTUBE_UPLOAD_API,
    query: { channelId: context.externalId, uploadType: "multipart" },
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
  });
}
