/**
 * Gestion d'un compte connecté : publications (liste, modification,
 * suppression), bannière et filigrane, profil, sections de la page
 * d'accueil, playlists, quotas. Chaque action vérifie la
 * capacité du compte ; le connecteur fait l'appel, le cœur garde les jetons.
 */

import type {
  AccountQuotaUsage,
  ChannelQuery,
  ChannelReadOptions,
  ChannelVideos,
  ConnectionCapability,
  ConnectorContext,
  Connector,
  LivePublishForm,
  PublishSource,
  PlaylistInput,
  PlaylistSummary,
  PostPatch,
  PostSummary,
  ProfileChoice,
  ProfileSection,
  ProfileSnapshot,
  ProfileValue,
  QuotaUsage,
  WatermarkTiming,
} from "./types";
import { cleanProfileValue } from "./profile";
import { QuotaExceededError, ReconnectRequiredError } from "./errors";
import { accountContext, noteReconnectRequired, requireCapability } from "./accounts";
import { getAccountQuotaUsage, getQuotaUsage, markAccountQuotaExhausted, markQuotaExhausted } from "./quota";

/** Liste des publications gardée dix minutes, actualisée à la demande. */
const POSTS_CACHE_MS = 10 * 60 * 1000;

const holder = globalThis as typeof globalThis & { __sxmPostsCache?: Map<string, { fetchedAt: number; posts: PostSummary[] }> };
const postsCache = (holder.__sxmPostsCache ??= new Map<string, { fetchedAt: number; posts: PostSummary[] }>());

/**
 * Exécute une action du connecteur. Un quota épuisé chez le service suspend
 * aussi la file (celle du service, ou du seul compte) ; un accès refusé passe
 * le compte « à reconnecter ».
 */
async function withAccount<T>(
  accountId: string,
  capability: ConnectionCapability,
  action: (connector: Connector, context: ConnectorContext) => Promise<T>
): Promise<T> {
  const { connector, context } = requireCapability(accountId, capability);
  try {
    return await action(connector, context);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      if (error.scope === "account") markAccountQuotaExhausted(accountId, error.retryAt);
      else markQuotaExhausted(connector, error.bucket);
    }
    if (error instanceof ReconnectRequiredError) noteReconnectRequired(accountId, error);
    throw error;
  }
}

export async function listPosts(accountId: string, options: { refresh?: boolean } = {}): Promise<{ posts: PostSummary[]; fetchedAt: number }> {
  const cached = postsCache.get(accountId);
  if (cached && !options.refresh && Date.now() - cached.fetchedAt < POSTS_CACHE_MS) return cached;
  const posts = await withAccount(accountId, "posts.list", (connector, context) => {
    if (!connector.posts) throw new Error(`${connector.label} ne sait pas lister les publications.`);
    return connector.posts.list(context);
  });
  const entry = { fetchedAt: Date.now(), posts };
  postsCache.set(accountId, entry);
  return entry;
}

/**
 * Publications déjà lues pour ce compte, gardées en mémoire par le cœur,
 * sans appel au service ; `null` si rien n'a encore été lu depuis le
 * démarrage. Sert aux tableaux de bord qui ne doivent pas consommer de quota.
 */
export function peekPosts(accountId: string): { posts: PostSummary[]; fetchedAt: number } | null {
  return postsCache.get(accountId) ?? null;
}

export async function updatePost(accountId: string, postId: string, patch: PostPatch): Promise<PostSummary> {
  if (typeof postId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(postId)) throw new Error("Publication invalide.");
  const updated = await withAccount(accountId, "posts.manage", (connector, context) => {
    if (!connector.posts?.update) throw new Error(`${connector.label} ne permet pas de modifier une publication.`);
    return connector.posts.update(context, postId, patch);
  });
  const cached = postsCache.get(accountId);
  if (cached) cached.posts = cached.posts.map((post) => (post.id === postId ? { ...post, ...updated } : post));
  return updated;
}

export async function removePost(accountId: string, postId: string): Promise<void> {
  if (typeof postId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(postId)) throw new Error("Publication invalide.");
  await withAccount(accountId, "posts.manage", (connector, context) => {
    if (!connector.posts?.remove) throw new Error(`${connector.label} ne permet pas de supprimer une publication.`);
    return connector.posts.remove(context, postId);
  });
  const cached = postsCache.get(accountId);
  if (cached) cached.posts = cached.posts.filter((post) => post.id !== postId);
}

