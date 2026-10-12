/**
 * Comptes connectés : types communs au cœur, aux connecteurs et aux modules
 * (dossier 07, § 5.4 et § 8).
 *
 * Un module ne cite jamais un service : il demande une capacité
 * (`publish.video`…) et construit son interface à partir des comptes qui
 * l'ont. Ce fichier ne contient que des types et quelques constantes pures :
 * il est importé aussi par le navigateur.
 */

/** Ce qu'un compte sait faire ; un module demande une capacité, jamais un service. */
export type ConnectionCapability =
  | "publish.video" // envoyer une vidéo
  | "publish.image" // publier une image (Instagram, Facebook… à venir)
  | "publish.text" // publier un message (X, Threads… à venir)
  | "posts.list" // lister les publications du compte
  | "posts.manage" // modifier, changer la visibilité, supprimer
  | "profile.banner" // changer la bannière
  | "profile.watermark"; // changer le filigrane des vidéos

export const CAPABILITIES: readonly ConnectionCapability[] = [
  "publish.video",
  "publish.image",
  "publish.text",
  "posts.list",
  "posts.manage",
  "profile.banner",
  "profile.watermark",
];

/** Libellés affichés, communs à toutes les interfaces. */
export const CAPABILITY_LABELS: Record<ConnectionCapability, string> = {
  "publish.video": "publier des vidéos",
  "publish.image": "publier des images",
  "publish.text": "publier des messages",
  "posts.list": "lister les publications",
  "posts.manage": "gérer les publications",
  "profile.banner": "changer la bannière",
  "profile.watermark": "changer le filigrane",
};

export function isCapability(value: unknown): value is ConnectionCapability {
  return typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value);
}

/** Jetons ou secret chiffrés en AES-256-GCM (voir `crypto.ts`). */
export interface EncryptedBlob {
  /** Version du format. */
  v: 1;
  /** Clé employée : « env-1 » (CONNECTIONS_ENCRYPTION_KEY) ou « auth-1 » (dérivée d'AUTH_SECRET). */
  kid: string;
  iv: string;
  tag: string;
  data: string;
}

/**
 * Jetons d'un compte, une fois déchiffrés. Ne quittent jamais `accounts.ts`,
 * sinon vers les points d'extension du connecteur (`exchangeToken`,
 * `refreshToken`, `revokeAccess`).
 */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Instant d'expiration du jeton d'accès, en millisecondes ; `TOKEN_NEVER_EXPIRES` s'il n'expire pas. */
  expiresAt: number;
  tokenType?: string;
  /** Instant d'émission, quand il est connu (certains services ne prolongent qu'un jeton assez ancien). */
  issuedAt?: number;
}

/** Échéance d'un jeton qui n'expire pas (jeton de page…) : la plus grande date représentable. */
export const TOKEN_NEVER_EXPIRES = 8_640_000_000_000_000;

/** Jeton d'accès remis à un connecteur pour un appel. */
export interface AccessToken {
  value: string;
  expiresAt: number;
}

/** Identité d'un compte, lue chez le service avec un jeton neuf. */
export interface AccountProfile {
  externalId: string;
  name: string;
  avatarUrl?: string;
  url?: string;
  /** Identifiant lisible (« @machaine »). */
  handle?: string;
}

/**
 * Compte trouvé après une autorisation (`fetchAccounts`). Une seule connexion
 * peut en rendre plusieurs : les pages d'un profil, les comptes
 * professionnels liés à ces pages…
 */
export interface DiscoveredAccount extends AccountProfile {
  /**
   * Jeton propre à ce compte (jeton de page). Absent : le compte se sert du
   * jeton de l'autorisation, partagé avec les autres comptes sans jeton propre
   * de la même autorisation. `expiresAt` absent : le jeton n'expire pas.
   */
  token?: { accessToken: string; refreshToken?: string; expiresAt?: number; tokenType?: string };
  /** Portées réellement accordées pour ce compte, quand le service les donne (sinon celles de l'autorisation). */
  scopes?: string[];
  /** Restreint les capacités déduites des portées (rôle insuffisant sur une page…). Ne les élargit jamais. */
  capabilities?: ConnectionCapability[];
  /**
   * Données propres au connecteur, **non secrètes**, rangées en clair avec le
   * compte et rendues au connecteur dans son contexte (identifiant d'une page
   * liée…). Vingt clés au plus, 500 caractères par valeur.
   */
  data?: Record<string, string>;
}

export type AccountStatus = "connected" | "needs-reconnect";

/**
 * Comment le jeton d'un compte se renouvelle :
 * - « automatic » : par le cœur (`refresh_token` ou `refreshToken` du connecteur) ;
 * - « manual » : il expire et seule une reconnexion le remplace ;
 * - « none » : il n'expire pas.
 */
export type TokenRenewal = "automatic" | "manual" | "none";

/** État du jeton vu par l'administration (distinct de `status`, qui dit si le compte est utilisable). */
export type TokenState = "ok" | "expiring-soon" | "expired";

