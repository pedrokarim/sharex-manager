/**
 * Connecteur Instagram (dossier 07b), voie « Instagram API with Instagram
 * Login » : compte professionnel (créateur ou entreprise), sans Page
 * Facebook, sans revue d'application pour les comptes du propriétaire de
 * l'instance.
 *
 * - Une connexion désigne un compte : pour un second compte, on reconnecte
 *   (`force_reauth` évite de retomber sur la session Instagram ouverte).
 * - Jeton longue durée de 60 jours, sans jeton d'actualisation, prolongé par
 *   la tâche de fond du cœur quand il lui reste moins de 30 jours.
 * - Instagram télécharge les fichiers à une adresse publique temporaire de
 *   l'instance : elle doit être joignable depuis Internet.
 * - Ni suppression ni modification par l'API dans cette voie.
 */

import type { Connector } from "../../types";
import { exchangeForLongLived, fetchInstagramProfile, parseInstagramTokenResponse, refreshLongLived } from "./auth";
import { INSTAGRAM_ACCOUNT_QUOTA, INSTAGRAM_LIMITS } from "./limits";
import { INSTAGRAM_PUBLISH_FIELDS, normalizeInstagramOptions } from "./metadata";
import { listInstagramPosts } from "./posts";
import { findExistingInstagramPost, publishToInstagram } from "./publish";
import { COMMENT_MAX_CHARS, postInstagramComment } from "./follow-ups";

export const SCOPE_BASIC = "instagram_business_basic";
export const SCOPE_PUBLISH = "instagram_business_content_publish";
/** Premier commentaire : jamais demandée à la première connexion, seulement ajoutée à la demande. */
export const SCOPE_MANAGE_COMMENTS = "instagram_business_manage_comments";

const DAY = 24 * 60 * 60 * 1000;

export const instagramConnector: Connector = {
  id: "instagram",
  label: "Instagram",
  logo: "instagram",
  accountNoun: { one: "compte", many: "comptes" },
  status: "ready",
  // Publier exige les deux portées : `instagram_business_basic` sert à tout
  // appel et au renouvellement du jeton.
  capabilities: [
    { capability: "publish.video", scopes: [SCOPE_PUBLISH], allOf: [SCOPE_BASIC] },
    { capability: "publish.image", scopes: [SCOPE_PUBLISH], allOf: [SCOPE_BASIC] },
    { capability: "posts.list", scopes: [SCOPE_BASIC] },
    { capability: "comment.create", scopes: [SCOPE_MANAGE_COMMENTS], allOf: [SCOPE_BASIC] },
  ],
  app: {
    envPrefix: "INSTAGRAM",
    consoleUrl: "https://developers.facebook.com/apps/",
    setupSteps: [
      "Passer le compte Instagram en compte professionnel (créateur ou entreprise), dans l’application Instagram.",
      "Sur developers.facebook.com, créer une application de type « Business » et lui ajouter le cas d’usage « Manage messaging and content on Instagram », puis choisir « API setup with Instagram Login ».",
      "Dans « Generate access tokens », cliquer sur « Add account » et se connecter avec le compte Instagram à publier : c’est ce qui le rend utilisable sans revue d’application.",
      "Dans « Set up Instagram business login », ajouter l’URI de redirection ci-dessus, puis vérifier dans « Business login settings » qu’aucune barre oblique n’a été ajoutée à la fin.",
      "Recopier ici l’« Instagram app ID » et l’« Instagram app secret » affichés sur la même page (pas l’identifiant de l’application Meta), ou les définir dans INSTAGRAM_CLIENT_ID et INSTAGRAM_CLIENT_SECRET.",
      "Facultatif, pour le premier commentaire : vérifier que l’autorisation instagram_business_manage_comments figure dans le cas d’usage. Elle n’est demandée qu’au moment où vous l’ajoutez à un compte déjà connecté.",
      "Ne pas demander de revue d’application : elle ne sert qu’à publier pour des comptes qui ne sont pas les vôtres.",
      "L’instance doit être joignable en HTTPS depuis Internet : Instagram vient télécharger chaque fichier à une adresse temporaire sous /api/connections/media/. Derrière Cloudflare, exempter ce seul chemin des défis anti-robots.",
    ],
    disconnectHelp:
      "Instagram ne permet pas de retirer l’accès par son API : dans les réglages d’Instagram, ouvrez la rubrique des applications et sites web, puis retirez l’application.",
  },
  oauth: {
    authorizeUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    // PKCE n'est pas documenté par Instagram : `state` et le cookie signé du cœur suffisent.
    pkce: false,
    scopeSeparator: ",",
    // Toujours demander les identifiants : permet de choisir un autre compte.
    extraParams: { force_reauth: "true" },
    parseTokenResponse: (body) => parseInstagramTokenResponse(body),
    scopeSets: [
      {
        id: "publish",
        label: "Publier",
        description: "Publier des Reels et des images, et lister les publications.",
        scopes: [SCOPE_BASIC, SCOPE_PUBLISH],
      },
      {
        id: "read",
        label: "Lecture seule",
        description: "Lister les publications ; la publication reste grisée.",
        scopes: [SCOPE_BASIC],
      },
    ],
  },
  fetchProfile: fetchInstagramProfile,
  exchangeToken: exchangeForLongLived,
  refreshToken: refreshLongLived,
  // Prolongé quand il reste moins de 30 jours (une fois par mois environ),
  // jamais avant 24 heures, par la tâche de fond même sans publication.
  tokenLifetime: { renewBeforeMs: 30 * DAY, minAgeMs: DAY, schedule: "scheduled" },
  accountQuota: INSTAGRAM_ACCOUNT_QUOTA,
  limits: INSTAGRAM_LIMITS,
  // Deux heures : le temps qu'Instagram télécharge et traite un long Reel.
  publicMedia: { ttlMs: 2 * 60 * 60 * 1000, maxDownloads: 5 },
  publishFields: INSTAGRAM_PUBLISH_FIELDS,
  shortForm: {
    maxSeconds: 900,
    verticalNote: "Publié en Reel ; le 9:16 évite recadrage et bandes.",
    horizontalNote: "Publié en Reel quand même, avec des bandes : préférez un export vertical.",
  },
  normalizeOptions: (options, source) => ({ ...normalizeInstagramOptions(options, source) }),
  publish: publishToInstagram,
  followUps: {
    comment: {
      maxLength: COMMENT_MAX_CHARS,
      documented: false,
      help: "Posté par le compte juste après la publication. Instagram ne documente aucune limite : celle de la légende est appliquée.",
    },
    // Couverture d'un Reel : envoyée avec le conteneur (`cover_url`), jamais après.
    cover: { mode: "publish", option: { key: "cover", value: "custom" }, limits: INSTAGRAM_LIMITS.cover, sourceKinds: ["video"] },
  },
  postComment: postInstagramComment,
  findExisting: findExistingInstagramPost,
  posts: {
    list: listInstagramPosts,
  },
};
