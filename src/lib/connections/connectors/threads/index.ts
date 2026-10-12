/**
 * Connecteur Threads (dossier 07c).
 *
 * Une autorisation désigne un seul profil Threads. Sans revue de Meta,
 * l'application reste en développement et ne sert qu'aux profils invités
 * comme « Threads Tester », ce qui suffit à une instance personnelle.
 *
 * Jetons : le code donne un jeton d'une heure, aussitôt échangé contre un
 * jeton de 60 jours (`th_exchange_token`), prolongé de 60 jours par
 * `th_refresh_token` dès qu'il a 24 heures. Il n'y a pas de jeton
 * d'actualisation ni de révocation par l'API.
 */

import type { AccountQuota, Connector } from "../../types";
import {
  THREADS_AUTHORIZE_URL,
  THREADS_TOKEN_URL,
  deleteThreadsPost,
  exchangeForLongLived,
  fetchThreadsProfile,
  fetchThreadsScopes,
  listThreadsPosts,
  refreshLongLived,
} from "./api";
import { TEXT_MAX, THREADS_LIMITS, THREADS_PUBLISH_FIELDS, normalizeThreadsOptions } from "./options";
import { findExistingThreadsPost, publishToThreads } from "./publish";
import { REPLY_QUOTA_METHOD, postThreadsReply } from "./follow-ups";

export const SCOPE_BASIC = "threads_basic";
export const SCOPE_PUBLISH = "threads_content_publish";
export const SCOPE_DELETE = "threads_delete";
/** Réponses (premier commentaire) : jamais demandée à la première connexion, seulement ajoutée à la demande. */
export const SCOPE_MANAGE_REPLIES = "threads_manage_replies";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Limites propres à chaque profil, sur 24 heures glissantes : 250
 * publications (un carrousel compte pour une) et 100 suppressions. L'usage
 * réel est aussi relu chez Threads avant chaque publication.
 */
export const threadsAccountQuota: AccountQuota = {
  windowMs: DAY_MS,
  buckets: [
    { id: "posts", label: "Publications", limit: 250 },
    { id: "deletes", label: "Suppressions", limit: 100 },
    { id: "replies", label: "Réponses", limit: 1000 },
  ],
  cost: (method) => {
    if (method === "threads_publish") return { bucket: "posts", units: 1 };
    if (method === REPLY_QUOTA_METHOD) return { bucket: "replies", units: 1 };
    if (method === "threads.delete") return { bucket: "deletes", units: 1 };
    return null;
  },
};

export const threadsConnector: Connector = {
  id: "threads",
  label: "Threads",
  logo: "threads",
  accountNoun: { one: "profil", many: "profils" },
  status: "ready",
  capabilities: [
    { capability: "publish.text", scopes: [SCOPE_PUBLISH] },
    { capability: "publish.image", scopes: [SCOPE_PUBLISH] },
    { capability: "publish.video", scopes: [SCOPE_PUBLISH] },
    { capability: "posts.list", scopes: [SCOPE_BASIC] },
    // La gestion se réduit à la suppression : l'API ne modifie pas une publication.
    { capability: "posts.manage", scopes: [SCOPE_DELETE] },
    // Premier commentaire : réponse du profil à sa propre publication.
    { capability: "comment.create", scopes: [SCOPE_MANAGE_REPLIES], allOf: [SCOPE_PUBLISH] },
  ],
  app: {
    envPrefix: "THREADS",
    consoleUrl: "https://developers.facebook.com/apps/",
    setupSteps: [
      "Créer une application sur developers.facebook.com/apps/creation avec le cas d’usage « Access the Threads API », sans portefeuille d’entreprise. Une application à part, distincte de celle de Facebook ou d’Instagram.",
      "Use cases › Customize : ajouter « threads_content_publish » et « threads_delete » (« threads_basic » est déjà là).",
      "Settings du cas d’usage : recopier ici le « Threads App ID » et le « Threads App secret » (pas l’identifiant de l’application Meta), et coller l’URI de redirection ci-dessus dans « Valid OAuth Redirect URIs », identique au caractère près.",
      "App roles › Roles › Add People › Threads Tester : inviter chaque profil Threads à connecter, puis accepter l’invitation dans Threads (Paramètres › Compte › Autorisations des sites web).",
      "Facultatif, pour le premier commentaire (réponse à sa propre publication) : ajouter aussi « threads_manage_replies » au cas d’usage. Elle n’est demandée qu’au moment où vous l’ajoutez à un profil déjà connecté.",
      "Laisser l’application en développement : sans revue de Meta, elle publie pour les profils invités, ce qui suffit à une instance personnelle.",
      "Le site doit être joignable depuis Internet en HTTPS : Threads vient chercher images et vidéos sous /api/connections/media/. Derrière Cloudflare, exempter ce seul chemin des défis anti-robots.",
    ],
    disconnectHelp:
      "Threads ne permet pas de retirer l’accès par son API : retirez aussi l’application dans Threads, Paramètres › Compte › Autorisations des sites web.",
  },
  oauth: {
    authorizeUrl: THREADS_AUTHORIZE_URL,
    tokenUrl: THREADS_TOKEN_URL,
    // La documentation de Threads ne prévoit pas PKCE.
    pkce: false,
    scopeSeparator: ",",
    scopeSets: [
      {
        id: "all",
        label: "Tout",
        description: "Publier des messages, des images et des vidéos, lister et supprimer les publications.",
        scopes: [SCOPE_BASIC, SCOPE_PUBLISH, SCOPE_DELETE],
      },
      {
        id: "publish",
        label: "Publication seulement",
        description: "Publier et lister ; la suppression reste grisée.",
        scopes: [SCOPE_BASIC, SCOPE_PUBLISH],
      },
    ],
  },
  exchangeToken: (tokens, context) => exchangeForLongLived(tokens, context),
  refreshToken: (_account, tokens) => refreshLongLived(tokens),
  fetchGrantedScopes: (token) => fetchThreadsScopes(token),
  tokenLifetime: {
    // Prolongé dès qu'il a dix jours (il en vaut soixante) : un renouvellement
    // manqué laisse cinquante jours pour réessayer, et chaque renouvellement
    // prolonge aussi l'accord du profil (90 jours).
    renewBeforeMs: 50 * DAY_MS,
    minAgeMs: DAY_MS,
    schedule: "scheduled",
    // Le jeton court rendu par l'échange du code n'a pas d'`expires_in` : une heure.
    defaultMs: 60 * 60 * 1000,
  },
  accountQuota: threadsAccountQuota,
  limits: THREADS_LIMITS,
  publicMedia: { ttlMs: 60 * 60 * 1000, maxDownloads: 5 },
  fetchProfile: (token) => fetchThreadsProfile(token),
  publishFields: THREADS_PUBLISH_FIELDS,
  normalizeOptions: (options, source) => {
    const normalized = normalizeThreadsOptions(options, source);
    return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
  },
  publish: publishToThreads,
  followUps: {
    comment: {
      maxLength: TEXT_MAX,
      count: "emoji-bytes",
      documented: true,
      help: "Publié comme une réponse du profil à sa propre publication ; 500 caractères au plus, un émoji comptant pour plusieurs.",
    },
  },
  postComment: postThreadsReply,
  findExisting: findExistingThreadsPost,
  posts: {
    list: (context) => listThreadsPosts(context),
    remove: deleteThreadsPost,
  },
};
