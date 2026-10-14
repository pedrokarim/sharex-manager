/**
 * Champs de publication TikTok, validation des options, limites et
 * formulaire lu à l'affichage de l'écran Publier (dossier 07e, § 5 à 7).
 *
 * Deux modes :
 * - « inbox » (par défaut) : la vidéo arrive en brouillon dans la boîte de
 *   réception de l'application TikTok, où la personne la finit et la publie.
 *   L'API ne prend alors ni texte ni visibilité.
 * - « direct » : publication directe, proposée seulement quand l'application
 *   est déclarée auditée par TikTok et que le compte a accordé
 *   `video.publish`. L'écran suit alors les règles de TikTok (Content Sharing
 *   Guidelines) : `creator_info` lu à l'affichage, pseudo montré, visibilité
 *   sans valeur d'avance parmi celles que rend TikTok, interactions décochées
 *   et grisées si le compte les a coupées, divulgation du contenu commercial,
 *   durée vérifiée, consentement explicite.
 */

import type { ConnectorContext, LivePublishForm, NormalizeContext, PublishField, PublishFieldRule, PublishLimits, PublishSource } from "../../types";
import { QuotaExceededError, ReconnectRequiredError } from "../../errors";
import { fetchTiktokUser, tiktokRequest } from "./api";

export const SCOPE_BASIC = "user.info.basic";
export const SCOPE_PROFILE = "user.info.profile";
export const SCOPE_UPLOAD = "video.upload";
export const SCOPE_PUBLISH = "video.publish";
export const SCOPE_LIST = "video.list";

/** Réglage d'application : case « Application auditée par TikTok ». */
export const AUDITED_SETTING = "audited";

/** Texte de la publication directe : 2 200 unités UTF-16 au plus (« UTF-16 runes »). */
export const CAPTION_MAX = 2200;

export const PRIVACY_LEVELS = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: "Tout le monde",
  MUTUAL_FOLLOW_FRIENDS: "Amis (abonnements mutuels)",
  FOLLOWER_OF_CREATOR: "Abonnés",
  SELF_ONLY: "Moi uniquement",
};

/** Ce qui est affiché à la fin d'un envoi en brouillon. */
export const INBOX_NOTE = "Envoyé en brouillon dans TikTok : ouvrez la boîte de réception de l’application pour publier.";

/**
 * Limites de TikTok pour une vidéo (guide du transfert des médias) : MP4
 * (conseillé), MOV ou WebM, 4 Go, 10 minutes (moins pour certains comptes,
 * `max_video_post_duration_sec`), côtés entre 360 et 4 096 px. La cadence
 * (23 à 60 i/s) n'est pas connue du cœur : TikTok la vérifie au traitement.
 */
export const TIKTOK_LIMITS: PublishLimits = {
  video: {
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
    maxBytes: 4 * 1024 * 1024 * 1024,
    maxDurationMs: 10 * 60_000,
    minWidth: 360,
    minHeight: 360,
    maxWidth: 4096,
    maxHeight: 4096,
  },
};

/**
 * Champs fixes : le texte seul, rempli par les textes de l'export. Les
 * réglages (mode, visibilité, interactions…) viennent du formulaire lu à
 * l'affichage (`buildPublishForm`).
 */
export const TIKTOK_PUBLISH_FIELDS: PublishField[] = [
  {
    key: "caption",
    kind: "textarea",
    label: "Texte",
    role: "caption",
    maxLength: CAPTION_MAX,
    sourceKinds: ["video"],
    help: "Publication directe seulement : 2 200 caractères au plus, mots-dièse et mentions compris. Un brouillon arrive sans texte : copiez-le dans l’application.",
  },
];

// ─── Formulaire lu à l'affichage ──────────────────────────────────