/** Compte tel qu'il est rangé sur le disque. */
export interface ConnectedAccount {
  /** Identifiant interne, « acc-… ». */
  id: string;
  /** « youtube », plus tard « facebook », « instagram »… */
  connector: string;
  /** Identifiant chez le service (UC… pour une chaîne YouTube). */
  externalId: string;
  name: string;
  /** Nom choisi dans ShareX Manager, sinon le nom chez le service. */
  label?: string;
  handle?: string;
  avatarUrl?: string;
  /** Adresse publique du compte (page de la chaîne). */
  url?: string;
  /** Jetons chiffrés, jamais renvoyés au client. */
  credentials: EncryptedBlob;
  scopes: string[];
  /** Capacités réellement accordées, déduites des portées. */
  capabilities: ConnectionCapability[];
  status: AccountStatus;
  /** Raison du passage en « à reconnecter ». */
  statusReason?: string;
  connectedAt: number;
  lastCheckedAt: number;
  /**
   * Autorisation dont le compte est issu (« grt-… ») : plusieurs comptes
   * peuvent en venir. Absent pour un compte enregistré avant son apparition.
   */
  grantId?: string;
  /**
   * « grant » (ou absent) : `credentials` est le jeton de l'autorisation,
   * recopié dans chaque compte qui le partage et renouvelé pour tous ensemble.
   * « own » : `credentials` est le jeton propre au compte (jeton de page).
   */
  tokenSource?: "grant" | "own";
  /** Jeton de l'autorisation, gardé pour la révocation finale d'un compte à jeton propre. */
  grantCredentials?: EncryptedBlob;
  /** Données non secrètes du connecteur (voir `DiscoveredAccount.data`). */
  data?: Record<string, string>;
  /** Échéance du jeton, en clair pour l'administration (ce n'est pas un secret). */
  tokenExpiresAt?: number;
  tokenRenewal?: TokenRenewal;
  /** Dernier renouvellement réussi. */
  tokenRenewedAt?: number;
  /** Dernier renouvellement échoué alors que le jeton restait valable. */
  tokenRenewError?: string;
}

/** Ce que voient l'interface et les modules : jamais de jeton. */
export interface AccountSummary {
  id: string;
  connector: string;
  connectorLabel: string;
  /** Entrée de `BrandLogo`. */
  logo: string;
  externalId: string;
  name: string;
  label?: string;
  /** `label`, sinon `name`. */
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  url?: string;
  scopes: string[];
  capabilities: ConnectionCapability[];
  status: AccountStatus;
  statusReason?: string;
  connectedAt: number;
  lastCheckedAt: number;
  /** Autorisation d'origine, commune aux comptes rendus par une même connexion. */
  grantId?: string;
  /** Échéance du jeton ; absente s'il n'expire pas ou si elle est inconnue. */
  tokenExpiresAt?: number;
  tokenRenewal?: TokenRenewal;
  tokenState: TokenState;
  /** Pourquoi le jeton expire bientôt (renouvellement refusé…). */
  tokenStateReason?: string;
  /** Limites propres à ce compte (`limitsFor`) ; absentes : celles du connecteur valent. */
  limits?: PublishLimits;
}

// ─── Champs de publication ────────────────────────────────────────

/**
 * Rôle d'un champ, pour que l'appelant (Clip Studio) le préremplisse depuis
 * une image de marque sans connaître le service : « title » reçoit le modèle
 * de titre, « tags » les tags de la marque…
 */
export type PublishFieldRole =
  | "title"
  | "description"
  | "tags"
  | "category"
  | "privacy"
  | "scheduledAt"
  | "madeForKids"
  | "syntheticMedia"
  | "topic"; // sujet de la publication, prérempli par le premier tag de la marque

interface PublishFieldBase {
  key: string;
  label: string;
  role?: PublishFieldRole;
  help?: string;
  /** Types de source pour lesquels le champ vaut ; absent : tous. */
  sourceKinds?: PublishSource["kind"][];
}

/** Un champ de publication : l'interface le dessine sans connaître le service. */
export type PublishField =
  | (PublishFieldBase & { kind: "text"; maxLength: number; maxBytes?: number; required?: boolean })
  | (PublishFieldBase & { kind: "textarea"; maxLength: number; maxBytes?: number })
  | (PublishFieldBase & { kind: "tags"; maxTotal: number })
  | (PublishFieldBase & { kind: "select"; choices: { value: string; label: string }[]; defaultValue?: string })
  | (PublishFieldBase & { kind: "datetime" })
  | (PublishFieldBase & { kind: "toggle"; defaultValue?: boolean });

// ─── Publication ──────────────────────────────────────────────────

interface PublishSourceBase {
  /** Module propriétaire : c'est lui qui résout les fichiers (`resolveExportFile`). */
  module: string;
  id: string;
  /** Nom lisible (nom du projet), pour l'interface et un titre de secours. */
  name?: string;
}

