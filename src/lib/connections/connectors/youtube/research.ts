/**
 * Lecture publique d'une chaîne YouTube, pour l'étude d'une niche (Clip
 * Studio, « Idées ») : ses derniers envois, avec durée et vues.
 *
 * Trois méthodes à 1 unité, toutes comptées avant l'appel (`quota.ts`,
 * vérifié dans la page « Quota calculator » mise à jour le 08/10/2026) :
 * - `channels.list` (`forHandle` ou `mine`) : la playlist des envois ;
 * - `playlistItems.list` : 50 envois par page ;
 * - `videos.list` : durée et statistiques, 50 vidéos par appel.
 * `search.list` n'est jamais appelé : il coûte bien plus et a son propre
 * plafond quotidien.
 */

import type { ChannelQuery, ChannelReadOptions, ChannelVideo, ChannelVideos, ConnectorContext } from "../../types";
import { ServiceError } from "../../errors";
import { videoUrl, youtubeRequest } from "./api";

const PAGE = 50;
const MAX_SCAN = 100;
const DEFAULT_SCAN = 50;

/** `@nom` d'une chaîne : 3 à 30 lettres, chiffres, points, tirets ou soulignés. */
export const HANDLE_PATTERN = /^@[\p{L}\p{N}._-]{3,30}$/u;

/** Identifiant `@nom` nettoyé (adresse de chaîne ou nom sans « @ » acceptés), ou `null`. */
export function cleanHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let text = value.trim();
  const fromUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(@[^/?#\s]+)/i.exec(text);
  if (fromUrl) {
    try {
      text = decodeURIComponent(fromUrl[1]);
    } catch {
      return null;
    }
  }
  if (!text.startsWith("@")) text = `@${text}`;
  return HANDLE_PATTERN.test(text) ? text : null;
}

/** Durée ISO 8601 (« PT1M5S », « P1DT2H ») en secondes ; 0 si illisible. */
export function parseIsoDuration(value: unknown): number {
  if (typeof value !== "string") return 0;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return Math.round(Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0));
}

function scanOf(options: ChannelReadOptions = {}): number {
  const scan = Math.round(Number(options.scan ?? DEFAULT_SCAN));
  return Math.min(MAX_SCAN, Math.max(1, Number.isFinite(scan) ? scan : DEFAULT_SCAN));
}

/**
 * Unités pour une chaîne : `channels.list`, puis par page de 50 envois un
 * `playlistItems.list` et un `videos.list`. Au moins une page, au plus
 * `scan / 50` pages (quand la première ne suffit pas à trouver assez de
 * vidéos courtes).
 */
export function youtubeChannelCost(options: ChannelReadOptions = {}): { min: number; max: number } {
  const pages = Math.ceil(scanOf(options) / PAGE);
  return { min: 3, max: 1 + 2 * pages };
}

interface ChannelResource {
  id: string;
  snippet?: { title?: string; customUrl?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  statistics?: { videoCount?: string };
}

interface VideoResource {
  id: string;
  snippet?: { title?: string; publishedAt?: string };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

/**
 * Derniers envois d'une chaîne, du plus récent au plus ancien. Lit une page
 * de 50 envois, puis une seconde si `wantShorts` n'est pas atteint et que
 * `scan` le permet.
 */
export async function fetchChannelVideos(context: ConnectorContext, query: ChannelQuery, options: ChannelReadOptions = {}): Promise<ChannelVideos> {
  const calls: string[] = [];
  const scan = scanOf(options);
  const shortMax = Math.max(1, Number(options.shortMaxSeconds ?? 180));
  const wantShorts = Math.max(0, Number(options.wantShorts ?? 0));

  let channelQuery: Record<string, string | boolean>;
  if ("mine" in query) channelQuery = { mine: true };
  else {
    const handle = cleanHandle(query.handle);
    if (!handle) throw new Error("Identifiant de chaîne invalide\u00a0: il commence par «\u00a0@\u00a0».");
    channelQuery = { forHandle: handle };
  }

  calls.push("channels.list");
  const channels = await youtubeRequest<{ items?: ChannelResource[] }>(context, "channels.list", "channels", {
    query: { part: "snippet,contentDetails,statistics", ...channelQuery },
  });
  const channel = channels.items?.[0];
  if (!channel?.id) throw new ServiceError(404, "Chaîne introuvable sur YouTube.", "channelNotFound");
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  const customUrl = channel.snippet?.customUrl;
  const handle = customUrl ? (customUrl.startsWith("@") ? customUrl : `@${customUrl}`) : undefined;
  const count = Number(channel.statistics?.videoCount);
  const summary: ChannelVideos["channel"] = {
    id: channel.id,
    title: String(channel.snippet?.title ?? channel.id).slice(0, 200),
    ...(handle && HANDLE_PATTERN.test(handle) ? { handle } : {}),
    url: handle && HANDLE_PATTERN.test(handle) ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${encodeURIComponent(channel.id)}`,
    ...(Number.isFinite(count) ? { videoCount: count } : {}),
  };
  if (!uploads) return { channel: summary, videos: [], calls };

  const videos: ChannelVideo[] = [];
  let pageToken: string | undefined;
  let read = 0;
  do {
    calls.push("playlistItems.list");
    const page = await youtubeRequest<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>(
      context,
      "playlistItems.list",
      "playlistItems",
      { query: { part: "contentDetails", playlistId: uploads, maxResults: PAGE, pageToken } }
    );
    const ids = (page.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(id))
      .slice(0, scan - read);
    read += ids.length;
    pageToken = page.nextPageToken;
    if (ids.length > 0) {
      calls.push("videos.list");
      const body = await youtubeRequest<{ items?: VideoResource[] }>(context, "videos.list", "videos", {
        query: { part: "snippet,contentDetails,statistics", id: ids.join(","), maxResults: PAGE },
      });
      for (const video of body.items ?? []) {
        const views = Number(video.statistics?.viewCount);
        videos.push({
          id: video.id,
          title: String(video.snippet?.title ?? "").slice(0, 300),
          url: videoUrl(video.id),
          ...(video.snippet?.publishedAt ? { publishedAt: video.snippet.publishedAt } : {}),
          durationSeconds: parseIsoDuration(video.contentDetails?.duration),
          ...(video.statistics?.viewCount !== undefined && Number.isFinite(views) ? { views } : {}),
        });
      }
    }
    const shorts = videos.filter((video) => video.durationSeconds > 0 && video.durationSeconds <= shortMax).length;
    if (wantShorts > 0 && shorts >= wantShorts) break;
  } while (pageToken && read < scan);

  // L'ordre de la playlist des envois n'est pas documenté : on trie par date.
  videos.sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "") || 0);
  return { channel: summary, videos, calls };
}