// ─── Lecture publique d'une chaîne ────────────────────────────────

/**
 * Vidéos publiques d'une chaîne (la sienne avec `{ mine: true }`, une autre
 * par son `@nom`), lues avec le jeton de ce compte. Exige `posts.list` :
 * une portée de lecture. Chaque appel est compté dans le quota du service ;
 * un quota épuisé suspend la file comme pour toute autre action.
 */
export async function readChannelVideos(accountId: string, query: ChannelQuery, options: ChannelReadOptions = {}): Promise<ChannelVideos> {
  return withAccount(accountId, "posts.list", (connector, context) => {
    if (!connector.research) throw new Error(`${connector.label} ne permet pas de lire une autre chaîne.`);
    return connector.research.channelVideos(context, query, options);
  });
}

/** Unités au moins et au plus pour lire une chaîne avec ce compte ; `null` si le service ne le permet pas. */
export function channelReadCost(accountId: string, options: ChannelReadOptions = {}): { min: number; max: number } | null {
  const { connector } = accountContext(accountId);
  return connector.research ? connector.research.costPerChannel(options) : null;
}

/** Envoie une image de profil (bannière ou filigrane) au compte. */
export async function setProfileImage(accountId: string, what: "banner" | "watermark", png: Buffer, timing?: WatermarkTiming): Promise<void> {
  if (!Buffer.isBuffer(png) || png.length === 0) throw new Error("Image manquante.");
  // Signature PNG : rien d'autre n'est envoyé au service.
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("L’image doit être un PNG.");
  if (what === "banner") {
    await withAccount(accountId, "profile.banner", (connector, context) => {
      if (!connector.profile?.setBanner) throw new Error(`${connector.label} ne sait pas changer la bannière.`);
      return connector.profile.setBanner(context, png);
    });
  } else {
    await withAccount(accountId, "profile.watermark", (connector, context) => {
      if (!connector.profile?.setWatermark) throw new Error(`${connector.label} ne sait pas changer le filigrane.`);
      return connector.profile.setWatermark(context, png, timing);
    });
  }
}

// ─── Profil du compte ─────────────────────────────────────────────

/** Une lecture (profil, sections, playlists) : aucune capacité exigée, mais un compte utilisable. */
async function withAccountRead<T>(accountId: string, action: (connector: Connector, context: ConnectorContext) => Promise<T>): Promise<T> {
  const resolved = accountContext(accountId);
  if (resolved.account.status !== "connected") throw new ReconnectRequiredError(`Le compte « ${resolved.account.displayName} » doit être reconnecté.`);
  try {
    return await action(resolved.connector, resolved.context);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      if (error.scope === "account") markAccountQuotaExhausted(accountId, error.retryAt);
      else markQuotaExhausted(resolved.connector, error.bucket);
    }
    if (error instanceof ReconnectRequiredError) noteReconnectRequired(accountId, error);
    throw error;
  }
}

/** Message d'une capacité manquante : « Autoriser… » la donne, sauf si le rôle du compte l'interdit. */
function missingCapabilityMessage(account: { displayName: string; requestableCapabilities?: ConnectionCapability[] }, capability: ConnectionCapability): string {
  return account.requestableCapabilities?.includes(capability)
    ? `Le compte « ${account.displayName} » n’a pas encore autorisé cela : utilisez « Autoriser… ».`
    : `Le compte « ${account.displayName} » n’a pas le droit de faire cela chez le service.`;
}

/**
 * Formulaire de publication d'un compte, lu chez le service au moment
 * d'afficher l'écran Publier (`Connector.publishForm`) ; `null` quand le
 * service n'en a pas (les champs fixes du connecteur valent).
 */
export async function accountPublishForm(
  accountId: string,
  media: { kind: PublishSource["kind"]; durationMs?: number }
): Promise<LivePublishForm | null> {
  const kind = (["video", "image", "text", "carousel"] as const).find((value) => value === media?.kind);
  if (!kind) throw new Error("Type de publication inconnu.");
  const durationMs = Number(media.durationMs);
  const { connector, account } = accountContext(accountId);
  if (!connector.publishForm) return null;
  return withAccount(accountId, kind === "video" ? "publish.video" : kind === "text" ? "publish.text" : "publish.image", (current, context) =>
    current.publishForm!(context, { scopes: account.scopes, media: { kind, ...(durationMs > 0 ? { durationMs } : {}) } })
  );
}

