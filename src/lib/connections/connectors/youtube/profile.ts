/**
 * Profil de la chaîne YouTube : ce que l'API Data v3 permet de modifier et
 * ce qu'elle ne permet pas (dossier 07, § 8.12). Références vérifiées le
 * 12/10/2026 :
 * - `channels.update` (50 unités ; portées `youtube`, `youtube.force-ssl` ou
 *   `youtubepartner`) : une partie par requête, `brandingSettings` ou
 *   `localizations`. La requête remplace toutes les valeurs modifiables de la
 *   partie envoyée : on relit d'abord la chaîne (`channels.list`, 1 unité) et
 *   on renvoie le reste tel quel, titre compris (`channelTitleUpdateForbidden`
 *   sinon) ;
 * - `brandingSettings.channel` : `description` (1 000 caractères),
 *   `keywords` (séparés par des espaces, 500 caractères au total),
 *   `defaultLanguage`, `country`, `unsubscribedTrailer` (vidéo publique ou
 *   non répertoriée de la chaîne) ; `localizations` : nom et description par
 *   langue, `defaultLanguage` exigée avant (`defaultLanguageNotSetError`) ;
 * - `channelSections` : 10 sections au plus, `snippet.type` obligatoire ;
 *   un `update` efface ce qui n'est pas renvoyé (50 unités par écriture) ;
 * - `playlists` et `playlistItems` : 50 unités par écriture, 1 par lecture.
 * Non modifiables par l'API : nom, identifiant @, photo de profil, liens.
 */

import type {
  ConnectorContext,
  PlaylistInput,
  PlaylistSummary,
  PlaylistsSupport,
  PostPrivacy,
  ProfileChoice,
  ProfileField,
  ProfileLocalization,
  ProfileSection,
  ProfileSectionsSupport,
  ProfileSnapshot,
  ProfileValue,
} from "../../types";
import { ServiceError } from "../../errors";
import { formatKeywords, parseKeywords } from "../../profile";
import { stripAngleBrackets } from "../../templates";
import { listUploads, youtubeRequest } from "./api";

/** Page « Personnalisation › Profil » de YouTube Studio : nom, identifiant, photo, bannière, description, liens. */
const STUDIO_PROFILE = "https://studio.youtube.com/channel/{externalId}/editing/profile";
/** Page « Personnalisation › Mise en page » : bande-annonce et sections de l'accueil. */
const STUDIO_LAYOUT = "https://studio.youtube.com/channel/{externalId}/editing/sections";
const STUDIO_LINK = "Ouvrir YouTube Studio › Personnalisation";

export const DESCRIPTION_MAX = 1000;
export const KEYWORDS_MAX = 500;

