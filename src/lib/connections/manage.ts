/**
 * Gestion d'un compte connecté : publications (liste, modification,
 * suppression), bannière et filigrane, quotas. Chaque action vérifie la
 * capacité du compte ; le connecteur fait l'appel, le cœur garde les jetons.
 */

import type { AccountQuotaUsage, ConnectionCapability, ConnectorContext, Connector, PostPatch, PostSummary, QuotaUsage, WatermarkTiming } from "./types";
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