/** Valeurs actuelles du profil chez le service. */
export async function readAccountProfile(accountId: string): Promise<ProfileSnapshot> {
  return withAccountRead(accountId, (connector, context) => {
    if (!connector.readProfile) throw new Error(`${connector.label} ne permet pas de lire le profil.`);
    return connector.readProfile(context);
  });
}

/**
 * Envoie des éléments modifiables du profil. Chaque valeur est contrôlée
 * (`cleanProfileValue`) et chaque capacité vérifiée avant le moindre appel :
 * rien ne part si un seul élément est refusé.
 */
export async function updateAccountProfile(accountId: string, changes: Record<string, unknown>): Promise<ProfileSnapshot> {
  const { account, connector } = accountContext(accountId);
  const update = connector.updateProfile;
  if (!update) throw new Error(`${connector.label} ne permet pas de modifier le profil.`);
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Rien à envoyer.");
  const clean: Record<string, ProfileValue> = {};
  for (const [key, value] of Object.entries(changes)) {
    const field = connector.profileFields?.find((entry) => entry.key === key);
    if (!field) throw new Error("Élément du profil inconnu.");
    if (!field.editable || field.kind === "image") throw new Error(`${connector.label} ne permet pas de changer « ${field.label} » par son API.`);
    if (field.capability && !account.capabilities.includes(field.capability)) throw new Error(missingCapabilityMessage(account, field.capability));
    clean[key] = cleanProfileValue(field, value);
  }
  if (Object.keys(clean).length === 0) throw new Error("Rien à envoyer.");
  return withAccountRead(accountId, (_, context) => update(context, clean));
}

/** Choix possibles d'un élément (vidéos de la chaîne pour la bande-annonce). */
export async function accountProfileChoices(accountId: string, key: string): Promise<ProfileChoice[]> {
  return withAccountRead(accountId, (connector, context) => {
    const field = connector.profileFields?.find((entry) => entry.key === key);
    if (!field || !connector.profileChoices) throw new Error("Aucun choix pour cet élément.");
    return connector.profileChoices(context, field.key);
  });
}

// ─── Sections de la page d'accueil ────────────────────────────────

const ITEM_ID = /^[A-Za-z0-9_.-]{1,80}$/;

function requireSections(connector: Connector) {
  if (!connector.sections) throw new Error(`${connector.label} ne gère pas les sections de la page d’accueil.`);
  return connector.sections;
}

export async function listAccountSections(accountId: string): Promise<ProfileSection[]> {
  return withAccountRead(accountId, (connector, context) => requireSections(connector).list(context));
}

/** Ajoute une section (type permis par le service, dans la limite du service), puis rend la liste relue. */
export async function addAccountSection(accountId: string, input: { type: string; playlistId?: string }): Promise<ProfileSection[]> {
  const sections = requireSections(accountContext(accountId).connector);
  const type = sections.support.types.find((entry) => entry.value === input?.type);
  if (!type) throw new Error("Type de section refusé.");
  const playlistId = input.playlistId;
  if (type.needsPlaylist && !(typeof playlistId === "string" && ITEM_ID.test(playlistId))) throw new Error("Choisissez une playlist.");
  return withAccount(accountId, sections.support.capability, async (_, context) => {
    const current = await sections.list(context);
    if (current.length >= sections.support.maxSections) throw new Error(`${sections.support.maxSections} sections au plus : retirez-en une d’abord.`);
    await sections.add(context, { type: type.value, ...(type.needsPlaylist ? { playlistId } : {}) });
    return sections.list(context);
  });
}

export async function moveAccountSection(accountId: string, sectionId: string, position: number): Promise<ProfileSection[]> {
  if (typeof sectionId !== "string" || !ITEM_ID.test(sectionId)) throw new Error("Section invalide.");
  if (!Number.isInteger(position) || position < 0 || position > 50) throw new Error("Position invalide.");
  const sections = requireSections(accountContext(accountId).connector);
  return withAccount(accountId, sections.support.capability, async (_, context) => {
    await sections.move(context, sectionId, position);
    return sections.list(context);
  });
}