export const YOUTUBE_PROFILE_FIELDS: ProfileField[] = [
  {
    key: "description",
    label: "Description de la chaîne",
    kind: "textarea",
    editable: true,
    maxLength: DESCRIPTION_MAX,
    capability: "profile.details",
    brand: "description",
    help: "Affichée dans « À propos » de la chaîne.",
  },
  {
    key: "keywords",
    label: "Mots-clés de la chaîne",
    kind: "keywords",
    editable: true,
    maxLength: KEYWORDS_MAX,
    capability: "profile.details",
    brand: "keywords",
    help: "Repris des tags de la marque. YouTube compte 500 caractères pour toute la liste.",
  },
  {
    key: "defaultLanguage",
    label: "Langue de la chaîne",
    kind: "language",
    editable: true,
    capability: "profile.details",
    brand: "language",
    help: "Langue du nom et de la description ; exigée avant les traductions.",
  },
  {
    key: "country",
    label: "Pays",
    kind: "country",
    editable: true,
    clearable: true,
    capability: "profile.details",
    brand: "country",
  },
  {
    key: "unsubscribedTrailer",
    label: "Bande-annonce pour les visiteurs non abonnés",
    kind: "video",
    editable: true,
    clearable: true,
    capability: "profile.details",
    help: "Une vidéo publique ou non répertoriée de la chaîne.",
  },
  {
    key: "localizations",
    label: "Traductions du nom et de la description",
    kind: "localizations",
    editable: true,
    capability: "profile.details",
    itemLimits: { description: DESCRIPTION_MAX },
    help: "Montrées aux spectateurs qui parlent ces langues.",
  },
  {
    key: "banner",
    label: "Bannière",
    kind: "image",
    editable: true,
    capability: "profile.banner",
    imageFormat: "banner",
    help: "Remplace la bannière ; les autres réglages du profil sont gardés.",
  },
  {
    key: "watermark",
    label: "Filigrane",
    kind: "image",
    editable: true,
    capability: "profile.watermark",
    imageFormat: "watermark",
    help: "Posé par YouTube sur les vidéos, en haut à droite.",
  },
  {
    key: "title",
    label: "Nom de la chaîne",
    kind: "text",
    editable: false,
    brand: "name",
    manual: { url: STUDIO_PROFILE, linkLabel: STUDIO_LINK },
  },
  {
    key: "handle",
    label: "Identifiant @",
    kind: "text",
    editable: false,
    manual: { url: STUDIO_PROFILE, linkLabel: STUDIO_LINK },
  },
  {
    key: "avatar",
    label: "Photo de profil",
    kind: "image",
    editable: false,
    imageFormat: "avatar",
    manual: { url: STUDIO_PROFILE, linkLabel: STUDIO_LINK },
  },
  {
    key: "links",
    label: "Liens de la chaîne",
    kind: "textarea",
    editable: false,
    brand: "links",
    manual: { url: STUDIO_PROFILE, linkLabel: STUDIO_LINK, reason: "YouTube ne permet ni de lire ni de changer les liens de la chaîne par son API." },
  },
];

// ─── Lecture ──────────────────────────────────────────────────────

interface BrandingChannel {
  title?: string;
  description?: string;
  keywords?: string;
  defaultLanguage?: string;
  country?: string;
  unsubscribedTrailer?: string;
  [key: string]: unknown;
}

interface ChannelResource {
  id: string;
  snippet?: { title?: string; description?: string; customUrl?: string; defaultLanguage?: string; country?: string; thumbnails?: Record<string, { url?: string }> };
  brandingSettings?: Record<string, unknown> & { channel?: BrandingChannel };
  localizations?: Record<string, { title?: string; description?: string }>;
}

async function readChannel(context: ConnectorContext, part: string): Promise<ChannelResource> {
  const body = await youtubeRequest<{ items?: ChannelResource[] }>(context, "channels.list", "channels", { query: { part, mine: true } });
  const channel = body.items?.[0];
  if (!channel?.id) throw new ServiceError(404, "Chaîne introuvable sur YouTube.", "channelNotFound");
  return channel;
}

function localizationsOf(channel: ChannelResource): Record<string, ProfileLocalization> {
  const out: Record<string, ProfileLocalization> = {};
  for (const [language, entry] of Object.entries(channel.localizations ?? {})) {
    out[language] = { title: entry?.title ?? "", description: entry?.description ?? "" };
  }
  return out;
}

function snapshotOf(channel: ChannelResource): ProfileSnapshot {
  const branding = channel.brandingSettings?.channel ?? {};
  const snippet = channel.snippet ?? {};
  const thumbnails = snippet.thumbnails ?? {};
  const avatar = thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url;
  const values: Record<string, ProfileValue> = {
    title: snippet.title ?? branding.title ?? "",
    description: branding.description ?? snippet.description ?? "",
    keywords: parseKeywords(branding.keywords ?? ""),
    defaultLanguage: branding.defaultLanguage ?? snippet.defaultLanguage ?? "",
    country: branding.country ?? snippet.country ?? "",
    unsubscribedTrailer: branding.unsubscribedTrailer ?? "",
    localizations: localizationsOf(channel),
  };
  if (snippet.customUrl) values.handle = snippet.customUrl.startsWith("@") ? snippet.customUrl : `@${snippet.customUrl}`;
  if (avatar) values.avatar = avatar;
  return { values, fetchedAt: Date.now() };
}

