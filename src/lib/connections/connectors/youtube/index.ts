/**
 * Connecteur YouTube (dossier 07, § 8.4 à 8.8).
 *
 * Une connexion désigne une chaîne : pour une seconde chaîne, on reconnecte
 * en choisissant l'autre chaîne (ou le compte de marque) chez Google.
 */

import type { Connector } from "../../types";
import { deleteVideo, fetchChannelProfile, listUploads, setChannelBanner, setChannelWatermark, updateVideo, videoProcessing } from "./api";
import { YOUTUBE_PUBLISH_FIELDS, normalizeYoutubeOptions, type YoutubeOptions } from "./metadata";
import { youtubeQuota } from "./quota";
import { uploadVideo } from "./upload";

export const SCOPE_UPLOAD = "https://www.googleapis.com/auth/youtube.upload";
export const SCOPE_MANAGE = "https://www.googleapis.com/auth/youtube";
export const SCOPE_READONLY = "https://www.googleapis.com/auth/youtube.readonly";

export const youtubeConnector: Connector = {
  id: "youtube",
  label: "YouTube",
  logo: "youtube",
  accountNoun: { one: "chaîne", many: "chaînes" },
  status: "ready",
  // Une seule des portées listées suffit. `youtube` couvre tout ce que
  // couvre `youtube.upload`. La bannière demande `youtube` : son
  // application (`channels.update`) n'est pas permise par `youtube.upload`.
  capabilities: [
    { capability: "publish.video", scopes: [SCOPE_UPLOAD, SCOPE_MANAGE] },
    { capability: "profile.watermark", scopes: [SCOPE_UPLOAD, SCOPE_MANAGE] },
    { capability: "profile.banner", scopes: [SCOPE_MANAGE] },
    { capability: "posts.list", scopes: [SCOPE_MANAGE, SCOPE_READONLY] },
    { capability: "posts.manage", scopes: [SCOPE_MANAGE] },
  ],
  app: {
    envPrefix: "YOUTUBE",
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    setupSteps: [
      "Créer un projet dans Google Cloud Console et y activer « YouTube Data API v3 ».",
      "Écran de consentement OAuth : type « Externe », nom de l’application, adresse de contact.",
      "Identifiants : « ID client OAuth », type « Application Web », avec l’URI de redirection ci-dessus comme URI de redirection autorisée.",
      "Recopier ici l’identifiant et le secret du client (ou les définir dans YOUTUBE_CLIENT_ID et YOUTUBE_CLIENT_SECRET).",
      "Passer l’application « En production » : en statut « Test », Google fait expirer les jetons au bout de sept jours. Sans vérification, Google affiche « application non validée » au consentement ; le propriétaire de l’instance peut l’accepter.",
    ],
  },
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    pkce: true,
    // `prompt=consent` : Google rend un jeton d'actualisation à chaque reconnexion.
    extraParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    scopeSets: [
      {
        id: "all",
        label: "Tout",
        description: "Publier, gérer les vidéos, la bannière et le filigrane.",
        scopes: [SCOPE_UPLOAD, SCOPE_MANAGE],
      },
      {
        id: "upload",
        label: "Lecture et envoi seulement",
        description: "Publier et lister les vidéos ; la gestion reste grisée.",
        scopes: [SCOPE_UPLOAD, SCOPE_READONLY],
      },
    ],
  },
  quota: youtubeQuota,
  fetchProfile: fetchChannelProfile,
  publishFields: YOUTUBE_PUBLISH_FIELDS,
  // L'API n'a pas de champ « Short » : YouTube classe seul une vidéo verticale
  // ou carrée de trois minutes au plus.
  shortForm: {
    maxSeconds: 180,
    verticalNote: "Vertical ou carré et de trois minutes au plus : YouTube le classera en Short.",
    horizontalNote: "Export horizontal : YouTube le publiera comme une vidéo classique, pas comme un Short.",
  },
  normalizeOptions: (options, source) => ({ ...normalizeYoutubeOptions(options, source) }),
  publish: (context) => uploadVideo(context, normalizeYoutubeOptions(context.options, context.source, 0) as YoutubeOptions),
  checkProcessing: videoProcessing,
  posts: {
    list: (context) => listUploads(context),
    update: updateVideo,
    remove: deleteVideo,
  },
  profile: {
    setBanner: setChannelBanner,
    setWatermark: setChannelWatermark,
  },
};