export async function removeAccountSection(accountId: string, sectionId: string): Promise<ProfileSection[]> {
  if (typeof sectionId !== "string" || !ITEM_ID.test(sectionId)) throw new Error("Section invalide.");
  const sections = requireSections(accountContext(accountId).connector);
  return withAccount(accountId, sections.support.capability, async (_, context) => {
    await sections.remove(context, sectionId);
    return sections.list(context);
  });
}

// ─── Playlists ────────────────────────────────────────────────────

function requirePlaylists(connector: Connector) {
  if (!connector.playlists) throw new Error(`${connector.label} ne gère pas les playlists.`);
  return connector.playlists;
}

/** Contrôle d'une playlist reçue : titre obligatoire, limites du service, visibilité connue. */
export function cleanPlaylistInput(input: unknown, limits: { titleMax: number; descriptionMax: number }, partial = false): Partial<PlaylistInput> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Partial<PlaylistInput> = {};
  if (raw.title !== undefined || !partial) {
    const title = typeof raw.title === "string" ? raw.title.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim() : "";
    if (!title) throw new Error("Le titre de la playlist est obligatoire.");
    if (Array.from(title).length > limits.titleMax) throw new Error(`Le titre dépasse ${limits.titleMax} caractères.`);
    out.title = title;
  }
  if (raw.description !== undefined || !partial) {
    const description =
      typeof raw.description === "string" ? raw.description.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, "").trim() : "";
    if (Array.from(description).length > limits.descriptionMax) throw new Error(`La description dépasse ${limits.descriptionMax.toLocaleString("fr-FR")} caractères.`);
    out.description = description;
  }
  if (raw.privacy !== undefined || !partial) {
    if (raw.privacy !== "private" && raw.privacy !== "unlisted" && raw.privacy !== "public") throw new Error("Visibilité inconnue.");
    out.privacy = raw.privacy;
  }
  return out;
}

export async function listAccountPlaylists(accountId: string): Promise<PlaylistSummary[]> {
  return withAccountRead(accountId, (connector, context) => requirePlaylists(connector).list(context));
}

export async function createAccountPlaylist(accountId: string, input: unknown): Promise<PlaylistSummary> {
  const playlists = requirePlaylists(accountContext(accountId).connector);
  const clean = cleanPlaylistInput(input, playlists.support) as PlaylistInput;
  return withAccount(accountId, playlists.support.capability, (_, context) => playlists.create(context, clean));
}

export async function updateAccountPlaylist(accountId: string, playlistId: string, patch: unknown): Promise<PlaylistSummary> {
  if (typeof playlistId !== "string" || !ITEM_ID.test(playlistId)) throw new Error("Playlist invalide.");
  const playlists = requirePlaylists(accountContext(accountId).connector);
  const clean = cleanPlaylistInput(patch, playlists.support, true);
  if (Object.keys(clean).length === 0) throw new Error("Rien à modifier.");
  return withAccount(accountId, playlists.support.capability, (_, context) => playlists.update(context, playlistId, clean));
}

export async function addVideoToAccountPlaylist(accountId: string, playlistId: string, videoId: string): Promise<void> {
  if (typeof playlistId !== "string" || !ITEM_ID.test(playlistId)) throw new Error("Playlist invalide.");
  if (typeof videoId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(videoId)) throw new Error("Vidéo invalide.");
  const playlists = requirePlaylists(accountContext(accountId).connector);
  const addVideo = playlists.addVideo;
  if (!addVideo) throw new Error("Ce service ne permet pas d’ajouter une vidéo à une playlist.");
  await withAccount(accountId, playlists.support.capability, (_, context) => addVideo(context, playlistId, videoId));
}

/** Quotas du jour du service de ce compte (partagés par tous ses comptes). */
export function quotaForAccount(accountId: string): QuotaUsage | null {
  const { connector } = accountContext(accountId);
  return getQuotaUsage(connector);
}

/** Quota propre au compte, sur sa fenêtre glissante (absent si le service n'en déclare pas). */
export function accountQuotaForAccount(accountId: string): AccountQuotaUsage | null {
  const { connector } = accountContext(accountId);
  return getAccountQuotaUsage(connector, accountId);
}

/** Oublie la liste gardée en mémoire (déconnexion). */
export function forgetPosts(accountId: string) {
  postsCache.delete(accountId);
}