/** Profil actuel : une lecture de la chaîne (1 unité). */
export async function readYoutubeProfile(context: ConnectorContext): Promise<ProfileSnapshot> {
  return snapshotOf(await readChannel(context, "snippet,brandingSettings,localizations"));
}

// ─── Écriture ─────────────────────────────────────────────────────

const BRANDING_KEYS = ["description", "keywords", "defaultLanguage", "country", "unsubscribedTrailer"] as const;

/**
 * Applique les valeurs (déjà contrôlées par le cœur). Relit la chaîne, puis
 * envoie `brandingSettings` complet (titre et autres valeurs inchangés) et,
 * à part, `localizations` complètes : une partie par requête.
 */
export async function updateYoutubeProfile(context: ConnectorContext, changes: Record<string, ProfileValue>): Promise<ProfileSnapshot> {
  const brandingKeys = BRANDING_KEYS.filter((key) => key in changes);
  const localizations = changes.localizations as Record<string, ProfileLocalization> | undefined;
  const current = await readChannel(context, "brandingSettings,localizations");

  // Les traductions exigent une langue de chaîne : on le dit avant le moindre envoi.
  const language = typeof changes.defaultLanguage === "string" ? changes.defaultLanguage : current.brandingSettings?.channel?.defaultLanguage;
  if (localizations && Object.keys(localizations).length > 0 && !language) {
    throw new Error("Choisissez d’abord la langue de la chaîne : YouTube l’exige avant les traductions.");
  }

  if (brandingKeys.length > 0) {
    const branding = structuredClone(current.brandingSettings ?? {});
    const channel: BrandingChannel = { ...(branding.channel ?? {}) };
    for (const key of brandingKeys) {
      const value = changes[key];
      if (key === "keywords") {
        channel.keywords = formatKeywords(Array.isArray(value) ? value : []);
      } else if (key === "description") {
        channel.description = stripAngleBrackets(String(value ?? ""));
      } else if (typeof value === "string" && value) {
        channel[key] = value;
      } else {
        // Pays ou bande-annonce vidés : la valeur absente est effacée par YouTube.
        delete channel[key];
      }
    }
    branding.channel = channel;
    await youtubeRequest(context, "channels.update", "channels", {
      method: "PUT",
      query: { part: "brandingSettings" },
      json: { id: current.id, brandingSettings: branding },
    });
  }

  if (localizations) {
    const next: Record<string, ProfileLocalization> = {};
    for (const [code, entry] of Object.entries(localizations)) next[code] = { title: entry.title, description: stripAngleBrackets(entry.description) };
    await youtubeRequest(context, "channels.update", "channels", {
      method: "PUT",
      query: { part: "localizations" },
      json: { id: current.id, localizations: next },
    });
  }

  return readYoutubeProfile(context);
}

/** Vidéos qui peuvent servir de bande-annonce : publiques ou non répertoriées, parmi les 50 derniers envois. */
export async function youtubeProfileChoices(context: ConnectorContext, key: string): Promise<ProfileChoice[]> {
  if (key !== "unsubscribedTrailer") return [];
  const uploads = await listUploads(context, 50);
  return uploads
    .filter((video) => video.privacy === "public" || video.privacy === "unlisted")
    .map((video) => ({
      value: video.id,
      label: video.title || video.id,
      detail: video.privacy === "public" ? "Publique" : "Non répertoriée",
      thumbnailUrl: video.thumbnailUrl,
    }));
}

// ─── Sections de la page d'accueil ────────────────────────────────

/** Types qu'on peut encore ajouter, et leurs libellés. */
const SECTION_TYPES: ProfileSectionsSupport["types"] = [
  { value: "recentUploads", label: "Vidéos récentes" },
  { value: "popularUploads", label: "Vidéos populaires" },
  { value: "singlePlaylist", label: "Une playlist", needsPlaylist: true },
  { value: "allPlaylists", label: "Playlists créées" },
  { value: "subscriptions", label: "Abonnements" },
  { value: "liveEvents", label: "Diffusions en direct" },
  { value: "upcomingEvents", label: "Diffusions à venir" },
  { value: "completedEvents", label: "Diffusions passées" },
];

