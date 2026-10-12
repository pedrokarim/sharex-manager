/**
 * Liste des publications d'un compte Instagram (dossier 07b, § 9).
 *
 * Dans la voie « Instagram Login », l'API ne permet ni de modifier une
 * légende ni de supprimer une publication : `posts.update` et `posts.remove`
 * restent absents, et l'interface renvoie vers Instagram (`permalink`).
 * Certains champs sont annoncés réservés à Facebook Login : en cas de refus
 * (code 100), la liste est relue avec les champs de base.
 */

import type { ConnectorContext, PostSummary } from "../../types";
import { truncateChars } from "../../templates";
import { InstagramApiError, graphRequest, idOf } from "./api";
import { parseInstagramDate } from "./publish";

const FULL_FIELDS = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count";
const BASE_FIELDS = "id,caption,media_type,permalink,thumbnail_url,media_url,timestamp";
const PAGE_SIZE = 50;
const MAX_PAGES = 2;

interface MediaItem {
  id?: unknown;
  caption?: unknown;
  media_type?: unknown;
  media_product_type?: unknown;
  permalink?: unknown;
  thumbnail_url?: unknown;
  media_url?: unknown;
  timestamp?: unknown;
  like_count?: unknown;
  comments_count?: unknown;
}

interface MediaPage {
  data?: MediaItem[];
  paging?: { cursors?: { after?: unknown }; next?: unknown };
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const https = (value: unknown) => (typeof value === "string" && value.startsWith("https://") ? value : undefined);

/** Hashtags d'une légende, sans « # ». */
function hashtagsOf(caption: string): string[] {
  return [...new Set((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1)))];
}

function kindLabel(item: MediaItem): string {
  if (item.media_product_type === "REELS") return "Reel";
  if (item.media_type === "CAROUSEL_ALBUM") return "Carrousel";
  if (item.media_type === "VIDEO") return "Vidéo";
  return "Image";
}

export function toPostSummary(item: MediaItem): PostSummary | null {
  const id = idOf(item.id);
  const url = https(item.permalink);
  if (!id || !url) return null;
  const caption = typeof item.caption === "string" ? item.caption : "";
  const firstLine = caption.split("\n").find((line) => line.trim())?.trim() ?? "";
  const published = parseInstagramDate(item.timestamp);
  return {
    id,
    title: firstLine ? truncateChars(firstLine, 100) : kindLabel(item),
    description: caption,
    tags: hashtagsOf(caption),
    url,
    // Une image n'a pas de miniature à part : `media_url` en tient lieu.
    thumbnailUrl: https(item.thumbnail_url) ?? (item.media_type !== "VIDEO" ? https(item.media_url) : undefined),
    privacy: "public",
    ...(Number.isFinite(published) ? { publishedAt: new Date(published).toISOString() } : {}),
    ...(count(item.like_count) !== undefined ? { likes: count(item.like_count) } : {}),
    ...(count(item.comments_count) !== undefined ? { comments: count(item.comments_count) } : {}),
  };
}

/** Les publications les plus récentes du compte (100 au plus). */
export async function listInstagramPosts(context: ConnectorContext): Promise<PostSummary[]> {
  const posts: PostSummary[] = [];
  let fields = FULL_FIELDS;
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let body: MediaPage;
    try {
      body = await graphRequest<MediaPage>(context, `${context.externalId}/media`, { query: { fields, limit: PAGE_SIZE, after } });
    } catch (error) {
      if (error instanceof InstagramApiError && error.code === 100 && fields !== BASE_FIELDS) {
        fields = BASE_FIELDS;
        page -= 1;
        continue;
      }
      throw error;
    }
    for (const item of Array.isArray(body.data) ? body.data : []) {
      const post = toPostSummary(item);
      if (post) posts.push(post);
    }
    const cursor = body.paging?.cursors?.after;
    if (!body.paging?.next || typeof cursor !== "string" || !cursor) break;
    after = cursor;
  }
  return posts;
}
