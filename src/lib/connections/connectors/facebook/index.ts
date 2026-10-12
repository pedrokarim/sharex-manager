/**
 * Connecteur Facebook : publication sur une Page (dossier 07a).
 *
 * Une autorisation rend toutes les Pages choisies au consentement, chacune
 * avec son propre jeton de Page, qui n'expire pas. L'application Meta est de
 * type Business, avec Facebook Login for Business : le dialogue d'autorisation
 * porte l'identifiant de configuration (`config_id`, réglage d'application).
 * Sans revue de l'application, seules les personnes qui ont un rôle sur elle
 * peuvent connecter leurs Pages, ce qui suffit à une instance personnelle.
 */

import type { Connector, PublishContext } from "../../types";
import { exchangeLongLivedToken, fetchFacebookPage, fetchFacebookPages, fetchGrantedFacebookScopes } from "./auth";
import { FACEBOOK_ID, GRAPH_VERSION } from "./graph";
import {
  FACEBOOK_ACCOUNT_QUOTA,
  FACEBOOK_LIMITS,
  FACEBOOK_PUBLISH_FIELDS,
  FACEBOOK_SHORT_FORM,
  type FacebookOptions,
  normalizeFacebookOptions,
} from "./metadata";
import { facebookProcessing, findExistingPost, listPagePosts, publishPhoto, publishText, removePagePost, updatePagePost } from "./posts";
import { publishReel } from "./reels";
import { publishPageVideo } from "./videos";

export const SCOPE_SHOW_LIST = "pages_show_list";
export const SCOPE_READ_ENGAGEMENT = "pages_read_engagement";
export const SCOPE_MANAGE_POSTS = "pages_manage_posts";

/** Publie selon la source : message, photo, Reel ou vidéo de la Page. */
async function publish(context: PublishContext) {
  // Les bornes de programmation ont été vérifiées à la mise en file.
  const options: FacebookOptions = normalizeFacebookOptions(context.options, context.source, null);
  switch (context.source.kind) {
    case "text":
      return publishText(context, options);
    case "image":
      return publishPhoto(context, options);
    case "video":
      return options.format === "reel" ? publishReel(context, options) : publishPageVideo(context, options);
    default:
      throw new Error("Facebook : la publication de plusieurs fichiers à la fois n’est pas encore prise en charge.");
  }
}

export const facebookConnector: Connector = {
  id: FACEBOOK_ID,
  label: "Facebook",
  logo: "facebook",
  accountNoun: { one: "page", many: "pages" },
  status: "ready",
  // `pages_manage_posts` dépend de `pages_read_engagement` et `pages_show_list` :
  // Meta les accorde ensemble. Une Page sans la tâche CREATE_CONTENT ne garde
  // que la lecture (restriction rendue par `fetchAccounts`).
  capabilities: [
    { capability: "publish.video", scopes: [SCOPE_MANAGE_POSTS] },
    { capability: "publish.image", scopes: [SCOPE_MANAGE_POSTS] },
    { capability: "publish.text", scopes: [SCOPE_MANAGE_POSTS] },
    { capability: "posts.list", scopes: [SCOPE_READ_ENGAGEMENT] },
    { capability: "posts.manage", scopes: [SCOPE_MANAGE_POSTS] },
  ],
  app: {
    envPrefix: "FACEBOOK",
    consoleUrl: "https://developers.facebook.com/apps/",
    setupSteps: [
      "Sur Meta for Developers, avec le compte Facebook qui administre la Page : « Créer une application », cas d’usage « Manage everything on your Page » (application de type Business).",
      "Dans ce cas d’usage, ajouter les autorisations pages_manage_posts et pages_read_engagement (pages_show_list est déjà présente).",
      "Facebook Login for Business > Paramètres : URI de redirection OAuth valide = l’URI ci-dessus ; laisser « Client OAuth login », « Web OAuth login » et « Enforce HTTPS » activés.",
      "Facebook Login for Business > Configurations : créer une configuration avec le type de jeton « Jeton d’accès utilisateur » et les autorisations pages_show_list, pages_read_engagement et pages_manage_posts ; recopier son identifiant ici (ou dans FACEBOOK_CONFIG_ID).",
      "Paramètres > Général : recopier l’identifiant et la clé secrète de l’application (ou les définir dans FACEBOOK_CLIENT_ID et FACEBOOK_CLIENT_SECRET).",
      "Conseillé : Paramètres > Avancé > Sécurité, activer « Exiger la clé secrète » ; ShareX Manager signe chaque appel.",
      "Ne pas soumettre de revue : elle ne sert qu’à ouvrir l’application à des personnes sans rôle sur elle. Si Meta demande de publier le cas d’usage, fournir l’icône, la politique de confidentialité (<AUTH_URL>/legal/privacy) et une adresse de suppression des données.",
      "Après la première publication, ouvrir la Page dans une fenêtre privée : une publication visible seulement de vous signale une application restée en mode Développement.",
    ],
    disconnectHelp: "Facebook ne permet pas de retirer l’accès par son API : retirez l’application dans Paramètres Facebook > Sécurité et connexion > Intégrations professionnelles.",
    settings: [
      {
        key: "config_id",
        label: "Identifiant de configuration (Facebook Login for Business)",
        help: "Affiché dans Facebook Login for Business > Configurations, après création d’une configuration à jeton d’accès utilisateur.",
        required: true,
        env: "FACEBOOK_CONFIG_ID",
        authorizeParam: true,
        pattern: "^[0-9]{5,25}$",
      },
    ],
  },
  oauth: {
    authorizeUrl: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
    // Meta ne documente pas PKCE dans ce flux (seulement dans le flux OIDC, « still in testing »).
    pkce: false,
    // Meta ne documente que l'échange du code en GET.
    tokenMethod: "GET",
    scopeSeparator: ",",
    scopeSets: [
      {
        id: "all",
        label: "Tout",
        description: "Publier des Reels, des vidéos, des photos et des messages, lister et gérer les publications.",
        scopes: [SCOPE_SHOW_LIST, SCOPE_READ_ENGAGEMENT, SCOPE_MANAGE_POSTS],
      },
      {
        id: "read",
        label: "Lecture seule",
        description: "Lister les publications ; la publication reste grisée.",
        scopes: [SCOPE_SHOW_LIST, SCOPE_READ_ENGAGEMENT],
      },
    ],
  },
  accountQuota: FACEBOOK_ACCOUNT_QUOTA,
  exchangeToken: exchangeLongLivedToken,
  fetchGrantedScopes: fetchGrantedFacebookScopes,
  fetchAccounts: fetchFacebookPages,
  fetchProfile: fetchFacebookPage,
  limits: FACEBOOK_LIMITS,
  publishFields: FACEBOOK_PUBLISH_FIELDS,
  shortForm: FACEBOOK_SHORT_FORM,
  normalizeOptions: (options, source) => ({ ...normalizeFacebookOptions(options, source) }),
  publish,
  checkProcessing: facebookProcessing,
  findExisting: findExistingPost,
  posts: {
    list: (context) => listPagePosts(context),
    update: updatePagePost,
    remove: removePagePost,
  },
};