export const YOUTUBE_SECTIONS_SUPPORT: ProfileSectionsSupport = {
  maxSections: 10,
  types: SECTION_TYPES,
  labels: {
    ...Object.fromEntries(SECTION_TYPES.map((type) => [type.value, type.label])),
    multiplePlaylists: "Plusieurs playlists",
    multipleChannels: "Chaînes mises en avant",
    // Retirés par YouTube le 12/05/2021 (historique des révisions de l'API).
    likedPlaylists: "Type retiré par YouTube",
    likes: "Type retiré par YouTube",
    postedPlaylists: "Type retiré par YouTube",
    postedVideos: "Type retiré par YouTube",
    recentActivity: "Type retiré par YouTube",
    recentPosts: "Type retiré par YouTube",
  },
  capability: "profile.sections",
  manualUrl: STUDIO_LAYOUT,
};

interface SectionResource {
  id: string;
  snippet?: { type?: string; title?: string; position?: number; channelId?: string };
  contentDetails?: { playlists?: string[]; channels?: string[] };
}

function toSection(resource: SectionResource, index: number): ProfileSection {
  return {
    id: resource.id,
    type: resource.snippet?.type ?? "",
    ...(resource.snippet?.title ? { title: resource.snippet.title } : {}),
    position: typeof resource.snippet?.position === "number" ? resource.snippet.position : index,
    ...(resource.contentDetails?.playlists?.length ? { playlistIds: resource.contentDetails.playlists } : {}),
    ...(resource.contentDetails?.channels?.length ? { channelIds: resource.contentDetails.channels } : {}),
  };
}

async function readSections(context: ConnectorContext): Promise<SectionResource[]> {
  const body = await youtubeRequest<{ items?: SectionResource[] }>(context, "channelSections.list", "channelSections", {
    query: { part: "snippet,contentDetails", mine: true },
  });
  return body.items ?? [];
}

export async function listYoutubeSections(context: ConnectorContext): Promise<ProfileSection[]> {
  return (await readSections(context)).map(toSection).sort((a, b) => a.position - b.position);
}

/** Ajoute une section en dernière position (`channelSections.insert`). */
export async function addYoutubeSection(context: ConnectorContext, input: { type: string; playlistId?: string }): Promise<void> {
  await youtubeRequest(context, "channelSections.insert", "channelSections", {
    method: "POST",
    query: { part: input.playlistId ? "snippet,contentDetails" : "snippet" },
    json: {
      snippet: { type: input.type },
      ...(input.playlistId ? { contentDetails: { playlists: [input.playlistId] } } : {}),
    },
  });
}

/**
 * Déplace une section. `channelSections.update` efface ce qui n'est pas
 * renvoyé : on relit la section et on renvoie son type, son titre et son
 * contenu tels quels, avec la nouvelle position.
 */
export async function moveYoutubeSection(context: ConnectorContext, id: string, position: number): Promise<void> {
  const current = (await readSections(context)).find((section) => section.id === id);
  if (!current?.snippet?.type) throw new ServiceError(404, "Section introuvable sur YouTube.", "channelSectionNotFound");
  const snippet: Record<string, unknown> = { type: current.snippet.type, position };
  if (current.snippet.title) snippet.title = current.snippet.title;
  const content = current.contentDetails ?? {};
  const hasContent = Boolean(content.playlists?.length || content.channels?.length);
  await youtubeRequest(context, "channelSections.update", "channelSections", {
    method: "PUT",
    query: { part: hasContent ? "snippet,contentDetails" : "snippet" },
    json: { id, snippet, ...(hasContent ? { contentDetails: content } : {}) },
  });
}

export async function removeYoutubeSection(context: ConnectorContext, id: string): Promise<void> {
  await youtubeRequest(context, "channelSections.delete", "channelSections", { method: "DELETE", query: { id } });
}

// ─── Playlists ────────────────────────────────────────────────────