/** Réponse de `creator_info` (référence « Query Creator Info »). */
export interface CreatorInfo {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

/** Lecture de `creator_info`, juste avant d'afficher l'écran ou de publier (20 appels par minute). */
export function queryCreatorInfo(context: ConnectorContext): Promise<CreatorInfo> {
  return tiktokRequest<CreatorInfo>(context, "/v2/post/publish/creator_info/query/", { method: "POST", body: {} });
}

const DIRECT = { key: "mode", values: ["direct"] };
const COMMERCIAL = { key: "commercial", values: [true] };
const LOCKED_HELP = "Coupé dans les réglages de ce compte TikTok.";

/** Règles entre champs de la publication directe (Content Sharing Guidelines, contenu commercial). */
export const DIRECT_RULES: PublishFieldRule[] = [
  {
    when: COMMERCIAL,
    anyOf: ["brandOrganic", "brandContent"],
    message: "Contenu commercial : cochez « Votre marque », « Contenu de marque » ou les deux.",
  },
  {
    when: { key: "brandContent", values: [true] },
    field: "privacy",
    notValues: ["SELF_ONLY"],
    message: "Un contenu de marque ne peut pas être visible de vous seul : choisissez une autre visibilité.",
  },
];

const DRAFT_NOTICE =
  "Brouillon : la vidéo arrive dans la boîte de réception de l’application TikTok ; touchez la notification pour finir l’édition et publier. Le texte n’est pas transmis : copiez-le dans l’application.";

/** Champs de la publication directe, d'après ce que rend `creator_info`. */
function directFields(info: CreatorInfo): PublishField[] {
  const levels = (info.privacy_level_options ?? []).filter((value): value is PrivacyLevel => (PRIVACY_LEVELS as readonly string[]).includes(value));
  const interaction = (key: string, label: string, locked: boolean | undefined): PublishField => ({
    key,
    kind: "toggle",
    label,
    showWhen: DIRECT,
    // Décochée d'avance, comme TikTok l'exige ; grisée si le compte l'a coupée.
    defaultValue: false,
    ...(locked ? { disabled: true, help: LOCKED_HELP } : {}),
  });
  return [
    {
      key: "mode",
      kind: "select",
      label: "Envoi",
      choices: [
        { value: "inbox", label: "Brouillon dans TikTok" },
        { value: "direct", label: "Publier directement" },
      ],
      defaultValue: "inbox",
    },
    {
      key: "privacy",
      kind: "select",
      role: "privacy",
      label: "Qui peut voir cette vidéo",
      choices: levels.map((value) => ({ value, label: PRIVACY_LABELS[value] })),
      // Aucune visibilité choisie d'avance (règle de TikTok).
      noDefault: true,
      required: true,
      showWhen: DIRECT,
    },
    interaction("allowComment", "Autoriser les commentaires", info.comment_disabled),
    interaction("allowDuet", "Autoriser le duo", info.duet_disabled),
    interaction("allowStitch", "Autoriser le collage", info.stitch_disabled),
    {
      key: "commercial",
      kind: "toggle",
      label: "Divulguer le contenu commercial",
      help: "La vidéo fait la promotion de vous-même, d’une marque, d’un produit ou d’un service.",
      defaultValue: false,
      showWhen: DIRECT,
    },
    {
      key: "brandOrganic",
      kind: "toggle",
      label: "Votre marque",
      help: "Vous faites votre propre promotion. La vidéo sera marquée « Contenu promotionnel ».",
      defaultValue: false,
      showWhen: COMMERCIAL,
    },
    {
      key: "brandContent",
      kind: "toggle",
      label: "Contenu de marque",
      help: "Vous faites la promotion d’un tiers. La vidéo sera marquée « Partenariat rémunéré ».",
      defaultValue: false,
      showWhen: COMMERCIAL,
    },
    {
      key: "aigc",
      kind: "toggle",
      role: "syntheticMedia",
      label: "Contenu généré par IA",
      help: "TikTok l’indique sur la vidéo.",
      defaultValue: false,
      showWhen: DIRECT,
    },
    {
      key: "consent",
      kind: "toggle",
      label: "J’ai relu la vidéo et j’accepte de la publier sur ce compte",
      required: true,
      defaultValue: false,
      showWhen: DIRECT,
    },
  ];
}

/** Déclarations exigées près du bouton d'envoi (Content Sharing Guidelines, point 2 et 3). */
const DECLARATIONS: NonNullable<LivePublishForm["declarations"]> = [
  {
    text: "En publiant sur TikTok, vous acceptez sa confirmation d’utilisation de la musique (Music Usage Confirmation).",
    when: [DIRECT, { key: "brandContent", values: [false] }],
  },
  {
    text: "En publiant sur TikTok, vous acceptez sa politique sur le contenu de marque (Branded Content Policy) et sa confirmation d’utilisation de la musique (Music Usage Confirmation).",
    when: [DIRECT, { key: "brandContent", values: [true] }],
  },
  {
    text: "Votre vidéo sera marquée « Contenu promotionnel ».",
    when: [DIRECT, { key: "brandOrganic", values: [true] }, { key: "brandContent", values: [false] }],
  },
  {
    text: "Votre vidéo sera marquée « Partenariat rémunéré ».",
    when: [DIRECT, { key: "brandContent", values: [true] }],
  },
];

/** La publication directe est-elle permise : application déclarée auditée et portée `video.publish` accordée. */
export function directAllowed(appSettings: Record<string, string>, scopes: string[]): boolean {
  return appSettings[AUDITED_SETTING] === "true" && scopes.includes(SCOPE_PUBLISH);
}

/**
 * Formulaire de l'écran Publier pour un compte TikTok. Sans publication
 * directe possible : le brouillon seul, avec l'identité du compte. Sinon :
 * `creator_info` lu maintenant, et les champs de la publication directe.
 */
export async function buildPublishForm(context: ConnectorContext, input: { scopes: string[]; media: { kind: PublishSource["kind"]; durationMs?: number } }): Promise<LivePublishForm> {
  if (input.media.kind !== "video") return { fields: [], blockers: ["TikTok : seules les vidéos sont prises en charge pour l’instant."] };
  const audited = context.appSettings[AUDITED_SETTING] === "true";
  const blockers = input.scopes.includes(SCOPE_UPLOAD) || directAllowed(context.appSettings, input.scopes) ? [] : ["Ce compte n’a pas autorisé l’envoi de vidéos (video.upload) : reconnectez-le."];

  if (!directAllowed(context.appSettings, input.scopes)) {
    const notices = [DRAFT_NOTICE];
    if (audited) notices.push("La publication directe demande l’autorisation « video.publish » : reconnectez le compte avec le jeu de portées « Tout ».");
    else notices.push("Publication directe désactivée tant que l’application n’est pas déclarée auditée par TikTok (configuration du service).");
    let identity: LivePublishForm["identity"];
    try {
      const token = await context.getAccessToken();
      const user = await fetchTiktokUser(token.value);
      identity = {
        name: user.display_name?.trim() || "Compte TikTok",
        ...(user.username ? { handle: `@${user.username}` } : {}),
        ...(user.avatar_url?.startsWith("https://") ? { avatarUrl: user.avatar_url } : {}),
      };
    } catch (error) {
      if (error instanceof ReconnectRequiredError) throw error;
    }
    return { ...(identity ? { identity } : {}), fields: [], notices, ...(blockers.length > 0 ? { blockers } : {}) };
  }

  let info: CreatorInfo;
  try {
    info = await queryCreatorInfo(context);
  } catch (error) {
    if (error instanceof ReconnectRequiredError) throw error;
    // Le compte ne peut pas publier directement maintenant (limite du jour…) : le brouillon reste possible.
    const reason = error instanceof QuotaExceededError || error instanceof Error ? error.message : "TikTok n’a pas rendu l’état du compte.";
    return { fields: [], notices: [DRAFT_NOTICE, `Publication directe indisponible pour l’instant : ${reason}`] };
  }
  const maxSeconds = Number(info.max_video_post_duration_sec);
  const identity = {
    name: info.creator_nickname?.trim() || info.creator_username || "Compte TikTok",
    ...(info.creator_username ? { handle: `@${info.creator_username}` } : {}),
    ...(info.creator_avatar_url?.startsWith("https://") ? { avatarUrl: info.creator_avatar_url } : {}),
  };
  return {
    identity,
    fields: directFields(info),
    rules: DIRECT_RULES,
    notices: [
      "Brouillon : la vidéo arrive dans la boîte de réception de l’application TikTok, où vous la finissez. Publier directement : TikTok la met en ligne avec les réglages ci-dessous ; la mise en ligne peut prendre quelques minutes.",
    ],
    declarations: DECLARATIONS,
    ...(maxSeconds > 0 ? { limits: { video: { maxDurationMs: maxSeconds * 1000 } } } : {}),
  };
}

// ─── Validation ───────────────────────────────────────────────────

export interface TiktokOptions {
  mode: "inbox" | "direct";
  /** Texte de la publication directe (titre chez TikTok). */
  caption?: string;
  privacy?: PrivacyLevel;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  brandOrganic: boolean;
  brandContent: boolean;
  aigc: boolean;
}

/** Longueur comptée par TikTok : unités UTF-16 (un émoji en vaut souvent deux). */
export const utf16Length = (text: string) => text.length;

/**
 * Valide et complète les options reçues de l'écran Publier. Le mode
 * direct exige une application déclarée auditée, l'autorisation
 * `video.publish`, une visibilité choisie, le consentement et des cases de
 * contenu commercial cohérentes ; sinon la vidéo part en brouillon.
 */
export function normalizeTiktokOptions(input: unknown, source: PublishSource, context?: NormalizeContext): TiktokOptions {
  if (source.kind !== "video") throw new Error("TikTok : seules les vidéos sont prises en charge pour l’instant.");
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const flag = (key: string) => raw[key] === true;
  if (raw.mode !== "direct") {
    if (context && !context.scopes.includes(SCOPE_UPLOAD)) throw new Error("Ce compte TikTok n’a pas autorisé l’envoi de brouillons (video.upload) : reconnectez-le.");
    return { mode: "inbox", allowComment: false, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false, aigc: false };
  }
  if (context && context.appSettings[AUDITED_SETTING] !== "true") {
    throw new Error("La publication directe sur TikTok demande une application auditée par TikTok : cochez « Application auditée par TikTok » dans la configuration du service une fois l’audit obtenu, ou envoyez en brouillon.");
  }
  if (context && !context.scopes.includes(SCOPE_PUBLISH)) throw new Error("Ce compte TikTok n’a pas autorisé la publication directe (video.publish) : reconnectez-le avec le jeu de portées « Tout ».");
  const privacy = (PRIVACY_LEVELS as readonly unknown[]).includes(raw.privacy) ? (raw.privacy as PrivacyLevel) : undefined;
  if (!privacy) throw new Error("Choisissez qui peut voir la vidéo sur TikTok : aucune visibilité n’est choisie d’avance.");
  if (!flag("consent")) throw new Error("Cochez le consentement avant de publier sur TikTok.");
  const commercial = flag("commercial");
  const brandOrganic = commercial && flag("brandOrganic");
  const brandContent = commercial && flag("brandContent");
  if (commercial && !brandOrganic && !brandContent) throw new Error(DIRECT_RULES[0].message);
  if (brandContent && privacy === "SELF_ONLY") throw new Error(DIRECT_RULES[1].message);
  const caption = String(raw.caption ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (utf16Length(caption) > CAPTION_MAX) throw new Error(`Le texte fait ${utf16Length(caption).toLocaleString("fr-FR")} unités pour TikTok (un émoji en compte deux) : ${CAPTION_MAX.toLocaleString("fr-FR")} au plus.`);
  return {
    mode: "direct",
    ...(caption ? { caption } : {}),
    privacy,
    allowComment: flag("allowComment"),
    allowDuet: flag("allowDuet"),
    allowStitch: flag("allowStitch"),
    brandOrganic,
    brandContent,
    aigc: flag("aigc"),
  };
}

/** Relit des options déjà validées (rangées avec le travail). */
export function readTiktokOptions(options: Record<string, unknown>): TiktokOptions {
  const privacy = (PRIVACY_LEVELS as readonly unknown[]).includes(options.privacy) ? (options.privacy as PrivacyLevel) : undefined;
  return {
    mode: options.mode === "direct" ? "direct" : "inbox",
    ...(typeof options.caption === "string" && options.caption ? { caption: options.caption } : {}),
    ...(privacy ? { privacy } : {}),
    allowComment: options.allowComment === true,
    allowDuet: options.allowDuet === true,
    allowStitch: options.allowStitch === true,
    brandOrganic: options.brandOrganic === true,
    brandContent: options.brandContent === true,
    aigc: options.aigc === true,
  };
}
