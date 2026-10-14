"use server";

/**
 * Actions serveur de « Comptes connectés ». Chacune vérifie la session
 * administrateur : une action est joignable par une requête directe, pas
 * seulement depuis la page. Les erreurs sont rendues comme valeur, avec leur
 * message en français : une erreur levée serait masquée en production.
 */

import { clearAppConfig, saveAppConfig } from "@/lib/connections/apps";
import { disconnectAccount, getAccountSummary, renameAccount, verifyAccount, type DisconnectResult } from "@/lib/connections/accounts";
import { cancelPendingAuthorization, finalizePendingAuthorization, readPendingAuthorization, type PendingAuthorizationView } from "@/lib/connections/pending";
import { getBillingStatus, setMonthlyBudget, type BillingStatus } from "@/lib/connections/billing";
import { getConnector } from "@/lib/connections/registry";
import { wakePublishQueue } from "@/lib/connections/publish-queue";
import { cancelJob, cancelJobsForAccount, listJobs, retryJob } from "@/lib/connections/publish-queue";
import { accountPublishForm, accountQuotaForAccount, forgetPosts, listPosts, quotaForAccount, removePost, updatePost } from "@/lib/connections/manage";
import {
  accountProfileChoices,
  addAccountSection,
  addVideoToAccountPlaylist,
  createAccountPlaylist,
  listAccountPlaylists,
  listAccountSections,
  moveAccountSection,
  readAccountProfile,
  removeAccountSection,
  updateAccountPlaylist,
  updateAccountProfile,
} from "@/lib/connections/manage";
import { errorMessage } from "@/lib/connections/errors";
import { auditConnection } from "@/lib/connections/audit";
import type {
  AccountQuotaUsage,
  AccountSummary,
  LivePublishForm,
  PlaylistInput,
  PlaylistSummary,
  PostPatch,
  PostSummary,
  ProfileChoice,
  ProfileSection,
  ProfileSnapshot,
  PublishJobSummary,
  QuotaUsage,
} from "@/lib/connections/types";
import { adminSession, connectionsOverview, type ConnectionsOverview } from "./data";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(task: (session: NonNullable<Awaited<ReturnType<typeof adminSession>>>) => Promise<T> | T): Promise<ActionResult<T>> {
  const session = await adminSession();
  if (!session) return { ok: false, error: "Réservé aux administrateurs." };
  try {
    return { ok: true, data: await task(session) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Action impossible.") };
  }
}

const isId = (value: unknown): value is string => typeof value === "string" && /^[a-z]{2,8}-[a-z0-9]{6,40}$/.test(value);

function requireId(value: unknown): string {
  if (!isId(value)) throw new Error("Identifiant invalide.");
  return value;
}

// ─── Page de la liste ─────────────────────────────────────────────

export async function getOverviewAction(): Promise<ActionResult<ConnectionsOverview>> {
  return run(() => connectionsOverview());
}

export async function saveAppAction(
  connectorId: string,
  input: { clientId?: string; clientSecret?: string; settings?: Record<string, string> }
): Promise<ActionResult<ConnectionsOverview>> {
  return run((session) => {
    saveAppConfig(String(connectorId), { clientId: input?.clientId, clientSecret: input?.clientSecret, settings: input?.settings });
    auditConnection(session, `Application ${connectorId} configurée depuis « Comptes connectés »`, { connector: connectorId });
    return connectionsOverview();
  });
}

export async function clearAppAction(connectorId: string): Promise<ActionResult<ConnectionsOverview>> {
  return run((session) => {
    clearAppConfig(String(connectorId));
    auditConnection(session, `Configuration de l’application ${connectorId} effacée`, { connector: connectorId });
    return connectionsOverview();
  });
}

export async function renameAccountAction(accountId: string, label: string): Promise<ActionResult<AccountSummary>> {
  return run(() => renameAccount(requireId(accountId), label));
}

export async function verifyAccountAction(accountId: string): Promise<ActionResult<AccountSummary>> {
  return run(() => verifyAccount(requireId(accountId)));
}

export async function disconnectAccountAction(accountId: string): Promise<ActionResult<DisconnectResult>> {
  return run(async (session) => {
    const id = requireId(accountId);
    const account = getAccountSummary(id);
    if (!account) throw new Error("Compte introuvable.");
    cancelJobsForAccount(id);
    const result = await disconnectAccount(id);
    forgetPosts(id);
    auditConnection(session, `Compte déconnecté : ${account.connectorLabel} « ${account.name} »${result.revoked ? "" : " (révocation non confirmée)"}`, {
      connector: account.connector,
      accountId: id,
    });
    return result;
  });
}

// ─── Choix des comptes après une autorisation ─────────────────────

/** Comptes trouvés par une autorisation en attente (sans jeton), pour l'administrateur qui l'a lancée. */
export async function getPendingAuthorizationAction(pendingId: string): Promise<ActionResult<PendingAuthorizationView>> {
  return run((session) => {
    const view = readPendingAuthorization(String(pendingId), String(session.user?.id ?? ""));
    if (!view) throw new Error("Le choix des comptes a expiré : recommencez la connexion.");
    return view;
  });
}

/** Enregistre les comptes cochés (par identifiant chez le service) ; les autres sont oubliés. */
export async function finalizePendingAuthorizationAction(pendingId: string, keep: string[]): Promise<ActionResult<{ grantId: string; accounts: AccountSummary[] }>> {
  return run((session) => {
    const result = finalizePendingAuthorization(String(pendingId), String(session.user?.id ?? ""), Array.isArray(keep) ? keep.map(String) : []);
    for (const account of result.accounts) {
      auditConnection(session, `Compte connecté : ${account.connectorLabel} « ${account.name} »`, { connector: account.connector, accountId: account.id });
    }
    wakePublishQueue();
    return result;
  });
}

export async function cancelPendingAuthorizationAction(pendingId: string): Promise<ActionResult<{ cancelled: true }>> {
  return run((session) => {
    cancelPendingAuthorization(String(pendingId), String(session.user?.id ?? ""));
    return { cancelled: true as const };
  });
}

// ─── Services payants ─────────────────────────────────────────────

export async function getBillingAction(connectorId: string): Promise<ActionResult<BillingStatus | null>> {
  return run(() => {
    const connector = getConnector(String(connectorId));
    if (!connector) throw new Error("Service inconnu.");
    return getBillingStatus(connector);
  });
}

/** Budget mensuel d'un service payant (`null` : aucun). */
export async function setMonthlyBudgetAction(connectorId: string, amount: number | null): Promise<ActionResult<BillingStatus | null>> {
  return run((session) => {
    const connector = getConnector(String(connectorId));
    if (!connector) throw new Error("Service inconnu.");
    setMonthlyBudget(connector, amount === null ? null : Number(amount));
    auditConnection(session, `Budget mensuel ${connector.label} : ${amount === null ? "aucun" : amount}`, { connector: connector.id });
    return getBillingStatus(connector);
  });
}

// ─── Fiche d'un compte ────────────────────────────────────────────

export async function listPostsAction(accountId: string, refresh = false): Promise<ActionResult<{ posts: PostSummary[]; fetchedAt: number }>> {
  return run(() => listPosts(requireId(accountId), { refresh: Boolean(refresh) }));
}

export async function updatePostAction(accountId: string, postId: string, patch: PostPatch): Promise<ActionResult<PostSummary>> {
  return run(async (session) => {
    const post = await updatePost(requireId(accountId), String(postId), sanitizePatch(patch));
    auditConnection(session, `Publication modifiée : « ${post.title} »`, { accountId, postId, fields: Object.keys(patch ?? {}) });
    return post;
  });
}

export async function removePostAction(accountId: string, postId: string, title: string): Promise<ActionResult<{ removed: true }>> {
  return run(async (session) => {
    await removePost(requireId(accountId), String(postId));
    auditConnection(session, `Publication supprimée : « ${String(title).slice(0, 120)} »`, { accountId, postId }, "warning");
    return { removed: true as const };
  });
}

export async function accountActivityAction(
  accountId: string
): Promise<ActionResult<{ jobs: PublishJobSummary[]; quota: QuotaUsage | null; accountQuota: AccountQuotaUsage | null; account: AccountSummary | null }>> {
  return run(() => {
    const id = requireId(accountId);
    return { jobs: listJobs({ accountId: id }), quota: quotaForAccount(id), accountQuota: accountQuotaForAccount(id), account: getAccountSummary(id) };
  });
}

/**
 * Mesure d'un texte propre au service, côté serveur (`Connector.measureText`),
 * pour le compteur de la fenêtre de publication ; `null` quand le service n'en
 * a pas (la mesure du navigateur, `limits.text.count`, fait alors foi).
 */
export async function measureTextAction(connectorId: string, text: string): Promise<ActionResult<{ used: number; max: number } | null>> {
  return run(() => {
    const connector = getConnector(String(connectorId));
    if (!connector) throw new Error("Service inconnu.");
    if (!connector.measureText) return null;
    return connector.measureText(String(text ?? "").slice(0, 100_000));
  });
}

/**
 * Formulaire de publication d'un compte lu chez le service à l'affichage de
 * l'écran Publier (identité, réglages permis, déclarations) ; `null` quand
 * le service n'en a pas.
 */
export async function publishFormAction(
  accountId: string,
  media: { kind: "video" | "image" | "text" | "carousel"; durationMs?: number }
): Promise<ActionResult<LivePublishForm | null>> {
  return run(() => accountPublishForm(requireId(accountId), { kind: media?.kind, durationMs: Number(media?.durationMs) || undefined }));
}

export async function cancelJobAction(jobId: string): Promise<ActionResult<PublishJobSummary>> {
  return run(() => cancelJob(requireId(jobId)));
}

export async function retryJobAction(jobId: string): Promise<ActionResult<PublishJobSummary>> {
  return run(() => retryJob(requireId(jobId)));
}

export async function pushBrandAction(accountId: string, kitId: string, what: "banner" | "watermark"): Promise<ActionResult<{ success: boolean }>> {
  return run(async (session) => {
    const id = requireId(accountId);
    if (what !== "banner" && what !== "watermark") throw new Error("Format inconnu.");
    const { apiModuleManager } = await import("@/lib/modules/module-manager.api");
    const result = (await apiModuleManager.callModuleFunction("brand-kit", "pushBrandToAccount", { kitId: String(kitId), accountId: id, what })) as {
      success: boolean;
    } | null;
    if (!result) throw new Error("Le module « Image de marque » n’est pas chargé.");
    auditConnection(session, `${what === "banner" ? "Bannière" : "Filigrane"} de la marque envoyé au compte ${id}`, { accountId: id, kitId, what });
    return result;
  });
}

// ─── Profil du compte ─────────────────────────────────────────────

export async function readProfileAction(accountId: string): Promise<ActionResult<ProfileSnapshot>> {
  return run(() => readAccountProfile(requireId(accountId)));
}

/** Envoie un ou plusieurs éléments modifiables du profil ; rend les valeurs relues chez le service. */
export async function updateProfileAction(accountId: string, changes: Record<string, unknown>): Promise<ActionResult<ProfileSnapshot>> {
  return run(async (session) => {
    const id = requireId(accountId);
    const snapshot = await updateAccountProfile(id, changes);
    auditConnection(session, `Profil du compte ${id} modifié`, { accountId: id, fields: Object.keys(changes ?? {}).slice(0, 20) });
    return snapshot;
  });
}

export async function profileChoicesAction(accountId: string, key: string): Promise<ActionResult<ProfileChoice[]>> {
  return run(() => accountProfileChoices(requireId(accountId), String(key)));
}

export async function listSectionsAction(accountId: string): Promise<ActionResult<ProfileSection[]>> {
  return run(() => listAccountSections(requireId(accountId)));
}

export async function addSectionAction(accountId: string, input: { type: string; playlistId?: string }): Promise<ActionResult<ProfileSection[]>> {
  return run(async (session) => {
    const id = requireId(accountId);
    const type = String(input?.type ?? "");
    const sections = await addAccountSection(id, { type, ...(input?.playlistId ? { playlistId: String(input.playlistId) } : {}) });
    auditConnection(session, `Section ajoutée à la page d’accueil du compte ${id}`, { accountId: id, type });
    return sections;
  });
}

export async function moveSectionAction(accountId: string, sectionId: string, position: number): Promise<ActionResult<ProfileSection[]>> {
  return run(async (session) => {
    const id = requireId(accountId);
    const sections = await moveAccountSection(id, String(sectionId), Number(position));
    auditConnection(session, `Section déplacée sur la page d’accueil du compte ${id}`, { accountId: id, sectionId, position });
    return sections;
  });
}

export async function removeSectionAction(accountId: string, sectionId: string): Promise<ActionResult<ProfileSection[]>> {
  return run(async (session) => {
    const id = requireId(accountId);
    const sections = await removeAccountSection(id, String(sectionId));
    auditConnection(session, `Section retirée de la page d’accueil du compte ${id}`, { accountId: id, sectionId }, "warning");
    return sections;
  });
}

export async function listPlaylistsAction(accountId: string): Promise<ActionResult<PlaylistSummary[]>> {
  return run(() => listAccountPlaylists(requireId(accountId)));
}

export async function createPlaylistAction(accountId: string, input: PlaylistInput): Promise<ActionResult<PlaylistSummary>> {
  return run(async (session) => {
    const id = requireId(accountId);
    const playlist = await createAccountPlaylist(id, input);
    auditConnection(session, `Playlist créée : « ${playlist.title.slice(0, 120)} »`, { accountId: id, playlistId: playlist.id });
    return playlist;
  });
}

export async function updatePlaylistAction(accountId: string, playlistId: string, patch: Partial<PlaylistInput>): Promise<ActionResult<PlaylistSummary>> {
  return run(async (session) => {
    const id = requireId(accountId);
    const playlist = await updateAccountPlaylist(id, String(playlistId), patch);
    auditConnection(session, `Playlist modifiée : « ${playlist.title.slice(0, 120)} »`, { accountId: id, playlistId, fields: Object.keys(patch ?? {}) });
    return playlist;
  });
}

export async function addPlaylistVideoAction(accountId: string, playlistId: string, videoId: string): Promise<ActionResult<{ added: true }>> {
  return run(async (session) => {
    const id = requireId(accountId);
    await addVideoToAccountPlaylist(id, String(playlistId), String(videoId));
    auditConnection(session, `Vidéo ajoutée à une playlist du compte ${id}`, { accountId: id, playlistId, videoId });
    return { added: true as const };
  });
}

function sanitizePatch(patch: PostPatch): PostPatch {
  const clean: PostPatch = {};
  if (!patch || typeof patch !== "object") return clean;
  if (typeof patch.title === "string") clean.title = patch.title;
  if (typeof patch.description === "string") clean.description = patch.description;
  if (Array.isArray(patch.tags)) clean.tags = patch.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 100);
  if (typeof patch.categoryId === "string") clean.categoryId = patch.categoryId;
  if (patch.privacy === "private" || patch.privacy === "unlisted" || patch.privacy === "public") clean.privacy = patch.privacy;
  if (patch.publishAt === null) clean.publishAt = null;
  else if (typeof patch.publishAt === "string") {
    const date = new Date(patch.publishAt);
    if (Number.isNaN(date.getTime())) throw new Error("Date de programmation invalide.");
    if (date.getTime() < Date.now() + 60_000) throw new Error("La date de programmation doit être dans le futur.");
    clean.publishAt = date.toISOString();
  }
  return clean;
}