export const YOUTUBE_PLAYLISTS_SUPPORT: PlaylistsSupport = {
  capability: "playlists.manage",
  // Limites de YouTube Studio : la référence de l'API ne les écrit pas.
  titleMax: 150,
  descriptionMax: 5000,
  addVideo: true,
};

interface PlaylistResource {
  id: string;
  snippet?: { title?: string; description?: string; defaultLanguage?: string; thumbnails?: Record<string, { url?: string }> };
  status?: { privacyStatus?: PostPrivacy; podcastStatus?: string };
  contentDetails?: { itemCount?: number };
}

const playlistUrl = (id: string) => `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;

function toPlaylist(resource: PlaylistResource): PlaylistSummary {
  const thumbnails = resource.snippet?.thumbnails ?? {};
  return {
    id: resource.id,
    title: resource.snippet?.title ?? "",
    description: resource.snippet?.description ?? "",
    privacy: resource.status?.privacyStatus ?? "private",
    ...(typeof resource.contentDetails?.itemCount === "number" ? { itemCount: resource.contentDetails.itemCount } : {}),
    ...(thumbnails.medium?.url || thumbnails.default?.url ? { thumbnailUrl: thumbnails.medium?.url ?? thumbnails.default?.url } : {}),
    url: playlistUrl(resource.id),
  };
}

/** Playlists de la chaîne, 200 au plus (4 lectures de 50). */
export async function listYoutubePlaylists(context: ConnectorContext): Promise<PlaylistSummary[]> {
  const out: PlaylistSummary[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 4; page += 1) {
    const body = await youtubeRequest<{ items?: PlaylistResource[]; nextPageToken?: string }>(context, "playlists.list", "playlists", {
      query: { part: "snippet,status,contentDetails", mine: true, maxResults: 50, pageToken },
    });
    out.push(...(body.items ?? []).map(toPlaylist));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export async function createYoutubePlaylist(context: ConnectorContext, input: PlaylistInput): Promise<PlaylistSummary> {
  const created = await youtubeRequest<PlaylistResource>(context, "playlists.insert", "playlists", {
    method: "POST",
    query: { part: "snippet,status" },
    json: { snippet: { title: input.title, description: input.description }, status: { privacyStatus: input.privacy } },
  });
  return toPlaylist({ ...created, contentDetails: { itemCount: 0 } });
}

/**
 * Modifie une playlist. `playlists.update` efface ce qui n'est pas renvoyé
 * (la description, par exemple) : on relit la playlist et on renvoie son
 * `snippet` et son `status` complets.
 */
export async function updateYoutubePlaylist(context: ConnectorContext, id: string, patch: Partial<PlaylistInput>): Promise<PlaylistSummary> {
  const body = await youtubeRequest<{ items?: PlaylistResource[] }>(context, "playlists.list", "playlists", {
    query: { part: "snippet,status,contentDetails", id },
  });
  const current = body.items?.[0];
  if (!current) throw new ServiceError(404, "Playlist introuvable sur YouTube.", "playlistNotFound");
  const snippet: Record<string, unknown> = {
    title: patch.title ?? current.snippet?.title ?? "",
    description: patch.description ?? current.snippet?.description ?? "",
  };
  if (current.snippet?.defaultLanguage) snippet.defaultLanguage = current.snippet.defaultLanguage;
  const status: Record<string, unknown> = { privacyStatus: patch.privacy ?? current.status?.privacyStatus ?? "private" };
  if (current.status?.podcastStatus) status.podcastStatus = current.status.podcastStatus;
  const updated = await youtubeRequest<PlaylistResource>(context, "playlists.update", "playlists", {
    method: "PUT",
    query: { part: "snippet,status" },
    json: { id, snippet, status },
  });
  return toPlaylist({ ...current, ...updated, id, contentDetails: current.contentDetails });
}

export async function addYoutubePlaylistVideo(context: ConnectorContext, playlistId: string, videoId: string): Promise<void> {
  await youtubeRequest(context, "playlistItems.insert", "playlistItems", {
    method: "POST",
    query: { part: "snippet" },
    json: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } },
  });
}
