/**
 * Connecteur TikTok (dossier 07e).
 *
 * Connexion par Login Kit pour le Web : OAuth 2.0 classique avec
 * `client_key` et `client_secret`, sans PKCE (réservé par TikTok aux
 * applications mobiles et de bureau). Jeton d'accès de 24 heures, jeton
 * d'actualisation d'un an, qui peut changer à chaque renouvellement ;
 * révocation par `POST /v2/oauth/revoke/`.
 *
 * Publication par Content Posting API : en brouillon dans la boîte de
 * réception de TikTok par défaut (`video.upload`), en publication directe
 * (`video.publish`) seulement quand l'application est déclarée auditée par
 * TikTok, avec l'écran que TikTok exige (`publishForm`).
 */

import type { AccountQuota, Connector } from "../../types";
import { TIKTOK_AUTHORIZE_URL, TIKTOK_TOKEN_URL, fetchTiktokProfile, listTiktokVideos, revokeTiktokAccess } from "./api";
import {
  AUDITED_SETTING,
  CAPTION_MAX,
  SCOPE_BASIC,
  SCOPE_LIST,
  SCOPE_PROFILE,
  SCOPE_PUBLISH,
  SCOPE_UPLOAD,
  TIKTOK_LIMITS,
  TIKTOK_PUBLISH_FIELDS,
  buildPublishForm,
  normalizeTiktokOptions,
  utf16Length,
} from "./options";
import { publishToTiktok } from "./publish";
import { TIKTOK_PROFILE_FIELDS, readTiktokProfile } from "./profile";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Limites propres à chaque compte, sur 24 heures glissantes : une
 * quinzaine de publications directes (« typically around 15 », toutes
 * applications confondues, d'après TikTok) et cinq brouillons en attente.
 * Le compte local ne voit pas ce qui part d'ailleurs : un refus de TikTok
 * (`spam_risk_too_many_posts`, `spam_risk_too_many_pending_share`) suspend
 * aussi le compte.
 */
export const tiktokAccountQuota: AccountQuota = {
  windowMs: DAY_MS,
  buckets: [
    { id: "posts", label: "Publications directes", limit: 15 },
    { id: "drafts", label: "Brouillons envoyés", limit: 5 },
  ],
  cost: (method) => {
    if (method === "tiktok.direct") return { bucket: "posts", units: 1 };
    if (method === "tiktok.inbox") return { bucket: "drafts", units: 1 };
    return null;
  },
};

export const tiktokConnector: Connector = {
  id: "tiktok",
  label: "TikTok",
  logo: "tiktok",
  accountNoun: { one: "compte", many: "comptes" },
  status: "ready",
  capabilities: [
    // Brouillon (`video.upload`) ou publication directe (`video.publish`) : l'une suffit.
    { capability: "publish.video", scopes: [SCOPE_UPLOAD, SCOPE_PUBLISH] },
    { capability: "posts.list", scopes: [SCOPE_LIST] },
  ],
  app: {
    envPrefix: "TIKTOK",
    envNames: { clientId: "TIKTOK_CLIENT_KEY", clientSecret: "TIKTOK_CLIENT_SECRET" },
    credentialLabels: { clientId: "Client key", clientSecret: "Client secret" },
    consoleUrl: "https://developers.tiktok.com/apps/",
    setupSteps: [
      "Sur developers.tiktok.com, « Manage apps » puis « Connect an app » : nom, icône carrée de 1 024 px, catégorie et description (affichées à la personne qui autorise), plateforme « Web » avec l’adresse du site, liens vers les conditions d’utilisation et la politique de confidentialité.",
      "Products : ajouter « Login Kit » et « Content Posting API ». Dans Login Kit, coller l’adresse de retour ci-dessus, identique au caractère près (HTTPS, sans paramètre).",
      "Scopes : « user.info.basic » et « video.upload » (brouillons) ; « user.info.profile » pour le pseudo et la bio ; « video.list » pour lister les vidéos ; « video.publish » seulement pour la publication directe (activer aussi « Direct Post » dans Content Posting API).",
      "Pour essayer sans revue : créer un bac à sable (Sandbox), y ajouter jusqu’à dix comptes cibles (Target users) dont vous avez les identifiants, et recopier ici la « Client key » et le « Client secret » du bac à sable.",
      "Pour la production : soumettre l’application à la revue de TikTok (une à cinq vidéos de démonstration, une justification par portée), puis recopier ici la « Client key » et le « Client secret » de production.",
      "La publication directe reste désactivée tant que l’application n’a pas passé l’audit de TikTok (Content Sharing Guidelines). Une fois l’audit obtenu, cocher « Application auditée par TikTok » ci-dessous.",
    ],
    settings: [
      {
        key: AUDITED_SETTING,
        kind: "toggle",
        label: "Application auditée par TikTok",
        help: "À cocher seulement après l’audit de TikTok. Sans audit, TikTok n’accepte la publication directe que pour un compte privé, en « Moi uniquement », et pour cinq comptes par 24 heures : ShareX Manager envoie alors en brouillon dans la boîte de réception de TikTok.",
      },
    ],
    disconnectHelp: "TikTok n’a pas confirmé le retrait de l’accès : retirez aussi l’application dans les réglages de l’application TikTok (Paramètres et confidentialité, applications autorisées).",
  },
  oauth: {
    authorizeUrl: TIKTOK_AUTHORIZE_URL,
    tokenUrl: TIKTOK_TOKEN_URL,
    // Login Kit pour le Web : pas de PKCE (TikTok ne le demande qu'aux applications mobiles et de bureau).
    pkce: false,
    clientIdParam: "client_key",
    scopeSeparator: ",",
    scopeSets: [
      {
        id: "drafts",
        label: "Brouillons",
        description: "Envoyer des vidéos en brouillon dans la boîte de réception de TikTok, à finir dans l’application.",
        scopes: [SCOPE_BASIC, SCOPE_UPLOAD],
      },
      {
        id: "all",
        label: "Tout",
        description: "Brouillons, publication directe (application auditée), pseudo et bio, liste des vidéos.",
        scopes: [SCOPE_BASIC, SCOPE_PROFILE, SCOPE_UPLOAD, SCOPE_PUBLISH, SCOPE_LIST],
      },
    ],
  },
  tokenLifetime: {
    // Jeton de 24 heures renouvelé par la tâche de fond deux heures avant son échéance : le jeton d'actualisation (un an) reste vivant même sans publication.
    renewBeforeMs: 2 * 60 * 60 * 1000,
    schedule: "scheduled",
    defaultMs: DAY_MS,
  },
  revokeAccess: (tokens, context) => revokeTiktokAccess(tokens, context),
  fetchProfile: (token) => fetchTiktokProfile(token),
  accountQuota: tiktokAccountQuota,
  limits: TIKTOK_LIMITS,
  measureText: (text) => ({ used: utf16Length(text), max: CAPTION_MAX }),
  publishFields: TIKTOK_PUBLISH_FIELDS,
  publishForm: (context, input) => buildPublishForm(context, input),
  normalizeOptions: (options, source, context) => {
    const normalized = normalizeTiktokOptions(options, source, context);
    return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
  },
  publish: (context) => publishToTiktok(context),
  continuePublish: (context) => publishToTiktok(context),
  posts: {
    list: (context) => listTiktokVideos(context),
  },
  profileFields: TIKTOK_PROFILE_FIELDS,
  readProfile: readTiktokProfile,
};