/** Une image ou une vidéo, telle que le module la décrit. */
export interface PublishMediaItem {
  kind: "video" | "image";
  /** Nom du fichier chez le module (jamais un chemin). */
  file: string;
  bytes: number;
  /** Type MIME exact ; absent : déduit de l'extension. */
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

/** Un seul fichier : une vidéo ou une image. */
export interface PublishFileSource extends PublishSourceBase, PublishMediaItem {
  /**
   * Image de couverture d'une vidéo, facultative, résolue par le module
   * propriétaire avec son propre identifiant ; servie au connecteur par
   * `context.coverPath` ou `context.publicUrl(…, { item: "cover" })`.
   */
  cover?: PublishMediaItem & { id: string };
  text?: never;
  items?: never;
}

/** Un message sans fichier ; sa longueur est bornée par le connecteur (`limits.text`). */
export interface PublishTextSource extends PublishSourceBase {
  kind: "text";
  text: string;
  /** Toujours 0 : rien à envoyer. */
  bytes: 0;
  file?: never;
  items?: never;
}

/**
 * Plusieurs fichiers publiés ensemble (carrousel). Chaque élément est résolu
 * par le module propriétaire avec son propre identifiant. Aucune interface ne
 * s'en sert encore.
 */
export interface PublishCarouselSource extends PublishSourceBase {
  kind: "carousel";
  items: (PublishMediaItem & { id: string })[];
  /** Somme des tailles. */
  bytes: number;
  file?: never;
  text?: never;
}

/** Ce qu'on publie, désigné par le module qui le possède. */
export type PublishSource = PublishFileSource | PublishTextSource | PublishCarouselSource;

export type PublishJobState =
  | "queued"
  | "uploading"
  | "processing"
  | "done"
  | "failed"
  | "cancelled"
  | "waiting-quota"
  // Crédits épuisés chez le service ou budget mensuel atteint : sans reprise automatique, « Reprendre » à la main.
  | "waiting-credits";

export interface PublishJob {
  id: string;
  accountId: string;
  connector: string;
  source: PublishSource;
  /** Options propres au service, validées par son connecteur (`publishFields`). */
  options: Record<string, unknown>;
  state: PublishJobState;
  /** État de reprise propre au connecteur (URI de session YouTube…). Jamais envoyé au client. */
  resume?: Record<string, unknown>;
  bytesSent: number;
  /** Publication obtenue : identifiant et adresse chez le service. */
  result?: PublishResult;
  error?: string;
  /** Remarque non bloquante (visibilité obtenue différente de celle demandée…). */
  warning?: string;
  /** Attente du quota : instant de reprise prévu. */
  retryAt?: number;
  /**
   * Publication différée tenue par la file, pour un service qui ne programme
   * pas lui-même : le travail reste « queued » jusqu'à cet instant, même
   * après un redémarrage.
   */
  publishAt?: number;
  /** Nombre de passages dans `publish()` ; au-delà du premier, `findExisting` est consulté. */
  attempts?: number;
  /** Coût estimé (en `currency` du connecteur), compté dans le budget mensuel une fois publié. */
  cost?: { amount: number; currency: string };
  /**
   * Travail « processing » : instant du prochain passage chez le service.
   * Sans `result`, la file rappelle alors le connecteur pour finir la
   * publication (`continuePublish`) ; avec, elle suit le traitement
   * (`checkProcessing`). Absent : dès que possible.
   */
  checkAt?: number;
  /** Entrée en « processing » : point de départ de l'abandon du suivi. */
  processingSince?: number;
  /** Étape en cours, lisible, rendue par le connecteur (pendant une attente chez le service). */
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** Travail vu par l'interface : sans état de reprise. */
export type PublishJobSummary = Omit<PublishJob, "resume"> & { title?: string };

// ─── Gestion des publications ─────────────────────────────────────

export type PostPrivacy = "private" | "unlisted" | "public";

export interface PostSummary {
  id: string;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  thumbnailUrl?: string;
  url: string;
  privacy: PostPrivacy;
  /** Date de mise en ligne (ISO). */
  publishedAt?: string;
  /** Date de publication programmée (ISO), pour une vidéo privée. */
  publishAt?: string;
  views?: number;
  likes?: number;
  comments?: number;
}

export interface PostPatch {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacy?: PostPrivacy;
  /** Date ISO, ou `null` pour retirer la programmation. */
  publishAt?: string | null;
}

/** Moment d'apparition du filigrane d'une chaîne. */
export interface WatermarkTiming {
  type: "offsetFromStart" | "offsetFromEnd";
  offsetMs: number;
  /** Une seconde au moins ; absent : jusqu'à la fin. */
  durationMs?: number;
}

// ─── Quotas ───────────────────────────────────────────────────────

export interface QuotaBucket {
  id: string;
  label: string;
  /** Unités par jour. */
  limit: number;
}

export interface QuotaUsage {
  connector: string;
  /** Jour de référence du service (AAAA-MM-JJ). */
  day: string;
  buckets: { id: string; label: string; used: number; limit: number }[];
  /** Instant de la prochaine remise à zéro. */
  resetsAt: number;
  /** Publication suspendue jusqu'à cet instant (quota épuisé chez le service). */
  pausedUntil?: number;
}

/** Usage du quota propre à un compte, sur sa fenêtre glissante. */
export interface AccountQuotaUsage {
  accountId: string;
  windowMs: number;
  buckets: { id: string; label: string; used: number; limit: number }[];
  /** Instant où la plus ancienne unité comptée sort de la fenêtre. */
  nextReleaseAt?: number;
  /** Publication de ce compte suspendue jusqu'à cet instant. */
  pausedUntil?: number;
}

// ─── Connecteurs ──────────────────────────────────────────────────

/** Ce qu'un connecteur reçoit pour agir au nom d'un compte. */
export interface ConnectorContext {
  accountId: string;
  externalId: string;
  /** Données non secrètes rangées avec le compte (`DiscoveredAccount.data`). */
  data?: Record<string, string>;
  /** Jeton d'accès valide, renouvelé au besoin par le cœur. */
  getAccessToken(): Promise<AccessToken>;
  /** Compte une méthode du service dans les quotas ; lève une erreur si le reste du jour ne suffit pas. */
  chargeQuota(method: string): void;
  /**
   * Preuve dérivée du secret de l'application, sans jamais le donner :
   * HMAC-SHA256 de `value` (le jeton d'accès) par le secret, en hexadécimal.
   */
  appSecretProof(value: string): string;
  /** Réglages non secrets de l'application (`app.settings`), par clé. */
  appSettings: Record<string, string>;
}

/** Réglages d'un lien public temporaire (voir `public-media.ts`). */
export interface PublicUrlOptions {
  /** Fichier à servir : élément du carrousel (0 par défaut) ou couverture de la vidéo. */
  item?: number | "cover";
  /**
   * Fichier dérivé (JPEG converti…) créé par le connecteur dans
   * `context.tempFile()` : servi à la place, effacé à la fermeture du lien.
   */
  derivedFile?: string;
  /** Type MIME servi ; absent : celui de la source, sinon d'après l'extension. */
  contentType?: string;
  /** Lectures complètes permises (comptées en octets servis) : 5 par défaut, 50 au plus. */
  maxDownloads?: number;
}

/** Lien public créé pour un travail. */
export interface PublicLinkInfo {
  id: string;
  /** Adresse ASCII, terminée par l'extension du fichier. */
  url: string;
  expiresAt: number;
}

/** Une lecture d'un lien public (journal d'accès). */
export interface PublicLinkAccess {
  at: number;
  method: "GET" | "HEAD";
  status: number;
  bytes: number;
  /** Agent annoncé par le service (tronqué). */
  agent?: string;
}

export interface PublishContext extends ConnectorContext {
  /** Chemin absolu du fichier, résolu par le module propriétaire ; vide pour un texte seul. */
  filePath: string;
  /** Chemins absolus de tous les fichiers, dans l'ordre (un seul hors carrousel, aucun pour un texte). */
  filePaths: string[];
  source: PublishSource;
  options: Record<string, unknown>;
  resume?: Record<string, unknown>;
  /** Enregistre l'état de reprise et la progression. */
  saveProgress(resume: Record<string, unknown> | undefined, bytesSent: number): void;
  signal: AbortSignal;
  /** Attente entre deux essais (remplacée par les tests). */
  sleep(ms: number): Promise<void>;
  /**
   * Adresse publique temporaire d'un fichier du travail, pour un service qui
   * va le chercher lui-même au lieu de le recevoir. Construite depuis
   * AUTH_URL ; durée par défaut celle de `Connector.publicMedia`, sinon une
   * heure. Le lien est révoqué quand le travail se termine. Lève une erreur
   * pour un texte seul ou sans AUTH_URL.
   */
  publicUrl(ttlMs?: number, options?: PublicUrlOptions): string;
  /** Comme `publicUrl`, avec l'identifiant du lien (pour lire son journal ou le fermer seul). */
  publicLink(ttlMs?: number, options?: PublicUrlOptions): PublicLinkInfo;
  /** Journal des lectures d'un lien de ce travail : progression, diagnostic. */
  publicLinkAccesses(linkId: string): PublicLinkAccess[];
  /** Ferme un lien de ce travail, ou tous sans argument (le service a fini de télécharger). */
  revokePublicUrls(linkId?: string): void;
  /** Chemin d'un fichier temporaire du cœur pour un fichier dérivé ; effacé avec son lien ou à la fin du travail. */
  tempFile(extension: string): string;
  /** Couverture de la vidéo, résolue par le module (absente sinon). */
  coverPath?: string;
  /** Numéro du passage (1 au premier) : au-delà, la publication a pu aboutir sans que la réponse arrive. */
  attempt: number;
}

/** Résultat d'une vérification du traitement par le service. */
export interface ProcessingStatus {
  done: boolean;
  failed?: string;
  /** Visibilité obtenue, comparée à celle demandée. */
  privacy?: string;
  /**
   * Résultat définitif, quand le service ne donne l'adresse (ou
   * l'identifiant) de la publication qu'une fois le traitement fini : il
   * remplace celui rendu par `publish`.
   */
  result?: PublishResult;
}

/** Publication obtenue chez le service. */
export interface PublishResult {
  externalId: string;
  url: string;
}

/**
 * Rendu par `publish` ou `continuePublish` quand le fichier est parti mais
 * que le service le traite encore, avant de pouvoir publier : la file passe
 * le travail en « processing », libère l'envoi pour le travail suivant et
 * rappelle le connecteur après `retryAfterMs`, même après un redémarrage.
 * L'état de reprise doit avoir été enregistré (`saveProgress`) avant.
 */
export interface PublishPending {
  pending: true;
  /** Délai avant le prochain passage, en millisecondes (borné par la file : d'une seconde à une heure). */
  retryAfterMs: number;
  /** Étape lisible, affichée avec le travail. */
  note?: string;
}

/** Ce que rend une publication : le résultat, ou « à reprendre plus tard ». */
export type PublishOutcome = PublishResult | PublishPending;

export function isPublishPending(value: unknown): value is PublishPending {
  return Boolean(value && typeof value === "object" && (value as { pending?: unknown }).pending === true);
}

export interface ConnectorApp {
  /** Préfixe des variables d'environnement : `<PREFIX>_CLIENT_ID`, `<PREFIX>_CLIENT_SECRET`. */
  envPrefix: string;
  setupSteps: string[];
  consoleUrl: string;
  /**
   * Consigne affichée à la déconnexion quand le service ne permet pas de
   * révoquer l'accès par son API (« retirez l'application dans … »).
   */
  disconnectHelp?: string;
  /**
   * Réglages propres au service, saisis avec l'identifiant et le secret (ou
   * lus dans `env`) : un identifiant de configuration de connexion…
   */
  settings?: AppSetting[];
}

/** Réglage d'application déclaré par un connecteur. */
export interface AppSetting {
  /** Clé (lettres, chiffres, `_`) ; aussi le nom du paramètre ajouté à l'adresse d'autorisation si `authorizeParam`. */
  key: string;
  label: string;
  help?: string;
  required?: boolean;
  /** Chiffré sur le disque, jamais réaffiché ni remis au connecteur (seulement utilisé par le cœur). */
  secret?: boolean;
  /** Variable d'environnement qui le fournit, prioritaire sur la saisie (`FACEBOOK_CONFIG_ID`). */
  env?: string;
  /** Recopié dans l'adresse d'autorisation, sous ce nom (`true` : sous `key`). */
  authorizeParam?: boolean | string;
  /** Forme attendue, vérifiée à la saisie. */
  pattern?: string;
}

/** Réponse de jeton ramenée aux champs de la norme OAuth (RFC 6749, § 5.1 et 5.2). */
export interface TokenResponseFields {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  /** Message lisible du service, affiché après nettoyage. */
  error_description?: string;
}

export interface ConnectorOAuth {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  pkce: boolean;
  /**
   * Authentification du client auprès de `tokenUrl` et `revokeUrl` :
   * « body » (par défaut) met l'identifiant et le secret dans le corps de
   * l'échange, « basic » les passe en `Authorization: Basic` (et aussi à la
   * révocation).
   */
  clientAuth?: "body" | "basic";
  /** Méthode de l'échange du code et du renouvellement : `POST` en corps de formulaire (par défaut) ou `GET` en paramètres. */
  tokenMethod?: "POST" | "GET";
  /** Séparateur des portées dans l'adresse d'autorisation : espace par défaut, virgule chez certains services. */
  scopeSeparator?: string;
  /**
   * Lecture d'une réponse de jeton qui s'écarte de la norme. Par défaut, le
   * cœur lit les champs normés et reconnaît aussi `{ error_type,
   * error_message }` et `{ error: { message, type, code } }`.
   */
  parseTokenResponse?(body: unknown, status: number): TokenResponseFields;
  /**
   * Lecture d'une erreur d'un appel OAuth (échange, renouvellement,
   * révocation) : code et message lisible. `null` : lecture par défaut.
   */
  readError?(body: unknown, status: number): { code: string; message?: string } | null;
  /** Paramètres propres au service (access_type=offline…). */
  extraParams?: Record<string, string>;
  /** Jeux de portées proposés à la connexion (« tout », « lecture et envoi »). */
  scopeSets: { id: string; label: string; description?: string; scopes: string[] }[];
}

/**
 * Ce que reçoivent `fetchProfile` et `fetchAccounts` pour lire un compte :
 * de quoi compter le quota et signer les appels, jamais le secret.
 */
export interface AccountReadContext {
  chargeQuota(method: string): void;
  /** Comme `ConnectorContext.appSecretProof` : HMAC-SHA256 de `value` par le secret de l'application. */
  appSecretProof(value: string): string;
  /** Réglages non secrets de l'application. */
  appSettings: Record<string, string>;
}

/** Ce que reçoivent les points d'extension des jetons. */
export interface TokenHookContext {
  /** Application déclarée chez le service (identifiant et secret du client). */
  app: { clientId: string; clientSecret: string };
  /** Réglages de l'application (`app.settings`), secrets compris : ces points d'extension parlent au service en son nom. */
  settings: Record<string, string>;
  chargeQuota(method: string): void;
}

/** Compte dont on renouvelle le jeton (ses jetons arrivent à part). */
export interface TokenAccount {
  id: string;
  externalId: string;
  tokenSource: "grant" | "own";
  data?: Record<string, string>;
}

/** Cycle de vie des jetons propre au service. */
export interface TokenLifetime {
  /**
   * Renouveler quand il reste moins que cette durée avant l'échéance (une
   * minute par défaut). Une tâche le fait au démarrage puis toutes les heures,
   * et chaque usage le vérifie.
   */
  renewBeforeMs?: number;
  /**
   * « Pas avant » : âge minimal d'un jeton pour qu'on tente de le prolonger
   * (24 h chez certains services). Un jeton plus jeune est gardé tel quel.
   */
  minAgeMs?: number;
  /**
   * Quand renouveler :
   * - « scheduled » (par défaut) : à l'usage, et par la tâche de fond
   *   (démarrage, puis toutes les heures), même sans publication ;
   * - « on-use » : à l'usage seulement (jeton d'actualisation à usage unique :
   *   chaque rotation est une occasion de le perdre).
   */
  schedule?: "scheduled" | "on-use";
  /**
   * Avec « on-use » : renouvellement d'entretien par la tâche de fond quand
   * le dernier date de plus que cette durée (pour qu'un jeton
   * d'actualisation à durée limitée n'expire pas faute d'usage).
   */
  maintenanceAfterMs?: number;
  /**
   * Durée de vie à supposer quand le service ne donne pas `expires_in` :
   * une heure par défaut, `null` pour un jeton qui n'expire pas.
   */
  defaultMs?: number | null;
}

/**
 * Mesure d'un texte (`limits.ts`, la même dans le navigateur et sur le serveur) :
 * - « characters » : points de code Unicode ;
 * - « emoji-bytes » : chaque émoji compte pour ses octets UTF-8, le reste pour un ;
 * - « weighted » : poids 1 pour les écritures latines et la ponctuation
 *   courante, 2 pour le reste et pour chaque émoji, 23 pour chaque adresse web.
 */
export type TextCount = "characters" | "emoji-bytes" | "weighted";

/**
 * Prix d'une publication chez un service payant à l'usage, rangé dans une
 * table datée. L'interface l'affiche avant l'envoi ; la file le compte dans
 * le budget mensuel de l'instance.
 */
export interface PublishPricing {
  /** Code ISO 4217 (« USD »). */
  currency: string;
  /** Date (AAAA-MM-JJ) à laquelle la table a été relevée. */
  asOf: string;
  /** Prix d'une publication selon le type de source. */
  perPublish: Partial<Record<PublishSource["kind"], number>>;
  /** Surcoût quand le texte publié contient une adresse web. */
  linkSurcharge?: number;
  note?: string;
}

/**
 * Quota propre à chaque compte (et non à l'application), sur une fenêtre
 * glissante : « 250 publications par profil sur 24 heures ». Le cœur tient
 * un compte local ; le connecteur peut en plus lire l'usage réel chez le
 * service et lever `QuotaExceededError` avec `scope: "account"`.
 */
export interface AccountQuota {
  buckets: QuotaBucket[];
  /** Durée de la fenêtre glissante, en millisecondes. */
  windowMs: number;
  /** Coût d'une méthode ; `null` : non comptée. */
  cost(method: string): { bucket: string; units: number } | null;
}

/** Limites d'une image ou d'une vidéo chez le service. */
export interface MediaLimits {
  /** Types MIME acceptés ; absent : tous. */
  mimeTypes?: string[];
  /** Poids maximal, en octets. */
  maxBytes?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  /** Rapport largeur / hauteur accepté, bornes comprises (4:5 → 0,8 ; 1,91:1 → 1,91). */
  aspectRatio?: { min: number; max: number };
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

/** Ce que le service accepte : lu par l'interface, vérifié par la file avant tout envoi. */
export interface PublishLimits {
  video?: MediaLimits;
  image?: MediaLimits;
  /**
   * Couverture d'une vidéo (`PublishFileSource.cover`) : rapport, poids,
   * types acceptés, souvent différents de ceux d'une image publiée (9:16
   * pour un format court). Absent : la couverture n'est pas vérifiée.
   */
  cover?: MediaLimits;
  /** Message seul : longueur en caractères (points de code Unicode). */
  text?: {
    maxLength: number;
    /**
     * Mesure : « characters » (par défaut) compte les points de code ;
     * « emoji-bytes » compte chaque émoji pour ses octets UTF-8 et le reste
     * pour un. Même mesure dans le navigateur et sur le serveur (`limits.ts`).
     */
    count?: TextCount;
  };
  carousel?: { minItems: number; maxItems: number };
}

export interface Connector {
  id: string;
  label: string;
  /** Entrée de BrandLogo : le logo officiel du service. */
  logo: string;
  /** Nom d'un compte chez ce service : « chaîne », « page », « compte ». */
  accountNoun: { one: string; many: string };
  /** « ready » : utilisable ; « planned » : affiché « bientôt », non connectable. */
  status: "ready" | "planned";
  /** Ce que le connecteur sait faire, et les portées qui le permettent (une seule suffit). */
  capabilities: {
    capability: ConnectionCapability;
    scopes: string[];
    /** Portées toutes exigées en plus (publier une vidéo peut demander l'envoi de média **et** l'écriture). */
    allOf?: string[];
  }[];
  app: ConnectorApp;
  oauth: ConnectorOAuth;
  /** Compartiments de quota du service ; absent : aucun suivi. */
  quota?: {
    buckets: QuotaBucket[];
    /** Coût d'une méthode : compartiment et unités. */
    cost(method: string): { bucket: string; units: number };
    /** Instant de la prochaine remise à zéro après `now`. */
    nextReset(now: number): number;
    /** Jour de référence du service pour `now`. */
    day(now: number): string;
  };
  /** Quota par compte sur fenêtre glissante ; s'ajoute à `quota`, qui appartient à l'application. */
  accountQuota?: AccountQuota;
  /**
   * Lit l'identité du compte avec un jeton neuf. `account` est fourni à la
   * vérification d'un compte déjà enregistré (son `externalId`, ses `data`) ;
   * `context` donne de quoi signer les appels (`appSecretProof`).
   */
  fetchProfile?(
    token: AccessToken,
    chargeQuota: (method: string) => void,
    account?: { externalId: string; data?: Record<string, string> },
    context?: AccountReadContext
  ): Promise<AccountProfile>;
  /**
   * Comptes rendus par une autorisation quand elle en donne plusieurs (pages,
   * comptes liés). Prioritaire sur `fetchProfile` à la connexion ; chaque
   * compte peut porter son propre jeton. Tous sont gardés. `context` donne de
   * quoi signer les appels (`appSecretProof`).
   */
  fetchAccounts?(token: AccessToken, chargeQuota: (method: string) => void, context?: AccountReadContext): Promise<DiscoveredAccount[]>;
  /** Juste après l'échange du code : échange contre un jeton longue durée… */
  exchangeToken?(tokens: TokenSet, context: TokenHookContext): Promise<TokenSet>;
  /**
   * Portées réellement accordées, quand la réponse de jeton ne les donne pas
   * (appel d'inspection du jeton). `null` ou une erreur : repli sur les
   * portées demandées.
   */
  fetchGrantedScopes?(token: AccessToken, context: TokenHookContext): Promise<string[] | null>;
  /**
   * Renouvelle un jeton sans `refresh_token` standard (prolonger un jeton
   * longue durée avant son échéance). Une `OAuthError` « invalid_grant » ou
   * une `ReconnectRequiredError` passe le compte « à reconnecter » dès que le
   * jeton n'est plus utilisable ; avant, l'échec est seulement signalé.
   */
  refreshToken?(account: TokenAccount, tokens: TokenSet, context: TokenHookContext): Promise<TokenSet>;
  tokenLifetime?: TokenLifetime;
  /** Révocation propre au service, à la place de `oauth.revokeUrl`. Rend vrai si le service l'a acceptée. */
  revokeAccess?(tokens: TokenSet, context: TokenHookContext): Promise<boolean>;
  /** Ce que le service accepte (durée, formats, rapport, poids, longueur du texte). */
  limits?: PublishLimits;
  /**
   * Limites propres à un compte (selon son abonnement chez le service, lu au
   * profil et rangé dans `data`). Absent ou `null` : `limits`.
   */
  limitsFor?(account: { externalId: string; data?: Record<string, string> }): PublishLimits | null;
  /**
   * Mesure d'un texte propre au service, côté serveur ; prioritaire sur
   * `limits.text.count`, qui reste ce que l'interface affiche.
   */
  measureText?(text: string): { used: number; max: number };
  /** Prix à l'usage ; l'instance peut fixer un budget mensuel par service (`billing.ts`). */
  pricing?: PublishPricing;
  /**
   * Avant de republier un travail déjà tenté (réponse perdue, redémarrage
   * sans point de reprise chez le service) : la publication existe-t-elle
   * déjà ? Rendue, elle termine le travail sans republier.
   */
  findExisting?(context: PublishContext): Promise<PublishResult | null>;
  /**
   * Le service va chercher les fichiers à une adresse publique
   * (`context.publicUrl`) : l'instance doit être joignable depuis Internet.
   * Durée de vie et téléchargements permis par défaut des liens.
   */
  publicMedia?: { ttlMs?: number; maxDownloads?: number };
  /** Champs de publication propres au service, décrits pour que l'interface les dessine seule. */
  publishFields?: PublishField[];
  /** Remarque sur le format d'une vidéo (format court du service), affichée par la fenêtre de publication. */
  shortForm?: ShortFormNote;
  /** Valide les options reçues et les complète (limites du service). */
  normalizeOptions?(options: unknown, source: PublishSource): Record<string, unknown>;
  /**
   * Publie (un fichier, plusieurs, ou un texte) ; enregistre l'état de reprise
   * au fil de l'envoi par `saveProgress`. Pour un service qui crée d'abord
   * un conteneur puis le publie (appel non rejouable), ranger l'identifiant du
   * conteneur dans l'état de reprise et relire son état avant de republier.
   *
   * Le service traite encore ce qu'il a reçu : rendre `PublishPending` au
   * lieu d'attendre ici. Seul l'envoi des octets occupe la file ; l'attente
   * se fait à côté, et la publication est finie par `continuePublish`.
   */
  publish?(context: PublishContext): Promise<PublishOutcome>;
  /**
   * Reprend une publication rendue « à reprendre » (`PublishPending`), à
   * l'heure demandée, hors du verrou d'envoi, avec l'état de reprise
   * enregistré : relit l'état chez le service et publie quand il est prêt.
   * Rend le résultat final ou une nouvelle attente. Absent : `publish` est
   * rappelé (il doit alors reprendre d'après `context.resume`).
   */
  continuePublish?(context: PublishContext): Promise<PublishOutcome>;
  /**
   * Suit le traitement d'une publication déjà faite ; peut rendre son
   * résultat définitif (`ProcessingStatus.result`).
   */
  checkProcessing?(context: ConnectorContext, externalId: string): Promise<ProcessingStatus>;
  /** Actions de gestion, présentes selon les capacités. */
  posts?: {
    list(context: ConnectorContext): Promise<PostSummary[]>;
    /** Facultatif : certains services ne permettent que de lister et supprimer. */
    update?(context: ConnectorContext, id: string, patch: PostPatch): Promise<PostSummary>;
    remove?(context: ConnectorContext, id: string): Promise<void>;
  };
  profile?: {
    setBanner?(context: ConnectorContext, png: Buffer): Promise<void>;
    setWatermark?(context: ConnectorContext, png: Buffer, timing?: WatermarkTiming): Promise<void>;
  };
}

/** Ce qu'un service fait d'une vidéo selon son format (Shorts de YouTube…). */
export interface ShortFormNote {
  /** Durée maximale d'une vidéo courte, en secondes. */
  maxSeconds: number;
  /** Vidéo verticale ou carrée assez courte. */
  verticalNote: string;
  /** Vidéo horizontale. */
  horizontalNote: string;
}

/** Description publique d'un connecteur, pour l'interface et les modules. */
export interface ConnectorInfo {
  id: string;
  label: string;
  logo: string;
  accountNoun: { one: string; many: string };
  status: "ready" | "planned";
  capabilities: ConnectionCapability[];
  scopeSets: { id: string; label: string; description?: string; capabilities: ConnectionCapability[] }[];
  publishFields: PublishField[];
  shortForm?: ShortFormNote;
  limits?: PublishLimits;
  pricing?: PublishPricing;
  /** Actions de gestion fournies ; l'interface ne propose que celles-là. */
  postActions?: { update: boolean; remove: boolean };
  /** Consigne de déconnexion quand le service ne permet pas la révocation par l'API. */
  disconnectHelp?: string;
  /** Une connexion peut rendre plusieurs comptes ; tous sont gardés. */
  multipleAccounts?: boolean;
  /** Le service va chercher les fichiers à une adresse publique de l'instance. */
  publicMedia?: boolean;
}

// ─── Parcours de connexion ────────────────────────────────────────

/** Type du message que la page de retour (mode « popup ») envoie à la fenêtre d'origine. */
export const CONNECTION_MESSAGE_TYPE = "sxm:connection";
/** Canal `BroadcastChannel` de secours, quand le service a coupé le lien avec la fenêtre d'origine. */
export const CONNECTION_CHANNEL = "sxm-connections";

/**
 * Résultat d'une connexion, rendu à la fenêtre d'origine par `postMessage`
 * (limité à l'origine de l'application) ou, sans fenêtre d'origine, par les
 * paramètres de l'adresse de retour (`connected`, `pending`, `errorCode`).
 *
 * Codes d'erreur : ceux du service (`access_denied`, `redirect_uri_mismatch`,
 * `invalid_client`, `invalid_grant`…) et ceux du cœur (`app_not_configured`,
 * `invalid_state`, `no_accounts`, `connection_failed`).
 */
export type ConnectionResultMessage =
  | { type: typeof CONNECTION_MESSAGE_TYPE; ok: true; connector: string; state: "connected"; grantId: string; accountIds: string[] }
  | { type: typeof CONNECTION_MESSAGE_TYPE; ok: true; connector: string; state: "pending"; pendingId: string; count: number }
  | { type: typeof CONNECTION_MESSAGE_TYPE; ok: false; connector: string; error: { code: string; message: string } };
